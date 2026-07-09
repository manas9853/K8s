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
async def get_optimization_advisor(cluster: Optional[str] = Query(None)):
    """AI Copilot - Optimization Advisor — real data from cluster"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        pods = ctx.get("pods", [])
        ns_resources = ctx.get("namespace_resources", [])
        orphaned_pvcs = ctx.get("orphaned_pvcs", [])

        recommendations = []

        # OPT-1: Over-provisioned pods (cpu_usage < 30% of request)
        over_prov = [
            p for p in pods
            if isinstance(p, dict)
            and p.get("cpu_request_cores", 0) > 0
            and (p.get("cpu_usage_cores", 0) / p["cpu_request_cores"]) < 0.30
        ]
        if over_prov:
            # Estimate monthly savings: waste = (request - usage) * $20/core/month
            cpu_waste = sum(
                p.get("cpu_request_cores", 0) - p.get("cpu_usage_cores", 0)
                for p in over_prov
            )
            savings = round(cpu_waste * 20.0, 2)
            sample = [p["name"] for p in sorted(over_prov, key=lambda p: p.get("cpu_request_cores", 0) - p.get("cpu_usage_cores", 0), reverse=True)[:3]]
            recommendations.append({
                "id": "opt-001",
                "title": "Right-size Over-Provisioned Pods",
                "description": f"{len(over_prov)} pods use <30% of their requested CPU — "
                               f"{', '.join(sample)}{' and more' if len(over_prov) > 3 else ''}",
                "impact": "high",
                "savings": savings,
                "effort": "low",
                "resources_affected": len(over_prov),
                "affected_names": sample,
            })

        # OPT-2: High-cost namespaces with no CPU limit set
        unlim = [
            p for p in pods
            if isinstance(p, dict) and p.get("cpu_limit_cores", 0) == 0
        ]
        if unlim:
            namespaces_unlim = list({p.get("namespace", "unknown") for p in unlim})
            savings_unlim = round(len(unlim) * 3.5, 2)
            recommendations.append({
                "id": "opt-002",
                "title": "Set CPU Limits on Unconstrained Pods",
                "description": f"{len(unlim)} pods have no CPU limit — they can starve neighbours. "
                               f"Affected namespaces: {', '.join(namespaces_unlim[:4])}",
                "impact": "medium",
                "savings": savings_unlim,
                "effort": "low",
                "resources_affected": len(unlim),
                "affected_names": namespaces_unlim[:5],
            })

        # OPT-3: Idle namespaces (cost allocated but very low usage)
        idle_ns = [
            ns for ns in ns_resources
            if isinstance(ns, dict)
            and ns.get("monthly_cost", 0) > 10
            and ns.get("cpu_usage_cores", 0) < 0.05
        ]
        if idle_ns:
            idle_savings = round(sum(ns.get("monthly_cost", 0) for ns in idle_ns), 2)
            names = [ns.get("namespace", "?") for ns in idle_ns[:4]]
            recommendations.append({
                "id": "opt-003",
                "title": "Review Idle Namespaces",
                "description": f"{len(idle_ns)} namespaces have cost allocation but near-zero CPU usage: "
                               f"{', '.join(names)}",
                "impact": "high",
                "savings": idle_savings,
                "effort": "low",
                "resources_affected": len(idle_ns),
                "affected_names": names,
            })

        # OPT-4: Orphaned PVCs wasting storage
        if orphaned_pvcs:
            pvc_cost = round(len(orphaned_pvcs) * 8.0, 2)
            names = [p.get("name", "?") for p in orphaned_pvcs[:4]]
            recommendations.append({
                "id": "opt-004",
                "title": "Delete Orphaned PersistentVolumeClaims",
                "description": f"{len(orphaned_pvcs)} PVCs are not mounted by any pod — releasing them "
                               f"saves storage costs immediately: {', '.join(names)}",
                "impact": "medium",
                "savings": pvc_cost,
                "effort": "low",
                "resources_affected": len(orphaned_pvcs),
                "affected_names": names,
            })

        # Sort by savings descending
        recommendations.sort(key=lambda r: r["savings"], reverse=True)

        total_savings = round(sum(r["savings"] for r in recommendations), 2)

        return {
            "advisor_type": "optimization",
            "cluster": ctx.get("cluster_name", "all"),
            "recommendations": recommendations,
            "total_potential_savings": total_savings,
            "priority_actions": len([r for r in recommendations if r["impact"] == "high"]),
            "last_updated": datetime.utcnow().isoformat() + "Z",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_optimization_advisor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
async def get_incident_investigator(cluster: Optional[str] = Query(None)):
    """AI Copilot - Incident Investigator — real OOMKill + restart data"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        oom_events      = ctx.get("oom_events", [])
        restart_analysis = sorted(ctx.get("restart_analysis", []),
                                  key=lambda x: x.get("restart_count", 0), reverse=True)
        warning_events  = ctx.get("warning_events", [])

        incidents = []

        # OOMKill incidents
        for i, ev in enumerate(oom_events[:10]):
            pod_name = ev.get("pod_name") or ev.get("name", f"pod-{i}")
            ns       = ev.get("namespace", "")
            ts       = ev.get("timestamp") or ev.get("time") or datetime.utcnow().isoformat() + "Z"
            cluster_tag = ev.get("_cluster", "")
            incidents.append({
                "incident_id": f"inc-oom-{i+1:03d}",
                "type": "OOMKill",
                "severity": "critical",
                "title": f"OOMKill — {pod_name}",
                "status": "active",
                "root_cause": "Pod exceeded memory limit and was killed by the OOM killer",
                "confidence": 0.94,
                "affected_pods": [pod_name],
                "namespace": ns,
                "cluster": cluster_tag,
                "timestamp": ts,
                "recommendations": [
                    f"Increase memory limit for {pod_name}",
                    "Check for memory leaks in application code",
                    "Set up memory usage alerting",
                ],
                "agent_command": {
                    "command": "patch_deployment_resources",
                    "params": {"name": pod_name.rsplit("-", 2)[0], "namespace": ns,
                               "memory_request": "512Mi", "memory_limit": "2Gi"},
                },
            })

        # High-restart incidents
        for i, r in enumerate(restart_analysis[:5]):
            if r.get("restart_count", 0) < 3:
                continue
            pod_name = r.get("name", f"pod-{i}")
            ns       = r.get("namespace", "")
            cluster_tag = r.get("_cluster", "")
            incidents.append({
                "incident_id": f"inc-rst-{i+1:03d}",
                "type": "CrashLoop",
                "severity": "high" if r.get("restart_count", 0) > 10 else "medium",
                "title": f"CrashLoop — {pod_name} ({r.get('restart_count', 0)} restarts)",
                "status": "active",
                "root_cause": "Pod is repeatedly crashing — likely OOM or application error",
                "confidence": 0.87,
                "affected_pods": [pod_name],
                "namespace": ns,
                "cluster": cluster_tag,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "recommendations": [
                    f"Check logs for {pod_name}",
                    "Review liveness probe configuration",
                    "Consider increasing resource limits",
                ],
                "agent_command": {
                    "command": "restart_deployment",
                    "params": {"name": pod_name.rsplit("-", 2)[0], "namespace": ns},
                },
            })

        sev = {s: sum(1 for inc in incidents if inc["severity"] == s)
               for s in ("critical", "high", "medium")}
        return {
            "investigator_type": "incident",
            "cluster_name": ctx.get("cluster_name", ""),
            "active_incidents": len(incidents),
            "warning_events_count": len(warning_events),
            "incidents": incidents,
            "severity_breakdown": sev,
            "last_updated": datetime.utcnow().isoformat() + "Z",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"incident-investigator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
async def get_manual_mode_status(cluster: Optional[str] = Query(None)):
    """Manual Mode — real over-provisioned pod recommendations as approval queue"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        CPU_PER_CORE_MONTH = 0.031 * 24 * 30
        MEM_PER_GB_MONTH   = 0.0035 * 24 * 30
        pods = ctx.get("pods", [])
        recs = []

        for i, p in enumerate(pods):
            cpu_req = p.get("cpu_request_m") or 0
            mem_req = p.get("memory_request_mb") or 0
            if cpu_req > 800:
                rec_cpu = max(100, int(cpu_req * 0.30))
                savings = round((cpu_req - rec_cpu) / 1000 * CPU_PER_CORE_MONTH, 2)
                recs.append({
                    "id": f"man-{len(recs)+1:03d}",
                    "type": "cpu_rightsizing",
                    "resource": f"pod/{p.get('name','?')}",
                    "namespace": p.get("namespace", ""),
                    "cluster": p.get("_cluster", ctx.get("cluster_name", "")),
                    "current": f"{cpu_req}m CPU",
                    "recommended": f"{rec_cpu}m CPU",
                    "savings": savings,
                    "risk": "low",
                    "confidence": 0.90,
                    "requires_approval": True,
                    "agent_command": {
                        "command": "patch_deployment_resources",
                        "params": {"name": p.get("name","?").rsplit("-", 2)[0],
                                   "namespace": p.get("namespace",""),
                                   "cpu_request": f"{rec_cpu}m"},
                    },
                })
            if mem_req > 1024:
                rec_mem = max(256, int(mem_req * 0.50))
                savings = round((mem_req - rec_mem) / 1024 * MEM_PER_GB_MONTH, 2)
                recs.append({
                    "id": f"man-{len(recs)+1:03d}",
                    "type": "memory_rightsizing",
                    "resource": f"pod/{p.get('name','?')}",
                    "namespace": p.get("namespace", ""),
                    "cluster": p.get("_cluster", ctx.get("cluster_name", "")),
                    "current": f"{mem_req}Mi",
                    "recommended": f"{rec_mem}Mi",
                    "savings": savings,
                    "risk": "low",
                    "confidence": 0.87,
                    "requires_approval": True,
                    "agent_command": {
                        "command": "patch_deployment_resources",
                        "params": {"name": p.get("name","?").rsplit("-", 2)[0],
                                   "namespace": p.get("namespace",""),
                                   "memory_request": f"{rec_mem}Mi"},
                    },
                })

        for pvc in ctx.get("orphaned_pvcs", []):
            recs.append({
                "id": f"man-{len(recs)+1:03d}",
                "type": "unused_pvc_cleanup",
                "resource": f"pvc/{pvc.get('name','?')}",
                "namespace": pvc.get("namespace", ""),
                "cluster": pvc.get("_cluster", ctx.get("cluster_name", "")),
                "current": f"{pvc.get('size_gb') or pvc.get('capacity_gb', '?')} GB (unattached)",
                "recommended": "Delete — no pods using this PVC",
                "savings": round((pvc.get("size_gb") or pvc.get("capacity_gb") or 0) * 0.10, 2),
                "risk": "medium",
                "confidence": 0.95,
                "requires_approval": True,
            })

        recs.sort(key=lambda x: x["savings"], reverse=True)
        return {
            "mode": "manual", "enabled": True,
            "cluster_name": ctx.get("cluster_name", ""),
            "pending_reviews": len(recs),
            "recommendations": recs[:20],
            "stats": {"total_recommendations": len(recs), "approved": 0,
                      "rejected": 0, "pending": len(recs)},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"manual-mode error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/operations/assisted-mode")
async def get_assisted_mode_status(cluster: Optional[str] = Query(None)):
    """Assisted Mode — real rule matches + agent command history as live feed"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        pods    = ctx.get("pods", [])
        oom     = ctx.get("oom_events", [])
        orphans = ctx.get("orphaned_pvcs", [])

        # Rules that fire based on real signals
        rules = [
            {
                "rule_id": "rule-cpu-waste",
                "category": "COST",
                "name": "Auto-fix CPU Over-Provisioning",
                "condition": "cpu_request > 3× observed for 7 days AND risk = LOW",
                "fires_when": f"{sum(1 for p in pods if (p.get('cpu_request_m') or 0) > 500)} pods qualify today",
                "enabled": True,
                "applied_today": sum(1 for p in pods if (p.get("cpu_request_m") or 0) > 500),
            },
            {
                "rule_id": "rule-oom-mem",
                "category": "PERFORMANCE",
                "name": "Auto-increase Memory on OOMKill",
                "condition": "pod OOMKilled AND memory_limit < 4Gi AND risk = LOW",
                "fires_when": f"{len(oom)} OOMKill events detected",
                "enabled": True,
                "applied_today": len(oom),
            },
            {
                "rule_id": "rule-orphan-pvc",
                "category": "STORAGE",
                "name": "Flag Orphaned PVCs for Approval",
                "condition": "PVC unattached > 30 days",
                "fires_when": f"{len(orphans)} orphaned PVCs detected",
                "enabled": True,
                "applied_today": 0,
            },
            {
                "rule_id": "rule-priv-sec",
                "category": "SECURITY",
                "name": "Auto-patch Privilege Escalation",
                "condition": "allowPrivilegeEscalation: true AND risk = LOW",
                "fires_when": f"{sum(1 for p in pods if any(c.get('allow_privilege_escalation') for c in (p.get('containers') or [])))} containers qualify",
                "enabled": False,
                "applied_today": 0,
            },
        ]

        return {
            "mode": "assisted", "enabled": True,
            "cluster_name": ctx.get("cluster_name", ""),
            "auto_approve_threshold": 50.0,
            "rules": rules,
            "stats": {
                "total_rules": len(rules),
                "enabled_rules": sum(1 for r in rules if r["enabled"]),
                "auto_applied_today": sum(r["applied_today"] for r in rules),
                "pending_approval": len(orphans),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assisted-mode error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/operations/autonomous-mode")
async def get_autonomous_mode_status(cluster: Optional[str] = Query(None)):
    """Autonomous Mode — real agent command history as activity feed"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        pods = ctx.get("pods", [])
        oom  = ctx.get("oom_events", [])
        restarts = ctx.get("restart_analysis", [])

        # Read real agent command history from DB
        recent_activities = []
        try:
            from database.db import db_manager
            clusters_list = db_manager.get_all_clusters()
            for c in (clusters_list if not cluster else [{"cluster_name": cluster}]):
                history = db_manager.get_metrics_history(c["cluster_name"], limit=5)
                for row in history:
                    recent_activities.append({
                        "id": f"hist-{row.get('id','')}",
                        "timestamp": row.get("received_at") or row.get("timestamp", ""),
                        "action": "Metrics snapshot collected",
                        "resource": f"cluster/{c['cluster_name']}",
                        "result": "success",
                    })
        except Exception:
            pass

        total_pods    = len(pods)
        unstable_pods = sum(1 for r in restarts if r.get("restart_count", 0) > 5)
        oom_pods      = len(oom)

        return {
            "mode": "autonomous",
            "cluster_name": ctx.get("cluster_name", ""),
            "autonomous_enabled": False,
            "cluster_summary": {
                "total_pods": total_pods,
                "oom_pods": oom_pods,
                "unstable_pods": unstable_pods,
                "fixable_automatically": max(0, unstable_pods + oom_pods - 1),
            },
            "guardrails": [
                "AI will NEVER delete production namespaces",
                "AI will NEVER delete PVCs with data",
                "AI will NEVER scale down below 1 replica",
                "AI will NEVER touch database StatefulSets",
                "AI will NEVER modify RBAC or cluster-admin roles",
            ],
            "recent_activities": recent_activities[:10],
            "last_updated": datetime.utcnow().isoformat() + "Z",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"autonomous-mode error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AUTO-FIX CENTER SECTION
# ============================================================================

@router.get("/autofix/resource-fixes")
async def get_resource_fixes(cluster: Optional[str] = Query(None)):
    """Resource fixes — real over-provisioned pods + orphaned PVCs"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        CPU_PER_CORE_MONTH = 0.031 * 24 * 30
        MEM_PER_GB_MONTH   = 0.0035 * 24 * 30
        pods    = ctx.get("pods", [])
        orphans = ctx.get("orphaned_pvcs", [])
        fixes   = []

        # CPU over-provisioning
        for p in sorted(pods, key=lambda x: x.get("cpu_request_m", 0) or 0, reverse=True):
            cpu_req = p.get("cpu_request_m") or 0
            if cpu_req < 500:
                continue
            rec_cpu = max(100, int(cpu_req * 0.30))
            savings = round((cpu_req - rec_cpu) / 1000 * CPU_PER_CORE_MONTH, 2)
            fixes.append({
                "fix_id": f"res-{len(fixes)+1:03d}",
                "category": "CPU_WASTE",
                "type": "cpu_over_provisioning",
                "resource": p.get("name", "?"),
                "namespace": p.get("namespace", ""),
                "cluster": p.get("_cluster", ctx.get("cluster_name", "")),
                "current_cpu": f"{cpu_req}m",
                "recommended_cpu": f"{rec_cpu}m",
                "savings": savings,
                "risk": "low",
                "status": "ready",
                "confidence": 0.90,
                "agent_command": {
                    "command": "patch_deployment_resources",
                    "params": {"name": p.get("name","?").rsplit("-", 2)[0],
                               "namespace": p.get("namespace",""),
                               "cpu_request": f"{rec_cpu}m"},
                },
            })

        # Memory over-provisioning
        for p in sorted(pods, key=lambda x: x.get("memory_request_mb", 0) or 0, reverse=True):
            mem_req = p.get("memory_request_mb") or 0
            if mem_req < 512:
                continue
            rec_mem = max(128, int(mem_req * 0.50))
            savings = round((mem_req - rec_mem) / 1024 * MEM_PER_GB_MONTH, 2)
            fixes.append({
                "fix_id": f"res-{len(fixes)+1:03d}",
                "category": "MEMORY_WASTE",
                "type": "memory_over_provisioning",
                "resource": p.get("name", "?"),
                "namespace": p.get("namespace", ""),
                "cluster": p.get("_cluster", ctx.get("cluster_name", "")),
                "current_memory": f"{mem_req}Mi",
                "recommended_memory": f"{rec_mem}Mi",
                "savings": savings,
                "risk": "low",
                "status": "ready",
                "confidence": 0.87,
                "agent_command": {
                    "command": "patch_deployment_resources",
                    "params": {"name": p.get("name","?").rsplit("-", 2)[0],
                               "namespace": p.get("namespace",""),
                               "memory_request": f"{rec_mem}Mi"},
                },
            })

        # Orphaned PVCs
        for pvc in orphans:
            gb = pvc.get("size_gb") or pvc.get("capacity_gb") or 0
            fixes.append({
                "fix_id": f"res-{len(fixes)+1:03d}",
                "category": "STORAGE_WASTE",
                "type": "unused_pvc",
                "resource": pvc.get("name", "?"),
                "namespace": pvc.get("namespace", ""),
                "cluster": pvc.get("_cluster", ctx.get("cluster_name", "")),
                "size": f"{gb}Gi",
                "savings": round(gb * 0.10, 2),
                "risk": "medium",
                "status": "ready",
                "confidence": 0.95,
            })

        total_savings = round(sum(f["savings"] for f in fixes), 2)
        return {
            "category": "resource_fixes",
            "cluster_name": ctx.get("cluster_name", ""),
            "total_fixes": len(fixes),
            "potential_savings": total_savings,
            "fixes": fixes,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"resource-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
async def get_bulk_fixes(cluster: Optional[str] = Query(None)):
    """Bulk fixes — combined fix candidates from all categories, real data"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        CPU_PER_CORE_MONTH = 0.031 * 24 * 30
        MEM_PER_GB_MONTH   = 0.0035 * 24 * 30
        pods    = ctx.get("pods", [])
        orphans = ctx.get("orphaned_pvcs", [])
        oom     = ctx.get("oom_events", [])

        cpu_waste = sum(1 for p in pods if (p.get("cpu_request_m") or 0) > 500)
        mem_waste = sum(1 for p in pods if (p.get("memory_request_mb") or 0) > 512)
        cpu_savings = round(sum(
            max(0, (p.get("cpu_request_m") or 0) - max(100, int((p.get("cpu_request_m") or 0) * 0.30))) / 1000 * CPU_PER_CORE_MONTH
            for p in pods if (p.get("cpu_request_m") or 0) > 500
        ), 2)
        mem_savings = round(sum(
            max(0, (p.get("memory_request_mb") or 0) - max(128, int((p.get("memory_request_mb") or 0) * 0.50))) / 1024 * MEM_PER_GB_MONTH
            for p in pods if (p.get("memory_request_mb") or 0) > 512
        ), 2)
        pvc_savings = round(sum((p.get("size_gb") or p.get("capacity_gb") or 0) * 0.10 for p in orphans), 2)

        # Unique namespaces for filter
        namespaces = sorted(set(p.get("namespace", "") for p in pods if p.get("namespace")))

        operations = []
        if cpu_waste:
            operations.append({
                "operation_id": "bulk-cpu",
                "category": "CPU_WASTE",
                "name": "Right-size All Over-Provisioned CPU",
                "description": f"Reduce CPU requests on {cpu_waste} pods requesting >500m",
                "affected_resources": cpu_waste,
                "total_savings": cpu_savings,
                "risk": "low",
            })
        if mem_waste:
            operations.append({
                "operation_id": "bulk-mem",
                "category": "MEMORY_WASTE",
                "name": "Right-size All Over-Provisioned Memory",
                "description": f"Reduce memory requests on {mem_waste} pods requesting >512Mi",
                "affected_resources": mem_waste,
                "total_savings": mem_savings,
                "risk": "low",
            })
        if orphans:
            operations.append({
                "operation_id": "bulk-pvc",
                "category": "STORAGE_WASTE",
                "name": "Clean Up All Orphaned PVCs",
                "description": f"Remove {len(orphans)} PVCs not attached to any pod",
                "affected_resources": len(orphans),
                "total_savings": pvc_savings,
                "risk": "medium",
            })
        if oom:
            operations.append({
                "operation_id": "bulk-oom",
                "category": "RELIABILITY",
                "name": "Fix All OOMKilled Pods",
                "description": f"Increase memory limits on {len(oom)} pods that have been OOMKilled",
                "affected_resources": len(oom),
                "total_savings": 0.0,
                "risk": "low",
            })

        return {
            "category": "bulk_fixes",
            "cluster_name": ctx.get("cluster_name", ""),
            "total_operations": len(operations),
            "total_potential_savings": round(cpu_savings + mem_savings + pvc_savings, 2),
            "available_namespaces": namespaces,
            "available_operations": operations,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bulk-fixes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# ROLLBACK CENTER SECTION
# ============================================================================

@router.get("/rollback/deployment-rollback")
async def get_deployment_rollbacks(cluster: Optional[str] = Query(None)):
    """Deployment rollback — real deployments from workloads domain"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")
        deployments = ctx.get("deployments", [])
        items = []
        for dep in deployments[:20]:
            name = dep.get("name") or dep.get("deployment_name", "?")
            ns   = dep.get("namespace", "")
            items.append({
                "deployment": name,
                "namespace": ns,
                "cluster": dep.get("_cluster", ctx.get("cluster_name", "")),
                "current_replicas": dep.get("replicas") or dep.get("ready_replicas", 1),
                "image": dep.get("image") or dep.get("container_image", ""),
                "can_rollback": True,
            })
        return {
            "category": "deployment_rollback",
            "cluster_name": ctx.get("cluster_name", ""),
            "available_deployments": len(items),
            "deployments": items,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"deployment-rollback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rollback/configuration-rollback")
async def get_configuration_rollbacks(cluster: Optional[str] = Query(None)):
    """Configuration rollback — real ConfigMaps and Secrets from cluster"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")
        cms  = ctx.get("configmaps", [])
        secs = ctx.get("secrets", [])
        cm_items = [
            {
                "resource_type": "ConfigMap",
                "name": cm.get("name", "?"),
                "namespace": cm.get("namespace", ""),
                "cluster": cm.get("_cluster", ctx.get("cluster_name", "")),
                "data_keys": cm.get("data_keys") or list((cm.get("data") or {}).keys()),
                "key_count": cm.get("key_count") or len(cm.get("data") or {}),
                "can_rollback": True,
            }
            for cm in cms[:20]
        ]
        sec_items = [
            {
                "resource_type": "Secret",
                "name": s.get("name", "?"),
                "namespace": s.get("namespace", ""),
                "cluster": s.get("_cluster", ctx.get("cluster_name", "")),
                "key_count": s.get("key_count") or len(s.get("data") or {}),
                "values_hidden": True,
                "can_rollback": True,
            }
            for s in secs[:20]
        ]
        return {
            "category": "configuration_rollback",
            "cluster_name": ctx.get("cluster_name", ""),
            "configmaps": cm_items,
            "secrets": sec_items,
            "total_configmaps": len(cm_items),
            "total_secrets": len(sec_items),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"configuration-rollback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rollback/namespace-rollback")
async def get_namespace_rollbacks(cluster: Optional[str] = Query(None)):
    """Namespace rollback — real namespaces with deployment counts"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")
        pods        = ctx.get("pods", [])
        deployments = ctx.get("deployments", [])
        namespaces  = ctx.get("namespaces", [])

        # Build per-namespace summary from real data
        ns_names = set()
        for p in pods:
            if p.get("namespace"):
                ns_names.add(p["namespace"])
        for d in deployments:
            if d.get("namespace"):
                ns_names.add(d["namespace"])
        for n in namespaces:
            name = n.get("name") if isinstance(n, dict) else str(n)
            if name:
                ns_names.add(name)

        items = []
        for ns in sorted(ns_names):
            pod_count = sum(1 for p in pods if p.get("namespace") == ns)
            dep_count = sum(1 for d in deployments if d.get("namespace") == ns)
            risk = "extreme" if ns in ("production", "prod", "kube-system") else \
                   "medium"  if ns in ("staging", "stage") else "low"
            items.append({
                "namespace": ns,
                "cluster": ctx.get("cluster_name", ""),
                "pod_count": pod_count,
                "deployment_count": dep_count,
                "risk": risk,
                "can_rollback": dep_count > 0,
            })
        return {
            "category": "namespace_rollback",
            "cluster_name": ctx.get("cluster_name", ""),
            "namespaces": items,
            "total_namespaces": len(items),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"namespace-rollback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rollback/cluster-rollback")
async def get_cluster_rollbacks(cluster: Optional[str] = Query(None)):
    """Cluster rollback — real snapshots from metrics history"""
    try:
        from database.db import db_manager
        clusters_list = db_manager.get_all_clusters()
        if not clusters_list:
            raise HTTPException(status_code=503, detail="No clusters available")

        target = cluster or clusters_list[0]["cluster_name"]
        history = db_manager.get_metrics_history(target, limit=10)

        snapshots = []
        for row in history:
            pods_raw = row.get("pods") or {}
            if isinstance(pods_raw, str):
                import json as _j
                try: pods_raw = _j.loads(pods_raw)
                except Exception: pods_raw = {}
            pod_count = len(pods_raw.get("items", []))
            snapshots.append({
                "snapshot_id":  row["id"],
                "timestamp":    row.get("timestamp") or row.get("received_at", ""),
                "pod_count":    pod_count,
                "can_rollback": True,
            })

        ctx = await _fetch_cluster_context(cluster)
        return {
            "category": "cluster_rollback",
            "cluster_name": target,
            "total_pods": len(ctx.get("pods", [])),
            "total_deployments": len(ctx.get("deployments", [])),
            "total_namespaces": len(set(p.get("namespace","") for p in ctx.get("pods", []))),
            "snapshots": snapshots,
            "risk": "extreme",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cluster-rollback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AI RECOMMENDATIONS SECTION
# ============================================================================

@router.get("/recommendations/cost")
async def get_cost_recommendations(cluster: Optional[str] = Query(None)):
    """Cost recommendations — real namespace cost breakdown from finops domain"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        CPU_MONTH = 0.031 * 24 * 30
        MEM_MONTH = 0.0035 * 24 * 30
        pods    = ctx.get("pods", [])
        orphans = ctx.get("orphaned_pvcs", [])
        ns_res  = ctx.get("namespace_resources", [])

        recs = []
        # Per-namespace cost recommendations
        ns_costs = []
        for ns in ns_res:
            cpu_cores = (ns.get("total_cpu_request_m") or 0) / 1000
            mem_gb    = (ns.get("total_memory_request_mb") or 0) / 1024
            cost      = round(cpu_cores * CPU_MONTH + mem_gb * MEM_MONTH, 2)
            ns_costs.append({"namespace": ns.get("namespace","?"), "cost": cost,
                              "cluster": ns.get("_cluster","")})
        ns_costs.sort(key=lambda x: x["cost"], reverse=True)

        for i, ns in enumerate(ns_costs[:5]):
            potential = round(ns["cost"] * 0.35, 2)
            recs.append({
                "id": f"cost-ns-{i+1:03d}", "priority": "high" if i < 2 else "medium",
                "title": f"Right-size workloads in {ns['namespace']}",
                "description": f"Namespace costs ~${ns['cost']}/mo — 35% savings estimated",
                "savings": potential, "effort": "low", "confidence": 0.88,
                "affected_namespace": ns["namespace"],
                "cluster": ns.get("cluster",""),
            })

        # Orphaned PVC recommendations
        for pvc in orphans[:5]:
            gb = pvc.get("size_gb") or pvc.get("capacity_gb") or 0
            savings = round(gb * 0.10, 2)
            recs.append({
                "id": f"cost-pvc-{len(recs)+1:03d}", "priority": "high",
                "title": f"Delete orphaned PVC {pvc.get('name','?')}",
                "description": f"PVC {pvc.get('name','?')} in {pvc.get('namespace','')} is unattached ({gb}Gi)",
                "savings": savings, "effort": "low", "confidence": 0.97,
                "affected_namespace": pvc.get("namespace",""),
                "cluster": pvc.get("_cluster",""),
            })

        # Over-provisioned pods
        cpu_waste_pods = [p for p in pods if (p.get("cpu_request_m") or 0) > 1000]
        if cpu_waste_pods:
            total = round(sum((p.get("cpu_request_m",0) or 0) * 0.70 / 1000 * CPU_MONTH for p in cpu_waste_pods), 2)
            recs.append({
                "id": f"cost-cpu-{len(recs)+1:03d}", "priority": "high",
                "title": f"Right-size {len(cpu_waste_pods)} over-provisioned pods",
                "description": f"{len(cpu_waste_pods)} pods requesting >1000m CPU — 70% savings possible",
                "savings": total, "effort": "low", "confidence": 0.91,
            })

        recs.sort(key=lambda x: x["savings"], reverse=True)
        total_savings = round(sum(r["savings"] for r in recs), 2)
        return {
            "category": "cost",
            "cluster_name": ctx.get("cluster_name",""),
            "total_recommendations": len(recs),
            "potential_savings": total_savings,
            "namespace_costs": ns_costs[:10],
            "recommendations": recs,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cost-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations/performance")
async def get_performance_recommendations(cluster: Optional[str] = Query(None)):
    """Performance recommendations — real throttled/OOM/unstable pods"""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        pods     = ctx.get("pods", [])
        oom      = ctx.get("oom_events", [])
        restarts = sorted(ctx.get("restart_analysis", []),
                          key=lambda x: x.get("restart_count", 0), reverse=True)
        recs = []

        # OOMKill pods — memory needs increase
        for ev in oom[:5]:
            name = ev.get("pod_name") or ev.get("name", "?")
            ns   = ev.get("namespace", "")
            recs.append({
                "id": f"perf-oom-{len(recs)+1:03d}",
                "category": "STABILITY",
                "priority": "critical",
                "title": f"OOMKill fix — {name}",
                "description": f"Pod {name} in {ns} was OOMKilled — increase memory limit",
                "impact": "critical", "effort": "low", "confidence": 0.96,
                "affected_pod": name, "namespace": ns,
                "cluster": ev.get("_cluster", ctx.get("cluster_name","")),
                "agent_command": {"command": "patch_deployment_resources",
                                  "params": {"name": name.rsplit("-",2)[0],
                                             "namespace": ns, "memory_limit": "4Gi"}},
            })

        # High-restart pods — instability
        for r in restarts[:5]:
            if r.get("restart_count", 0) < 3:
                continue
            name = r.get("name", "?")
            ns   = r.get("namespace", "")
            recs.append({
                "id": f"perf-rst-{len(recs)+1:03d}",
                "category": "STABILITY",
                "priority": "high",
                "title": f"CrashLoop — {name} ({r.get('restart_count',0)} restarts)",
                "description": f"Pod restarts indicate resource pressure or app error",
                "impact": "high", "effort": "low", "confidence": 0.88,
                "affected_pod": name, "namespace": ns,
                "cluster": r.get("_cluster", ctx.get("cluster_name","")),
            })

        # No CPU limits — throttling risk
        no_cpu_limit = [p for p in pods if not p.get("cpu_limit_m") and (p.get("cpu_request_m") or 0) > 200]
        if no_cpu_limit:
            recs.append({
                "id": f"perf-cpu-{len(recs)+1:03d}",
                "category": "THROTTLING",
                "priority": "medium",
                "title": f"{len(no_cpu_limit)} pods have no CPU limit — throttling risk",
                "description": "Pods without CPU limits can consume all node CPU, throttling neighbours",
                "impact": "medium", "effort": "low", "confidence": 0.85,
            })

        # Single replicas — SPOF
        single_replica = [p for p in pods
                          if (p.get("replicas") or p.get("ready_replicas") or 1) == 1][:5]
        for p in single_replica:
            recs.append({
                "id": f"perf-spof-{len(recs)+1:03d}",
                "category": "CAPACITY",
                "priority": "medium",
                "title": f"Single replica — {p.get('name','?')}",
                "description": "Pod has 1 replica — any crash causes full downtime",
                "impact": "high", "effort": "medium", "confidence": 0.92,
                "affected_pod": p.get("name","?"), "namespace": p.get("namespace",""),
            })

        total_pods = len(pods)
        no_probe   = sum(1 for p in pods if not p.get("has_liveness"))
        perf_score = max(0, min(100, 100
                                - len(oom) * 5
                                - len([r for r in restarts if r.get("restart_count",0) > 5]) * 3
                                - len(no_cpu_limit) * 1))
        return {
            "category": "performance",
            "cluster_name": ctx.get("cluster_name",""),
            "performance_score": perf_score,
            "total_recommendations": len(recs),
            "summary": {"total_pods": total_pods, "oom_pods": len(oom),
                        "no_probe_pods": no_probe, "no_cpu_limit_pods": len(no_cpu_limit)},
            "recommendations": recs,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"performance-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations/reliability")
async def get_reliability_recommendations(cluster: Optional[str] = Query(None)):
    """Reliability recommendations — real pods missing probes, single replicas, etc."""
    try:
        ctx = await _fetch_cluster_context(cluster)
        if not ctx:
            raise HTTPException(status_code=503, detail="No cluster data available")

        pods     = ctx.get("pods", [])
        restarts = ctx.get("restart_analysis", [])
        recs     = []

        # Missing liveness probes
        no_live = [p for p in pods if not p.get("has_liveness")][:10]
        for p in no_live:
            recs.append({
                "id": f"rel-probe-{len(recs)+1:03d}",
                "fix_type": "ADD_HEALTH_CHECK",
                "priority": "high",
                "title": f"No liveness probe — {p.get('name','?')}",
                "description": f"Pod {p.get('name','?')} in {p.get('namespace','')} has no liveness probe — can silently fail",
                "impact": "high", "effort": "low", "confidence": 0.93,
                "affected_pod": p.get("name","?"), "namespace": p.get("namespace",""),
                "cluster": p.get("_cluster", ctx.get("cluster_name","")),
                "agent_command": {"command": "patch_deployment_probes",
                                  "params": {"name": p.get("name","?").rsplit("-",2)[0],
                                             "namespace": p.get("namespace","")}},
            })

        # Missing readiness probes
        no_ready = [p for p in pods if not p.get("has_readiness")][:5]
        for p in no_ready:
            recs.append({
                "id": f"rel-rdy-{len(recs)+1:03d}",
                "fix_type": "ADD_READINESS_PROBE",
                "priority": "medium",
                "title": f"No readiness probe — {p.get('name','?')}",
                "description": "Traffic sent to pod even if it is not ready to serve",
                "impact": "medium", "effort": "low", "confidence": 0.90,
                "affected_pod": p.get("name","?"), "namespace": p.get("namespace",""),
                "cluster": p.get("_cluster", ctx.get("cluster_name","")),
            })

        # High-restart pods (reliability risk)
        for r in sorted(restarts, key=lambda x: x.get("restart_count",0), reverse=True)[:5]:
            if r.get("restart_count",0) < 5:
                continue
            recs.append({
                "id": f"rel-rst-{len(recs)+1:03d}",
                "fix_type": "ADD_REPLICA",
                "priority": "high",
                "title": f"Frequent crashes — {r.get('name','?')} ({r.get('restart_count',0)} restarts)",
                "description": "High restart count indicates reliability risk",
                "impact": "high", "effort": "medium", "confidence": 0.87,
                "affected_pod": r.get("name","?"), "namespace": r.get("namespace",""),
                "cluster": r.get("_cluster", ctx.get("cluster_name","")),
            })

        no_probe_count  = len(no_live)
        no_ready_count  = len(no_ready)
        high_rst_count  = len([r for r in restarts if r.get("restart_count",0) > 5])
        reliability_score = max(0, min(100, 100
                                       - no_probe_count * 3
                                       - high_rst_count * 5
                                       - no_ready_count * 2))
        return {
            "category": "reliability",
            "cluster_name": ctx.get("cluster_name",""),
            "reliability_score": reliability_score,
            "total_recommendations": len(recs),
            "summary": {"total_pods": len(pods), "no_liveness": no_probe_count,
                        "no_readiness": no_ready_count, "high_restart": high_rst_count},
            "recommendations": recs,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reliability-recommendations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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