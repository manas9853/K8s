#!/usr/bin/env python3
"""
Self-check for node_scanner.py's scan logic. Run directly:
python3 test_node_scanner.py
No pytest, no live cluster/containerd socket — mocks subprocess.run to
verify the trivy invocation (command args, CONTAINERD_NAMESPACE env var)
and result handling for the success/timeout/bad-exit/bad-json cases.
"""
import os
import subprocess
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("PLATFORM_URL", "http://test")
os.environ.setdefault("API_TOKEN", "test-token")
os.environ.setdefault("NODE_NAME", "test-node")

import node_scanner


def _fake_completed(returncode: int, stdout: bytes = b"", stderr: bytes = b""):
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


def demo():
    # Success: valid trivy JSON, returncode 0
    with patch.object(subprocess, "run", return_value=_fake_completed(
        0, stdout=b'{"SchemaVersion": 2, "Results": []}'
    )) as mock_run:
        result = node_scanner._scan_one_image("nginx:latest")
        assert result["scan_status"] == "scanned", result
        assert result["raw_report"]["SchemaVersion"] == 2, result
        cmd = mock_run.call_args.args[0]
        assert "--image-src" in cmd and "containerd" in cmd, cmd
        env = mock_run.call_args.kwargs["env"]
        assert env["CONTAINERD_NAMESPACE"] == "k8s.io", env

    # returncode 1 = vulnerabilities found, still a valid scan
    with patch.object(subprocess, "run", return_value=_fake_completed(
        1, stdout=b'{"SchemaVersion": 2, "Results": []}'
    )):
        result = node_scanner._scan_one_image("app:v1")
        assert result["scan_status"] == "scanned", result

    # Bad exit code -> error, not a crash
    with patch.object(subprocess, "run", return_value=_fake_completed(
        2, stderr=b"image not found in containerd store"
    )):
        result = node_scanner._scan_one_image("missing:latest")
        assert result["scan_status"] == "error", result
        assert "not found" in result["error_message"], result

    # Malformed JSON -> error, not a crash
    with patch.object(subprocess, "run", return_value=_fake_completed(0, stdout=b"not json")):
        result = node_scanner._scan_one_image("weird:latest")
        assert result["scan_status"] == "error", result

    # Timeout -> error, not a crash
    with patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired(cmd="trivy", timeout=1)):
        result = node_scanner._scan_one_image("slow:latest")
        assert result["scan_status"] == "error" and "timed out" in result["error_message"], result

    print("OK: node_scanner trivy invocation + error-handling checks passed")


if __name__ == "__main__":
    demo()
