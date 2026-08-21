#!/usr/bin/env python3
"""
Node Image Scanner — DaemonSet sidecar to the main cluster agent.
=====================================================================
Scans every container image actually running on THIS node using Trivy's
containerd source (--image-src containerd), reading straight from the
node's local image store over the containerd socket. This needs zero
registry credentials — the image is already pulled locally, regardless
of whether it came from a public or private registry — which is exactly
what the network-pull based scanning in backend/services/trivy_scanner.py
can never do for a customer's private registry.

One process per node (via DaemonSet). Runs on the schedule below,
enumerates images from pods scheduled to this node via the K8s API
(fieldSelector spec.nodeName=$NODE_NAME — no cluster-wide list needed),
then posts results to the backend, tagged with node + cluster.

Environment Variables:
  PLATFORM_URL        Backend base URL (same as the main agent)
  API_TOKEN           Bearer token (same as the main agent)
  CLUSTER_NAME        Human-readable cluster name
  NODE_NAME           This node's name (downward API: spec.nodeName)
  SCAN_INTERVAL       Seconds between full node scans (default: 21600 = 6h)
  SCAN_TIMEOUT        Per-image trivy timeout in seconds (default: 120)
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import time
from typing import Any, Dict, List, Set

import requests
from kubernetes import client, config
from kubernetes.client.rest import ApiException

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] node-scanner: %(message)s",
)
logger = logging.getLogger("node-scanner")

PLATFORM_URL   = os.getenv("PLATFORM_URL", "").rstrip("/")
API_TOKEN      = os.getenv("API_TOKEN", "")
CLUSTER_NAME   = os.getenv("CLUSTER_NAME", "unknown")
NODE_NAME      = os.getenv("NODE_NAME", "")
SCAN_INTERVAL  = int(os.getenv("SCAN_INTERVAL", str(6 * 3600)))
SCAN_TIMEOUT   = int(os.getenv("SCAN_TIMEOUT", "120"))
TRIVY_BINARY   = os.getenv("TRIVY_BINARY", "/usr/local/bin/trivy")

if not (PLATFORM_URL and API_TOKEN and NODE_NAME):
    logger.error("PLATFORM_URL, API_TOKEN, and NODE_NAME (downward API) are required.")
    sys.exit(1)


def _load_k8s_config() -> None:
    try:
        config.load_incluster_config()
    except Exception:
        config.load_kube_config()


def _images_on_this_node(core: client.CoreV1Api) -> Set[str]:
    """Unique image references from every pod scheduled to this node."""
    pods = core.list_pod_for_all_namespaces(
        field_selector=f"spec.nodeName={NODE_NAME}"
    ).items
    images: Set[str] = set()
    for pod in pods:
        for c in (pod.spec.containers or []) + (pod.spec.init_containers or []):
            if c.image:
                images.add(c.image)
    return images


def _scan_one_image(image: str) -> Dict[str, Any]:
    """
    Run trivy against the node-local containerd image store. No registry
    credentials involved — the image is already pulled onto this node.
    """
    env = dict(os.environ)
    # kubelet/containerd store pod images under the k8s.io namespace, not
    # containerd's own "default" — this is the #1 reason a naive
    # `trivy image --image-src containerd` comes back empty on a K8s node.
    env["CONTAINERD_NAMESPACE"] = "k8s.io"

    cmd = [
        TRIVY_BINARY, "image",
        "--image-src", "containerd",
        "--no-progress",
        "--format", "json",
        "--timeout", f"{SCAN_TIMEOUT}s",
        image,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=SCAN_TIMEOUT + 10, env=env)
    except subprocess.TimeoutExpired:
        return {"image": image, "scan_status": "error", "error_message": "scan timed out"}

    if proc.returncode not in (0, 1):  # 1 = vulnerabilities found, still valid JSON
        stderr = proc.stderr.decode("utf-8", errors="replace")[:300]
        return {"image": image, "scan_status": "error", "error_message": stderr}

    try:
        raw = json.loads(proc.stdout.decode("utf-8", errors="replace") or "{}")
    except json.JSONDecodeError as e:
        return {"image": image, "scan_status": "error", "error_message": f"bad JSON: {e}"}

    return {"image": image, "scan_status": "scanned", "raw_report": raw}


def _post_results(node_results: List[Dict[str, Any]]) -> None:
    url = f"{PLATFORM_URL}/api/agents/node-image-scans"
    payload = {
        "cluster_name": CLUSTER_NAME,
        "node_name":    NODE_NAME,
        "scanned_at":   time.time(),
        "results":      node_results,
    }
    try:
        resp = requests.post(
            url, json=payload, timeout=30,
            headers={"Authorization": f"Bearer {API_TOKEN}"},
        )
        if resp.status_code >= 300:
            logger.warning(f"backend rejected scan results: HTTP {resp.status_code} {resp.text[:200]}")
    except requests.RequestException as e:
        logger.warning(f"failed to post scan results: {e}")


def run_cycle() -> None:
    _load_k8s_config()
    core = client.CoreV1Api()

    try:
        images = _images_on_this_node(core)
    except ApiException as e:
        logger.error(f"could not list pods on {NODE_NAME}: {e}")
        return

    logger.info(f"scanning {len(images)} image(s) on node {NODE_NAME}")
    results = [_scan_one_image(img) for img in sorted(images)]

    scanned = sum(1 for r in results if r["scan_status"] == "scanned")
    errored = len(results) - scanned
    logger.info(f"node scan complete: {scanned} scanned, {errored} errored")

    _post_results(results)


def main() -> None:
    logger.info(f"node-scanner starting on {NODE_NAME} (cluster={CLUSTER_NAME}, interval={SCAN_INTERVAL}s)")
    while True:
        try:
            run_cycle()
        except Exception as e:
            logger.error(f"scan cycle failed: {e}", exc_info=True)
        time.sleep(SCAN_INTERVAL)


if __name__ == "__main__":
    main()
