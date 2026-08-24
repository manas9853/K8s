"""
Self-check for the RCA engine (Phase A — Workload agent, Phase B —
Networking agent cross-domain handoff, Phase C — validated apply,
Phase D — outcome tracking / confidence calibration, Phase E — LLM
fallback for unrecognized failures). Pure-function tests against
synthetic pod/event/probe fixtures shaped exactly like what agent.py
actually collects/returns — no live cluster needed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")

from services.rca_engine import (  # noqa: E402
    investigate_pod, interpret_network_probe, apply_network_validation,
    deployment_target, recommended_memory_limit_mb,
    determine_recovery, apply_fix_confidence,
    has_unrecognized_failure_signal, parse_llm_hypotheses, add_llm_fallback,
)


def _pod(name="p1", namespace="default", phase="running", waiting=None,
          last_state_reason=None, restarts=0, image="nginx:1.25", **extra):
    cs = {"name": "app", "state": f"waiting:{waiting}" if waiting else "running",
          "last_state_reason": last_state_reason}
    return {
        "name": name, "namespace": namespace, "phase": phase,
        "total_restarts": restarts, "container_statuses": [cs],
        "containers": [{"name": "app", "image": image}],
        "service_account": "default",
        **extra,
    }


def _event(pod_name, namespace, message, reason="Failed"):
    return {"type": "Warning", "namespace": namespace, "involved_object_name": pod_name,
            "reason": reason, "message": message}


def test_healthy_pod_no_findings():
    r = investigate_pod(_pod(), [])
    assert r["healthy"] is True
    assert r["findings"] == []


def test_image_pull_manifest_unknown():
    pod = _pod(waiting="ImagePullBackOff", image="myapp:v9-typo")
    events = [_event("p1", "default", 'Failed to pull image "myapp:v9-typo": manifest unknown')]
    r = investigate_pod(pod, events)
    assert not r["healthy"]
    f = next(f for f in r["findings"] if f["failure_class"] == "image_pull")
    top = f["hypotheses"][0]
    assert "doesn't exist" in top["cause"]
    assert top["confidence"] > 0
    assert top["validated"] is False


def test_image_pull_auth_failure_ranks_over_no_match():
    pod = _pod(waiting="ErrImagePull", image="private.registry.io/app:v1")
    events = [_event("p1", "default", "unauthorized: authentication required")]
    r = investigate_pod(pod, events)
    f = next(f for f in r["findings"] if f["failure_class"] == "image_pull")
    assert any("authentication failure" in h["cause"].lower() for h in f["hypotheses"])


def test_image_pull_no_event_falls_back_generic():
    pod = _pod(waiting="ImagePullBackOff")
    r = investigate_pod(pod, [])
    f = next(f for f in r["findings"] if f["failure_class"] == "image_pull")
    assert len(f["hypotheses"]) >= 1
    assert f["hypotheses"][0]["confidence"] <= 0.5


def test_oom_killed_confidence_scales_with_usage():
    pod = _pod(last_state_reason="OOMKilled",
                memory_request_mb=100, memory_limit_mb=200,
                memory_usage_mb=195, has_live_metrics=True)
    r = investigate_pod(pod, [])
    f = next(f for f in r["findings"] if f["failure_class"] == "oom_killed")
    assert f["hypotheses"][0]["confidence"] > 0.9  # near-limit usage -> high confidence
    assert "256" in f["hypotheses"][0]["recommendation"] or "260" in f["hypotheses"][0]["recommendation"]


def test_oom_excludes_pod_from_crash_loop_investigator():
    pod = _pod(waiting="CrashLoopBackOff", last_state_reason="OOMKilled", restarts=25)
    r = investigate_pod(pod, [])
    classes = [f["failure_class"] for f in r["findings"]]
    assert "oom_killed" in classes
    assert "crash_loop" not in classes  # avoid duplicate/overlapping findings


def test_crash_loop_probe_failure():
    pod = _pod(waiting="CrashLoopBackOff", last_state_reason="Error", restarts=15)
    events = [_event("p1", "default", "Readiness probe failed: HTTP probe failed with statuscode: 500")]
    r = investigate_pod(pod, events)
    f = next(f for f in r["findings"] if f["failure_class"] == "crash_loop")
    assert any("probe" in h["cause"].lower() for h in f["hypotheses"])


def test_pending_insufficient_cpu():
    pod = _pod(phase="pending")
    events = [_event("p1", "default", "0/3 nodes are available: 3 Insufficient cpu.", reason="FailedScheduling")]
    r = investigate_pod(pod, events)
    f = next(f for f in r["findings"] if f["failure_class"] == "pending_unschedulable")
    assert "CPU" in f["hypotheses"][0]["cause"]


def test_config_error_missing_configmap():
    pod = _pod(waiting="CreateContainerConfigError")
    events = [_event("p1", "default", 'configmap "app-config" not found')]
    r = investigate_pod(pod, events)
    f = next(f for f in r["findings"] if f["failure_class"] == "config_error")
    assert "ConfigMap" in f["hypotheses"][0]["cause"]


def test_hypotheses_ranked_descending():
    pod = _pod(waiting="ImagePullBackOff", image="app")  # no tag -> static hint too
    events = [_event("p1", "default", "manifest unknown: manifest not found")]
    r = investigate_pod(pod, events)
    f = next(f for f in r["findings"] if f["failure_class"] == "image_pull")
    confidences = [h["confidence"] for h in f["hypotheses"]]
    assert confidences == sorted(confidences, reverse=True)


# ── Phase B: Networking agent probe interpretation / cross-domain handoff ──

def _probe(status="exists", dns_ok=True, has_secret=False, sa="default", **extra):
    return {
        "image": "myapp:v1", "registry_host": "registry-1.docker.io",
        "registry_check": {"status": status, "http_status": 200 if status == "exists" else 404, "detail": "GET ... -> x"},
        "dns_check": {"resolved": dns_ok} if dns_ok else {"resolved": False, "error": "no such host"},
        "service_account": sa, "pull_secrets_checked": ["regcred"] if has_secret else [],
        "has_matching_pull_secret": has_secret,
        **extra,
    }


def test_probe_dns_failure_is_confirmed_network_issue():
    hyps = interpret_network_probe(_probe(dns_ok=False))
    assert hyps[0]["validated"] is True
    assert hyps[0]["source"] == "networking_agent"
    assert "DNS" in hyps[0]["cause"] or "Network" in hyps[0]["cause"]
    assert hyps[0]["confidence"] >= 0.9


def test_probe_not_found_confirms_bad_tag():
    hyps = interpret_network_probe(_probe(status="not_found"))
    assert "doesn't exist" in hyps[0]["cause"]
    assert hyps[0]["validated"] is True


def test_probe_auth_required_no_secret_is_high_confidence():
    hyps = interpret_network_probe(_probe(status="auth_required", has_secret=False))
    assert "no valid pull secret" in hyps[0]["cause"]
    assert hyps[0]["confidence"] >= 0.85


def test_probe_auth_required_with_secret_points_to_stale_creds():
    hyps = interpret_network_probe(_probe(status="auth_required", has_secret=True))
    assert "credentials" in hyps[0]["cause"].lower() or "expired" in hyps[0]["cause"].lower()


def test_probe_exists_rules_out_common_causes():
    hyps = interpret_network_probe(_probe(status="exists"))
    assert "publicly reachable" in hyps[0]["cause"] or "ruled out" in hyps[0]["cause"]
    assert hyps[0]["validated"] is True


def test_apply_network_validation_replaces_image_pull_hypotheses():
    pod = _pod(waiting="ImagePullBackOff", image="myapp:v1")
    events = [_event("p1", "default", "manifest unknown")]
    result = investigate_pod(pod, events)
    before = next(f for f in result["findings"] if f["failure_class"] == "image_pull")["hypotheses"]
    assert before[0]["validated"] is False  # Phase A: ranked, not proven

    updated = apply_network_validation(result, _probe(status="not_found"))
    after = next(f for f in updated["findings"] if f["failure_class"] == "image_pull")["hypotheses"]
    assert after[0]["validated"] is True
    assert after[0]["source"] == "networking_agent"


# ── Phase C: apply-fix target resolution ────────────────────────────────────

def test_deployment_target_from_replicaset_owner():
    pod = _pod(owner_kind="ReplicaSet", owner_name="myapp-7d4b8f9c6d")
    target = deployment_target(pod)
    assert target == {"deployment": "myapp", "container": "app"}


def test_deployment_target_none_for_non_replicaset_owner():
    pod = _pod(owner_kind="DaemonSet", owner_name="fluentd")
    assert deployment_target(pod) is None


def test_deployment_target_none_when_no_owner():
    pod = _pod(owner_kind=None, owner_name=None)
    assert deployment_target(pod) is None


def test_deployment_target_none_when_no_containers():
    pod = _pod(owner_kind="ReplicaSet", owner_name="myapp-7d4b8f9c6d")
    pod["containers"] = []
    assert deployment_target(pod) is None


def test_recommended_memory_limit_scales_existing_limit():
    assert recommended_memory_limit_mb(100, 200) == 260.0


def test_recommended_memory_limit_falls_back_to_request_when_no_limit_set():
    assert recommended_memory_limit_mb(100, 0) == 260.0
    assert recommended_memory_limit_mb(0, 0) == 256  # floor, not zero


# ── Phase D: outcome tracking / confidence calibration ──────────────────────

def test_determine_recovery_pod_gone_is_unknown():
    assert determine_recovery(None, baseline_restarts=5) == "unknown"


def test_determine_recovery_restarts_unchanged_means_recovered():
    pod = _pod(restarts=5)
    assert determine_recovery(pod, baseline_restarts=5) == "recovered"


def test_determine_recovery_restarts_dropped_still_recovered():
    # A restart counter can't decrease in practice, but if it somehow did
    # (metrics glitch, counter reset), that's not evidence of a crash.
    pod = _pod(restarts=3)
    assert determine_recovery(pod, baseline_restarts=5) == "recovered"


def test_determine_recovery_restarts_increased_means_not_recovered():
    pod = _pod(restarts=6)
    assert determine_recovery(pod, baseline_restarts=5) == "not_recovered"


def test_apply_fix_confidence_noop_when_no_success_rate():
    pod = _pod(last_state_reason="OOMKilled")
    result = investigate_pod(pod, [])
    enriched = apply_fix_confidence(result, "oom_killed", None)
    h = enriched["findings"][0]["hypotheses"][0]
    assert "fix_confidence" not in h


def test_apply_fix_confidence_attaches_rate_to_matching_class_only():
    pod = _pod(waiting="ImagePullBackOff", last_state_reason="OOMKilled")
    result = investigate_pod(pod, [])
    enriched = apply_fix_confidence(result, "oom_killed", {"sample_size": 10, "success_rate": 0.8})

    oom = next(f for f in enriched["findings"] if f["failure_class"] == "oom_killed")
    assert oom["hypotheses"][0]["fix_confidence"] == 0.8
    assert oom["hypotheses"][0]["fix_confidence_sample_size"] == 10

    other = [f for f in enriched["findings"] if f["failure_class"] != "oom_killed"]
    assert all("fix_confidence" not in h for f in other for h in f["hypotheses"])


# ── Phase E: LLM fallback for unrecognized failures ─────────────────────────

def test_unrecognized_waiting_reason_triggers_signal():
    pod = _pod(waiting="RunContainerError")  # not one of the 5 known reasons
    assert has_unrecognized_failure_signal(pod) is True


def test_known_waiting_reason_does_not_trigger_signal():
    pod = _pod(waiting="ImagePullBackOff")
    assert has_unrecognized_failure_signal(pod) is False


def test_pending_phase_does_not_trigger_signal():
    # Already always covered by PendingUnschedulableInvestigator
    pod = _pod(phase="pending")
    assert has_unrecognized_failure_signal(pod) is False


def test_not_ready_running_container_triggers_signal():
    pod = _pod()
    pod["container_statuses"][0]["ready"] = False
    assert has_unrecognized_failure_signal(pod) is True


def test_healthy_running_pod_no_signal():
    pod = _pod()
    pod["container_statuses"][0]["ready"] = True
    assert has_unrecognized_failure_signal(pod) is False


def test_parse_llm_hypotheses_valid_json():
    raw = '{"hypotheses": [{"cause": "disk pressure on node", "reasoning": "restart pattern matches eviction", "recommendation": "check node disk usage"}]}'
    out = parse_llm_hypotheses(raw)
    assert len(out) == 1
    assert out[0]["cause"] == "disk pressure on node"
    assert out[0]["confidence"] == 0.35
    assert out[0]["validated"] is False
    assert out[0]["source"] == "llm"


def test_parse_llm_hypotheses_caps_at_three():
    raw = '{"hypotheses": [' + ",".join(
        f'{{"cause": "cause {i}"}}' for i in range(6)
    ) + "]}"
    assert len(parse_llm_hypotheses(raw)) == 3


def test_parse_llm_hypotheses_malformed_json_returns_empty():
    assert parse_llm_hypotheses("not json at all") == []
    assert parse_llm_hypotheses("") == []


def test_parse_llm_hypotheses_missing_hypotheses_key_returns_empty():
    assert parse_llm_hypotheses('{"foo": "bar"}') == []


def test_parse_llm_hypotheses_never_trusts_llm_self_reported_confidence():
    # Even if the model tries to claim high confidence, we never use it.
    raw = '{"hypotheses": [{"cause": "x", "confidence": 0.99}]}'
    assert parse_llm_hypotheses(raw)[0]["confidence"] == 0.35


def test_add_llm_fallback_noop_when_already_explained():
    pod = _pod(waiting="ImagePullBackOff")
    result = investigate_pod(pod, [])
    before = len(result["findings"])
    updated = add_llm_fallback(result, pod, [{"cause": "x"}])
    assert len(updated["findings"]) == before  # unchanged — image_pull already explains it


def test_add_llm_fallback_noop_when_genuinely_healthy():
    pod = _pod()
    result = investigate_pod(pod, [])
    assert result["healthy"] is True
    updated = add_llm_fallback(result, pod, None)
    assert updated["healthy"] is True
    assert updated["findings"] == []


def test_add_llm_fallback_attaches_hypotheses_for_unrecognized_failure():
    pod = _pod(waiting="RunContainerError")
    result = investigate_pod(pod, [])
    assert result["healthy"] is True  # no Investigator recognizes this reason

    llm_hyps = [{"cause": "real llm guess", "confidence": 0.35, "evidence": [],
                 "recommendation": "check it", "steps": [], "validated": False, "source": "llm"}]
    updated = add_llm_fallback(result, pod, llm_hyps)
    assert updated["healthy"] is False
    f = next(f for f in updated["findings"] if f["failure_class"] == "unrecognized")
    assert f["hypotheses"][0]["cause"] == "real llm guess"


def test_add_llm_fallback_honest_note_when_no_llm_available():
    pod = _pod(waiting="RunContainerError")
    result = investigate_pod(pod, [])
    updated = add_llm_fallback(result, pod, None)
    assert updated["healthy"] is False
    f = next(f for f in updated["findings"] if f["failure_class"] == "unrecognized")
    assert f["hypotheses"][0]["source"] == "none"
    assert f["hypotheses"][0]["confidence"] == 0.0


if __name__ == "__main__":
    test_healthy_pod_no_findings()
    test_image_pull_manifest_unknown()
    test_image_pull_auth_failure_ranks_over_no_match()
    test_image_pull_no_event_falls_back_generic()
    test_oom_killed_confidence_scales_with_usage()
    test_oom_excludes_pod_from_crash_loop_investigator()
    test_crash_loop_probe_failure()
    test_pending_insufficient_cpu()
    test_config_error_missing_configmap()
    test_hypotheses_ranked_descending()
    test_probe_dns_failure_is_confirmed_network_issue()
    test_probe_not_found_confirms_bad_tag()
    test_probe_auth_required_no_secret_is_high_confidence()
    test_probe_auth_required_with_secret_points_to_stale_creds()
    test_probe_exists_rules_out_common_causes()
    test_apply_network_validation_replaces_image_pull_hypotheses()
    test_deployment_target_from_replicaset_owner()
    test_deployment_target_none_for_non_replicaset_owner()
    test_deployment_target_none_when_no_owner()
    test_deployment_target_none_when_no_containers()
    test_recommended_memory_limit_scales_existing_limit()
    test_recommended_memory_limit_falls_back_to_request_when_no_limit_set()
    test_determine_recovery_pod_gone_is_unknown()
    test_determine_recovery_restarts_unchanged_means_recovered()
    test_determine_recovery_restarts_dropped_still_recovered()
    test_determine_recovery_restarts_increased_means_not_recovered()
    test_apply_fix_confidence_noop_when_no_success_rate()
    test_apply_fix_confidence_attaches_rate_to_matching_class_only()
    test_unrecognized_waiting_reason_triggers_signal()
    test_known_waiting_reason_does_not_trigger_signal()
    test_pending_phase_does_not_trigger_signal()
    test_not_ready_running_container_triggers_signal()
    test_healthy_running_pod_no_signal()
    test_parse_llm_hypotheses_valid_json()
    test_parse_llm_hypotheses_caps_at_three()
    test_parse_llm_hypotheses_malformed_json_returns_empty()
    test_parse_llm_hypotheses_missing_hypotheses_key_returns_empty()
    test_parse_llm_hypotheses_never_trusts_llm_self_reported_confidence()
    test_add_llm_fallback_noop_when_already_explained()
    test_add_llm_fallback_noop_when_genuinely_healthy()
    test_add_llm_fallback_attaches_hypotheses_for_unrecognized_failure()
    test_add_llm_fallback_honest_note_when_no_llm_available()
    print("OK: all RCA engine checks passed")
