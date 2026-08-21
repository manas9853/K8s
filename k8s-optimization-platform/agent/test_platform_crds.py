#!/usr/bin/env python3
"""
Self-check for the GitOps/policy CRD parsers (agent.py). Run directly:
python3 test_platform_crds.py
No pytest, no live cluster — feeds synthetic CRD-shaped dicts (the same
shape kubectl get -o json would produce) straight into the pure parser
functions.
"""
from agent import (
    _parse_argocd_apps,
    _parse_flux_kustomizations,
    _parse_tekton_pipelineruns,
    _parse_kyverno_policies,
    _parse_gatekeeper_templates,
    _parse_policy_report_violations,
)


def demo():
    apps = _parse_argocd_apps([{
        "metadata": {"name": "web", "namespace": "argocd"},
        "spec": {"source": {"repoURL": "https://github.com/x/y", "targetRevision": "main"},
                 "destination": {"namespace": "prod"}},
        "status": {"sync": {"status": "OutOfSync"}, "health": {"status": "Degraded"},
                   "operationState": {"finishedAt": "2026-08-01T00:00:00Z"}},
    }])
    assert apps == [{
        "name": "web", "namespace": "argocd", "repo": "https://github.com/x/y",
        "target_revision": "main", "destination_ns": "prod",
        "sync_status": "OutOfSync", "health_status": "Degraded",
        "last_sync_at": "2026-08-01T00:00:00Z",
    }], apps

    kusts = _parse_flux_kustomizations([{
        "metadata": {"name": "apps", "namespace": "flux-system"},
        "spec": {"sourceRef": {"name": "flux-repo"}, "path": "./apps"},
        "status": {"conditions": [{"type": "Ready", "status": "True", "message": "Applied"}],
                   "lastAppliedRevision": "main@sha1:abc"},
    }])
    assert kusts[0]["ready"] is True and kusts[0]["revision"] == "main@sha1:abc", kusts

    runs = _parse_tekton_pipelineruns([{
        "metadata": {"name": "build-1", "namespace": "ci"},
        "spec": {"pipelineRef": {"name": "build"}},
        "status": {"startTime": "t0", "completionTime": "t1",
                   "conditions": [{"type": "Succeeded", "reason": "Succeeded"}],
                   "childReferences": [{"name": "build-1-compile"}, {"name": "build-1-test"}]},
    }])
    assert runs[0]["status"] == "Succeeded" and runs[0]["pipeline_ref"] == "build", runs
    assert runs[0]["task_count"] == 2, runs

    kyverno = _parse_kyverno_policies([{
        "metadata": {"name": "require-labels"},
        "spec": {"validationFailureAction": "Enforce", "background": True, "rules": [{}, {}]},
    }])
    assert kyverno[0]["rule_count"] == 2 and kyverno[0]["engine"] == "kyverno", kyverno

    gk = _parse_gatekeeper_templates([{"metadata": {"name": "k8srequiredlabels"}}])
    assert gk == [{"engine": "gatekeeper", "name": "k8srequiredlabels"}], gk

    violations = _parse_policy_report_violations([{
        "metadata": {"namespace": "default", "creationTimestamp": "2026-08-20T00:00:00Z"},
        "results": [
            {"policy": "require-labels", "rule": "check-team", "result": "fail",
             "resources": [{"name": "my-pod", "kind": "Pod"}], "message": "missing label", "severity": "high"},
            {"policy": "require-labels", "rule": "check-owner", "result": "pass",
             "resources": [{"name": "other-pod", "kind": "Pod"}]},
        ],
    }])
    assert len(violations) == 1 and violations[0]["resource"] == "my-pod", violations
    assert violations[0]["kind"] == "Pod" and violations[0]["detected_at"] == "2026-08-20T00:00:00Z", violations

    # Empty input never crashes
    assert _parse_argocd_apps([]) == []
    assert _parse_policy_report_violations([]) == []

    print("OK: all CRD parser checks passed")


if __name__ == "__main__":
    demo()
