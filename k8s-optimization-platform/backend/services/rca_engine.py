"""
Root Cause Analysis engine (Phase A — Workload agent). Single flat module
by design: a NEW subpackage under services/ hits an environment-specific
import-collection bug in this repo's pytest setup — reproduced
independently with a throwaway probe package (any new services/<pkg>/
fails to resolve, but only when the full test suite collects together,
not standalone) — so this stays one file rather than a services/rca/
package. ponytail: flat module, not a package — services/cost_service.py
etc. already prove this size/shape works fine as a single file here.

One Investigator per failure class; each produces ranked Hypotheses
built from evidence gathered against REAL pod/event data — never a
fabricated confidence literal like the ones in api/incidents.py (88.0,
92.0, 95.0 as bare constants). Confidence is a transparent evidence-
weighted score, not a calibrated model: each corroborating signal adds a
fixed weight, capped at 0.95 (passive signals alone never justify full
certainty — that needs Phase B's active validation probes). `validated:
False` on every hypothesis is deliberate — "ranked from evidence", not
"proven". ponytail: fixed per-signal weights, not learned; Phase D's
outcome tracking is the real path to calibrated confidence.

Every signal used here is real and already collected by the agent:
container_statuses.state/last_state_reason (agent/agent.py:_container_state)
and Warning Events with real message text (agent/agent.py:_observability).
"""
from typing import Any, Dict, List, Optional


# ── shared building blocks ──────────────────────────────────────────────────

def make_hypothesis(cause: str, evidence: List[Dict[str, str]], recommendation: str,
                     steps: List[str], base_weight: float = 0.35,
                     evidence_weight: float = 0.3) -> Dict[str, Any]:
    confidence = min(0.95, base_weight + evidence_weight * len(evidence))
    return {
        "cause": cause,
        "confidence": round(confidence, 2),
        "evidence": evidence,
        "recommendation": recommendation,
        "steps": steps,
        "validated": False,
    }


def related_warning_events(events: List[Dict[str, Any]], namespace: str, pod_name: str) -> List[Dict[str, Any]]:
    """Real cluster Events (agent's observability domain) mentioning this pod."""
    return [
        e for e in events
        if e.get("type") == "Warning"
        and e.get("namespace") == namespace
        and e.get("involved_object_name") == pod_name
    ]


def event_message_matches(events: List[Dict[str, Any]], *substrings: str) -> Optional[Dict[str, Any]]:
    """First warning event whose message contains any of the given
    substrings (case-insensitive) — returns the matching event, or None."""
    for e in events:
        msg = (e.get("message") or "").lower()
        if any(s.lower() in msg for s in substrings):
            return e
    return None


class Investigator:
    """One failure class. Subclasses implement `matches` + `investigate`."""
    name: str = "base"

    def matches(self, pod: Dict[str, Any]) -> bool:
        raise NotImplementedError

    def investigate(self, pod: Dict[str, Any], events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Return ranked hypotheses (highest confidence first)."""
        raise NotImplementedError


# ── Workload agent: top 5 pod/container failure classes ────────────────────

def _container_states(pod: Dict[str, Any]) -> List[Dict[str, Any]]:
    return pod.get("container_statuses") or []


def recommended_memory_limit_mb(mem_req: float, mem_lim: float) -> float:
    """Shared by OOMKilledInvestigator's recommendation text (Phase A) and
    the apply-fix endpoint (Phase C) — one formula, not duplicated, so a
    future change to the sizing logic can't drift between what we tell
    the user and what we actually apply."""
    return mem_lim * 1.3 if mem_lim > 0 else max(mem_req * 2.6, 256)


def deployment_target(pod: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Real Deployment name + container to patch, derived from the pod's
    real ReplicaSet owner (standard '<deployment>-<template-hash>' naming
    Kubernetes itself uses) — None if this pod isn't Deployment-managed,
    since auto-apply only supports that owner kind for now."""
    if pod.get("owner_kind") != "ReplicaSet":
        return None
    owner_name = pod.get("owner_name") or ""
    if "-" not in owner_name:
        return None
    containers = pod.get("containers") or []
    if not containers:
        return None
    return {"deployment": owner_name.rsplit("-", 1)[0], "container": containers[0].get("name")}


def _waiting_reason(pod: Dict[str, Any]) -> str:
    for cs in _container_states(pod):
        state = cs.get("state", "")
        if isinstance(state, str) and state.startswith("waiting:"):
            return state.split(":", 1)[1]
    return ""


def _is_oom(pod: Dict[str, Any]) -> bool:
    return any(cs.get("last_state_reason") == "OOMKilled" for cs in _container_states(pod))


def _first_image(pod: Dict[str, Any]) -> str:
    containers = pod.get("containers") or []
    return containers[0].get("image", "unknown") if containers else "unknown"


class ImagePullInvestigator(Investigator):
    name = "image_pull"

    def matches(self, pod: Dict[str, Any]) -> bool:
        return _waiting_reason(pod) in ("ImagePullBackOff", "ErrImagePull")

    def investigate(self, pod, events):
        namespace, pod_name = pod.get("namespace", "default"), pod.get("name", "unknown")
        image = _first_image(pod)
        related = related_warning_events(events, namespace, pod_name)
        hyps: List[Dict[str, Any]] = []

        m = event_message_matches(related, "manifest unknown", "not found", "repository does not exist")
        if m:
            hyps.append(make_hypothesis(
                cause=f"Image or tag doesn't exist in the registry ({image})",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Verify the image name/tag is correct and has actually been pushed to the registry.",
                steps=[
                    f"Confirm the exact image reference: {image}",
                    "Check the registry for that repository/tag (typo in the tag is the most common cause)",
                    "If the tag was recently deleted or retagged, update the deployment to a valid tag",
                ],
            ))

        m = event_message_matches(related, "unauthorized", "authentication required", "pull access denied")
        if m:
            hyps.append(make_hypothesis(
                cause="Registry authentication failure",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The imagePullSecret is missing, expired, or lacks pull permission for this image.",
                steps=[
                    "Check the pod's ServiceAccount for a valid imagePullSecrets entry",
                    "Verify the referenced Secret exists in this namespace and hasn't expired",
                    "Confirm the credentials in the secret actually have pull access to this repository",
                ],
            ))

        m = event_message_matches(related, "429", "toomanyrequests", "rate limit")
        if m:
            hyps.append(make_hypothesis(
                cause="Registry rate limit exceeded",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Pulls to this registry are being throttled.",
                steps=[
                    "Authenticate pulls — anonymous pulls have much lower rate limits on most registries",
                    "Consider a pull-through cache/mirror for high-frequency image pulls",
                    "Retry after the registry's rate-limit window resets",
                ],
                base_weight=0.5,
            ))

        m = event_message_matches(related, "no such host", "i/o timeout", "dial tcp", "connection refused")
        if m:
            h = make_hypothesis(
                cause="Network/DNS issue reaching the registry",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The node couldn't reach the registry over the network.",
                steps=[
                    "Check NetworkPolicies restricting egress from this namespace",
                    "Verify DNS resolution for the registry host from cluster nodes",
                    "Confirm the registry is reachable from the node's network (firewall/proxy)",
                ],
                base_weight=0.25,
            )
            h["evidence"].append({"signal": "note", "detail": "Not independently verified — needs a live connectivity check (Networking agent, Phase B)"})
            hyps.append(h)

        sa = pod.get("service_account")
        if sa and sa != "default" and not related:
            hyps.append(make_hypothesis(
                cause="Missing image pull permissions on ServiceAccount",
                evidence=[{"signal": "service_account", "detail": f"Pod uses non-default ServiceAccount '{sa}'"}],
                recommendation=f"Check whether ServiceAccount '{sa}' has the required imagePullSecrets attached.",
                steps=[f"kubectl get sa {sa} -n {namespace} -o yaml",
                       "Confirm imagePullSecrets includes a secret valid for this registry"],
                base_weight=0.2,
            ))

        if image != "unknown" and ":" not in image.split("/")[-1] and "@" not in image:
            hyps.append(make_hypothesis(
                cause="Image reference has no explicit tag (defaults to :latest, which may not exist or drift unexpectedly)",
                evidence=[{"signal": "static_check", "detail": f"Image string: {image}"}],
                recommendation="Pin an explicit, existing tag instead of relying on the implicit :latest default.",
                steps=[f"Update the image reference to an explicit tag, e.g. {image}:<version>"],
                base_weight=0.15,
            ))

        if not hyps:
            hyps.append(make_hypothesis(
                cause=f"Image pull failing ({_waiting_reason(pod)}) — no specific cause matched in event text",
                evidence=[{"signal": "waiting_reason", "detail": _waiting_reason(pod)}],
                recommendation="Inspect the pod's events directly for the exact failure message.",
                steps=[f"kubectl describe pod {pod_name} -n {namespace}"],
                base_weight=0.2,
            ))

        return sorted(hyps, key=lambda h: h["confidence"], reverse=True)


class OOMKilledInvestigator(Investigator):
    """Checked ahead of CrashLoopInvestigator — OOMKilled is the more
    specific, directly-observed cause when both would otherwise match."""
    name = "oom_killed"

    def matches(self, pod: Dict[str, Any]) -> bool:
        return _is_oom(pod)

    def investigate(self, pod, events):
        mem_req = float(pod.get("memory_request_mb") or 0)
        mem_lim = float(pod.get("memory_limit_mb") or 0) or mem_req * 2
        mem_usage = float(pod.get("memory_usage_mb") or 0)
        has_live = bool(pod.get("has_live_metrics"))

        evidence = [{"signal": "last_state_reason", "detail": "OOMKilled"}]
        if has_live and mem_lim > 0:
            pct = mem_usage / mem_lim * 100
            evidence.append({"signal": "live_memory_usage", "detail": f"{mem_usage:.0f}Mi of {mem_lim:.0f}Mi limit ({pct:.0f}%)"})
            confidence = min(0.95, 0.6 + min(pct, 100) / 100 * 0.35)
        else:
            # OOMKilled reason alone is a strong, direct signal even
            # without live-usage corroboration (no fake precision added).
            confidence = 0.6

        rec_limit = recommended_memory_limit_mb(mem_req, mem_lim)
        return [{
            "cause": "Container exceeded its memory limit and was killed by the kernel",
            "confidence": round(confidence, 2),
            "evidence": evidence,
            "recommendation": f"Increase the memory limit to at least {rec_limit:.0f}Mi.",
            "steps": [
                f"Set memory limit to ~{rec_limit:.0f}Mi (current: {mem_lim:.0f}Mi)",
                "If usage keeps growing after the increase, investigate a memory leak instead of raising the limit again",
            ],
            "validated": False,
        }]


class CrashLoopInvestigator(Investigator):
    name = "crash_loop"

    def matches(self, pod: Dict[str, Any]) -> bool:
        if _is_oom(pod):
            return False  # OOMKilledInvestigator owns this — avoid duplicate findings
        return _waiting_reason(pod) == "CrashLoopBackOff" or int(pod.get("total_restarts") or 0) > 20

    def investigate(self, pod, events):
        namespace, pod_name = pod.get("namespace", "default"), pod.get("name", "unknown")
        related = related_warning_events(events, namespace, pod_name)
        restarts = int(pod.get("total_restarts") or 0)
        hyps: List[Dict[str, Any]] = []

        m = event_message_matches(related, "readiness probe failed", "liveness probe failed")
        if m:
            hyps.append(make_hypothesis(
                cause="Liveness/readiness probe misconfiguration",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The probe is killing the container before it finishes starting, or the probe endpoint is wrong.",
                steps=["Increase initialDelaySeconds/timeoutSeconds on the probe",
                       "Verify the probe path/port actually reflects app readiness"],
                base_weight=0.4,
            ))

        if any(cs.get("last_state_reason") == "Error" for cs in _container_states(pod)):
            hyps.append(make_hypothesis(
                cause="Application exits with a non-zero error code on startup",
                evidence=[{"signal": "last_state_reason", "detail": "Error"}],
                recommendation="The application itself is crashing — check its logs for the real stack trace.",
                steps=[f"kubectl logs {pod_name} -n {namespace} --previous",
                       "Check for a missing required env var, config file, or dependency"],
                base_weight=0.3,
            ))

        if not hyps:
            hyps.append(make_hypothesis(
                cause=f"Repeated restarts ({restarts}x) — no specific signal matched",
                evidence=[{"signal": "restart_count", "detail": str(restarts)}],
                recommendation="Check container logs directly for the crash reason.",
                steps=[f"kubectl logs {pod_name} -n {namespace} --previous"],
                base_weight=0.2,
            ))

        return sorted(hyps, key=lambda h: h["confidence"], reverse=True)


class PendingUnschedulableInvestigator(Investigator):
    name = "pending_unschedulable"

    def matches(self, pod: Dict[str, Any]) -> bool:
        return (pod.get("phase") or "").lower() == "pending"

    def investigate(self, pod, events):
        namespace, pod_name = pod.get("namespace", "default"), pod.get("name", "unknown")
        related = related_warning_events(events, namespace, pod_name)
        hyps: List[Dict[str, Any]] = []

        m = event_message_matches(related, "insufficient cpu")
        if m:
            hyps.append(make_hypothesis(
                cause="No node has enough available CPU to schedule this pod",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Lower the pod's CPU request, or add node capacity.",
                steps=["Reduce cpu.requests if it's higher than actually needed",
                       "Scale the node pool if the cluster is genuinely at capacity"],
            ))

        m = event_message_matches(related, "insufficient memory")
        if m:
            hyps.append(make_hypothesis(
                cause="No node has enough available memory to schedule this pod",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Lower the pod's memory request, or add node capacity.",
                steps=["Reduce memory.requests if it's higher than actually needed",
                       "Scale the node pool if the cluster is genuinely at capacity"],
            ))

        m = event_message_matches(related, "didn't match node selector", "didn't match pod affinity", "node(s) had taint")
        if m:
            hyps.append(make_hypothesis(
                cause="No node satisfies this pod's scheduling constraints (nodeSelector/affinity/taints)",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The scheduling constraints exclude every available node.",
                steps=["Review nodeSelector/affinity rules against actual node labels",
                       "Check for a missing toleration if targeting tainted nodes"],
            ))

        m = event_message_matches(related, "persistentvolumeclaim", "pvc")
        if m:
            hyps.append(make_hypothesis(
                cause="Pod is waiting on an unbound PersistentVolumeClaim",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The referenced PVC isn't bound to a PersistentVolume yet.",
                steps=[f"kubectl get pvc -n {namespace}",
                       "Verify a StorageClass/provisioner is available to satisfy it"],
            ))

        if not hyps:
            hyps.append(make_hypothesis(
                cause="Pod stuck Pending — no specific scheduling failure matched in event text",
                evidence=[{"signal": "phase", "detail": "Pending"}],
                recommendation="Inspect scheduling events directly.",
                steps=[f"kubectl describe pod {pod_name} -n {namespace}"],
                base_weight=0.2,
            ))

        return sorted(hyps, key=lambda h: h["confidence"], reverse=True)


class ConfigErrorInvestigator(Investigator):
    name = "config_error"

    def matches(self, pod: Dict[str, Any]) -> bool:
        return _waiting_reason(pod) == "CreateContainerConfigError"

    def investigate(self, pod, events):
        namespace, pod_name = pod.get("namespace", "default"), pod.get("name", "unknown")
        related = related_warning_events(events, namespace, pod_name)
        hyps: List[Dict[str, Any]] = []

        m = event_message_matches(related, "configmap")
        if m and "not found" in (m.get("message") or "").lower():
            hyps.append(make_hypothesis(
                cause="Referenced ConfigMap doesn't exist",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Create the missing ConfigMap or fix the reference in the pod spec.",
                steps=[f"kubectl get configmap -n {namespace}",
                       "Compare against the configMapRef/envFrom name in the pod spec"],
                base_weight=0.5,
            ))

        m = event_message_matches(related, "secret")
        if m and "not found" in (m.get("message") or "").lower():
            hyps.append(make_hypothesis(
                cause="Referenced Secret doesn't exist",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="Create the missing Secret or fix the reference in the pod spec.",
                steps=[f"kubectl get secret -n {namespace}",
                       "Compare against the secretKeyRef/envFrom name in the pod spec"],
                base_weight=0.5,
            ))

        m = event_message_matches(related, "couldn't find key")
        if m:
            hyps.append(make_hypothesis(
                cause="ConfigMap/Secret exists but is missing the referenced key",
                evidence=[{"signal": "event_message", "detail": m["message"]}],
                recommendation="The key referenced in env/envFrom doesn't exist in the target ConfigMap/Secret.",
                steps=["Compare the exact key name in the pod spec against the actual ConfigMap/Secret keys"],
                base_weight=0.5,
            ))

        if not hyps:
            hyps.append(make_hypothesis(
                cause="Container config error — no specific cause matched in event text",
                evidence=[{"signal": "waiting_reason", "detail": "CreateContainerConfigError"}],
                recommendation="Inspect the pod's events directly.",
                steps=[f"kubectl describe pod {pod_name} -n {namespace}"],
                base_weight=0.2,
            ))

        return sorted(hyps, key=lambda h: h["confidence"], reverse=True)


# ── coordinator (Phase A: single agent — see module docstring) ─────────────

WORKLOAD_AGENT: List[Investigator] = [
    ImagePullInvestigator(),
    OOMKilledInvestigator(),
    CrashLoopInvestigator(),
    PendingUnschedulableInvestigator(),
    ConfigErrorInvestigator(),
]


def investigate_pod(pod: Dict[str, Any], events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Run every matching Investigator against one pod, return combined
    ranked hypotheses grouped by which failure class each came from."""
    findings = []
    for inv in WORKLOAD_AGENT:
        if inv.matches(pod):
            findings.append({
                "failure_class": inv.name,
                "hypotheses": inv.investigate(pod, events),
            })
    return {
        "pod_name": pod.get("name", "unknown"),
        "namespace": pod.get("namespace", "default"),
        "healthy": not findings,
        "findings": findings,
    }


# ── Networking agent (Phase B) — cross-domain handoff ───────────────────────
# The Workload agent's ImagePullInvestigator can't independently verify its
# own "wrong image/tag" / "auth failure" / "network unreachable" hypotheses
# from passive signals alone — that's real evidence a live registry/DNS/
# secret probe has to gather, which is the Networking agent's job (the
# actual probing runs in the K8s agent — agent.py:_diagnose_image_pull,
# via the agent_commands queue; this function interprets its real result).
# This is the Coordinator's cross-domain handoff described in the roadmap:
# a hypothesis the Workload agent can't resolve gets handed to the agent
# that actually owns that evidence, instead of staying "unverified".

def interpret_network_probe(probe: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Turn agent.py's _diagnose_image_pull result into real, VALIDATED
    hypotheses (validated=True — these come from an active check, not a
    passive-signal guess)."""
    dns = probe.get("dns_check") or {}
    reg = probe.get("registry_check") or {}
    image = probe.get("image", "unknown")
    has_secret = bool(probe.get("has_matching_pull_secret"))
    sa = probe.get("service_account", "default")

    if not dns.get("resolved", True):
        return [{
            "cause": "Network/DNS issue reaching the registry — confirmed",
            "confidence": 0.9,
            "evidence": [{"signal": "dns_check", "detail": dns.get("error", "DNS resolution failed")}],
            "recommendation": "The cluster genuinely cannot resolve the registry hostname.",
            "steps": ["Check cluster DNS (CoreDNS) health",
                       "Check NetworkPolicies restricting egress from this namespace",
                       "Verify the registry hostname is spelled correctly"],
            "validated": True, "source": "networking_agent",
        }]

    status = reg.get("status")
    if status == "not_found":
        return [{
            "cause": f"Image or tag genuinely doesn't exist in the registry ({image}) — confirmed",
            "confidence": 0.9,
            "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")}],
            "recommendation": "Verified directly against the registry: this exact image:tag isn't there.",
            "steps": [f"Confirm the intended image reference for {image}",
                       "Check the registry for the correct tag (typo is the most common cause)"],
            "validated": True, "source": "networking_agent",
        }]
    if status == "auth_required":
        if has_secret:
            return [{
                "cause": "Registry requires auth, and a matching pull secret IS configured — its credentials are likely wrong or expired",
                "confidence": 0.75,
                "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")},
                             {"signal": "pull_secret_check", "detail": f"ServiceAccount '{sa}' has a secret matching this registry, but the registry still rejects anonymous access (expected) — verify the secret's actual credentials"}],
                "recommendation": "The pull secret exists and targets the right registry, but its stored credentials may be stale.",
                "steps": ["Verify the secret's username/password or token hasn't expired or been rotated on the registry side",
                           "Recreate the imagePullSecret with fresh credentials"],
                "validated": True, "source": "networking_agent",
            }]
        return [{
            "cause": f"Registry authentication failure — confirmed no valid pull secret for {probe.get('registry_host', 'this registry')}",
            "confidence": 0.9,
            "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")},
                         {"signal": "pull_secret_check", "detail": f"ServiceAccount '{sa}' has no imagePullSecret matching this registry (checked: {probe.get('pull_secrets_checked', [])})"}],
            "recommendation": f"Attach an imagePullSecret valid for this registry to ServiceAccount '{sa}'.",
            "steps": [f"kubectl create secret docker-registry <name> --docker-server=<registry> -n <namespace>",
                       f"kubectl patch serviceaccount {sa} -p '{{\"imagePullSecrets\": [{{\"name\": \"<name>\"}}]}}'"],
            "validated": True, "source": "networking_agent",
        }]
    if status == "rate_limited":
        return [{
            "cause": "Registry rate limit exceeded — confirmed",
            "confidence": 0.85,
            "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")}],
            "recommendation": "Pulls to this registry are being throttled right now.",
            "steps": ["Authenticate pulls — anonymous pulls have much lower rate limits on most registries",
                       "Consider a pull-through cache/mirror"],
            "validated": True, "source": "networking_agent",
        }]
    if status == "exists":
        return [{
            "cause": "Image and tag ARE publicly reachable — the two most common causes are ruled out",
            "confidence": 0.55,
            "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")}],
            "recommendation": "Not a bad image reference or missing credentials — likely a transient registry hiccup, a node-level network problem, or a local registry mirror/proxy misconfiguration.",
            "steps": ["Retry the pull — check if it's transient",
                       "Check node-level network/proxy config if it keeps failing",
                       "If using a registry mirror/pull-through cache, verify it's configured correctly"],
            "validated": True, "source": "networking_agent",
        }]
    return [{
        "cause": "Registry unreachable from the agent's network",
        "confidence": 0.5,
        "evidence": [{"signal": "registry_check", "detail": reg.get("detail", "")}],
        "recommendation": "Couldn't complete the check — the registry itself may be down, or blocked from this cluster.",
        "steps": ["Retry — could be transient", "Check firewall/proxy rules for outbound access to this registry"],
        "validated": True, "source": "networking_agent",
    }]


def apply_network_validation(result: Dict[str, Any], probe: Dict[str, Any]) -> Dict[str, Any]:
    """Replace the image_pull finding's hypotheses with the Networking
    agent's validated ones, once a probe result is available — the
    Coordinator's cross-domain handoff, applied."""
    validated = interpret_network_probe(probe)
    for finding in result.get("findings", []):
        if finding["failure_class"] == "image_pull":
            finding["hypotheses"] = validated
    return result


# ── Outcome tracking (Phase D) ──────────────────────────────────────────────
# After a fix is applied (Phase C), did it actually work? This is answered
# from real observed behavior after the fact, not inferred at apply time —
# see api/agent_receiver.py's /metrics hook, which resolves pending
# rca_fix_outcomes rows whenever fresh data arrives, and
# db_manager.get_rca_fix_success_rate, which aggregates the resolved ones.

def determine_recovery(pod: Optional[Dict[str, Any]], baseline_restarts: int) -> str:
    """Pure classification: did a pod recover after a fix was applied?
    Comparing restart counts is the reliable signal — last_state_reason is
    historical and won't clear itself just because time passed, so it
    can't tell "recovered" apart from "hasn't restarted since the pre-fix
    OOM event yet". pod=None means it's gone from the latest metrics
    (deleted/replaced) — treated as "unknown" rather than guessed either
    way, since a redeploy could mean anything."""
    if pod is None:
        return "unknown"
    current_restarts = int(pod.get("total_restarts") or 0)
    return "not_recovered" if current_restarts > baseline_restarts else "recovered"


def apply_fix_confidence(result: Dict[str, Any], failure_class: str,
                          success_rate: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Attach empirical fix-success calibration to a failure class's
    hypotheses — separate from `confidence` (how sure we are of the
    CAUSE, already evidence-based from Phase A) since this answers a
    different question: how often does the recommended FIX actually
    work, in practice, across every time it's been applied.
    success_rate=None (not enough resolved outcomes yet) leaves
    hypotheses untouched rather than showing a meaningless number from
    a sample of 1 or 2."""
    if not success_rate:
        return result
    for finding in result.get("findings", []):
        if finding["failure_class"] == failure_class:
            for h in finding["hypotheses"]:
                h["fix_confidence"] = success_rate["success_rate"]
                h["fix_confidence_sample_size"] = success_rate["sample_size"]
    return result


# ── LLM-assisted fallback (Phase E) — long-tail failures only ──────────────
# The 5 Investigators above cover the common failure classes with zero LLM
# involvement. This layer ONLY fires when a pod shows a real failure signal
# (has_unrecognized_failure_signal) that none of them explain — never for a
# genuinely healthy pod, and never as a replacement for real evidence when
# real evidence exists. An LLM hypothesis is speculation grounded in the
# same real data, not a new source of truth: confidence is a fixed, low
# ceiling (never the LLM's own self-reported number — that's the exact
# fabricated-confidence pattern this whole engine exists to eliminate),
# `validated` is always False, and Phase C's apply-fix gate never accepts
# an `source: "llm"` hypothesis as a basis for automated action.

_KNOWN_WAITING_REASONS = {"ImagePullBackOff", "ErrImagePull", "CrashLoopBackOff", "CreateContainerConfigError"}
_LLM_CONFIDENCE_CEILING = 0.35  # deliberately below every real evidence-based hypothesis's floor


def has_unrecognized_failure_signal(pod: Dict[str, Any]) -> bool:
    """True when a pod shows a real failure signal that none of the 5
    known Investigators would explain — Phase E's trigger condition.
    Keeps the LLM fallback from ever firing on a genuinely healthy pod."""
    waiting = _waiting_reason(pod)
    if waiting and waiting not in _KNOWN_WAITING_REASONS:
        return True
    phase = (pod.get("phase") or "").lower()
    if phase not in ("running", "succeeded", ""):
        return False  # Pending is already always covered by PendingUnschedulableInvestigator
    for cs in _container_states(pod):
        if cs.get("ready") is False:
            return True
        reason = cs.get("last_state_reason")
        if reason and reason not in ("OOMKilled", "Error"):
            return True
    return False


def parse_llm_hypotheses(raw: str) -> List[Dict[str, Any]]:
    """Pure parsing of the LLM's JSON response into hypothesis dicts —
    split from the actual API call (llm_investigate) so this is testable
    without a network call or an API key. Silently returns [] on any
    malformed response rather than guessing at partial data."""
    import json
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    hyps = data.get("hypotheses") if isinstance(data, dict) else None
    if not isinstance(hyps, list):
        return []
    out = []
    for h in hyps[:3]:
        if not isinstance(h, dict) or not h.get("cause"):
            continue
        out.append({
            "cause": str(h["cause"])[:300],
            "confidence": _LLM_CONFIDENCE_CEILING,
            "evidence": [{"signal": "llm_reasoning", "detail": str(h.get("reasoning", ""))[:500]}],
            "recommendation": str(h.get("recommendation") or "Investigate manually — no established pattern matched.")[:300],
            "steps": [],
            "validated": False,
            "source": "llm",
        })
    return out


async def llm_investigate(pod: Dict[str, Any], events: List[Dict[str, Any]], api_key: str) -> List[Dict[str, Any]]:
    """Phase E — LLM-assisted hypothesis generation, only called when
    OPENAI_API_KEY is set AND has_unrecognized_failure_signal(pod) is
    True (checked by the caller). Grounded strictly in the real data
    already collected for this pod; the prompt explicitly forbids
    inventing details not present in that data."""
    import json
    import openai

    pod_name = pod.get("name", "unknown")
    namespace = pod.get("namespace", "default")
    related = related_warning_events(events, namespace, pod_name)

    system_prompt = (
        "You are analyzing a Kubernetes pod whose failure did not match any known "
        "diagnostic pattern (not ImagePullBackOff, OOMKilled, CrashLoopBackOff, "
        "Pending/Unschedulable, or CreateContainerConfigError). Given ONLY the real "
        "data below, propose up to 3 possible root causes. Ground every hypothesis "
        "strictly in the data provided — never invent details, logs, or events not "
        "shown. If the data is insufficient to guess, say so honestly as a single "
        "hypothesis rather than fabricating specifics. Respond with strict JSON only: "
        '{"hypotheses": [{"cause": str, "reasoning": str, "recommendation": str}]}'
    )
    user_prompt = (
        f"Pod: {pod_name} (namespace: {namespace}, phase: {pod.get('phase')})\n"
        f"Container statuses: {json.dumps(pod.get('container_statuses', []))}\n"
        f"Total restarts: {pod.get('total_restarts', 0)}\n"
        f"Related warning events: "
        f"{json.dumps([{'reason': e.get('reason'), 'message': e.get('message')} for e in related])}"
    )

    client = openai.AsyncOpenAI(api_key=api_key)
    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.2,
        max_tokens=500,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw = completion.choices[0].message.content or "{}"
    return parse_llm_hypotheses(raw)


def add_llm_fallback(result: Dict[str, Any], pod: Dict[str, Any],
                      llm_hypotheses: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Attach the LLM's hypotheses (or an honest 'nothing matched, no LLM
    configured' note) when a pod has an unrecognized failure signal and
    no Investigator explained it — never silently reports "healthy" for
    a pod that's actually failing in a way we don't recognize."""
    if result["findings"] or not has_unrecognized_failure_signal(pod):
        return result  # already explained by a real Investigator, or genuinely healthy

    if llm_hypotheses:
        result["findings"].append({"failure_class": "unrecognized", "hypotheses": llm_hypotheses})
    else:
        result["findings"].append({
            "failure_class": "unrecognized",
            "hypotheses": [{
                "cause": "Pod shows a failure signal that doesn't match any known pattern",
                "confidence": 0.0,
                "evidence": [{"signal": "waiting_reason_or_readiness",
                               "detail": _waiting_reason(pod) or "container reported not ready"}],
                "recommendation": "No automated diagnosis available — inspect the pod directly, "
                                   "or set OPENAI_API_KEY to enable AI-assisted hypothesis generation "
                                   "for unrecognized failures.",
                "steps": [f"kubectl describe pod {pod.get('name', '')} -n {pod.get('namespace', 'default')}"],
                "validated": False,
                "source": "none",
            }],
        })
    result["healthy"] = False
    return result
