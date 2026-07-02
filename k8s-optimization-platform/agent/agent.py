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
    """Convert Kubernetes CPU string ('500m', '2', '2000m') → cores (float)."""
    if not cpu_str:
        return 0.0
    s = str(cpu_str).strip()
    if s.endswith("m"):
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

                statuses.append({
                    "name":          cs.name,
                    "ready":         cs.ready,
                    "restart_count": rc,
                    "state":         state,
                    "image":         cs.image,
                    "image_id":      cs.image_id or "",
                })

            if total_restarts > 5:
                restart_issues.append({
                    "pod":           pod.metadata.name,
                    "namespace":     pod.metadata.namespace,
                    "restart_count": total_restarts,
                    "node":          pod.spec.node_name,
                })

            phase = (pod.status.phase or "Unknown").lower()
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
                "total_restarts":    total_restarts,
                "containers":        containers,
                "container_statuses": statuses,
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

        def _ds(d):
            return {
                "name":              d.metadata.name,
                "namespace":         d.metadata.namespace,
                "desired":           d.status.desired_number_scheduled or 0,
                "current":           d.status.current_number_scheduled or 0,
                "ready":             d.status.number_ready or 0,
                "available":         d.status.number_available or 0,
                "misscheduled":      d.status.number_misscheduled or 0,
                "labels":            d.metadata.labels or {},
                "update_strategy":   (d.spec.update_strategy.type
                                      if d.spec.update_strategy else "RollingUpdate"),
                "created":           _ts(d.metadata.creation_timestamp),
            }

        def _job(j):
            return {
                "name":       j.metadata.name,
                "namespace":  j.metadata.namespace,
                "completions": j.spec.completions,
                "parallelism": j.spec.parallelism,
                "active":     j.status.active or 0,
                "succeeded":  j.status.succeeded or 0,
                "failed":     j.status.failed or 0,
                "labels":     j.metadata.labels or {},
                "created":    _ts(j.metadata.creation_timestamp),
                "start_time": _ts(j.status.start_time),
                "completion_time": _ts(j.status.completion_time),
                "suspended":  bool(j.spec.suspend),
            }

        def _cj(cj):
            return {
                "name":            cj.metadata.name,
                "namespace":       cj.metadata.namespace,
                "schedule":        cj.spec.schedule,
                "suspend":         bool(cj.spec.suspend),
                "active_jobs":     len(cj.status.active or []),
                "last_schedule":   _ts(cj.status.last_schedule_time),
                "last_success":    _ts(cj.status.last_successful_time),
                "concurrency":     cj.spec.concurrency_policy or "Allow",
                "labels":          cj.metadata.labels or {},
                "created":         _ts(cj.metadata.creation_timestamp),
            }

        # Orphaned ReplicaSets (desired > 0, no Deployment parent owns them as live)
        orphaned_rs = [
            {
                "name":      rs.metadata.name,
                "namespace": rs.metadata.namespace,
                "replicas":  rs.spec.replicas or 0,
            }
            for rs in rsets
            if (rs.spec.replicas or 0) == 0
            and any(
                ref.kind == "Deployment"
                for ref in (rs.metadata.owner_references or [])
            )
        ]

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

    def _storage(self) -> Dict[str, Any]:
        pvcs = self.core.list_persistent_volume_claim_for_all_namespaces().items
        pvs  = self.core.list_persistent_volume().items
        scs  = self.storage.list_storage_class().items

        pvc_list: List[Dict] = []
        orphaned_pvcs: List[Dict] = []

        for pvc in pvcs:
            size = "0"
            if pvc.spec.resources and pvc.spec.resources.requests:
                size = pvc.spec.resources.requests.get("storage", "0")
            rec = {
                "name":          pvc.metadata.name,
                "namespace":     pvc.metadata.namespace,
                "status":        pvc.status.phase,
                "volume_name":   pvc.spec.volume_name,
                "storage_class": pvc.spec.storage_class_name,
                "size":          size,
                "size_bytes":    _parse_memory(size),
                "access_modes":  pvc.spec.access_modes or [],
                "labels":        pvc.metadata.labels or {},
                "created":       _ts(pvc.metadata.creation_timestamp),
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
            rec = {
                "name":         svc.metadata.name,
                "namespace":    svc.metadata.namespace,
                "type":         svc.spec.type or "ClusterIP",
                "cluster_ip":   svc.spec.cluster_ip,
                "external_ips": svc.spec.external_i_ps or [],
                "load_balancer_ip": (
                    svc.status.load_balancer.ingress[0].ip
                    if svc.status.load_balancer
                    and svc.status.load_balancer.ingress
                    else None
                ),
                "ports": [
                    {
                        "port":        p.port,
                        "protocol":    p.protocol or "TCP",
                        "target_port": str(p.target_port),
                        "node_port":   p.node_port,
                    }
                    for p in (svc.spec.ports or [])
                ],
                "selector":  svc.spec.selector or {},
                "labels":    svc.metadata.labels or {},
                "created":   _ts(svc.metadata.creation_timestamp),
            }
            svc_list.append(rec)
            if svc.spec.type in ("LoadBalancer", "NodePort"):
                external_svcs.append(rec)

        ing_list = []
        for ing in ings:
            rules = []
            for rule in (ing.spec.rules or []):
                if rule.http:
                    for path in (rule.http.paths or []):
                        rules.append({
                            "host":    rule.host,
                            "path":    path.path,
                            "service": (
                                path.backend.service.name
                                if path.backend and path.backend.service else None
                            ),
                        })
            ing_list.append({
                "name":      ing.metadata.name,
                "namespace": ing.metadata.namespace,
                "rules":     rules,
                "tls":       [{"hosts": t.hosts} for t in (ing.spec.tls or [])],
                "class":     (ing.spec.ingress_class_name or
                              (ing.metadata.annotations or {}).get(
                                  "kubernetes.io/ingress.class", "")),
                "labels":    ing.metadata.labels or {},
                "created":   _ts(ing.metadata.creation_timestamp),
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

        warning_events: List[Dict] = []
        recent_events:  List[Dict] = []

        for ev in events:
            rec = {
                "name":      ev.metadata.name,
                "namespace": ev.metadata.namespace,
                "type":      ev.type or "Normal",
                "reason":    ev.reason or "",
                "message":   (ev.message or "")[:500],
                "object_kind": ev.involved_object.kind or "",
                "object_name": ev.involved_object.name or "",
                "count":     ev.count or 1,
                "first_time": _ts(ev.first_timestamp),
                "last_time":  _ts(ev.last_timestamp),
            }
            if ev.type == "Warning":
                warning_events.append(rec)
            if ev.last_timestamp:
                age_s = (now - ev.last_timestamp).total_seconds()
                if age_s < 3600:
                    recent_events.append(rec)

        return {
            "events": {
                "total":          len(events),
                "warnings":       len(warning_events),
                "recent_count":   len(recent_events),
                "warning_events": warning_events[:100],
                "recent_events":  recent_events[:100],
            }
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

    # ── main loop ─────────────────────────────────────────────────────────────

    def run(self) -> None:
        logger.info(
            "Agent started — cluster=%s  provider=%s  interval=%ds",
            self.cluster_name, self._provider, self.collection_interval,
        )
        hb_cycle = 0

        while True:
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

            try:
                time.sleep(self.collection_interval)
            except KeyboardInterrupt:
                logger.info("Agent stopped by user.")
                break


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    ClusterAgent().run()


if __name__ == "__main__":
    main()

# Made with Bob
