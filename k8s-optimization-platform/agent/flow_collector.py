#!/usr/bin/env python3
"""
K8s Optimization Platform — Network Flow Collector (v0, conntrack-based)
=========================================================================
Reads this node's connection-tracking table and reports pod-to-pod traffic
as aggregated (source, destination, port, protocol, connection count)
records — no packet content, no payload bytes, ever.

This is a SEPARATE component from agent.py, deployed as a DaemonSet (one
pod per node) rather than a single Deployment, because it needs different
privileges:

  agent.py            — 1 replica, talks only to the K8s API server,
                         all Linux capabilities dropped, runs as non-root.
  flow_collector.py    — 1 pod PER NODE, hostNetwork: true, CAP_NET_ADMIN,
                         reads the host's live connection table.

That's a real increase in trust and attack surface (this pod can see every
byte-free connection tuple that crosses the node), so it's deployed as an
opt-in DaemonSet rather than folded into the existing low-privilege agent.

KNOWN LIMITATION — read this before deploying:
  This reads /proc/net/nf_conntrack, which is populated by the kernel's
  netfilter/iptables conntrack subsystem. CNIs that route pod traffic
  through iptables/nftables (Calico in iptables mode, Flannel, kube-router,
  kube-proxy in iptables/ipvs mode) populate this table normally.
  CNIs using an eBPF datapath that bypasses netfilter for pod-to-pod
  traffic (e.g. Cilium in native eBPF mode, some Antrea configurations)
  may show little or no pod-to-pod traffic here even though it's flowing —
  the packets never touch conntrack. If you're on one of those, this
  approach needs to be replaced with an eBPF-based collector (kprobes on
  tcp_connect/tcp_close, or a Cilium/Tetragon integration) instead of
  conntrack polling. Verify against your actual CNI before relying on this.

Environment Variables:
  PLATFORM_URL          Backend base URL (shared with agent.py's config)
  API_TOKEN             Bearer token issued by the platform
  CLUSTER_NAME           Human-readable cluster name
  NODE_NAME             Injected via downward API (spec.nodeName)
  COLLECTION_INTERVAL   Seconds between flow batches (default: 30)
  LOG_LEVEL             DEBUG | INFO | WARNING (default: INFO)
"""

from __future__ import annotations

import logging
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

import requests
import urllib3
from kubernetes import client, config

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("flow-collector")

CONNTRACK_PATH = "/host/proc/net/nf_conntrack"  # host /proc mounted read-only, see DaemonSet manifest
POD_IP_REFRESH_INTERVAL = 60  # seconds between re-syncing the IP -> pod map

# Matches lines like:
#   ipv4     2 tcp      6 431999 ESTABLISHED src=10.1.2.3 dst=10.1.4.5 sport=53212 dport=8080 ...
_CONNTRACK_LINE_RE = re.compile(
    r"^\w+\s+\d+\s+(?P<proto>tcp|udp)\s+\d+\s+\d+\s+(?:\S+\s+)?"
    r"src=(?P<src>[\d.]+)\s+dst=(?P<dst>[\d.]+)\s+sport=\d+\s+dport=(?P<dport>\d+)"
)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class FlowCollector:
    def __init__(self):
        self.platform_url = os.getenv("PLATFORM_URL", "http://localhost:8000").rstrip("/")
        self.api_token = os.getenv("API_TOKEN", "")
        self.cluster_name = os.getenv("CLUSTER_NAME", "")
        self.node_name = os.getenv("NODE_NAME", "")
        self.interval = int(os.getenv("COLLECTION_INTERVAL", "30"))

        if not self.api_token or not self.cluster_name or not self.node_name:
            logger.error("API_TOKEN, CLUSTER_NAME, and NODE_NAME are all required")
            raise SystemExit(1)

        try:
            config.load_incluster_config()
        except Exception:
            config.load_kube_config()
        self.core = client.CoreV1Api()

        self._ip_to_pod: Dict[str, Tuple[str, str]] = {}  # ip -> (namespace, pod_name)
        self._ip_map_updated_at = 0.0

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        })

    # ── pod IP resolution ──────────────────────────────────────────────────

    def _refresh_pod_ip_map(self):
        """Rebuild the IP -> (namespace, pod) map for pods on this node only."""
        now = time.monotonic()
        if now - self._ip_map_updated_at < POD_IP_REFRESH_INTERVAL:
            return
        try:
            pods = self.core.list_pod_for_all_namespaces(
                field_selector=f"spec.nodeName={self.node_name}"
            ).items
            new_map: Dict[str, Tuple[str, str]] = {}
            for p in pods:
                if p.status and p.status.pod_ip:
                    new_map[p.status.pod_ip] = (p.metadata.namespace, p.metadata.name)
            self._ip_to_pod = new_map
            self._ip_map_updated_at = now
            logger.debug("Refreshed pod IP map: %d pods on node '%s'", len(new_map), self.node_name)
        except Exception as e:
            logger.warning("Failed to refresh pod IP map: %s", e)

    def _resolve(self, ip: str) -> Optional[Tuple[str, str]]:
        return self._ip_to_pod.get(ip)

    # ── conntrack reading ───────────────────────────────────────────────────

    def _read_flows(self) -> Counter:
        """Read the host conntrack table and aggregate into flow-tuple counts.

        Returns a Counter keyed by
        (src_namespace, src_pod, dst_namespace, dst_pod, dst_port, protocol)
        — never anything that includes packet content or payload size.
        """
        flows: Counter = Counter()

        try:
            with open(CONNTRACK_PATH, "r") as f:
                for line in f:
                    m = _CONNTRACK_LINE_RE.match(line)
                    if not m:
                        continue

                    src = self._resolve(m.group("src"))
                    dst = self._resolve(m.group("dst"))
                    # Only keep connections where BOTH ends are pods we recognize
                    # on this node's pod map — drops node-to-internet, kubelet
                    # health checks, and anything we can't attribute cleanly.
                    if not src or not dst:
                        continue

                    src_ns, src_pod = src
                    dst_ns, dst_pod = dst
                    flows[(src_ns, src_pod, dst_ns, dst_pod, m.group("dport"), m.group("proto"))] += 1

        except FileNotFoundError:
            logger.warning(
                "%s not found — is nf_conntrack loaded and /host/proc mounted? "
                "See the KNOWN LIMITATION note in this file's docstring.",
                CONNTRACK_PATH,
            )
        except PermissionError:
            logger.error(
                "Permission denied reading %s — the pod needs CAP_NET_ADMIN. "
                "Check the DaemonSet's securityContext.",
                CONNTRACK_PATH,
            )
        except Exception as e:
            logger.error("Error reading conntrack table: %s", e)

        return flows

    # ── transmission ────────────────────────────────────────────────────────

    def _send(self, flows: Counter):
        if not flows:
            logger.debug("No attributable flows this cycle")
            return

        records = [
            {
                "src_namespace": src_ns, "src_pod": src_pod,
                "dst_namespace": dst_ns, "dst_pod": dst_pod,
                "dst_port": int(dport), "protocol": proto,
                "connection_count": count,
            }
            for (src_ns, src_pod, dst_ns, dst_pod, dport, proto), count in flows.items()
        ]

        payload = {
            "cluster_name": self.cluster_name,
            "node_name": self.node_name,
            "timestamp": _utcnow(),
            "flows": records,
        }

        try:
            resp = self.session.post(
                f"{self.platform_url}/api/agents/network-flows",
                json=payload,
                timeout=15,
                # NOTE: verify=False inherited from agent.py's existing pattern —
                # see the TLS verification issue flagged separately. Fix both
                # together rather than diverging between the two components.
                verify=False,
            )
            if resp.status_code == 200:
                logger.info("Sent %d flow records from node '%s'", len(records), self.node_name)
            else:
                logger.warning("Flow batch rejected: %s %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("Failed to send flow batch: %s", e)

    # ── main loop ────────────────────────────────────────────────────────────

    def run(self):
        logger.info(
            "Flow collector starting on node '%s' for cluster '%s' (interval=%ds)",
            self.node_name, self.cluster_name, self.interval,
        )
        while True:
            try:
                self._refresh_pod_ip_map()
                flows = self._read_flows()
                self._send(flows)
            except Exception as e:
                logger.error("Unhandled error in collection cycle: %s", e)
            time.sleep(self.interval)


if __name__ == "__main__":
    FlowCollector().run()
