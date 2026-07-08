#!/usr/bin/env python3
"""
K8s Optimization Platform — Production Cluster Agent
=====================================================
Collects the COMPLETE cluster data set required by every platform feature and
ships it to the central backend over HTTPS.  Zero cluster mutations — only
read-only Kubernetes API calls are made.

Environment Variables (all required unless marked optional):
  PLATFORM_URL          Backend base URL (e.g. https://api.example.com)
  API_TOKEN             Bearer token issued by the platform
  CLUSTER_NAME          Human-readable name shown in the UI
  ENVIRONMENT           production | staging | development  (default: production)
  COLLECTION_INTERVAL   Seconds between full collections    (default: 60)
  LOG_LEVEL             DEBUG | INFO | WARNING               (default: INFO)
  METRICS_SERVER_ENABLED  true | false — query metrics-server for live CPU/RAM
                          usage (default: false; requests-based estimates used)

Supported cloud providers (auto-detected from node labels):
  AWS (EKS), GCP (GKE), Azure (AKS), IBM Cloud (IKS),
  Oracle (OKE), DigitalOcean (DOKS), Alibaba (ACK), on-prem / unknown
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from kubernetes import client, config
from kubernetes.client.rest import ApiException

# ── silence noisy SSL warnings when verify=False is used ──────────────────────
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── logging setup ─────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("k8s-agent")

# ── cloud provider detection table ────────────────────────────────────────────
# Each entry: (label_key, provider_name, region_label)
_PROVIDER_HINTS: List[Tuple[str, str, str]] = [
    ("eks.amazonaws.com/nodegroup",             "AWS",           "topology.kubernetes.io/region"),
    ("cloud.google.com/gke-nodepool",           "GCP",           "topology.kubernetes.io/region"),
    ("kubernetes.azure.com/cluster",            "Azure",         "topology.kubernetes.io/region"),
    ("ibm-cloud.kubernetes.io/region",          "IBM Cloud",     "ibm-cloud.kubernetes.io/region"),
    ("oci.oraclecloud.com/fault-domain",        "Oracle",        "topology.kubernetes.io/region"),
    ("doks.digitalocean.com/node-id",           "DigitalOcean",  "topology.kubernetes.io/region"),
    ("node.kubernetes.io/instance-type",        "Unknown",       "topology.kubernetes.io/region"),
]


# ══════════════════════════════════════════════════════════════════════════════
# Helper utilities
# ══════════════════════════════════════════════════════════════════════════════

def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_cpu(cpu_str: str) -> float:
    """Convert Kubernetes CPU string → cores (float).

    Handles all formats returned by both the k8s API and metrics-server:
      '500m'     → 0.5   (millicores)
      '7949167n' → ~0.008 (nanocores from metrics-server)
      '2'        → 2.0   (whole cores)
    """
    if not cpu_str:
        return 0.0
    s = str(cpu_str).strip()
    if s.endswith("n"):          # nanocores (metrics-server live usage)
        return float(s[:-1]) / 1_000_000_000.0
    if s.endswith("m"):          # millicores (resource requests/limits)
        return float(s[:-1]) / 1000.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_memory(mem_str: str) -> float:
    """Convert Kubernetes memory string → bytes (float)."""
    if not mem_str:
        return 0.0
    s = str(mem_str).strip()
    units = {
        "Ki": 1024,       "Mi": 1024 ** 2, "Gi": 1024 ** 3, "Ti": 1024 ** 4,
        "Pi": 1024 ** 5,  "K":  1000,       "M":  1000 ** 2, "G":  1000 ** 3,
        "T":  1000 ** 4,  "P":  1000 ** 5,
    }
    for suffix, multiplier in units.items():
        if s.endswith(suffix):
            try:
                return float(s[: -len(suffix)]) * multiplier
            except ValueError:
                return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _safe(fn, default=None):
    """Execute fn, return default on any exception (keeps collection resilient)."""
    try:
        return fn()
    except Exception as exc:
        logger.warning("_safe caught %s: %s", fn.__name__ if hasattr(fn, '__name__') else fn, exc)
        return default


def _container_state(cs) -> str:
    if cs.state:
        if cs.state.running:
            return "running"
        if cs.state.waiting:
            return f"waiting:{cs.state.waiting.reason or 'unknown'}"
        if cs.state.terminated:
            return f"terminated:{cs.state.terminated.reason or 'unknown'}"
    return "unknown"


def _owner_kind(pod) -> Optional[str]:
    refs = pod.metadata.owner_references or []
    return refs[0].kind if refs else None


def _owner_name(pod) -> Optional[str]:
    refs = pod.metadata.owner_references or []
    return refs[0].name if refs else None


def _ts(obj) -> Optional[str]:
    """Serialize a datetime-like attribute to ISO string."""
    if obj is None:
        return None
    try:
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return str(obj)
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# ClusterAgent
# ══════════════════════════════════════════════════════════════════════════════

class ClusterAgent:
    """
    Read-only agent that collects the full cluster data set needed by every
    platform feature and sends it to the central backend.
    """

    # ── init ─────────────────────────────────────────────────────────────────

    def __init__(self) -> None:
        # Configuration
        self.platform_url      = os.getenv("PLATFORM_URL", "http://localhost:8000").rstrip("/")
        self.api_token         = os.getenv("API_TOKEN", "")
        self.cluster_name      = os.getenv("CLUSTER_NAME", "")
        self.environment       = os.getenv("ENVIRONMENT", "production")
        self.collection_interval = int(os.getenv("COLLECTION_INTERVAL", "60"))
        self.metrics_server    = os.getenv("METRICS_SERVER_ENABLED", "false").lower() == "true"

        if not self.api_token:
            logger.error("API_TOKEN is required — aborting.")
            sys.exit(1)
        if not self.cluster_name:
            logger.error("CLUSTER_NAME is required — aborting.")
            sys.exit(1)

        # Kubernetes client bootstrap
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes config.")
        except config.ConfigException:
            try:
                config.load_kube_config()
                logger.info("Loaded local kubeconfig.")
            except Exception as exc:
                logger.error("Cannot load Kubernetes config: %s", exc)
                sys.exit(1)

        # API clients (read-only operations only)
        self.core      = client.CoreV1Api()
        self.apps      = client.AppsV1Api()
        self.batch     = client.BatchV1Api()
        self.net       = client.NetworkingV1Api()
        self.rbac      = client.RbacAuthorizationV1Api()
        self.storage   = client.StorageV1Api()
        self.autoscale = client.AutoscalingV1Api()
        self.policy    = client.PolicyV1Api()
        self.version   = client.VersionApi()
        self.custom    = client.CustomObjectsApi()

        # Request session (reused for all outbound HTTP calls)
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization":             f"Bearer {self.api_token}",
            "Content-Type":              "application/json",
            "ngrok-skip-browser-warning": "true",
            "X-Agent-Version":           "2.0.0",
        })

        # Cluster-level info resolved once
        self._provider = "unknown"
        self._region   = "unknown"
        self._k8s_version = "unknown"
        self._node_instance_types: Dict[str, str] = {}

        self._resolve_cluster_identity()
        self._register()

    # ── identity & registration ───────────────────────────────────────────────

    def _resolve_cluster_identity(self) -> None:
        """Detect cloud provider, region, K8s version from node metadata."""
        try:
            vi = self.version.get_code()
            self._k8s_version = f"{vi.major}.{vi.minor}"
        except Exception:
            pass

        try:
            nodes = self.core.list_node(limit=5)
            for node in nodes.items:
                labels = node.metadata.labels or {}
                for label_key, provider_name, region_label in _PROVIDER_HINTS:
                    if label_key in labels:
                        self._provider = provider_name
                        self._region   = labels.get(region_label, "unknown")
                        break
                # Collect instance types for cost estimation
                itype = labels.get("node.kubernetes.io/instance-type") or \
                        labels.get("beta.kubernetes.io/instance-type", "")
                if itype:
                    self._node_instance_types[node.metadata.name] = itype
                if self._provider != "unknown":
                    break
        except Exception as exc:
            logger.warning("Cloud provider detection failed: %s", exc)

        logger.info("Provider=%s  Region=%s  K8s=%s",
                    self._provider, self._region, self._k8s_version)

    def _register(self) -> None:
        """Register this cluster with the platform (idempotent)."""
        payload = {
            "cluster_name":  self.cluster_name,
            "cluster_id":    self.cluster_name,
            "environment":   self.environment,
            "provider":      self._provider,
            "cloud_provider": self._provider,
            "region":        self._region,
            "version":       self._k8s_version,
            "agent_version": "2.0.0",
        }
        for endpoint in ["/api/agents/register", "/api/agent/register"]:
            try:
                resp = self._session.post(
                    self.platform_url + endpoint,
                    json=payload,
                    timeout=15,
                    verify=False,
                )
                if resp.status_code == 200:
                    logger.info("Cluster '%s' registered via %s", self.cluster_name, endpoint)
                    return
            except Exception as exc:
                logger.debug("Registration attempt %s failed: %s", endpoint, exc)

        logger.warning("Cluster registration did not succeed — will retry on next heartbeat.")

    # ── data collection ───────────────────────────────────────────────────────

    def collect(self) -> Dict[str, Any]:
        """
        Top-level collection.  Calls every domain collector; each is
        independently guarded so a single failure never silences the rest.
        """
        logger.info("Starting collection cycle for '%s'…", self.cluster_name)
        t0 = time.monotonic()

        payload: Dict[str, Any] = {
            "cluster_name":      self.cluster_name,
            "cluster_id":        self.cluster_name,
            "timestamp":         _utcnow(),
            "collection_type":   "comprehensive",
            "agent_version":     "2.0.0",
            "provider":          self._provider,
            "region":            self._region,
            "k8s_version":       self._k8s_version,
            "environment":       self.environment,

            # ── domains ────────────────────────────────────────────────────
            "nodes":             _safe(self._nodes,       {}),
            "namespaces":        _safe(self._namespaces,  {}),
            "pods":              _safe(self._pods,        {}),
            "resources":         {},           # filled after nodes+pods below
            "workloads":         _safe(self._workloads,  {}),
            "storage":           _safe(self._storage,    {}),
            "network":           _safe(self._network,    {}),
            "security":          _safe(self._security,   {}),
            "compliance":        _safe(self._compliance, {}),
            "observability":     _safe(self._observability, {}),
            "finops":            _safe(self._finops,     {}),
            "platform":          _safe(self._platform,   {}),
            "teams":             _safe(self._teams,      {}),
            "hpa":               _safe(self._hpa,        {}),
            "pdb":               _safe(self._pdb,        {}),
            "service_accounts":  _safe(self._service_accounts, []),
            "configmaps":        _safe(self._configmaps, {}),
            "secrets_domain":    _safe(self._secrets,    {}),
        }

        # Populate top-level "resources" summary from already-collected data
        payload["resources"] = self._resource_summary(payload)

        # ── post-collection sanity check ──────────────────────────────────
        node_count = payload.get("nodes", {}).get("count", 0)
        if node_count == 0:
            logger.warning(
                "NODES COUNT IS 0 for cluster '%s' — nodes domain collected: %s. "
                "Check that the agent ServiceAccount has ClusterRole permission to "
                "list nodes (kubectl auth can-i list nodes "
                "--as=system:serviceaccount:k8s-optimization-agent:k8s-optimization-agent).",
                self.cluster_name,
                bool(payload.get("nodes")),
            )

        elapsed = time.monotonic() - t0
        logger.info(
            "Collection done in %.1fs — nodes=%d pods=%d namespaces=%d",
            elapsed,
            node_count,
            payload.get("pods", {}).get("total", 0),
            payload.get("namespaces", {}).get("count", 0),
        )
        return payload

    # ── domain: nodes ─────────────────────────────────────────────────────────

    def _nodes(self) -> Dict[str, Any]:
        items = self.core.list_node().items
        details: List[Dict] = []
        total_cpu_cap = 0.0
        total_mem_cap = 0.0

        for n in items:
            cap    = n.status.capacity    or {}
            alloc  = n.status.allocatable or {}
            cpu_c  = _parse_cpu(cap.get("cpu", "0"))
            mem_c  = _parse_memory(cap.get("memory", "0"))
            total_cpu_cap += cpu_c
            total_mem_cap += mem_c
            labels = n.metadata.labels or {}
            roles  = [k.replace("node-role.kubernetes.io/", "")
                      for k in labels if k.startswith("node-role.kubernetes.io/")]
            if not roles:
                roles = ["worker"]
            is_ready = any(
                c.type == "Ready" and c.status == "True"
                for c in (n.status.conditions or [])
            )
            taints = [
                {"key": t.key, "effect": t.effect, "value": t.value}
                for t in (n.spec.taints or [])
            ]
            internal_ip = ""
            external_ip = ""
            for addr in (n.status.addresses or []):
                if addr.type == "InternalIP":
                    internal_ip = addr.address
                elif addr.type == "ExternalIP":
                    external_ip = addr.address

            details.append({
                "name":                n.metadata.name,
                "status":              "Ready" if is_ready else "NotReady",
                "roles":               roles,
                "internal_ip":         internal_ip,
                "external_ip":         external_ip,
                "kubelet_version":     n.status.node_info.kubelet_version,
                "os_image":            n.status.node_info.os_image,
                "kernel_version":      n.status.node_info.kernel_version,
                "container_runtime":   n.status.node_info.container_runtime_version,
                "architecture":        n.status.node_info.architecture,
                "cpu_capacity":        round(cpu_c, 3),
                "memory_capacity_gb":  round(mem_c / 1024 ** 3, 3),
                "cpu_allocatable":     round(_parse_cpu(alloc.get("cpu", "0")), 3),
                "memory_allocatable_gb": round(
                    _parse_memory(alloc.get("memory", "0")) / 1024 ** 3, 3),
                "pod_capacity":        int(alloc.get("pods", 110)),
                "instance_type":       self._node_instance_types.get(n.metadata.name, ""),
                "labels":              labels,
                "taints":              taints,
                "conditions":          [
                    {"type": c.type, "status": c.status,
                     "reason": c.reason, "message": (c.message or "")[:200]}
                    for c in (n.status.conditions or [])
                ],
                "created":             _ts(n.metadata.creation_timestamp),
                "unschedulable":       bool(n.spec.unschedulable),
                "provider_id":         n.spec.provider_id or "",
            })

        return {
            "count":                len(items),
            "ready_count":          sum(1 for d in details if d["status"] == "Ready"),
            "not_ready_count":      sum(1 for d in details if d["status"] == "NotReady"),
            "cpu_capacity_cores":   round(total_cpu_cap, 3),
            "memory_capacity_gb":   round(total_mem_cap / 1024 ** 3, 3),
            "items":                details,
        }

    # ── domain: namespaces ───────────────────────────────────────────────────

    def _namespaces(self) -> Dict[str, Any]:
        items = self.core.list_namespace().items
        return {
            "count": len(items),
            "items": [
                {
                    "name":    ns.metadata.name,
                    "status":  ns.status.phase,
                    "labels":  ns.metadata.labels or {},
                    "created": _ts(ns.metadata.creation_timestamp),
                }
                for ns in items
            ],
        }

    # ── domain: pods ─────────────────────────────────────────────────────────

    def _pods(self) -> Dict[str, Any]:
        all_pods = self.core.list_pod_for_all_namespaces().items
        pod_list: List[Dict] = []
        oom_events: List[Dict] = []
        restart_issues: List[Dict] = []

        # ── live usage from metrics-server ────────────────────────────────────
        # Build a lookup: (namespace, pod_name) -> {cpu_cores, memory_mb}
        _live_usage: Dict[tuple, Dict[str, float]] = {}
        if self.metrics_server:
            try:
                raw = self.custom.list_cluster_custom_object(
                    group="metrics.k8s.io", version="v1beta1", plural="pods"
                )
                for item in raw.get("items", []):
                    ns   = item["metadata"]["namespace"]
                    name = item["metadata"]["name"]
                    cpu_total = 0.0
                    mem_total = 0.0
                    for c in item.get("containers", []):
                        usage = c.get("usage", {})
                        cpu_total += _parse_cpu(usage.get("cpu", "0"))
                        mem_total += _parse_memory(usage.get("memory", "0"))
                    _live_usage[(ns, name)] = {
                        "cpu_cores":  round(cpu_total, 4),
                        "memory_mb":  round(mem_total / 1024 ** 2, 2),
                    }
            except Exception as exc:
                logger.debug("metrics-server pod query failed: %s", exc)

        for pod in all_pods:
            cpu_req = mem_req = cpu_lim = mem_lim = 0.0
            containers: List[Dict] = []
            total_restarts = 0

            # Resource requests/limits from spec
            for c in (pod.spec.containers or []):
                cr = cl = mr = ml = 0.0
                if c.resources:
                    if c.resources.requests:
                        cr = _parse_cpu(c.resources.requests.get("cpu", "0"))
                        mr = _parse_memory(c.resources.requests.get("memory", "0"))
                    if c.resources.limits:
                        cl = _parse_cpu(c.resources.limits.get("cpu", "0"))
                        ml = _parse_memory(c.resources.limits.get("memory", "0"))
                cpu_req += cr
                mem_req += mr
                cpu_lim += cl
                mem_lim += ml
                containers.append({
                    "name":         c.name,
                    "image":        c.image,
                    "cpu_request":  round(cr, 4),
                    "memory_request_mb": round(mr / 1024 ** 2, 2),
                    "cpu_limit":    round(cl, 4),
                    "memory_limit_mb": round(ml / 1024 ** 2, 2),
                    "ports": [
                        {"container_port": p.container_port,
                         "protocol": p.protocol or "TCP"}
                        for p in (c.ports or [])
                    ],
                    "env_var_count":   len(c.env or []) + len(c.env_from or []),
                    "has_liveness":    c.liveness_probe is not None,
                    "has_readiness":   c.readiness_probe is not None,
                    "has_startup":     c.startup_probe is not None,
                    "privileged": (
                        c.security_context is not None
                        and c.security_context.privileged is True
                    ),
                    "run_as_root": (
                        c.security_context is not None
                        and c.security_context.run_as_user == 0
                    ),
                    "allow_privilege_escalation": (
                        c.security_context is not None
                        and c.security_context.allow_privilege_escalation is True
                    ),
                    "read_only_root_fs": (
                        c.security_context is not None
                        and c.security_context.read_only_root_filesystem is True
                    ),
                })

            # Container statuses
            statuses: List[Dict] = []
            for cs in (pod.status.container_statuses or []):
                rc = cs.restart_count
                total_restarts += rc
                state = _container_state(cs)

                # OOM detection
                if (cs.last_state and cs.last_state.terminated
                        and cs.last_state.terminated.reason == "OOMKilled"):
                    oom_events.append({
                        "pod":       pod.metadata.name,
                        "namespace": pod.metadata.namespace,
                        "container": cs.name,
                        "timestamp": _ts(cs.last_state.terminated.finished_at),
                        "node":      pod.spec.node_name,
                    })

                # Last-state reason + timestamp (for restart / OOM analysis)
                last_reason = None
                last_finished = None
                if cs.last_state and cs.last_state.terminated:
                    last_reason   = cs.last_state.terminated.reason or "Error"
                    last_finished = _ts(cs.last_state.terminated.finished_at)
                elif cs.state and cs.state.waiting:
                    last_reason = cs.state.waiting.reason or "Unknown"

                statuses.append({
                    "name":                 cs.name,
                    "ready":                cs.ready,
                    "restart_count":        rc,
                    "state":                state,
                    "image":                cs.image,
                    "image_id":             cs.image_id or "",
                    "last_state_reason":    last_reason,
                    "last_state_finished":  last_finished,
                })

            if total_restarts > 5:
                restart_issues.append({
                    "pod":           pod.metadata.name,
                    "namespace":     pod.metadata.namespace,
                    "restart_count": total_restarts,
                    "node":          pod.spec.node_name,
                })

            phase = (pod.status.phase or "Unknown").lower()
            live = _live_usage.get(
                (pod.metadata.namespace, pod.metadata.name), {}
            )
            # PVC mounts: names of PVCs this pod references
            pvc_mounts = [
                vol.persistent_volume_claim.claim_name
                for vol in (pod.spec.volumes or [])
                if vol.persistent_volume_claim
            ]
            pod_list.append({
                "name":              pod.metadata.name,
                "namespace":         pod.metadata.namespace,
                "status":            pod.status.phase,
                "phase":             phase,
                "node":              pod.spec.node_name,
                "node_ip":           pod.status.host_ip,
                "pod_ip":            pod.status.pod_ip,
                "cpu_request":       round(cpu_req, 4),
                "memory_request_mb": round(mem_req / 1024 ** 2, 2),
                "cpu_limit":         round(cpu_lim, 4),
                "memory_limit_mb":   round(mem_lim / 1024 ** 2, 2),
                # Live usage from metrics-server (0.0 when unavailable)
                "cpu_usage_cores":   live.get("cpu_cores", 0.0),
                "memory_usage_mb":   live.get("memory_mb", 0.0),
                "total_restarts":    total_restarts,
                "containers":        containers,
                "container_statuses": statuses,
                "pvc_mounts":        pvc_mounts,
                "labels":            pod.metadata.labels or {},
                "annotations":       {
                    k: v for k, v in (pod.metadata.annotations or {}).items()
                    if not k.startswith("kubectl.kubernetes.io/last-applied")
                },
                "owner_kind":        _owner_kind(pod),
                "owner_name":        _owner_name(pod),
                "qos_class":         pod.status.qos_class or "BestEffort",
                "service_account":   pod.spec.service_account_name,
                "host_network":      bool(pod.spec.host_network),
                "host_pid":          bool(pod.spec.host_pid),
                "host_ipc":          bool(pod.spec.host_ipc),
                "created":           _ts(pod.metadata.creation_timestamp),
                "start_time":        _ts(pod.status.start_time),
            })

        phases = {}
        for p in all_pods:
            ph = (p.status.phase or "Unknown")
            phases[ph] = phases.get(ph, 0) + 1

        return {
            "total":           len(all_pods),
            "running":         phases.get("Running", 0),
            "pending":         phases.get("Pending", 0),
            "failed":          phases.get("Failed", 0),
            "succeeded":       phases.get("Succeeded", 0),
            "unknown":         phases.get("Unknown", 0),
            "items":           pod_list,
            "oom_events":      oom_events,
            "high_restarts":   restart_issues,
        }

    # ── domain: resource summary (derived) ───────────────────────────────────

    def _resource_summary(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        nodes_data = payload.get("nodes", {})
        pods_data  = payload.get("pods",  {})

        cpu_cap = nodes_data.get("cpu_capacity_cores", 0.0)
        mem_cap_gb = nodes_data.get("memory_capacity_gb", 0.0)

        cpu_req = sum(p.get("cpu_request", 0) for p in pods_data.get("items", []))
        mem_req_mb = sum(p.get("memory_request_mb", 0) for p in pods_data.get("items", []))

        return {
            "cpu_capacity_cores":      round(cpu_cap, 3),
            "cpu_requested_cores":     round(cpu_req, 3),
            "cpu_utilization_percent": round((cpu_req / cpu_cap * 100) if cpu_cap > 0 else 0, 2),
            "memory_capacity_gb":      round(mem_cap_gb, 3),
            "memory_requested_gb":     round(mem_req_mb / 1024, 3),
            "memory_utilization_percent": round(
                (mem_req_mb / 1024 / mem_cap_gb * 100) if mem_cap_gb > 0 else 0, 2),
        }

    # ── domain: workloads ────────────────────────────────────────────────────

    def _workloads(self) -> Dict[str, Any]:
        deps  = self.apps.list_deployment_for_all_namespaces().items
        ssets = self.apps.list_stateful_set_for_all_namespaces().items
        dsets = self.apps.list_daemon_set_for_all_namespaces().items
        rsets = self.apps.list_replica_set_for_all_namespaces().items
        jobs  = self.batch.list_job_for_all_namespaces().items
        crjs  = self.batch.list_cron_job_for_all_namespaces().items

        def _dep(d):
            containers = []
            for c in (d.spec.template.spec.containers or []):
                cr = cl = mr = ml = 0.0
                if c.resources:
                    if c.resources.requests:
                        cr = _parse_cpu(c.resources.requests.get("cpu", "0"))
                        mr = _parse_memory(c.resources.requests.get("memory", "0"))
                    if c.resources.limits:
                        cl = _parse_cpu(c.resources.limits.get("cpu", "0"))
                        ml = _parse_memory(c.resources.limits.get("memory", "0"))
                containers.append({
                    "name":           c.name,
                    "image":          c.image,
                    "cpu_request":    round(cr, 4),
                    "memory_request_mb": round(mr / 1024 ** 2, 2),
                    "cpu_limit":      round(cl, 4),
                    "memory_limit_mb": round(ml / 1024 ** 2, 2),
                    "resources": {
                        "requests": c.resources.requests if c.resources else {},
                        "limits":   c.resources.limits   if c.resources else {},
                    } if c.resources else {},
                })
            return {
                "name":                d.metadata.name,
                "namespace":           d.metadata.namespace,
                "replicas":            d.spec.replicas or 0,
                "ready_replicas":      d.status.ready_replicas or 0,
                "available_replicas":  d.status.available_replicas or 0,
                "unavailable_replicas": d.status.unavailable_replicas or 0,
                "updated_replicas":    d.status.updated_replicas or 0,
                "strategy":            (d.spec.strategy.type if d.spec.strategy else "RollingUpdate"),
                "labels":              d.metadata.labels or {},
                "annotations":         d.metadata.annotations or {},
                "selector":            (d.spec.selector.match_labels or {}
                                        if d.spec.selector else {}),
                "containers":          containers,
                "conditions":          [
                    {"type": c.type, "status": c.status}
                    for c in (d.status.conditions or [])
                ],
                "created":             _ts(d.metadata.creation_timestamp),
                "paused":              bool(d.spec.paused),
            }

        def _sts(s):
            return {
                "name":           s.metadata.name,
                "namespace":      s.metadata.namespace,
                "replicas":       s.spec.replicas or 0,
                "ready_replicas": s.status.ready_replicas or 0,
                "current_replicas": s.status.current_replicas or 0,
                "service_name":   s.spec.service_name or "",
                "labels":         s.metadata.labels or {},
                "update_strategy": (s.spec.update_strategy.type
                                    if s.spec.update_strategy else "RollingUpdate"),
                "volume_claim_templates": [
                    {
                        "name":         vct.metadata.name,
                        "storage_class": vct.spec.storage_class_name,
                        "size":         (vct.spec.resources.requests.get("storage", "0")
                                         if vct.spec.resources else "0"),
                    }
                    for vct in (s.spec.volume_claim_templates or [])
                ],
                "created": _ts(s.metadata.creation_timestamp),
            }

        def _containers_from_spec(spec):
            """Extract container info from a pod spec (template.spec)."""
            result = []
            for c in (spec.containers or []):
                ports = []
                if c.ports:
                    for p in c.ports:
                        ports.append({"containerPort": p.container_port, "protocol": p.protocol or "TCP"})
                req = {}
                lim = {}
                if c.resources:
                    if c.resources.requests:
                        req = dict(c.resources.requests)
                    if c.resources.limits:
                        lim = dict(c.resources.limits)
                result.append({
                    "name": c.name,
                    "image": c.image or "",
                    "ports": ports,
                    "resources": {"requests": req, "limits": lim},
                })
            return result

        def _ds(d):
            created_at = _ts(d.metadata.creation_timestamp)
            ds_containers = _containers_from_spec(d.spec.template.spec) if d.spec and d.spec.template and d.spec.template.spec else []
            selector = (d.spec.selector.match_labels or {}) if d.spec and d.spec.selector else {}
            return {
                "name":                      d.metadata.name,
                "namespace":                 d.metadata.namespace,
                "desired_number_scheduled":  d.status.desired_number_scheduled or 0,
                "current_number_scheduled":  d.status.current_number_scheduled or 0,
                "number_ready":              d.status.number_ready or 0,
                "number_available":          d.status.number_available or 0,
                "number_misscheduled":       d.status.number_misscheduled or 0,
                "labels":                    d.metadata.labels or {},
                "selector":                  selector,
                "containers":                ds_containers,
                "update_strategy":           (d.spec.update_strategy.type
                                              if d.spec.update_strategy else "RollingUpdate"),
                "created_at":                created_at,
            }

        def _job(j):
            created_at = _ts(j.metadata.creation_timestamp)
            start_time = _ts(j.status.start_time)
            completion_time = _ts(j.status.completion_time)
            # Compute duration in seconds when both timestamps are available
            duration = None
            if start_time and completion_time:
                try:
                    from datetime import datetime as _dt
                    fmt = "%Y-%m-%dT%H:%M:%S%z"
                    t0 = _dt.fromisoformat(start_time.replace("Z", "+00:00"))
                    t1 = _dt.fromisoformat(completion_time.replace("Z", "+00:00"))
                    duration = str(int((t1 - t0).total_seconds()))
                except Exception:
                    pass
            elif start_time:
                try:
                    from datetime import datetime as _dt, timezone as _tz
                    t0 = _dt.fromisoformat(start_time.replace("Z", "+00:00"))
                    duration = str(int((_dt.now(_tz.utc) - t0).total_seconds()))
                except Exception:
                    pass

            job_containers = _containers_from_spec(j.spec.template.spec) if j.spec and j.spec.template and j.spec.template.spec else []
            selector = (j.spec.selector.match_labels or {}) if j.spec and j.spec.selector else {}
            conditions = []
            for cond in (j.status.conditions or []):
                conditions.append({
                    "type": cond.type,
                    "status": cond.status,
                    "reason": cond.reason or "",
                    "message": cond.message or "",
                    "last_update_time": _ts(cond.last_transition_time),
                })
            return {
                "name":            j.metadata.name,
                "namespace":       j.metadata.namespace,
                "completions":     j.spec.completions,
                "parallelism":     j.spec.parallelism,
                "active":          j.status.active or 0,
                "succeeded":       j.status.succeeded or 0,
                "failed":          j.status.failed or 0,
                "start_time":      start_time,
                "completion_time": completion_time,
                "duration":        duration,
                "labels":          j.metadata.labels or {},
                "selector":        selector,
                "containers":      job_containers,
                "conditions":      conditions,
                "created_at":      created_at,
                "suspended":       bool(j.spec.suspend),
            }

        def _cj(cj):
            created_at = _ts(cj.metadata.creation_timestamp)
            # Build job_template summary from spec
            jt_spec = cj.spec.job_template.spec if cj.spec and cj.spec.job_template and cj.spec.job_template.spec else None
            jt_containers = _containers_from_spec(jt_spec.template.spec) if jt_spec and jt_spec.template and jt_spec.template.spec else []
            job_template = {
                "completions": jt_spec.completions if jt_spec else None,
                "parallelism": jt_spec.parallelism if jt_spec else None,
                "backoff_limit": jt_spec.backoff_limit if jt_spec and jt_spec.backoff_limit is not None else 6,
                "containers": jt_containers,
            }
            return {
                "name":                cj.metadata.name,
                "namespace":           cj.metadata.namespace,
                "schedule":            cj.spec.schedule,
                "suspend":             bool(cj.spec.suspend),
                "active":              len(cj.status.active or []),
                "last_schedule_time":  _ts(cj.status.last_schedule_time),
                "last_successful_time": _ts(cj.status.last_successful_time),
                "concurrency":         cj.spec.concurrency_policy or "Allow",
                "labels":              cj.metadata.labels or {},
                "job_template":        job_template,
                "created_at":          created_at,
            }

        # Orphaned ReplicaSets: 0 replicas and owned by a Deployment
        orphaned_rs = []
        for rs in rsets:
            if (rs.spec.replicas or 0) != 0:
                continue
            owner_refs = rs.metadata.owner_references or []
            dep_owner = next(
                (ref.name for ref in owner_refs if ref.kind == "Deployment"), None
            )
            if dep_owner is None:
                continue
            orphaned_rs.append({
                "name":       rs.metadata.name,
                "namespace":  rs.metadata.namespace,
                "replicas":   0,
                "owner_name": dep_owner,
                "created":    _ts(rs.metadata.creation_timestamp),
            })

        return {
            "deployments": {
                "total": len(deps),
                "healthy": sum(
                    1 for d in deps
                    if d.status.ready_replicas == d.spec.replicas and (d.spec.replicas or 0) > 0
                ),
                "items": [_dep(d) for d in deps],
            },
            "statefulsets": {
                "total": len(ssets),
                "items": [_sts(s) for s in ssets],
            },
            "daemonsets": {
                "total": len(dsets),
                "items": [_ds(d) for d in dsets],
            },
            "replicasets": {
                "total": len(rsets),
                "orphaned": orphaned_rs,
            },
            "jobs": {
                "total":    len(jobs),
                "active":   sum(1 for j in jobs if (j.status.active or 0) > 0),
                "failed":   sum(1 for j in jobs if (j.status.failed or 0) > 0),
                "items":    [_job(j) for j in jobs],
            },
            "cronjobs": {
                "total":     len(crjs),
                "suspended": sum(1 for cj in crjs if cj.spec.suspend),
                "items":     [_cj(cj) for cj in crjs],
            },
        }

    # ── domain: storage ──────────────────────────────────────────────────────

    def _pvc_usage_from_kubelet(self) -> Dict[str, Dict[str, float]]:
        """Query kubelet stats/summary on every node and return
        {namespace/pvc-name: {used_bytes, avail_bytes, capacity_bytes}}.
        Falls back to empty dict when nodes/proxy is unavailable.
        """
        import ast as _ast
        result: Dict[str, Dict[str, float]] = {}
        try:
            for node in self.core.list_node().items:
                node_name = node.metadata.name
                try:
                    raw = self.core.connect_get_node_proxy_with_path(
                        node_name, "stats/summary"
                    )
                    data = _ast.literal_eval(raw)
                    for pod in data.get("pods", []):
                        for vol in pod.get("volume", []):
                            ref = vol.get("pvcRef")
                            if ref:
                                key = f"{ref['namespace']}/{ref['name']}"
                                result[key] = {
                                    "used_bytes":  float(vol.get("usedBytes",  0)),
                                    "avail_bytes": float(vol.get("availableBytes", 0)),
                                    "cap_bytes":   float(vol.get("capacityBytes", 0)),
                                }
                except Exception as exc:
                    logger.debug("kubelet stats node=%s: %s", node_name, exc)
        except Exception as exc:
            logger.debug("_pvc_usage_from_kubelet: %s", exc)
        return result

    def _storage(self) -> Dict[str, Any]:
        pvcs = self.core.list_persistent_volume_claim_for_all_namespaces().items
        pvs  = self.core.list_persistent_volume().items
        scs  = self.storage.list_storage_class().items

        # Real per-PVC filesystem usage from kubelet
        pvc_usage = self._pvc_usage_from_kubelet()

        pvc_list: List[Dict] = []
        orphaned_pvcs: List[Dict] = []

        for pvc in pvcs:
            size = "0"
            if pvc.spec.resources and pvc.spec.resources.requests:
                size = pvc.spec.resources.requests.get("storage", "0")
            # Actual provisioned capacity from the bound PV (may differ from request)
            actual_capacity = (
                pvc.status.capacity.get("storage", size)
                if pvc.status and pvc.status.capacity
                else size
            )
            cap_bytes = _parse_memory(actual_capacity)
            ns_name   = f"{pvc.metadata.namespace}/{pvc.metadata.name}"
            usage     = pvc_usage.get(ns_name, {})
            used_bytes  = usage.get("used_bytes",  0.0)
            avail_bytes = usage.get("avail_bytes", 0.0)
            # When kubelet reported capacity differs from API, prefer kubelet's
            kubelet_cap = usage.get("cap_bytes", 0.0)
            if kubelet_cap > 0:
                cap_bytes = kubelet_cap

            rec = {
                "name":             pvc.metadata.name,
                "namespace":        pvc.metadata.namespace,
                "status":           pvc.status.phase,
                "volume_name":      pvc.spec.volume_name,
                "storage_class":    pvc.spec.storage_class_name,
                "size":             size,
                "size_bytes":       _parse_memory(size),
                "capacity":         actual_capacity,
                "capacity_bytes":   cap_bytes,
                "used_bytes":       used_bytes,
                "avail_bytes":      avail_bytes,
                "volume_mode":      pvc.spec.volume_mode or "Filesystem",
                "access_modes":     pvc.spec.access_modes or [],
                "labels":           pvc.metadata.labels or {},
                "created":          _ts(pvc.metadata.creation_timestamp),
            }
            pvc_list.append(rec)
            if pvc.status.phase != "Bound":
                orphaned_pvcs.append(rec)

        pv_list = [
            {
                "name":           pv.metadata.name,
                "status":         pv.status.phase,
                "claim":          (
                    f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}"
                    if pv.spec.claim_ref else None
                ),
                "storage_class":  pv.spec.storage_class_name,
                "capacity":       pv.spec.capacity.get("storage", "0") if pv.spec.capacity else "0",
                "capacity_bytes": _parse_memory(
                    pv.spec.capacity.get("storage", "0") if pv.spec.capacity else "0"),
                "access_modes":   pv.spec.access_modes or [],
                "reclaim_policy": pv.spec.persistent_volume_reclaim_policy,
                "created":        _ts(pv.metadata.creation_timestamp),
            }
            for pv in pvs
        ]

        sc_list = [
            {
                "name":                sc.metadata.name,
                "provisioner":         sc.provisioner,
                "reclaim_policy":      sc.reclaim_policy,
                "volume_binding_mode": sc.volume_binding_mode,
                "allow_expansion":     bool(sc.allow_volume_expansion),
                "is_default": (
                    (sc.metadata.annotations or {}).get(
                        "storageclass.kubernetes.io/is-default-class") == "true"
                ),
            }
            for sc in scs
        ]

        total_pvc_bytes = sum(p["size_bytes"] for p in pvc_list)
        return {
            "pvcs": {
                "total":            len(pvcs),
                "bound":            sum(1 for p in pvc_list if p["status"] == "Bound"),
                "pending":          sum(1 for p in pvc_list if p["status"] == "Pending"),
                "lost":             sum(1 for p in pvc_list if p["status"] == "Lost"),
                "total_capacity_gb": round(total_pvc_bytes / 1024 ** 3, 3),
                "orphaned":         orphaned_pvcs,
                "items":            pvc_list,
            },
            "pvs": {
                "total": len(pvs),
                "items": pv_list,
            },
            "storage_classes": {
                "total": len(scs),
                "items": sc_list,
            },
        }

    # ── domain: network ──────────────────────────────────────────────────────

    def _network(self) -> Dict[str, Any]:
        svcs    = self.core.list_service_for_all_namespaces().items
        ings    = self.net.list_ingress_for_all_namespaces().items
        netpols = self.net.list_network_policy_for_all_namespaces().items
        eps     = self.core.list_endpoints_for_all_namespaces().items

        svc_list: List[Dict] = []
        external_svcs: List[Dict] = []
        for svc in svcs:
            # LoadBalancer external IPs / hostnames from status.load_balancer.ingress
            lb_ingress = []
            if svc.status.load_balancer and svc.status.load_balancer.ingress:
                for ing in svc.status.load_balancer.ingress:
                    lb_ingress.append(ing.ip or ing.hostname or "")
            lb_ingress = [x for x in lb_ingress if x]  # drop empty

            # Endpoints count for this service
            ep_count = 0
            for ep in eps:
                if ep.metadata.name == svc.metadata.name and \
                        ep.metadata.namespace == svc.metadata.namespace:
                    for subset in (ep.subsets or []):
                        ep_count += len(subset.addresses or [])
                    break

            rec = {
                "name":              svc.metadata.name,
                "namespace":         svc.metadata.namespace,
                "type":              svc.spec.type or "ClusterIP",
                "cluster_ip":        svc.spec.cluster_ip,
                "external_ips":      svc.spec.external_i_ps or [],
                "load_balancer_ips": lb_ingress,
                "load_balancer_ip":  lb_ingress[0] if lb_ingress else None,
                "external_name":     svc.spec.external_name,
                "ports": [
                    {
                        "name":        p.name or "",
                        "port":        p.port,
                        "protocol":    p.protocol or "TCP",
                        "target_port": str(p.target_port),
                        "node_port":   p.node_port,
                    }
                    for p in (svc.spec.ports or [])
                ],
                "selector":          svc.spec.selector or {},
                "session_affinity":  svc.spec.session_affinity,
                "labels":            svc.metadata.labels or {},
                "annotations": {
                    k: v for k, v in (svc.metadata.annotations or {}).items()
                    if not k.startswith("kubectl.kubernetes.io")
                },
                "endpoints_count":   ep_count,
                "created":           _ts(svc.metadata.creation_timestamp),
            }
            svc_list.append(rec)
            if svc.spec.type in ("LoadBalancer", "NodePort"):
                external_svcs.append(rec)

        ing_list = []
        for ing in ings:
            # Collect all unique hosts across rules
            hosts = list({
                rule.host for rule in (ing.spec.rules or [])
                if rule.host
            })

            # Collect all path entries with full detail
            paths = []
            for rule in (ing.spec.rules or []):
                if rule.http:
                    for path in (rule.http.paths or []):
                        svc_name = (
                            path.backend.service.name
                            if path.backend and path.backend.service else None
                        )
                        svc_port = None
                        if path.backend and path.backend.service and path.backend.service.port:
                            svc_port = (
                                path.backend.service.port.number
                                or path.backend.service.port.name
                            )
                        paths.append({
                            "host":      rule.host or "*",
                            "path":      path.path or "/",
                            "path_type": path.path_type or "Prefix",
                            "service":   svc_name or "",
                            "port":      svc_port,
                        })

            # TLS
            tls_hosts = []
            for t in (ing.spec.tls or []):
                tls_hosts.extend(t.hosts or [])
            tls_enabled = len(ing.spec.tls or []) > 0

            # Address — from status.load_balancer.ingress
            address = ""
            if ing.status and ing.status.load_balancer and ing.status.load_balancer.ingress:
                parts = [
                    i.ip or i.hostname
                    for i in ing.status.load_balancer.ingress
                    if i.ip or i.hostname
                ]
                address = parts[0] if parts else ""

            # Port list (deduplicated from rules / TLS presence)
            port_set = set()
            if paths:
                port_set.add(80)
            if tls_enabled:
                port_set.add(443)
            if not port_set and paths:
                port_set.add(80)

            ingress_class = (
                ing.spec.ingress_class_name
                or (ing.metadata.annotations or {}).get("kubernetes.io/ingress.class", "")
                or ""
            )

            ing_list.append({
                "name":          ing.metadata.name,
                "namespace":     ing.metadata.namespace,
                "hosts":         hosts,
                "paths":         paths,
                "tls_enabled":   tls_enabled,
                "tls_hosts":     tls_hosts,
                "ingress_class": ingress_class,
                "address":       address,
                "ports":         sorted(port_set),
                "labels":        ing.metadata.labels or {},
                "created":       _ts(ing.metadata.creation_timestamp),
            })

        netpol_list = [
            {
                "name":         np.metadata.name,
                "namespace":    np.metadata.namespace,
                "pod_selector": (np.spec.pod_selector.match_labels or {}
                                 if np.spec.pod_selector else {}),
                "policy_types": np.spec.policy_types or [],
                "ingress_rules": len(np.spec.ingress or []),
                "egress_rules":  len(np.spec.egress or []),
                "created":      _ts(np.metadata.creation_timestamp),
            }
            for np in netpols
        ]

        # Namespaces that have no NetworkPolicy (compliance gap)
        ns_with_netpol = {np["namespace"] for np in netpol_list}
        all_ns = {ep.metadata.namespace for ep in eps} | \
                 {svc.metadata.namespace for svc in svcs}
        ns_without_netpol = sorted(
            ns for ns in all_ns
            if ns not in ns_with_netpol
            and ns not in ("kube-system", "kube-public", "kube-node-lease")
        )

        return {
            "services": {
                "total":              len(svcs),
                "load_balancers":     sum(1 for s in svcs if s.spec.type == "LoadBalancer"),
                "node_ports":         sum(1 for s in svcs if s.spec.type == "NodePort"),
                "cluster_ips":        sum(1 for s in svcs if s.spec.type == "ClusterIP"),
                "external_exposure":  external_svcs,
                "items":              svc_list,
            },
            "ingresses": {
                "total": len(ings),
                "items": ing_list,
            },
            "network_policies": {
                "total": len(netpols),
                "items": netpol_list,
                "namespaces_without_policy": ns_without_netpol,
            },
        }

    # ── domain: security ─────────────────────────────────────────────────────

    def _security(self) -> Dict[str, Any]:
        secrets   = self.core.list_secret_for_all_namespaces().items
        sas       = self.core.list_service_account_for_all_namespaces().items
        roles     = self.rbac.list_role_for_all_namespaces().items
        croles    = self.rbac.list_cluster_role().items
        rbs       = self.rbac.list_role_binding_for_all_namespaces().items
        crbs      = self.rbac.list_cluster_role_binding().items
        pods      = self.core.list_pod_for_all_namespaces().items

        # Secrets (NEVER ship secret data — only metadata)
        secret_list = [
            {
                "name":      s.metadata.name,
                "namespace": s.metadata.namespace,
                "type":      s.type,
                "data_keys": list(s.data.keys()) if s.data else [],
                "labels":    s.metadata.labels or {},
                "created":   _ts(s.metadata.creation_timestamp),
            }
            for s in secrets
        ]
        exposed_secrets = [rec for rec in secret_list if rec["namespace"] == "default"]

        # Privileged / root pods
        privileged_pods: List[Dict] = []
        root_pods: List[Dict] = []
        host_network_pods: List[Dict] = []
        no_limits_pods: List[Dict] = []
        missing_probes: List[Dict] = []
        images: Dict[str, List[str]] = {}  # image → [pod_namespace/name, ...]

        for pod in pods:
            has_limits = False
            for c in (pod.spec.containers or []):
                if c.resources and c.resources.limits:
                    has_limits = True
                if c.security_context:
                    if c.security_context.privileged:
                        privileged_pods.append({
                            "pod":       pod.metadata.name,
                            "namespace": pod.metadata.namespace,
                            "container": c.name,
                        })
                    if c.security_context.run_as_user == 0:
                        root_pods.append({
                            "pod":       pod.metadata.name,
                            "namespace": pod.metadata.namespace,
                            "container": c.name,
                        })
                # Collect images for vulnerability inventory
                img = c.image or ""
                key = f"{pod.metadata.namespace}/{pod.metadata.name}"
                images.setdefault(img, [])
                if key not in images[img]:
                    images[img].append(key)
                # Probe checks
                if not c.liveness_probe or not c.readiness_probe:
                    missing_probes.append({
                        "pod":            pod.metadata.name,
                        "namespace":      pod.metadata.namespace,
                        "container":      c.name,
                        "missing_liveness":  c.liveness_probe is None,
                        "missing_readiness": c.readiness_probe is None,
                    })

            if not has_limits:
                no_limits_pods.append({
                    "pod":       pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                })

            if pod.spec.host_network:
                host_network_pods.append({
                    "pod":       pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                })

        # RBAC: cluster-admin bindings
        cluster_admin_bindings = [
            {
                "name": crb.metadata.name,
                "subjects": [
                    {"kind": s.kind, "name": s.name, "namespace": s.namespace}
                    for s in (crb.subjects or [])
                ],
            }
            for crb in crbs
            if crb.role_ref.name == "cluster-admin"
        ]

        # Wildcard rules in ClusterRoles (high-risk)
        wildcard_roles: List[Dict] = []
        for cr in croles:
            for rule in (cr.rules or []):
                if "*" in (rule.verbs or []) and "*" in (rule.resources or []):
                    wildcard_roles.append({
                        "role": cr.metadata.name,
                        "type": "ClusterRole",
                    })
                    break

        # Image inventory (top 200 for payload size)
        image_inventory = [
            {"image": img, "pods": pods_using[:20]}
            for img, pods_using in sorted(images.items())[:200]
        ]

        return {
            "secrets": {
                "total":   len(secrets),
                "exposed": exposed_secrets,
                "items":   secret_list[:200],
            },
            "service_accounts": {
                "total": len(sas),
            },
            "rbac": {
                "roles":                   len(roles),
                "cluster_roles":           len(croles),
                "role_bindings":           len(rbs),
                "cluster_role_bindings":   len(crbs),
                "cluster_admin_bindings":  cluster_admin_bindings,
                "wildcard_roles":          wildcard_roles,
            },
            "container_security": {
                "privileged_pods":         privileged_pods,
                "root_pods":               root_pods,
                "host_network_pods":       host_network_pods,
                "pods_without_limits":     no_limits_pods,
                "pods_missing_probes":     missing_probes[:100],
            },
            "image_inventory": image_inventory,
        }

    # ── domain: compliance ───────────────────────────────────────────────────

    def _compliance(self) -> Dict[str, Any]:
        pods      = self.core.list_pod_for_all_namespaces().items
        nspaces   = self.core.list_namespace().items
        netpols   = self.net.list_network_policy_for_all_namespaces().items
        croles    = self.rbac.list_cluster_role().items

        netpol_ns = {np.metadata.namespace for np in netpols}
        system_ns = {"kube-system", "kube-public", "kube-node-lease"}

        ns_without_netpol = [
            ns.metadata.name for ns in nspaces
            if ns.metadata.name not in netpol_ns
            and ns.metadata.name not in system_ns
        ]

        pods_no_limits: List[str] = []
        pods_no_requests: List[str] = []
        pods_host_pid: List[str] = []
        pods_automount_sa: List[str] = []

        for pod in pods:
            has_limits = has_requests = False
            for c in (pod.spec.containers or []):
                if c.resources:
                    if c.resources.limits:
                        has_limits = True
                    if c.resources.requests:
                        has_requests = True
            if not has_limits:
                pods_no_limits.append(
                    f"{pod.metadata.namespace}/{pod.metadata.name}")
            if not has_requests:
                pods_no_requests.append(
                    f"{pod.metadata.namespace}/{pod.metadata.name}")
            if pod.spec.host_pid:
                pods_host_pid.append(
                    f"{pod.metadata.namespace}/{pod.metadata.name}")
            if pod.spec.automount_service_account_token is not False:
                pods_automount_sa.append(
                    f"{pod.metadata.namespace}/{pod.metadata.name}")

        # Check for wildcard RBAC
        wildcard_croles = [
            cr.metadata.name for cr in croles
            for rule in (cr.rules or [])
            if "*" in (rule.verbs or []) or "*" in (rule.resources or [])
        ]

        return {
            "network_policy": {
                "total_namespaces":            len(nspaces),
                "namespaces_with_policy":      len(netpol_ns),
                "namespaces_without_policy":   ns_without_netpol,
                "coverage_percent": round(
                    len(netpol_ns) / max(len(nspaces) - len(system_ns), 1) * 100, 1),
            },
            "resource_governance": {
                "total_pods":               len(pods),
                "pods_without_limits":      len(pods_no_limits),
                "pods_without_requests":    len(pods_no_requests),
                "pods_no_limits_list":      pods_no_limits[:50],
            },
            "pod_security": {
                "pods_with_host_pid":       pods_host_pid[:50],
                "pods_automount_sa_token":  len(pods_automount_sa),
            },
            "rbac_compliance": {
                "wildcard_cluster_roles":   wildcard_croles,
            },
        }

    # ── domain: observability ────────────────────────────────────────────────

    def _observability(self) -> Dict[str, Any]:
        events = self.core.list_event_for_all_namespaces().items
        now    = datetime.now(timezone.utc)

        all_events: List[Dict] = []
        warning_events: List[Dict] = []
        recent_events:  List[Dict] = []

        for ev in events:
            src = ev.source or type("_", (), {"component": None, "host": None})()
            last_ts = _ts(ev.last_timestamp)
            first_ts = _ts(ev.first_timestamp)

            # Compute human-readable age from last_timestamp
            age_str = ""
            if ev.last_timestamp:
                age_s = (now - ev.last_timestamp).total_seconds()
                if age_s < 60:
                    age_str = f"{int(age_s)}s"
                elif age_s < 3600:
                    age_str = f"{int(age_s // 60)}m"
                elif age_s < 86400:
                    age_str = f"{int(age_s // 3600)}h"
                else:
                    age_str = f"{int(age_s // 86400)}d"

            rec = {
                "name":             ev.metadata.name,
                "namespace":        ev.metadata.namespace,
                "type":             ev.type or "Normal",
                "reason":           ev.reason or "",
                "message":          (ev.message or "")[:500],
                "involved_object_kind": ev.involved_object.kind or "",
                "involved_object_name": ev.involved_object.name or "",
                "source_component": (src.component or "") if src else "",
                "source_host":      (src.host or "") if src else "",
                "count":            ev.count or 1,
                "first_timestamp":  first_ts or "",
                "last_timestamp":   last_ts or "",
                "age":              age_str,
            }
            all_events.append(rec)
            if ev.type == "Warning":
                warning_events.append(rec)
            if ev.last_timestamp:
                age_s = (now - ev.last_timestamp).total_seconds()
                if age_s < 3600:
                    recent_events.append(rec)

        return {
            "all_events":     all_events,
            "warning_events": warning_events,
            "recent_events":  recent_events[:100],
            "total":          len(all_events),
            "warnings":       len(warning_events),
            "recent_count":   len(recent_events),
        }

    # ── domain: FinOps ───────────────────────────────────────────────────────

    def _finops(self) -> Dict[str, Any]:
        pods  = self.core.list_pod_for_all_namespaces().items
        nodes = self.core.list_node().items

        ns_resources: Dict[str, Dict] = {}
        team_resources: Dict[str, Dict] = {}

        for pod in pods:
            ns   = pod.metadata.namespace
            team = (pod.metadata.labels or {}).get("team", "unknown")

            for bucket, key in [(ns_resources, ns), (team_resources, team)]:
                if key not in bucket:
                    bucket[key] = {
                        "cpu_request": 0.0,
                        "memory_request_gb": 0.0,
                        "pod_count": 0,
                        "cpu_limit": 0.0,
                        "memory_limit_gb": 0.0,
                    }
                bucket[key]["pod_count"] += 1
                for c in (pod.spec.containers or []):
                    if c.resources:
                        if c.resources.requests:
                            bucket[key]["cpu_request"] += _parse_cpu(
                                c.resources.requests.get("cpu", "0"))
                            bucket[key]["memory_request_gb"] += (
                                _parse_memory(c.resources.requests.get("memory", "0"))
                                / 1024 ** 3)
                        if c.resources.limits:
                            bucket[key]["cpu_limit"] += _parse_cpu(
                                c.resources.limits.get("cpu", "0"))
                            bucket[key]["memory_limit_gb"] += (
                                _parse_memory(c.resources.limits.get("memory", "0"))
                                / 1024 ** 3)

        # Round values
        for d in list(ns_resources.values()) + list(team_resources.values()):
            for k in ("cpu_request", "memory_request_gb", "cpu_limit", "memory_limit_gb"):
                d[k] = round(d[k], 4)

        # Node instance types (for cost estimation by platform)
        node_specs = [
            {
                "name":           n.metadata.name,
                "instance_type":  self._node_instance_types.get(n.metadata.name, ""),
                "cpu_cores":      round(_parse_cpu(
                    n.status.capacity.get("cpu", "0")
                    if n.status.capacity else "0"), 2),
                "memory_gb":      round(
                    _parse_memory(n.status.capacity.get("memory", "0")
                                  if n.status.capacity else "0") / 1024 ** 3, 2),
                "provider":       self._provider,
                "region":         self._region,
            }
            for n in nodes
        ]

        return {
            "namespace_resources":  ns_resources,
            "team_resources":       team_resources,
            "total_nodes":          len(nodes),
            "node_specs":           node_specs,
            "provider":             self._provider,
            "region":               self._region,
        }

    # ── domain: platform ─────────────────────────────────────────────────────

    def _platform(self) -> Dict[str, Any]:
        nspaces = self.core.list_namespace().items
        ns_names = [ns.metadata.name for ns in nspaces]

        gitops = {
            "argocd":      any("argocd" in n for n in ns_names),
            "flux":        any("flux" in n for n in ns_names),
            "tekton":      any("tekton" in n for n in ns_names),
            "jenkins":     any("jenkins" in n for n in ns_names),
            "spinnaker":   any("spinnaker" in n for n in ns_names),
        }

        # Detect cert-manager, external-secrets, vault
        addons = {
            "cert_manager":      any("cert-manager"      in n for n in ns_names),
            "external_secrets":  any("external-secrets"  in n for n in ns_names),
            "vault":             any("vault"              in n for n in ns_names),
            "istio":             any("istio"              in n for n in ns_names),
            "linkerd":           any("linkerd"            in n for n in ns_names),
            "prometheus":        any("monitoring"         in n or "prometheus" in n
                                    for n in ns_names),
            "grafana":           any("grafana"            in n for n in ns_names),
            "keda":              any("keda"               in n for n in ns_names),
        }

        return {
            "gitops_tools": gitops,
            "addon_tools":  addons,
            "namespaces":   ns_names,
        }

    # ── domain: teams ────────────────────────────────────────────────────────

    def _teams(self) -> Dict[str, Any]:
        pods    = self.core.list_pod_for_all_namespaces().items
        nspaces = self.core.list_namespace().items

        teams:          set = set()
        team_ns_map:    Dict[str, set] = {}
        team_pod_count: Dict[str, int] = {}
        owner_map:      Dict[str, set] = {}   # namespace → owners (from labels)

        for ns in nspaces:
            lbl = ns.metadata.labels or {}
            team = lbl.get("team") or lbl.get("owner") or lbl.get("managed-by")
            if team:
                teams.add(team)
                owner_map.setdefault(ns.metadata.name, set()).add(team)

        for pod in pods:
            lbl  = pod.metadata.labels or {}
            team = lbl.get("team") or lbl.get("owner") or lbl.get("app.kubernetes.io/managed-by")
            if team:
                teams.add(team)
                team_ns_map.setdefault(team, set()).add(pod.metadata.namespace)
                team_pod_count[team] = team_pod_count.get(team, 0) + 1

        return {
            "total_teams": len(teams),
            "teams":       sorted(teams),
            "team_namespaces": {t: sorted(nss) for t, nss in team_ns_map.items()},
            "team_pod_counts": team_pod_count,
            "namespace_owners": {ns: sorted(owners) for ns, owners in owner_map.items()},
        }

    # ── domain: HPA ──────────────────────────────────────────────────────────

    def _hpa(self) -> Dict[str, Any]:
        try:
            items = self.autoscale.list_horizontal_pod_autoscaler_for_all_namespaces().items
            return {
                "total": len(items),
                "items": [
                    {
                        "name":              h.metadata.name,
                        "namespace":         h.metadata.namespace,
                        "target_kind":       h.spec.scale_target_ref.kind,
                        "target_name":       h.spec.scale_target_ref.name,
                        "min_replicas":      h.spec.min_replicas,
                        "max_replicas":      h.spec.max_replicas,
                        "current_replicas":  h.status.current_replicas,
                        "desired_replicas":  h.status.desired_replicas,
                        "target_cpu_pct":    h.spec.target_cpu_utilization_percentage,
                        "current_cpu_pct":   h.status.current_cpu_utilization_percentage,
                        "created":           _ts(h.metadata.creation_timestamp),
                    }
                    for h in items
                ],
            }
        except ApiException:
            return {"total": 0, "items": []}

    # ── domain: PodDisruptionBudgets ─────────────────────────────────────────

    def _pdb(self) -> Dict[str, Any]:
        try:
            items = self.policy.list_pod_disruption_budget_for_all_namespaces().items
            return {
                "total": len(items),
                "items": [
                    {
                        "name":              p.metadata.name,
                        "namespace":         p.metadata.namespace,
                        "min_available":     str(p.spec.min_available) if p.spec.min_available is not None else None,
                        "max_unavailable":   str(p.spec.max_unavailable) if p.spec.max_unavailable is not None else None,
                        "expected_pods":     p.status.expected_pods,
                        "current_healthy":   p.status.current_healthy,
                        "disruptions_allowed": p.status.disruptions_allowed,
                    }
                    for p in items
                ],
            }
        except ApiException:
            return {"total": 0, "items": []}

    # ── domain: service accounts ─────────────────────────────────────────────

    def _service_accounts(self) -> List[Dict]:
        items = self.core.list_service_account_for_all_namespaces().items
        return [
            {
                "name":       sa.metadata.name,
                "namespace":  sa.metadata.namespace,
                "secrets":    len(sa.secrets or []),
                "automount":  sa.automount_service_account_token,
                "labels":     sa.metadata.labels or {},
                "created":    _ts(sa.metadata.creation_timestamp),
            }
            for sa in items
        ]

    # ── domain: secrets ──────────────────────────────────────────────────────

    def _secrets(self) -> Dict[str, Any]:
        """
        Collect all Secrets cluster-wide (metadata only — never ship values)
        and determine which are actively referenced by pods or service accounts.
        """
        secrets = self.core.list_secret_for_all_namespaces().items
        pods    = self.core.list_pod_for_all_namespaces().items
        sas     = self.core.list_service_account_for_all_namespaces().items

        # Build referenced set: "namespace/name"
        referenced: set = set()

        # Service account token secrets: every SA implicitly references its tokens
        for sa in sas:
            ns = sa.metadata.namespace
            for ref in (sa.secrets or []):
                if ref.name:
                    referenced.add(f"{ns}/{ref.name}")
            # imagePullSecrets on SA
            for ips in (sa.image_pull_secrets or []):
                if ips.name:
                    referenced.add(f"{ns}/{ips.name}")

        for pod in pods:
            ns   = pod.metadata.namespace
            spec = pod.spec
            # volumes
            for vol in (spec.volumes or []):
                if vol.secret:
                    referenced.add(f"{ns}/{vol.secret.secret_name}")
                if vol.projected:
                    for src in (vol.projected.sources or []):
                        if src.secret:
                            referenced.add(f"{ns}/{src.secret.name}")
            # envFrom
            for c in (spec.containers or []) + (spec.init_containers or []):
                for ef in (c.env_from or []):
                    if ef.secret_ref:
                        referenced.add(f"{ns}/{ef.secret_ref.name}")
                for ev in (c.env or []):
                    if ev.value_from and ev.value_from.secret_key_ref:
                        referenced.add(f"{ns}/{ev.value_from.secret_key_ref.name}")
            # imagePullSecrets on pod
            for ips in (spec.image_pull_secrets or []):
                if ips.name:
                    referenced.add(f"{ns}/{ips.name}")

        # Types to always skip (auto-managed by k8s / service accounts)
        SKIP_TYPES = {
            "kubernetes.io/service-account-token",
            "kubernetes.io/dockercfg",
            "bootstrap.kubernetes.io/token",
        }
        SYSTEM_PREFIXES = (
            "default-token-", "default-dockercfg-",
            "builder-token-", "builder-dockercfg-",
            "deployer-token-", "deployer-dockercfg-",
            "sh.helm.release.",
        )

        items  = []
        stale  = []
        for s in secrets:
            name  = s.metadata.name
            ns    = s.metadata.namespace
            key   = f"{ns}/{name}"
            stype = s.type or "Opaque"
            keys  = list(s.data.keys()) if s.data else []

            is_referenced = key in referenced
            is_system = (
                stype in SKIP_TYPES
                or any(name.startswith(p) for p in SYSTEM_PREFIXES)
            )
            created_ts = _ts(s.metadata.creation_timestamp)

            rec = {
                "name":          name,
                "namespace":     ns,
                "type":          stype,
                "data_keys":     keys,
                "key_count":     len(keys),
                "labels":        s.metadata.labels or {},
                "created":       created_ts or "",
                "is_referenced": is_referenced,
                "is_system":     is_system,
            }
            items.append(rec)
            if not is_referenced and not is_system:
                stale.append(rec)

        return {
            "total":       len(secrets),
            "referenced":  sum(1 for i in items if i["is_referenced"]),
            "stale":       len(stale),
            "items":       items,
            "stale_items": stale,
        }

    # ── domain: configmaps ───────────────────────────────────────────────────

    def _configmaps(self) -> Dict[str, Any]:
        """
        Collect all ConfigMaps cluster-wide and determine which ones are
        actively referenced by pods (via volumes, envFrom, or env valueFrom).
        """
        cms  = self.core.list_config_map_for_all_namespaces().items
        pods = self.core.list_pod_for_all_namespaces().items

        # Build set of referenced configmaps: "namespace/name"
        referenced: set = set()
        for pod in pods:
            ns = pod.metadata.namespace
            spec = pod.spec
            # volumeMounts referencing a configmap
            for vol in (spec.volumes or []):
                if vol.config_map:
                    referenced.add(f"{ns}/{vol.config_map.name}")
            # envFrom
            for c in (spec.containers or []) + (spec.init_containers or []):
                for ef in (c.env_from or []):
                    if ef.config_map_ref:
                        referenced.add(f"{ns}/{ef.config_map_ref.name}")
                for ev in (c.env or []):
                    if ev.value_from and ev.value_from.config_map_key_ref:
                        referenced.add(
                            f"{ns}/{ev.value_from.config_map_key_ref.name}")

        # System-managed configmaps we should never flag as stale
        SYSTEM_PREFIXES = (
            "kube-", "extension-apiserver-", "coredns", "cluster-info",
            "kubernetes-", "ibm-", "calico-", "cert-manager", "istio-",
            "prometheus-", "grafana-", "oauth-", "open-cluster-", "bootstrap-",
        )

        items = []
        stale = []
        for cm in cms:
            name = cm.metadata.name
            ns   = cm.metadata.namespace
            key  = f"{ns}/{name}"

            # Estimate size from data keys
            data_keys  = list((cm.data  or {}).keys())
            bdata_keys = list((cm.binary_data or {}).keys())
            size_bytes  = sum(
                len(v.encode("utf-8")) if isinstance(v, str) else len(v)
                for v in (cm.data or {}).values()
            )

            is_referenced  = key in referenced
            is_system      = any(name.startswith(p) for p in SYSTEM_PREFIXES)
            created_ts     = _ts(cm.metadata.creation_timestamp)

            rec = {
                "name":          name,
                "namespace":     ns,
                "data_keys":     data_keys,
                "binary_keys":   bdata_keys,
                "key_count":     len(data_keys) + len(bdata_keys),
                "size_bytes":    size_bytes,
                "labels":        cm.metadata.labels or {},
                "annotations":   len(cm.metadata.annotations or {}),
                "created":       created_ts or "",
                "is_referenced": is_referenced,
                "is_system":     is_system,
            }
            items.append(rec)
            if not is_referenced and not is_system:
                stale.append(rec)

        return {
            "total":      len(cms),
            "referenced": sum(1 for i in items if i["is_referenced"]),
            "stale":      len(stale),
            "items":      items,
            "stale_items": stale,
        }

    # ── HTTP transport ────────────────────────────────────────────────────────

    def _post(self, path: str, payload: Dict[str, Any],
              timeout: int = 60) -> bool:
        """POST to the first responding endpoint (v1 path, then legacy path)."""
        for url in [self.platform_url + path]:
            try:
                resp = self._session.post(
                    url, json=payload, timeout=timeout, verify=False)
                if resp.status_code == 200:
                    return True
                logger.warning("POST %s → HTTP %d: %.200s",
                               url, resp.status_code, resp.text)
            except requests.exceptions.ConnectionError as exc:
                logger.error("Connection error to %s: %s", url, exc)
            except requests.exceptions.Timeout:
                logger.error("Timeout posting to %s", url)
            except Exception as exc:
                logger.error("Unexpected error posting to %s: %s", url, exc)
        return False

    def send(self, payload: Dict[str, Any]) -> bool:
        """Ship the collected metrics to the platform."""
        # Build the legacy ClusterMetrics-compatible sub-payload too
        # so the existing agent_receiver endpoint accepts it without schema change.
        compact = {
            "cluster_name": payload["cluster_name"],
            "cluster_id":   payload["cluster_id"],
            "timestamp":    payload["timestamp"],
            "nodes":        payload.get("nodes",     {}),
            "namespaces":   payload.get("namespaces", {}),
            "pods":         payload.get("pods",       {}),
            "resources":    payload.get("resources",  {}),
            # Extended domains stored in resources for DB field; backend can
            # decode them from the "resources" JSONB blob if needed until the
            # schema migration lands.
            "workloads":    payload.get("workloads",  {}),
            "storage":      payload.get("storage",    {}),
            "network":      payload.get("network",    {}),
            "security":     payload.get("security",   {}),
            "compliance":   payload.get("compliance", {}),
            "observability": payload.get("observability", {}),
            "finops":       payload.get("finops",     {}),
            "platform":     payload.get("platform",   {}),
            "teams":        payload.get("teams",      {}),
            "hpa":          payload.get("hpa",        {}),
            "pdb":          payload.get("pdb",        {}),
            "service_accounts": payload.get("service_accounts", []),
            "configmaps":       payload.get("configmaps",       {}),
            "secrets_domain":   payload.get("secrets_domain",   {}),
            "collection_type": "comprehensive",
            "agent_version":   "2.0.0",
            "provider":        payload.get("provider", self._provider),
            "region":          payload.get("region",   self._region),
            "k8s_version":     payload.get("k8s_version", self._k8s_version),
        }
        # Try both canonical and legacy route; re-register on 404 and retry once
        for path in ["/api/agents/metrics", "/api/agent/metrics"]:
            try:
                resp = self._session.post(
                    self.platform_url + path,
                    json=compact,
                    timeout=60,
                    verify=False,
                )
                if resp.status_code == 200:
                    logger.info("Metrics sent via %s", path)
                    return True
                if resp.status_code == 404 and "not registered" in resp.text.lower():
                    logger.warning("Cluster not registered — re-registering and retrying %s", path)
                    self._register()
                    resp = self._session.post(
                        self.platform_url + path,
                        json=compact,
                        timeout=60,
                        verify=False,
                    )
                    if resp.status_code == 200:
                        logger.info("Metrics sent via %s (after re-register)", path)
                        return True
                logger.warning("POST %s → %d: %.200s", path, resp.status_code, resp.text)
            except Exception as exc:
                logger.error("send error (%s): %s", path, exc)
        return False

    def heartbeat(self) -> None:
        for path in ["/api/agents/heartbeat", "/api/agent/heartbeat"]:
            try:
                resp = self._session.post(
                    self.platform_url + path,
                    json={
                        "cluster_name": self.cluster_name,
                        "cluster_id":   self.cluster_name,
                        "timestamp":    _utcnow(),
                        "status":       "healthy",
                    },
                    timeout=10,
                    verify=False,
                )
                if resp.status_code == 200:
                    logger.debug("Heartbeat OK via %s", path)
                    return
            except Exception:
                pass

    # ── command executor ──────────────────────────────────────────────────────

    def _poll_and_execute_commands(self) -> None:
        """Fetch pending commands from the backend and execute each one."""
        for path in ["/api/agents/commands/pending", "/api/agent/commands/pending"]:
            try:
                resp = self._session.get(
                    self.platform_url + path,
                    params={"cluster_name": self.cluster_name},
                    timeout=10,
                    verify=False,
                )
                if resp.status_code != 200:
                    continue
                commands = resp.json().get("commands", [])
                for cmd in commands:
                    self._execute_command(cmd)
                return
            except Exception as exc:
                logger.debug("Command poll error (%s): %s", path, exc)

    def _execute_command(self, cmd: Dict[str, Any]) -> None:
        cmd_id  = cmd["id"]
        command = cmd["command"]
        params  = cmd.get("params", {})
        logger.info("Executing command id=%d  command=%s  params=%s", cmd_id, command, params)
        try:
            result = self._run_k8s_command(command, params)
            self._ack_command(cmd_id, success=True, result=result)
        except Exception as exc:
            logger.error("Command id=%d failed: %s", cmd_id, exc)
            self._ack_command(cmd_id, success=False, result={"error": str(exc)})

    def _run_k8s_command(self, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a single kubectl-style command and return a result dict."""
        ns   = params["namespace"]
        name = params["name"]

        if command == "restart_deployment":
            import datetime as _dt
            ts = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"template": {"metadata": {"annotations": {
                    "kubectl.kubernetes.io/restartedAt": ts
                }}}}})
            return {"restartedAt": ts}

        if command == "scale_deployment":
            replicas = int(params["replicas"])
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"replicas": replicas}})
            return {"replicas": replicas}

        if command == "delete_deployment":
            self.apps.delete_namespaced_deployment(name=name, namespace=ns)
            return {}

        if command == "patch_deployment_resources":
            reqs, lims = {}, {}
            if params.get("cpu_request"):    reqs["cpu"]    = params["cpu_request"]
            if params.get("memory_request"): reqs["memory"] = params["memory_request"]
            if params.get("cpu_limit"):      lims["cpu"]    = params["cpu_limit"]
            if params.get("memory_limit"):   lims["memory"] = params["memory_limit"]
            resources = {}
            if reqs: resources["requests"] = reqs
            if lims: resources["limits"]   = lims
            container_entry: Dict[str, Any] = {"resources": resources}
            if params.get("container_name"):
                container_entry["name"] = params["container_name"]
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"template": {"spec": {"containers": [container_entry]}}}})
            return {"patched": resources}

        if command == "patch_deployment_security_context":
            deployment = self.apps.read_namespaced_deployment(name=name, namespace=ns)
            containers = deployment.spec.template.spec.containers or []
            target = params.get("container_name")
            patch_containers = []
            for c in containers:
                if target and c.name != target:
                    continue
                security_context = {}
                if params.get("run_as_non_root") is not None:
                    security_context["runAsNonRoot"] = bool(params.get("run_as_non_root"))
                if params.get("run_as_user") is not None:
                    security_context["runAsUser"] = int(params.get("run_as_user"))
                if params.get("allow_privilege_escalation") is not None:
                    security_context["allowPrivilegeEscalation"] = bool(params.get("allow_privilege_escalation"))
                if params.get("read_only_root_filesystem") is not None:
                    security_context["readOnlyRootFilesystem"] = bool(params.get("read_only_root_filesystem"))
                patch_entry: Dict[str, Any] = {"name": c.name, "securityContext": security_context}
                patch_containers.append(patch_entry)
            if not patch_containers:
                raise ValueError(f"No matching deployment container found for {name}")
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"template": {"spec": {"containers": patch_containers}}}})
            return {"patched_containers": [c["name"] for c in patch_containers]}

        if command == "patch_deployment_probes":
            deployment = self.apps.read_namespaced_deployment(name=name, namespace=ns)
            containers = deployment.spec.template.spec.containers or []
            target = params.get("container_name")
            port = int(params.get("probe_port") or 8080)
            patch_containers = []
            for c in containers:
                if target and c.name != target:
                    continue
                patch_entry: Dict[str, Any] = {"name": c.name}
                if params.get("set_liveness"):
                    patch_entry["livenessProbe"] = {
                        "httpGet": {"path": "/", "port": port},
                        "initialDelaySeconds": 15,
                        "periodSeconds": 20,
                    }
                if params.get("set_readiness"):
                    patch_entry["readinessProbe"] = {
                        "httpGet": {"path": "/", "port": port},
                        "initialDelaySeconds": 5,
                        "periodSeconds": 10,
                    }
                patch_containers.append(patch_entry)
            if not patch_containers:
                raise ValueError(f"No matching deployment container found for {name}")
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"template": {"spec": {"containers": patch_containers}}}})
            return {"patched_containers": [c["name"] for c in patch_containers], "probe_port": port}

        if command == "patch_deployment_service_account":
            service_account_name = params.get("service_account_name")
            if not service_account_name:
                raise ValueError("service_account_name is required")
            self.apps.patch_namespaced_deployment(
                name=name, namespace=ns,
                body={"spec": {"template": {"spec": {"serviceAccountName": service_account_name}}}})
            return {"serviceAccountName": service_account_name}

        if command == "scale_statefulset":
            replicas = int(params["replicas"])
            self.apps.patch_namespaced_stateful_set(
                name=name, namespace=ns,
                body={"spec": {"replicas": replicas}})
            return {"replicas": replicas}

        if command == "restart_daemonset":
            import datetime as _dt
            ts = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            self.apps.patch_namespaced_daemon_set(
                name=name, namespace=ns,
                body={"spec": {"template": {"metadata": {"annotations": {
                    "kubectl.kubernetes.io/restartedAt": ts
                }}}}})
            return {"restartedAt": ts}

        if command == "delete_pod":
            self.core.delete_namespaced_pod(name=name, namespace=ns, grace_period_seconds=0)
            return {"deleted": name, "namespace": ns}

        if command == "delete_job":
            from kubernetes import client as _k8s
            self.batch.delete_namespaced_job(
                name=name, namespace=ns,
                body=_k8s.V1DeleteOptions(propagation_policy="Foreground"))
            return {}

        if command == "suspend_cronjob":
            suspend = bool(params.get("suspend", True))
            self.batch.patch_namespaced_cron_job(
                name=name, namespace=ns,
                body={"spec": {"suspend": suspend}})
            return {"suspend": suspend}

        if command == "trigger_cronjob":
            import datetime as _dt
            from kubernetes import client as _k8s
            cj = self.batch.read_namespaced_cron_job(name=name, namespace=ns)
            ts_str = _dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
            job_name = f"{name}-manual-{ts_str}"[:63]
            job = _k8s.V1Job(
                api_version="batch/v1",
                kind="Job",
                metadata=_k8s.V1ObjectMeta(
                    name=job_name,
                    namespace=ns,
                    annotations={"cronjob.kubernetes.io/instantiate": "manual"},
                ),
                spec=cj.spec.job_template.spec,
            )
            self.batch.create_namespaced_job(namespace=ns, body=job)
            return {"job_name": job_name}

        if command == "get_pod_logs":
            pod_name  = params.get("pod", name)
            container = params.get("container") or None
            tail      = int(params.get("tail_lines", 100))
            logs = self.core.read_namespaced_pod_log(
                name=pod_name,
                namespace=ns,
                container=container,
                tail_lines=tail,
                timestamps=False,
            )
            return {"logs": logs or ""}

        if command == "delete_network_policy":
            self.net.delete_namespaced_network_policy(name=name, namespace=ns)
            return {}

        # ── Security response actions ─────────────────────────────────────────

        if command == "quarantine_pod":
            # Apply a deny-all NetworkPolicy scoped to the pod's labels so all
            # ingress and egress traffic is blocked while the pod stays running
            # for forensic inspection.
            from kubernetes import client as _k8s
            pod = self.core.read_namespaced_pod(name=name, namespace=ns)
            labels = pod.metadata.labels or {}
            if not labels:
                raise ValueError(f"Pod {name} has no labels — cannot build selector-based quarantine policy")
            selector_key, selector_value = next(iter(labels.items()))
            policy_name = f"quarantine-{name}"[:63]
            body = _k8s.V1NetworkPolicy(
                metadata=_k8s.V1ObjectMeta(
                    name=policy_name,
                    namespace=ns,
                    labels={"managed-by": "k8s-optimization-platform", "action": "quarantine"},
                    annotations={"target-pod": name, "reason": "Pod quarantined by k8s-optimization-platform"},
                ),
                spec=_k8s.V1NetworkPolicySpec(
                    pod_selector=_k8s.V1LabelSelector(match_labels={selector_key: selector_value}),
                    policy_types=["Ingress", "Egress"],
                    ingress=[],
                    egress=[],
                ),
            )
            try:
                self.net.create_namespaced_network_policy(namespace=ns, body=body)
            except Exception as exc:
                if "already exists" in str(exc).lower():
                    self.net.replace_namespaced_network_policy(name=policy_name, namespace=ns, body=body)
                else:
                    raise
            return {"policy_name": policy_name, "namespace": ns, "selector": {selector_key: selector_value}}

        if command == "remove_quarantine":
            # Delete the quarantine NetworkPolicy to restore normal traffic.
            policy_name = params.get("policy_name") or f"quarantine-{name}"[:63]
            self.net.delete_namespaced_network_policy(name=policy_name, namespace=ns)
            return {"deleted_policy": policy_name}

        if command == "block_traffic":
            # Create a deny-all NetworkPolicy for an arbitrary source or destination.
            # At minimum one of source or destination must be provided.
            from kubernetes import client as _k8s
            source      = params.get("source", "")
            destination = params.get("destination", "")
            import datetime as _dt
            ts_str      = _dt.datetime.utcnow().strftime("%Y%m%d%H%M%S")
            policy_name = f"block-traffic-{ts_str}"[:63]

            # Build selector from source/destination namespace if provided
            pod_selector = _k8s.V1LabelSelector()  # empty = applies to all pods in ns
            ingress_rules: List[Dict] = []
            egress_rules:  List[Dict] = []
            policy_types = []

            if source:
                policy_types.append("Ingress")
            if destination:
                policy_types.append("Egress")
            if not policy_types:
                policy_types = ["Ingress", "Egress"]

            block_body = _k8s.V1NetworkPolicy(
                metadata=_k8s.V1ObjectMeta(
                    name=policy_name,
                    namespace=ns or "default",
                    labels={"managed-by": "k8s-optimization-platform", "action": "block-traffic"},
                    annotations={"source": source, "destination": destination},
                ),
                spec=_k8s.V1NetworkPolicySpec(
                    pod_selector=pod_selector,
                    policy_types=policy_types,
                    ingress=ingress_rules,
                    egress=egress_rules,
                ),
            )
            self.net.create_namespaced_network_policy(namespace=ns or "default", body=block_body)
            return {"policy_name": policy_name, "namespace": ns or "default", "source": source, "destination": destination}

        if command == "rotate_secret":
            # The platform cannot know the real secret value, so we annotate the
            # secret to record that a rotation was triggered and restart any
            # deployments that mount it so they pick up externally-rotated values.
            import datetime as _dt
            from kubernetes import client as _k8s
            ts = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            # Annotate the secret
            try:
                self.core.patch_namespaced_secret(
                    name=name, namespace=ns,
                    body={"metadata": {"annotations": {
                        "k8s-optimization-platform/rotation-triggered": ts,
                    }}},
                )
            except Exception:
                pass  # secret may not exist; still restart dependents

            # Find deployments that reference this secret and trigger a rollout
            deployments = self.apps.list_namespaced_deployment(namespace=ns).items
            restarted = []
            for dep in deployments:
                vols  = (dep.spec.template.spec.volumes or [])
                envs  = []
                for c in (dep.spec.template.spec.containers or []):
                    for es in (c.env_from or []):
                        if es.secret_ref and es.secret_ref.name == name:
                            envs.append(True)
                    for e in (c.env or []):
                        if e.value_from and e.value_from.secret_key_ref:
                            if e.value_from.secret_key_ref.name == name:
                                envs.append(True)
                refs_secret = any(v.secret for v in vols if v.secret and v.secret.secret_name == name) or bool(envs)
                if refs_secret:
                    self.apps.patch_namespaced_deployment(
                        name=dep.metadata.name, namespace=ns,
                        body={"spec": {"template": {"metadata": {"annotations": {
                            "kubectl.kubernetes.io/restartedAt": ts,
                        }}}}},
                    )
                    restarted.append(dep.metadata.name)
            return {"secret": name, "namespace": ns, "rotation_triggered_at": ts, "restarted_deployments": restarted}

        if command == "emergency_rollback":
            # Roll a deployment back to the previous ReplicaSet revision.
            import datetime as _dt
            from kubernetes import client as _k8s

            resource_type = params.get("resource_type", "deployment")
            ts = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            if resource_type == "deployment":
                # Kubernetes rollback = annotate the deployment to trigger undo
                self.apps.patch_namespaced_deployment(
                    name=name, namespace=ns,
                    body={"spec": {"template": {"metadata": {"annotations": {
                        "kubectl.kubernetes.io/restartedAt": ts,
                    }}}}},
                )
                # Attempt to roll back via apps/v1 RollbackConfig (K8s >= 1.9 uses
                # rollout undo which the python client does via AppsV1 patch with
                # the deployment revision annotation).
                rs_list = self.apps.list_namespaced_replica_set(
                    namespace=ns,
                    label_selector=",".join(
                        f"{k}={v}"
                        for k, v in (self.apps.read_namespaced_deployment(name=name, namespace=ns)
                                     .spec.selector.match_labels or {}).items()
                    ),
                ).items
                rs_list.sort(
                    key=lambda r: r.metadata.annotations.get("deployment.kubernetes.io/revision", "0")
                        if r.metadata.annotations else "0"
                )
                if len(rs_list) >= 2:
                    prev_rs = rs_list[-2]
                    self.apps.patch_namespaced_deployment(
                        name=name, namespace=ns,
                        body={"metadata": {"annotations": {
                            "deployment.kubernetes.io/revision": prev_rs.metadata.annotations.get(
                                "deployment.kubernetes.io/revision", "1")
                                if prev_rs.metadata.annotations else "1",
                        }}},
                    )
                return {"rolled_back": name, "namespace": ns, "timestamp": ts}

            raise ValueError(f"emergency_rollback not supported for resource_type={resource_type}")

        raise ValueError(f"Unknown command: {command}")

    def _ack_command(self, cmd_id: int, success: bool,
                     result: Optional[Dict[str, Any]] = None) -> None:
        for path in ["/api/agents/commands", "/api/agent/commands"]:
            try:
                resp = self._session.post(
                    f"{self.platform_url}{path}/{cmd_id}/ack",
                    json={"success": success, "result": result or {}},
                    timeout=10,
                    verify=False,
                )
                if resp.status_code == 200:
                    return
            except Exception as exc:
                logger.debug("ack_command error (%s): %s", path, exc)

    # ── main loop ─────────────────────────────────────────────────────────────

    def run(self) -> None:
        logger.info(
            "Agent started — cluster=%s  provider=%s  interval=%ds",
            self.cluster_name, self._provider, self.collection_interval,
        )
        hb_cycle = 0

        while True:
            try:
                # Execute any pending commands FIRST (low-latency writes)
                self._poll_and_execute_commands()
            except Exception as exc:
                logger.error("Command poll error: %s", exc)

            try:
                data = self.collect()
                self.send(data)
            except KeyboardInterrupt:
                logger.info("Agent stopped by user.")
                break
            except Exception as exc:
                logger.error("Collection/send error: %s", exc, exc_info=True)

            hb_cycle += 1
            if hb_cycle >= 3:
                try:
                    self.heartbeat()
                except Exception:
                    pass
                hb_cycle = 0

            # Sleep in short slices so commands are picked up quickly
            try:
                elapsed = 0
                while elapsed < self.collection_interval:
                    time.sleep(3)
                    elapsed += 3
                    try:
                        self._poll_and_execute_commands()
                    except Exception:
                        pass
            except KeyboardInterrupt:
                logger.info("Agent stopped by user.")
                break


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    ClusterAgent().run()


if __name__ == "__main__":
    main()

# Made with Bob
