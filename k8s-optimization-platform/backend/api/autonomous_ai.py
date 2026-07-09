"""
Autonomous AI Complete API
Consolidates all AI-powered features:
- AI Copilot (Natural Language, Optimization Advisor, Security Advisor, Incident Investigator)
- Autonomous Operations (Manual, Assisted, Autonomous modes)
- Auto-Fix Center (Resource, Security, Compliance, Bulk fixes)
- Rollback Center (Deployment, Configuration, Namespace, Cluster rollback)
- AI Recommendations (Cost, Performance, Reliability, Security, Compliance)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import logging
import os
import random

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================================
# SHARED DATA LAYER — _fetch_cluster_context + _answer_engine
# ============================================================================

async def _fetch_cluster_context(cluster: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch ALL data domains for a cluster (or aggregate all clusters).
    Single cluster  → reads 1 latest row from agent_metrics.
    All clusters    → aggregates all clusters; each pod/resource tagged with _cluster.
    """
    try:
        from database.db import db_manager
        clusters = db_manager.get_all_clusters()
        if not clusters:
            return {}

        def _safe(raw) -> Any:
            if raw is None:
                return {}
            if isinstance(raw, str):
                import json as _j
                try:
                    return _j.loads(raw)
                except Exception:
                    return {}
            return raw

        def _extract(metrics: Dict) -> Dict:
            pods_d  = _safe(metrics.get("pods"))
            finops_d = _safe(metrics.get("finops"))
            stor_d  = _safe(metrics.get("storage"))
            obs_d   = _safe(metrics.get("observability"))
            wl_d    = _safe(metrics.get("workloads"))
            cm_d    = _safe(metrics.get("configmaps"))
            sec_d   = _safe(metrics.get("secrets_domain"))
            ns_raw  = _safe(metrics.get("namespaces"))
            return {
                "pods":             pods_d.get("items", []),
                "oom_events":       pods_d.get("oom_events", []),
                "restart_analysis": pods_d.get("restart_analysis", []),
                "namespace_resources": finops_d.get("namespace_resources", []),
                "pvcs":             (_safe(stor_d.get("pvcs"))).get("items", []),
                "orphaned_pvcs":    (_safe(stor_d.get("pvcs"))).get("orphaned", []),
                "warning_events":   (_safe(obs_d.get("events"))).get("warning_events", []),
                "deployments":      (_safe(wl_d.get("deployments"))).get("items", []),
                "configmaps":       cm_d.get("items", []),
                "secrets":          sec_d.get("items", []),
                "namespaces":       ns_raw.get("items", []) if isinstance(ns_raw, dict) else
                                    (ns_raw if isinstance(ns_raw, list) else []),
                "finops":           finops_d,
                "storage":          stor_d,
                "observability":    obs_d,
                "workloads":        wl_d,
            }

        if cluster:
            metrics = db_manager.get_latest_metrics(cluster)
            if not metrics:
                return {}
            data = _extract(metrics)
            data["cluster_name"] = cluster
            return data

        # All clusters — aggregate and tag each item with _cluster
        list_keys = ["pods", "oom_events", "restart_analysis", "namespace_resources",
                     "pvcs", "orphaned_pvcs", "warning_events", "deployments",
                     "configmaps", "secrets", "namespaces"]
        agg: Dict[str, Any] = {k: [] for k in list_keys}
        agg["cluster_name"] = "all"
        agg.update({"finops": {}, "storage": {}, "observability": {}, "workloads": {}})

        for c in clusters:
            cname = c["cluster_name"]
            metrics = db_manager.get_latest_metrics(cname)
            if not metrics:
                continue
            d = _extract(metrics)
            for k in list_keys:
                for item in d.get(k, []):
                    if isinstance(item, dict):
                        item["_cluster"] = cname
                    agg[k].append(item)
        return agg
    except Exception as e:
        logger.error(f"_fetch_cluster_context error: {e}")
        return {}


# ── Beginner detection ────────────────────────────────────────────────────────

_K8S_TERMS = {
    "pod", "pods", "deployment", "namespace", "container", "kubectl",
    "node", "cluster", "pvc", "configmap", "daemonset", "statefulset",
    "hpa", "rbac", "ingress", "service", "cpu", "memory", "oom",
    "oomkill", "throttl", "evict", "replica", "liveness", "readiness",
    "cis", "pci", "cve", "securitycontext", "privileged",
}

def _is_beginner(query: str) -> bool:
    words = set(query.lower().split())
    return not bool(words & _K8S_TERMS)


# ── Intent routing ────────────────────────────────────────────────────────────

def _detect_intent(query: str) -> str:
    q = query.lower()
    if any(w in q for w in ["crash", "restart", "oomkill", "oom kill", "kill", "evict", "broken", "down", "fail"]):
        return "incident"
    if any(w in q for w in ["cost", "expensive", "money", "spend", "bill", "save", "waste", "cheap"]):
        return "cost"
    if any(w in q for w in ["security", "vulnerab", "privileged", "root", "cve", "attack", "hack", "exploit"]):
        return "security"
    if any(w in q for w in ["memory", "oom", "ram", "heap", "leak"]):
        return "memory"
    if any(w in q for w in ["storage", "disk", "pvc", "volume", "pv "]):
        return "storage"
    if any(w in q for w in ["cpu", "throttl", "slow", "performance", "latency", "speed"]):
        return "cpu"
    if any(w in q for w in ["health", "status", "overview", "summary", "how is", "what is", "show me"]):
        return "health"
    return "health"


# ── 7 response builders ───────────────────────────────────────────────────────

def _build_incident_answer(ctx: Dict, beginner: bool) -> Dict:
    oom = ctx.get("oom_events", [])
    restarts = sorted(ctx.get("restart_analysis", []), key=lambda x: x.get("restart_count", 0), reverse=True)
    warnings = ctx.get("warning_events", [])

    resources = []
    lines = []

    if oom:
        top = oom[:3]
        for e in top:
            name = e.get("pod_name") or e.get("name", "unknown")
            ns = e.get("namespace", "")
            resources.append({"type": "Pod", "name": name, "namespace": ns})
        lines.append(f"**OOMKill events:** {len(oom)} detected — top pods: " +
                     ", ".join(e.get("pod_name") or e.get("name", "?") for e in top))

    if restarts:
        top_r = restarts[:3]
        for r in top_r:
            resources.append({"type": "Pod", "name": r.get("name", "?"), "namespace": r.get("namespace", "")})
        lines.append(f"**High-restart pods:** " +
                     ", ".join(f"{r.get('name','?')} ({r.get('restart_count',0)} restarts)" for r in top_r))

    if warnings:
        lines.append(f"**Warning events:** {len(warnings)} Kubernetes warning events in the last snapshot")

    if not lines:
        lines = ["No active incidents found in the latest cluster snapshot."]

    if beginner:
        response = (
            "Think of your cluster like a fleet of workers. Some workers keep fainting (crashing) "
            "and getting replaced — that means something is wrong.\n\n" +
            "\n".join(lines) + "\n\n"
            "The fixes: give the fainting workers more memory, or find out why they keep running out."
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.91 if (oom or restarts) else 0.60,
        "related_resources": resources[:5],
        "suggestions": [
            "Show me which pods have the most restarts",
            "What is causing the OOMKills?",
            "How do I increase memory limits?",
            "Show me all warning events",
        ],
    }


def _build_cost_answer(ctx: Dict, beginner: bool) -> Dict:
    ns_resources = ctx.get("namespace_resources", [])
    pods = ctx.get("pod_cost_analysis", ctx.get("pods", []))
    orphaned = ctx.get("orphaned_pvcs", [])

    CPU_PER_CORE_MONTH = 0.031 * 24 * 30
    MEM_PER_GB_MONTH   = 0.0035 * 24 * 30

    ns_costs = []
    for ns in ns_resources:
        cpu_cores = (ns.get("total_cpu_request_m") or 0) / 1000
        mem_gb    = (ns.get("total_memory_request_mb") or 0) / 1024
        cost      = round(cpu_cores * CPU_PER_CORE_MONTH + mem_gb * MEM_PER_GB_MONTH, 2)
        ns_costs.append({"namespace": ns.get("namespace", "?"), "_cluster": ns.get("_cluster", ""), "cost": cost})
    ns_costs.sort(key=lambda x: x["cost"], reverse=True)

    total_cost = sum(n["cost"] for n in ns_costs)
    top_ns = ns_costs[:3]

    # Over-provisioned pods (cpu_request > 3× rough threshold)
    over_prov = [p for p in pods if (p.get("cpu_request_m") or 0) > 1000][:5]

    resources = [{"type": "Namespace", "name": n["namespace"], "namespace": ""} for n in top_ns]
    lines = []
    if top_ns:
        lines.append(f"**Total estimated monthly cost:** ${total_cost:,.0f}")
        lines.append("**Top cost namespaces:**")
        for n in top_ns:
            suffix = f" [{n['_cluster']}]" if n.get("_cluster") and n["_cluster"] != "all" else ""
            lines.append(f"  - {n['namespace']}{suffix}: ${n['cost']:,.0f}/mo")
    if orphaned:
        lines.append(f"**Orphaned PVCs:** {len(orphaned)} unused volumes wasting storage")
    if over_prov:
        lines.append(f"**Over-provisioned pods:** {len(over_prov)} pods requesting >1 CPU core each")

    if not lines:
        lines = ["No cost data available yet. Ensure the agent is collecting finops metrics."]

    if beginner:
        response = (
            "Your cloud bill works like a hotel — you pay for the rooms you reserve, not just the ones you use. "
            "Right now you have reserved more rooms than guests.\n\n" +
            "\n".join(lines) + "\n\n"
            "Quick wins: reduce over-reserved resources and delete unused storage volumes."
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.93 if ns_costs else 0.55,
        "related_resources": resources[:5],
        "suggestions": [
            "Which namespace wastes the most CPU?",
            "Show me unused PVCs",
            "List over-provisioned pods",
            "How much can I save by right-sizing?",
        ],
    }


def _build_memory_answer(ctx: Dict, beginner: bool) -> Dict:
    oom = ctx.get("oom_events", [])
    pods = ctx.get("pods", [])
    high_mem = sorted(
        [p for p in pods if (p.get("memory_request_mb") or 0) > 512],
        key=lambda x: x.get("memory_request_mb", 0), reverse=True
    )[:5]

    resources = []
    lines = []
    if oom:
        lines.append(f"**OOMKilled pods:** {len(oom)} — these pods ran out of memory and were killed")
        for e in oom[:3]:
            name = e.get("pod_name") or e.get("name", "?")
            resources.append({"type": "Pod", "name": name, "namespace": e.get("namespace", "")})
    if high_mem:
        lines.append("**Highest memory consumers:**")
        for p in high_mem:
            lines.append(f"  - {p.get('name','?')} ({p.get('namespace','')}) — "
                         f"{p.get('memory_request_mb',0):.0f} Mi requested")
            resources.append({"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")})

    if not lines:
        lines = ["No memory pressure signals found in the latest cluster snapshot."]

    if beginner:
        response = (
            "Memory in Kubernetes is like RAM in a computer — when a program needs more than available, "
            "it gets force-quit (OOMKilled). Your cluster has pods hitting this limit.\n\n" +
            "\n".join(lines)
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.90 if oom else 0.65,
        "related_resources": resources[:5],
        "suggestions": [
            "Which pods keep getting OOMKilled?",
            "How do I increase memory limits?",
            "Show me pods with memory leaks",
            "What is a safe memory limit to set?",
        ],
    }


def _build_cpu_answer(ctx: Dict, beginner: bool) -> Dict:
    pods = ctx.get("pods", [])
    high_cpu = sorted(
        [p for p in pods if (p.get("cpu_request_m") or 0) > 500],
        key=lambda x: x.get("cpu_request_m", 0), reverse=True
    )[:5]
    no_limit = [p for p in pods if not p.get("cpu_limit_m")][:3]

    resources = []
    lines = []
    if high_cpu:
        lines.append("**Top CPU consumers (by request):**")
        for p in high_cpu:
            lines.append(f"  - {p.get('name','?')} ({p.get('namespace','')}) — "
                         f"{p.get('cpu_request_m',0)}m CPU requested")
            resources.append({"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")})
    if no_limit:
        lines.append(f"**No CPU limit set:** {len(no_limit)} pods have no cpu limit — "
                     "they can starve other workloads")

    if not lines:
        lines = ["No CPU pressure signals found in the latest cluster snapshot."]

    if beginner:
        response = (
            "CPU in Kubernetes is like a highway — some cars (pods) are reserving 4 lanes but only using 1. "
            "This wastes space and slows everyone else down.\n\n" +
            "\n".join(lines)
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.88 if high_cpu else 0.60,
        "related_resources": resources[:5],
        "suggestions": [
            "Which pods have no CPU limits?",
            "Show me over-provisioned deployments",
            "How do I set CPU requests correctly?",
            "What is CPU throttling?",
        ],
    }


def _build_security_answer(ctx: Dict, beginner: bool) -> Dict:
    pods = ctx.get("pods", [])
    priv_pods   = [p for p in pods if any(c.get("privileged") for c in (p.get("containers") or []))]
    root_pods   = [p for p in pods if any(c.get("run_as_root") for c in (p.get("containers") or []))]
    host_net    = [p for p in pods if p.get("host_network")]

    resources = []
    lines = []
    if priv_pods:
        lines.append(f"**CRITICAL — Privileged containers:** {len(priv_pods)} pods running with full host access")
        for p in priv_pods[:3]:
            resources.append({"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")})
    if root_pods:
        lines.append(f"**CRITICAL — Root containers:** {len(root_pods)} pods running as UID 0")
        for p in root_pods[:3]:
            resources.append({"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")})
    if host_net:
        lines.append(f"**HIGH — Host network pods:** {len(host_net)} pods bypass network isolation")

    score_issues = len(priv_pods) + len(root_pods) + len(host_net)
    if not lines:
        lines = ["No critical security issues detected in the latest cluster snapshot."]

    if beginner:
        response = (
            "Security issues in your cluster are like leaving keys under the doormat — "
            "some containers have way too much access to the underlying machine.\n\n" +
            "\n".join(lines) + "\n\n"
            "Fix: patch the containers to run with minimal permissions."
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.95 if score_issues > 0 else 0.70,
        "related_resources": resources[:5],
        "suggestions": [
            "Show me all privileged containers",
            "How do I fix root containers?",
            "What compliance frameworks am I failing?",
            "Apply security hardening to all pods",
        ],
    }


def _build_storage_answer(ctx: Dict, beginner: bool) -> Dict:
    orphaned = ctx.get("orphaned_pvcs", [])
    pvcs     = ctx.get("pvcs", [])

    resources = []
    lines = []
    if orphaned:
        total_gb = sum((p.get("size_gb") or p.get("capacity_gb") or 0) for p in orphaned)
        lines.append(f"**Orphaned PVCs:** {len(orphaned)} unused volumes totalling ~{total_gb:.0f} GB")
        for p in orphaned[:3]:
            resources.append({"type": "PVC", "name": p.get("name","?"), "namespace": p.get("namespace","")})
    if pvcs:
        lines.append(f"**Total PVCs:** {len(pvcs)} persistent volumes in the cluster")

    if not lines:
        lines = ["No storage issues detected. All PVCs appear to be in use."]

    if beginner:
        response = (
            "Storage in Kubernetes is like rented warehouse space — you keep paying even when "
            "the warehouse is empty. Some of your storage volumes have no one using them.\n\n" +
            "\n".join(lines)
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.92 if orphaned else 0.65,
        "related_resources": resources[:5],
        "suggestions": [
            "List all orphaned PVCs",
            "How much storage am I wasting?",
            "Which PVCs can I safely delete?",
            "Show me storage cost by namespace",
        ],
    }


def _build_health_overview(ctx: Dict, beginner: bool) -> Dict:
    pods = ctx.get("pods", [])
    oom  = ctx.get("oom_events", [])
    restarts = ctx.get("restart_analysis", [])
    priv_pods = [p for p in pods if any(c.get("privileged") for c in (p.get("containers") or []))]

    running  = sum(1 for p in pods if p.get("phase", "").lower() == "running")
    pending  = sum(1 for p in pods if p.get("phase", "").lower() == "pending")
    failed   = sum(1 for p in pods if p.get("phase", "").lower() == "failed")

    lines = [
        f"**Cluster:** {ctx.get('cluster_name','?')}",
        f"**Total pods:** {len(pods)} — Running: {running} · Pending: {pending} · Failed: {failed}",
    ]
    if oom:
        lines.append(f"**OOMKill events:** {len(oom)} (pods running out of memory)")
    if restarts:
        high = [r for r in restarts if r.get("restart_count", 0) > 5]
        if high:
            lines.append(f"**Unstable pods:** {len(high)} pods with >5 restarts")
    if priv_pods:
        lines.append(f"**Security alert:** {len(priv_pods)} privileged containers detected")

    resources = [{"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")}
                 for p in pods[:3]]

    if beginner:
        response = (
            "Here is a health check of your Kubernetes cluster — like a doctor's report for your infrastructure.\n\n" +
            "\n".join(lines)
        )
    else:
        response = "\n".join(lines)

    return {
        "response": response,
        "confidence": 0.85 if pods else 0.40,
        "related_resources": resources,
        "suggestions": [
            "Why is my cluster expensive?",
            "Show me security issues",
            "Which pods keep crashing?",
            "Show me over-provisioned resources",
        ],
    }


# ── Phase 1 → Phase 2 swappable engine ───────────────────────────────────────

async def _answer_engine(query: str, ctx: Dict) -> Dict:
    """
    Phase 1: keyword routing over real cluster data.
    Phase 2: auto-activates when OPENAI_API_KEY is set in environment.
    """
    # Phase 2 slot — activate by adding OPENAI_API_KEY to .env + restart
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        try:
            return await _llm_engine(query, ctx, openai_key)
        except Exception as e:
            logger.warning(f"LLM engine failed, falling back to Phase 1: {e}")

    # Phase 1: rule-based keyword routing
    beginner = _is_beginner(query)
    intent   = _detect_intent(query)

    builders = {
        "incident": _build_incident_answer,
        "cost":     _build_cost_answer,
        "memory":   _build_memory_answer,
        "cpu":      _build_cpu_answer,
        "security": _build_security_answer,
        "storage":  _build_storage_answer,
        "health":   _build_health_overview,
    }
    return builders[intent](ctx, beginner)


async def _llm_engine(query: str, ctx: Dict, api_key: str) -> Dict:
    """
    Phase 2: OpenAI gpt-4o-mini with real cluster data as context.
    Only called when OPENAI_API_KEY is set.
    Falls back to Phase 1 if called without key or on API error.
    """
    import openai

    pod_summary = "\n".join(
        f"  - {p.get('name','?')} ns={p.get('namespace','?')} "
        f"cpu={p.get('cpu_request_m',0)}m mem={p.get('memory_request_mb',0)}Mi "
        f"restarts={p.get('restart_count',0)} phase={p.get('phase','?')}"
        for p in (ctx.get("pods") or [])[:20]
    ) or "  (no pod data)"

    oom_summary = "\n".join(
        f"  - {e.get('pod_name') or e.get('name','?')} ns={e.get('namespace','?')}"
        for e in (ctx.get("oom_events") or [])[:5]
    ) or "  (none)"

    system_prompt = (
        "You are an expert Kubernetes optimization AI. Answer in plain, direct language. "
        "Use the real cluster data below. Be specific — use actual pod names and numbers. "
        "Format with markdown bold for important items. Keep answers under 200 words."
    )
    user_prompt = (
        f"Cluster: {ctx.get('cluster_name','?')}\n\n"
        f"Pods (top 20):\n{pod_summary}\n\n"
        f"OOMKill events:\n{oom_summary}\n\n"
        f"Question: {query}"
    )

    client = openai.AsyncOpenAI(api_key=api_key)
    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.3,
        max_tokens=400,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    )
    answer = completion.choices[0].message.content or ""

    return {
        "response": answer,
        "confidence": 0.97,
        "related_resources": [
            {"type": "Pod", "name": p.get("name","?"), "namespace": p.get("namespace","")}
            for p in (ctx.get("pods") or [])[:3]
        ],
        "suggestions": [
            "Show me the most expensive namespace",
            "Which pods are crashing?",
            "What security issues exist?",
            "Give me a full health overview",
        ],
    }


async def _ai_security_context(cluster: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch real pod signals for AI security/compliance endpoints.
    FIXED: All-Clusters no longer silently falls back to clusters[0].
    Now aggregates pods across ALL clusters via _fetch_cluster_context.
    """
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            return {}
        pods = ctx.get("pods", [])
    except Exception as e:
        logger.error(f"_ai_security_context: {e}")
        pods = []

    tc = 0
    priv = root = pe = ro = host_net = host_pid = host_ipc = default_sa = no_lv = no_cpu = no_mem = 0
    namespaces = set()

    for pod in pods:
        namespaces.add(pod.get("namespace", ""))
        sa = pod.get("service_account", "default") or "default"
        if sa == "default":
            default_sa += 1
        if pod.get("host_network"):
            host_net += 1
        if pod.get("host_pid"):
            host_pid += 1
        if pod.get("host_ipc"):
            host_ipc += 1
        for c in (pod.get("containers") or []):
            tc += 1
            if c.get("privileged"):
                priv += 1
            if c.get("run_as_root"):
                root += 1
            if c.get("allow_privilege_escalation"):
                pe += 1
            if c.get("read_only_root_fs"):
                ro += 1
            if not c.get("has_liveness"):
                no_lv += 1
            if not c.get("cpu_limit"):
                no_cpu += 1
            if not c.get("memory_limit_mb"):
                no_mem += 1

    return {
        "cluster_name": cluster or "xforce-devops",
        "total_pods": len(pods),
        "total_containers": tc,
        "namespace_count": len(namespaces),
        "namespaces": list(namespaces),
        "privileged_count": priv,
        "root_count": root,
        "priv_esc_count": pe,
        "readonly_fs_count": ro,
        "host_network_count": host_net,
        "host_pid_count": host_pid,
        "host_ipc_count": host_ipc,
        "default_sa_count": default_sa,
        "no_liveness_count": no_lv,
        "no_cpu_limit_count": no_cpu,
        "no_mem_limit_count": no_mem,
        "pods": pods,
    }

# ============================================================================
# AI COPILOT SECTION
# ============================================================================

class QueryType(str, Enum):
    NATURAL_LANGUAGE = "natural_language"
    OPTIMIZATION = "optimization"
    SECURITY = "security"
    INCIDENT = "incident"

class CopilotQuery(BaseModel):
    query: str
    query_type: QueryType = QueryType.NATURAL_LANGUAGE
    cluster: Optional[str] = None          # which cluster to scope (None = all clusters)
    context: Optional[Dict[str, Any]] = None

class CopilotResponse(BaseModel):
    query_id: str
    query: str
    response: str
    suggestions: List[str]
    related_resources: List[Dict[str, str]]
    confidence: float
    timestamp: str

@router.post("/copilot/query", response_model=CopilotResponse)
async def query_copilot(query: CopilotQuery):
    """
    AI Copilot — Natural language query interface.
    Phase 1: keyword routing over real Postgres cluster data.
    Phase 2: auto-activates when OPENAI_API_KEY is set in .env.
    """
    query_id  = f"q-{random.randint(10000, 99999)}"
    timestamp = datetime.utcnow().isoformat() + "Z"

    try:
        ctx = await _fetch_cluster_context(query.cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available. Ensure the agent is running.")

        result = await _answer_engine(query.query, ctx)

        return CopilotResponse(
            query_id=query_id,
            query=query.query,
            response=result["response"],
            suggestions=result.get("suggestions", []),
            related_resources=result.get("related_resources", []),
            confidence=result.get("confidence", 0.80),
            timestamp=timestamp,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"query_copilot error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/copilot/optimization-advisor")
async def get_optimization_advisor():
    """AI Copilot - Optimization Advisor"""
    return {
        "advisor_type": "optimization",
        "recommendations": [
            {
                "id": "opt-001",
                "title": "Right-size Over-Provisioned Deployments",
                "description": "8 deployments are using less than 30% of requested resources",
                "impact": "high",
                "savings": 3200.0,
                "effort": "low",
                "resources_affected": 8
            },
            {
                "id": "opt-002",
                "title": "Enable Horizontal Pod Autoscaling",
                "description": "12 deployments could benefit from HPA based on traffic patterns",
                "impact": "medium",
                "savings": 1800.0,
                "effort": "medium",
                "resources_affected": 12
            },
            {
                "id": "opt-003",
                "title": "Consolidate Low-Utilization Nodes",
                "description": "3 nodes running at <20% utilization can be consolidated",
                "impact": "high",
                "savings": 2400.0,
                "effort": "low",
                "resources_affected": 3
            }
        ],
        "total_potential_savings": 7400.0,
        "priority_actions": 3,
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

@router.get("/copilot/security-advisor")
async def get_security_advisor(cluster: Optional[str] = Query(None)):
    """AI Copilot - Security Advisor — real data from cluster"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1

        # Derive security score from signals
        priv_rate = 1 - ctx["privileged_count"] / tc
        root_rate = 1 - ctx["root_count"] / tc
        pe_rate   = 1 - ctx["priv_esc_count"] / tc
        ro_rate   = ctx["readonly_fs_count"] / tc
        hn_rate   = 1 - ctx["host_network_count"] / tp
        sa_rate   = 1 - ctx["default_sa_count"] / tp
        security_score = round((priv_rate*20 + root_rate*15 + pe_rate*15 + ro_rate*10
                                + hn_rate*15 + sa_rate*15 + (1 - ctx["no_liveness_count"]/tc)*10), 1)

        issues = []
        if ctx["privileged_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if any(c.get("privileged") for c in (p.get("containers") or []))][:5]
            issues.append({"id": "sec-001", "severity": "critical", "category": "Container Security",
                           "title": "Privileged Containers Running in Cluster",
                           "description": f"{ctx['privileged_count']} containers running with privileged: true — full host access",
                           "affected_resources": pods_sample,
                           "remediation": "Remove privileged: true from all container securityContexts",
                           "cve_ids": []})
        if ctx["root_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if any(c.get("run_as_root") for c in (p.get("containers") or []))][:5]
            issues.append({"id": "sec-002", "severity": "critical", "category": "Container Security",
                           "title": "Containers Running as Root (UID 0)",
                           "description": f"{ctx['root_count']} containers running as root user",
                           "affected_resources": pods_sample,
                           "remediation": "Set runAsNonRoot: true and specify non-zero runAsUser",
                           "cve_ids": []})
        if ctx["host_network_count"] > 0:
            pods_sample = [p["name"] for p in ctx["pods"] if p.get("host_network")][:5]
            issues.append({"id": "sec-003", "severity": "high", "category": "Network Security",
                           "title": "Pods Using Host Network Namespace",
                           "description": f"{ctx['host_network_count']} pods with hostNetwork: true — unrestricted node network access",
                           "affected_resources": pods_sample,
                           "remediation": "Set hostNetwork: false unless absolutely required",
                           "cve_ids": []})
        if ctx["priv_esc_count"] > 0:
            issues.append({"id": "sec-004", "severity": "high", "category": "Container Security",
                           "title": "Privilege Escalation Allowed",
                           "description": f"{ctx['priv_esc_count']} containers allow allowPrivilegeEscalation: true",
                           "affected_resources": [f"{ctx['priv_esc_count']} containers"],
                           "remediation": "Set allowPrivilegeEscalation: false in all securityContexts",
                           "cve_ids": []})
        if ctx["default_sa_count"] > 0:
            issues.append({"id": "sec-005", "severity": "medium", "category": "RBAC",
                           "title": "Default Service Account Usage",
                           "description": f"{ctx['default_sa_count']} pods using default service account",
                           "affected_resources": [f"{ctx['default_sa_count']} pods"],
                           "remediation": "Create dedicated service accounts per workload",
                           "cve_ids": []})
        writable = tc - ctx["readonly_fs_count"]
        if writable > 0:
            issues.append({"id": "sec-006", "severity": "medium", "category": "Container Security",
                           "title": "Writable Root Filesystems",
                           "description": f"{writable} containers with readOnlyRootFilesystem: false",
                           "affected_resources": [f"{writable} containers"],
                           "remediation": "Set readOnlyRootFilesystem: true",
                           "cve_ids": []})

        sev_counts = {s: sum(1 for i in issues if i["severity"] == s) for s in ("critical","high","medium","low")}

        cis_score = round(security_score)
        return {
            "summary": {
                "total_issues": len(issues),
                "critical": sev_counts["critical"],
                "high": sev_counts["high"],
                "medium": sev_counts["medium"],
                "low": 0,
                "security_score": round(security_score, 1),
                "total_pods": tp,
                "total_containers": tc,
                "cluster_name": ctx["cluster_name"],
            },
            "issues": issues,
            "compliance_status": {
                "cis_benchmark": "Partial" if cis_score < 80 else "Compliant",
                "pci_dss": "Compliant" if ctx["privileged_count"] == 0 else "Non-Compliant",
                "hipaa": "Compliant" if ctx["readonly_fs_count"] / tc > 0.5 else "Needs Review",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-advisor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/copilot/incident-investigator")
async def get_incident_investigator():
    """AI Copilot - Incident Investigator"""
    return {
        "investigator_type": "incident",
        "active_incidents": 2,
        "resolved_today": 5,
        "incidents": [
            {
                "incident_id": "inc-001",
                "severity": "high",
                "title": "Repeated OOMKills in API Server",
                "status": "investigating",
                "root_cause": "Memory leak in application code",
                "affected_pods": ["api-server-7c9d8", "api-server-5k3m2"],
                "timeline": [
                    {"time": "2026-06-23T06:00:00Z", "event": "First OOMKill detected"},
                    {"time": "2026-06-23T06:15:00Z", "event": "Memory usage spike to 4Gi"},
                    {"time": "2026-06-23T06:30:00Z", "event": "Pod restarted automatically"},
                    {"time": "2026-06-23T07:00:00Z", "event": "Pattern identified: memory leak"}
                ],
                "recommendations": [
                    "Increase memory limit to 6Gi temporarily",
                    "Implement connection pooling",
                    "Add memory profiling"
                ],
                "related_metrics": {
                    "memory_growth_rate": "500Mi/hour",
                    "restart_count": 12,
                    "avg_uptime": "6 hours"
                }
            },
            {
                "incident_id": "inc-002",
                "severity": "medium",
                "title": "High CPU Throttling in Frontend",
                "status": "resolved",
                "root_cause": "CPU limits too restrictive",
                "affected_pods": ["frontend-web-8d7f"],
                "timeline": [
                    {"time": "2026-06-23T05:00:00Z", "event": "CPU throttling detected"},
                    {"time": "2026-06-23T05:30:00Z", "event": "Response time degradation"},
                    {"time": "2026-06-23T06:00:00Z", "event": "CPU limit increased to 2000m"},
                    {"time": "2026-06-23T06:15:00Z", "event": "Performance restored"}
                ],
                "recommendations": [
                    "Monitor CPU usage patterns",
                    "Consider HPA for traffic spikes"
                ],
                "related_metrics": {
                    "throttling_percentage": "45%",
                    "response_time_p95": "2.5s",
                    "cpu_utilization": "95%"
                }
            }
        ],
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

# ============================================================================
# AUTONOMOUS OPERATIONS SECTION
# ============================================================================

class OperationMode(str, Enum):
    MANUAL = "manual"
    ASSISTED = "assisted"
    AUTONOMOUS = "autonomous"

@router.get("/operations/modes")
async def get_operation_modes():
    """Get all autonomous operation modes"""
    return {
        "modes": [
            {
                "mode": "manual",
                "name": "Manual Mode",
                "description": "Full manual control - recommendations only",
                "automation_level": 0,
                "features": [
                    "View all recommendations",
                    "Manual approval required for every change",
                    "Complete audit trail",
                    "No automatic actions"
                ],
                "best_for": "Production environments requiring strict change control"
            },
            {
                "mode": "assisted",
                "name": "Assisted Mode",
                "description": "Semi-automated with approval workflow",
                "automation_level": 50,
                "features": [
                    "Automatic detection of optimization opportunities",
                    "One-click approval for recommended changes",
                    "Auto-approve low-risk changes below threshold",
                    "Notification system for pending approvals"
                ],
                "best_for": "Balanced approach for most environments"
            },
            {
                "mode": "autonomous",
                "name": "Autonomous Mode",
                "description": "Fully automated optimization",
                "automation_level": 100,
                "features": [
                    "Continuous automatic optimization",
                    "Self-healing capabilities",
                    "Predictive scaling",
                    "Automatic rollback on failures"
                ],
                "best_for": "Development and staging environments"
            }
        ],
        "current_mode": "assisted",
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }

@router.get("/operations/manual-mode")
async def get_manual_mode_status():
    """Get Manual Mode status and pending actions"""
    return {
        "mode": "manual",
        "enabled": True,
        "pending_reviews": 15,
        "recommendations": [
            {
                "id": "man-001",
                "type": "cpu_rightsizing",
                "resource": "deployment/frontend-web",
                "current": "2000m",
                "recommended": "500m",
                "savings": 45.0,
                "confidence": 0.95,
                "requires_approval": True
            },
            {
                "id": "man-002",
                "type": "memory_rightsizing",
                "resource": "deployment/api-server",
                "current": "4Gi",
                "recommended": "2Gi",
                "savings": 32.0,
                "confidence": 0.88,
                "requires_approval": True
            }
        ],
        "stats": {
            "total_recommendations": 15,
            "approved": 0,
            "rejected": 0,
            "pending": 15
        }
    }

@router.get("/operations/assisted-mode")
async def get_assisted_mode_status():
    """Get Assisted Mode status and auto-approved actions"""
    return {
        "mode": "assisted",
        "enabled": True,
        "auto_approve_threshold": 100.0,
        "pending_approval": 8,
        "auto_approved_today": 12,
        "actions": [
            {
                "id": "ast-001",
                "type": "cpu_rightsizing",
                "resource": "deployment/cache-service",
                "status": "auto_approved",
                "savings": 25.0,
                "risk": "low",
                "approved_at": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z"
            },
            {
                "id": "ast-002",
                "type": "unused_pvc_cleanup",
                "resource": "pvc/old-data-vol",
                "status": "pending_approval",
                "savings": 120.0,
                "risk": "medium",
                "requires_manual_approval": True
            }
        ],
        "stats": {
            "total_actions": 20,
            "auto_approved": 12,
            "pending_approval": 8,
            "applied": 10
        }
    }

@router.get("/operations/autonomous-mode")
async def get_autonomous_mode_status():
    """Get Autonomous Mode status and automated actions"""
    return {
        "mode": "autonomous",
        "status": "active",
        "autonomous_enabled": False,
        "optimizations_today": 45,
        "total_savings_today": "$1,250.00",
        "success_rate": 95.6,
        "recent_activities": [
            {
                "id": "auto-001",
                "timestamp": (datetime.utcnow() - timedelta(minutes=30)).isoformat() + "Z",
                "action": "CPU Rightsizing Applied",
                "resource": "deployment/worker-pool",
                "result": "success",
                "savings": "$35.00"
            },
            {
                "id": "auto-002",
                "timestamp": (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z",
                "action": "Horizontal Scaling (Scaled Down)",
                "resource": "deployment/api-server",
                "result": "success",
                "savings": "$80.00"
            },
            {
                "id": "auto-003",
                "timestamp": (datetime.utcnow() - timedelta(hours=3)).isoformat() + "Z",
                "action": "Node Consolidation (Drained)",
                "resource": "node/worker-3",
                "result": "success",
                "savings": "$450.00"
            }
        ]
    }

# ============================================================================
# AUTO-FIX CENTER SECTION
# ============================================================================

@router.get("/autofix/resource-fixes")
async def get_resource_fixes():
    """Get resource optimization fixes"""
    return {
        "category": "resource_fixes",
        "total_fixes": 28,
        "potential_savings": 3200.0,
        "fixes": [
            {
                "fix_id": "res-001",
                "type": "cpu_over_provisioning",
                "resource": "deployment/frontend-web",
                "namespace": "production",
                "current_cpu": "2000m",
                "recommended_cpu": "500m",
                "savings": 45.0,
                "risk": "low",
                "status": "ready",
                "confidence": 0.95
            },
            {
                "fix_id": "res-002",
                "type": "memory_over_provisioning",
                "resource": "deployment/api-server",
                "namespace": "production",
                "current_memory": "4Gi",
                "recommended_memory": "2Gi",
                "savings": 32.0,
                "risk": "low",
                "status": "ready",
                "confidence": 0.88
            },
            {
                "fix_id": "res-003",
                "type": "unused_pvc",
                "resource": "pvc/old-data-vol",
                "namespace": "staging",
                "size": "100Gi",
                "last_used": "90 days ago",
                "savings": 120.0,
                "risk": "medium",
                "status": "ready",
                "confidence": 0.92
            }
        ]
    }

@router.get("/autofix/security-fixes")
async def get_security_fixes(cluster: Optional[str] = Query(None)):
    """Get security-related fixes — real data from cluster signals"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        fixes = []
        tc = ctx["total_containers"] or 1

        if ctx["privileged_count"] > 0:
            priv_pods = [p["name"] for p in ctx["pods"]
                         if any(c.get("privileged") for c in (p.get("containers") or []))]
            for i, pod in enumerate(priv_pods[:5]):
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "critical",
                               "type": "privileged_container", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Container running with privileged: true",
                               "fix": "Remove privileged: true from securityContext", "status": "ready", "cve_ids": []})

        if ctx["root_count"] > 0:
            root_pods = [p["name"] for p in ctx["pods"]
                         if any(c.get("run_as_root") for c in (p.get("containers") or []))]
            for pod in root_pods[:5]:
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "critical",
                               "type": "root_container", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Container running as root (UID 0)",
                               "fix": "Set runAsNonRoot: true and runAsUser: 1000", "status": "ready", "cve_ids": []})

        if ctx["host_network_count"] > 0:
            hn_pods = [p["name"] for p in ctx["pods"] if p.get("host_network")]
            for pod in hn_pods[:5]:
                ns = next((p.get("namespace","") for p in ctx["pods"] if p.get("name") == pod), "")
                fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "high",
                               "type": "host_network", "resource": f"pod/{pod}",
                               "namespace": ns, "issue": "Pod using host network namespace",
                               "fix": "Set hostNetwork: false in pod spec", "status": "ready", "cve_ids": []})

        if ctx["priv_esc_count"] > 0:
            fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "high",
                           "type": "privilege_escalation", "resource": f"{ctx['priv_esc_count']} containers",
                           "namespace": "multiple", "issue": "allowPrivilegeEscalation: true",
                           "fix": "Set allowPrivilegeEscalation: false", "status": "ready", "cve_ids": []})

        writable = tc - ctx["readonly_fs_count"]
        if writable > 0:
            fixes.append({"fix_id": f"sec-{len(fixes)+1:03d}", "severity": "medium",
                           "type": "writable_fs", "resource": f"{writable} containers",
                           "namespace": "multiple", "issue": "readOnlyRootFilesystem: false",
                           "fix": "Set readOnlyRootFilesystem: true", "status": "ready", "cve_ids": []})

        sev_counts = {s: sum(1 for f in fixes if f["severity"] == s) for s in ("critical","high","medium")}
        return {
            "category": "security_fixes", "total_fixes": len(fixes),
            "critical": sev_counts["critical"], "high": sev_counts["high"], "medium": sev_counts["medium"],
            "fixes": fixes, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/autofix/compliance-fixes")
async def get_compliance_fixes(cluster: Optional[str] = Query(None)):
    """Get compliance-related fixes — real data from cluster signals"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1
        fixes = []

        items = [
            ("CIS Benchmark", "4.2.1", "privileged_container", "critical",
             f"{ctx['privileged_count']} containers have privileged: true",
             "Remove privileged: true — violates CIS 4.2.1", ctx["privileged_count"] > 0),
            ("CIS Benchmark", "4.2.3", "root_container", "critical",
             f"{ctx['root_count']} containers run as root",
             "Set runAsNonRoot: true — violates CIS 4.2.3", ctx["root_count"] > 0),
            ("PCI DSS", "Req 1", "host_network", "high",
             f"{ctx['host_network_count']} pods using host network",
             "Set hostNetwork: false — PCI DSS network isolation", ctx["host_network_count"] > 0),
            ("CIS Benchmark", "4.3.1", "writable_fs", "medium",
             f"{tc - ctx['readonly_fs_count']} containers have writable root FS",
             "Set readOnlyRootFilesystem: true — CIS 4.3.1", (tc - ctx["readonly_fs_count"]) > 0),
            ("ISO 27001", "A.9", "default_sa", "medium",
             f"{ctx['default_sa_count']} pods using default SA",
             "Create dedicated service accounts — ISO 27001 A.9", ctx["default_sa_count"] > 0),
            ("CIS Benchmark", "4.4.1", "cpu_limits", "medium",
             f"{ctx['no_cpu_limit_count']} containers missing CPU limits",
             "Add resources.limits.cpu — CIS 4.4.1", ctx["no_cpu_limit_count"] > 0),
        ]

        for fw, ctrl, ftype, sev, issue, fix, active in items:
            if active:
                fixes.append({"fix_id": f"comp-{len(fixes)+1:03d}", "framework": fw, "control": ctrl,
                               "type": ftype, "resource": issue.split()[0] + " resources",
                               "issue": issue, "fix": fix, "status": "ready", "impact": sev})

        fw_counts = {}
        for f in fixes:
            fw_counts[f["framework"]] = fw_counts.get(f["framework"], 0) + 1

        return {
            "category": "compliance_fixes", "total_fixes": len(fixes),
            "frameworks": fw_counts, "fixes": fixes, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compliance-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/autofix/bulk-fixes")
async def get_bulk_fixes():
    """Get bulk fix operations"""
    return {
        "category": "bulk_fixes",
        "available_operations": [
            {
                "operation_id": "bulk-001",
                "name": "Right-size All Over-Provisioned Deployments",
                "description": "Apply CPU/memory right-sizing to all deployments with >50% waste",
                "affected_resources": 15,
                "total_savings": 2400.0,
                "risk": "low",
                "estimated_duration": "5 minutes"
            },
            {
                "operation_id": "bulk-002",
                "name": "Clean Up All Unused PVCs",
                "description": "Remove all PVCs not attached to pods for >90 days",
                "affected_resources": 8,
                "total_savings": 960.0,
                "risk": "medium",
                "estimated_duration": "2 minutes"
            },
            {
                "operation_id": "bulk-003",
                "name": "Update All Vulnerable Images",
                "description": "Upgrade all container images with high-severity CVEs",
                "affected_resources": 12,
                "total_savings": 0.0,
                "risk": "medium",
                "estimated_duration": "10 minutes"
            }
        ],
        "last_bulk_operation": {
            "operation_id": "bulk-004",
            "name": "Remove Stale ConfigMaps",
            "completed_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
            "resources_affected": 23,
            "status": "success"
        }
    }

# ============================================================================
# ROLLBACK CENTER SECTION
# ============================================================================

@router.get("/rollback/deployment-rollback")
async def get_deployment_rollbacks():
    """Get deployment rollback history and options"""
    return {
        "category": "deployment_rollback",
        "available_rollbacks": 8,
        "rollbacks": [
            {
                "rollback_id": "dep-rb-001",
                "deployment": "frontend-web",
                "namespace": "production",
                "current_revision": 5,
                "previous_revision": 4,
                "change_date": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z",
                "change_type": "cpu_rightsizing",
                "can_rollback": True,
                "reason": "CPU reduced from 2000m to 500m"
            },
            {
                "rollback_id": "dep-rb-002",
                "deployment": "api-server",
                "namespace": "production",
                "current_revision": 12,
                "previous_revision": 11,
                "change_date": (datetime.utcnow() - timedelta(hours=5)).isoformat() + "Z",
                "change_type": "image_update",
                "can_rollback": True,
                "reason": "Updated to version 2.5.0"
            }
        ],
        "recent_rollbacks": [
            {
                "rollback_id": "dep-rb-003",
                "deployment": "worker-pool",
                "namespace": "processing",
                "rolled_back_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
                "reason": "Performance degradation after update",
                "status": "success"
            }
        ]
    }

@router.get("/rollback/configuration-rollback")
async def get_configuration_rollbacks():
    """Get configuration rollback history"""
    return {
        "category": "configuration_rollback",
        "available_rollbacks": 15,
        "rollbacks": [
            {
                "rollback_id": "cfg-rb-001",
                "resource_type": "ConfigMap",
                "resource_name": "app-config",
                "namespace": "production",
                "change_date": (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z",
                "changes": [
                    {"key": "max_connections", "old": "100", "new": "200"},
                    {"key": "timeout", "old": "30s", "new": "60s"}
                ],
                "can_rollback": True
            },
            {
                "rollback_id": "cfg-rb-002",
                "resource_type": "Secret",
                "resource_name": "db-credentials",
                "namespace": "production",
                "change_date": (datetime.utcnow() - timedelta(hours=3)).isoformat() + "Z",
                "changes": [
                    {"key": "password", "old": "***", "new": "***"}
                ],
                "can_rollback": True
            }
        ]
    }

@router.get("/rollback/namespace-rollback")
async def get_namespace_rollbacks():
    """Get namespace-wide rollback options"""
    return {
        "category": "namespace_rollback",
        "available_namespaces": 5,
        "namespaces": [
            {
                "rollback_id": "ns-rb-001",
                "namespace": "production",
                "last_snapshot": (datetime.utcnow() - timedelta(hours=6)).isoformat() + "Z",
                "changes_since_snapshot": 12,
                "can_rollback": True,
                "affected_resources": {
                    "deployments": 5,
                    "configmaps": 3,
                    "secrets": 2,
                    "services": 2
                }
            },
            {
                "rollback_id": "ns-rb-002",
                "namespace": "staging",
                "last_snapshot": (datetime.utcnow() - timedelta(hours=12)).isoformat() + "Z",
                "changes_since_snapshot": 8,
                "can_rollback": True,
                "affected_resources": {
                    "deployments": 3,
                    "configmaps": 2,
                    "secrets": 1,
                    "services": 2
                }
            }
        ]
    }

@router.get("/rollback/cluster-rollback")
async def get_cluster_rollbacks():
    """Get cluster-wide rollback options"""
    return {
        "category": "cluster_rollback",
        "cluster_name": "production-cluster",
        "last_snapshot": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
        "changes_since_snapshot": 45,
        "can_rollback": True,
        "snapshot_details": {
            "total_resources": 234,
            "namespaces": 8,
            "deployments": 32,
            "statefulsets": 5,
            "daemonsets": 8,
            "services": 45,
            "configmaps": 67,
            "secrets": 34,
            "pvcs": 23
        },
        "rollback_scope": [
            "All resource configurations",
            "RBAC policies",
            "Network policies",
            "Resource quotas",
            "Limit ranges"
        ],
        "estimated_duration": "15 minutes",
        "risk": "high"
    }

# ============================================================================
# AI RECOMMENDATIONS SECTION
# ============================================================================

@router.get("/recommendations/cost")
async def get_cost_recommendations():
    """Get AI-powered cost optimization recommendations"""
    return {
        "category": "cost",
        "total_recommendations": 15,
        "potential_savings": 4200.0,
        "recommendations": [
            {
                "id": "cost-001",
                "priority": "high",
                "title": "Right-size Over-Provisioned Deployments",
                "description": "8 deployments using <30% of requested resources",
                "savings": 1800.0,
                "effort": "low",
                "confidence": 0.95,
                "affected_resources": 8,
                "implementation": "Reduce CPU/memory requests to match actual usage"
            },
            {
                "id": "cost-002",
                "priority": "high",
                "title": "Remove Unused PVCs",
                "description": "5 PVCs not attached to any pods for >90 days",
                "savings": 600.0,
                "effort": "low",
                "confidence": 0.98,
                "affected_resources": 5,
                "implementation": "Delete unused persistent volume claims"
            },
            {
                "id": "cost-003",
                "priority": "medium",
                "title": "Enable Cluster Autoscaling",
                "description": "Cluster has 3 underutilized nodes that could be scaled down",
                "savings": 1800.0,
                "effort": "medium",
                "confidence": 0.85,
                "affected_resources": 3,
                "implementation": "Configure cluster autoscaler with min/max node counts"
            }
        ]
    }

@router.get("/recommendations/performance")
async def get_performance_recommendations():
    """Get AI-powered performance optimization recommendations"""
    return {
        "category": "performance",
        "total_recommendations": 12,
        "recommendations": [
            {
                "id": "perf-001",
                "priority": "high",
                "title": "Increase CPU Limits for Throttled Pods",
                "description": "Frontend pods experiencing 45% CPU throttling",
                "impact": "high",
                "effort": "low",
                "confidence": 0.92,
                "affected_resources": 3,
                "metrics": {
                    "current_throttling": "45%",
                    "target_throttling": "<5%",
                    "response_time_improvement": "40%"
                }
            },
            {
                "id": "perf-002",
                "priority": "high",
                "title": "Add Memory to OOMKilling Pods",
                "description": "API server pods restarting due to OOM",
                "impact": "critical",
                "effort": "low",
                "confidence": 0.98,
                "affected_resources": 2,
                "metrics": {
                    "current_memory": "2Gi",
                    "recommended_memory": "4Gi",
                    "restart_count": 12
                }
            },
            {
                "id": "perf-003",
                "priority": "medium",
                "title": "Enable Horizontal Pod Autoscaling",
                "description": "Traffic patterns show 3x variation during peak hours",
                "impact": "medium",
                "effort": "medium",
                "confidence": 0.88,
                "affected_resources": 5,
                "metrics": {
                    "peak_traffic": "3000 req/s",
                    "off_peak_traffic": "1000 req/s",
                    "recommended_min_replicas": 3,
                    "recommended_max_replicas": 10
                }
            }
        ]
    }

@router.get("/recommendations/reliability")
async def get_reliability_recommendations():
    """Get AI-powered reliability recommendations"""
    return {
        "category": "reliability",
        "total_recommendations": 10,
        "recommendations": [
            {
                "id": "rel-001",
                "priority": "high",
                "title": "Add Liveness and Readiness Probes",
                "description": "8 deployments missing health check probes",
                "impact": "high",
                "effort": "low",
                "confidence": 0.95,
                "affected_resources": 8,
                "risk_reduction": "Prevents serving traffic to unhealthy pods"
            },
            {
                "id": "rel-002",
                "priority": "high",
                "title": "Configure Pod Disruption Budgets",
                "description": "Critical services lack PDB protection",
                "impact": "high",
                "effort": "low",
                "confidence": 0.92,
                "affected_resources": 5,
                "risk_reduction": "Ensures minimum availability during updates"
            },
            {
                "id": "rel-003",
                "priority": "medium",
                "title": "Implement Multi-Zone Deployment",
                "description": "All pods in single availability zone",
                "impact": "critical",
                "effort": "high",
                "confidence": 0.98,
                "affected_resources": 15,
                "risk_reduction": "Protects against zone failures"
            }
        ]
    }

@router.get("/recommendations/security")
async def get_security_recommendations(cluster: Optional[str] = Query(None)):
    """Get AI-powered security recommendations — real data"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        tp = ctx["total_pods"] or 1
        recs = []

        items = [
            ("critical", "Remediate Privileged Containers",
             f"Remove privileged: true from {ctx['privileged_count']} containers",
             "low", 0.99, ctx["privileged_count"],
             ["CIS Benchmark 4.2.1", "PCI DSS Req 6"],
             ctx["privileged_count"] > 0),
            ("critical", "Enforce Non-Root User Execution",
             f"Set runAsNonRoot: true on {ctx['root_count']} containers running as UID 0",
             "low", 0.98, ctx["root_count"],
             ["CIS Benchmark 4.2.3", "PCI DSS 2.2.4"],
             ctx["root_count"] > 0),
            ("high", "Disable Host Namespace Access",
             f"Set hostNetwork/hostPID/hostIPC: false on {ctx['host_network_count']+ctx['host_pid_count']+ctx['host_ipc_count']} pods",
             "medium", 0.97, ctx["host_network_count"] + ctx["host_pid_count"] + ctx["host_ipc_count"],
             ["CIS Benchmark 4.1.x", "NIST CM-6"],
             (ctx["host_network_count"] + ctx["host_pid_count"] + ctx["host_ipc_count"]) > 0),
            ("high", "Block Privilege Escalation",
             f"Set allowPrivilegeEscalation: false on {ctx['priv_esc_count']} containers",
             "low", 0.96, ctx["priv_esc_count"],
             ["CIS Benchmark 4.2.2"],
             ctx["priv_esc_count"] > 0),
            ("medium", "Enable Read-Only Root Filesystem",
             f"Set readOnlyRootFilesystem: true on {tc - ctx['readonly_fs_count']} containers",
             "medium", 0.90, tc - ctx["readonly_fs_count"],
             ["CIS Benchmark 4.3.1", "GDPR"],
             (tc - ctx["readonly_fs_count"]) > 0),
            ("medium", "Segregate Service Accounts",
             f"Create dedicated service accounts for {ctx['default_sa_count']} pods using default SA",
             "medium", 0.88, ctx["default_sa_count"],
             ["ISO 27001 A.9", "SOC 2 CC6"],
             ctx["default_sa_count"] > 0),
        ]

        for i, (priority, title, desc, effort, conf, affected, compliance, active) in enumerate(items):
            if active:
                recs.append({"id": f"sec-rec-{len(recs)+1:03d}", "priority": priority, "title": title,
                             "description": desc, "impact": priority, "effort": effort,
                             "confidence": conf, "affected_resources": affected,
                             "cve_ids": [], "compliance_impact": compliance})

        sev_counts = {s: sum(1 for r in recs if r["priority"] == s) for s in ("critical","high","medium","low")}
        return {
            "category": "security", "total_recommendations": len(recs),
            "critical": sev_counts["critical"], "high": sev_counts["high"], "medium": sev_counts["medium"],
            "recommendations": recs, "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"security-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendations/compliance")
async def get_compliance_recommendations(cluster: Optional[str] = Query(None)):
    """Get AI-powered compliance recommendations — real data"""
    try:
        ctx = await _ai_security_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        tc = ctx["total_containers"] or 1
        recs = []

        items = [
            ("high", "CIS Benchmark", "4.2.1", "Remove Privileged Containers",
             f"{ctx['privileged_count']} containers violate CIS 4.2.1",
             "high", "medium", 0.99, ctx["privileged_count"],
             "CIS Kubernetes Benchmark v1.8", ctx["privileged_count"] > 0),
            ("high", "PCI DSS", "Req 1", "Enforce Network Isolation",
             f"{ctx['host_network_count']} pods bypass network policies via host network",
             "critical", "medium", 0.97, ctx["host_network_count"],
             "PCI DSS v4.0 Requirement 1", ctx["host_network_count"] > 0),
            ("high", "ISO 27001", "A.9", "Implement Service Account Segregation",
             f"{ctx['default_sa_count']} pods use default SA — violates ISO 27001 A.9",
             "high", "medium", 0.88, ctx["default_sa_count"],
             "ISO 27001:2022 Annex A.9", ctx["default_sa_count"] > 0),
            ("medium", "CIS Benchmark", "4.3.1", "Enforce Read-Only Filesystem",
             f"{tc - ctx['readonly_fs_count']} containers have writable root FS",
             "medium", "low", 0.90, tc - ctx["readonly_fs_count"],
             "CIS Benchmark v1.8 Section 4.3", (tc - ctx["readonly_fs_count"]) > 0),
            ("medium", "CIS Benchmark", "4.4.1", "Add Resource Limits",
             f"{ctx['no_cpu_limit_count']} containers missing CPU limits",
             "medium", "low", 0.85, ctx["no_cpu_limit_count"],
             "CIS Benchmark v1.8 Section 4.4", ctx["no_cpu_limit_count"] > 0),
        ]

        for priority, fw, ctrl, title, desc, impact, effort, conf, affected, gap, active in items:
            if active:
                recs.append({"id": f"comp-rec-{len(recs)+1:03d}", "priority": priority, "framework": fw,
                             "control": ctrl, "title": title, "description": desc,
                             "impact": impact, "effort": effort, "confidence": conf,
                             "affected_resources": affected, "compliance_gap": gap})

        fw_counts = {}
        for r in recs:
            fw_counts[r["framework"]] = fw_counts.get(r["framework"], 0) + 1

        return {
            "category": "compliance", "total_recommendations": len(recs),
            "frameworks": fw_counts, "recommendations": recs,
            "cluster_name": ctx["cluster_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compliance-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob - Comprehensive Autonomous AI API