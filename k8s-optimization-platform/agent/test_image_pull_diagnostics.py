#!/usr/bin/env python3
"""
Self-check for the Phase B image-pull diagnostic probe (agent.py):
_parse_image_ref and _interpret_manifest_response. Run directly:
python3 test_image_pull_diagnostics.py
Pure-function checks only — no network needed. See
verify_registry_check_live.py for a real Docker Hub round-trip.
"""
from agent import _parse_image_ref, _interpret_manifest_response


def demo():
    assert _parse_image_ref("nginx:1.25") == ("registry-1.docker.io", "library/nginx", "1.25")
    assert _parse_image_ref("nginx") == ("registry-1.docker.io", "library/nginx", "latest")
    assert _parse_image_ref("myorg/app:v1") == ("registry-1.docker.io", "myorg/app", "v1")
    assert _parse_image_ref("ghcr.io/org/app:v1") == ("ghcr.io", "org/app", "v1")
    assert _parse_image_ref("gcr.io/project/app") == ("gcr.io", "project/app", "latest")
    assert _parse_image_ref("private.registry.io:5000/app:v2") == ("private.registry.io:5000", "app", "v2")
    assert _parse_image_ref("localhost:5000/app:v1") == ("localhost:5000", "app", "v1")
    # digest reference — no tag, treated like a pinned version
    host, repo, ref = _parse_image_ref("nginx@sha256:abc123")
    assert (host, repo) == ("registry-1.docker.io", "library/nginx"), (host, repo)
    assert ref == "sha256:abc123", ref

    assert _interpret_manifest_response(200) == "exists"
    assert _interpret_manifest_response(404) == "not_found"
    assert _interpret_manifest_response(401) == "auth_required"
    assert _interpret_manifest_response(403) == "auth_required"
    assert _interpret_manifest_response(429) == "rate_limited"
    assert _interpret_manifest_response(500) == "unreachable"

    print("OK: _parse_image_ref and _interpret_manifest_response checks passed")


if __name__ == "__main__":
    demo()
