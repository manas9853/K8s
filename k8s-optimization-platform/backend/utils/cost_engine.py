"""
Cost Engine — single source of truth for all K8s cost calculations.

Ponytail rule: one module, imported everywhere. No duplication.
Previously every file (finops.py, autonomous_ai.py, cleanup.py, pods.py)
had its own formula. They are all replaced by this.

Data source priority per cluster:
  1. cluster_billing_cache  → Phase 2: real invoice from cloud billing API
  2. _fetch_cluster_context → Phase 1: agent node specs + instance type lookup

From-onboarding-date rule:
  Cost history starts from first agent_metrics row for a cluster.
  No fabricated pre-onboarding data. Ever.
"""
from __future__ import annotations
from typing import Any
import logging

logger = logging.getLogger(__name__)

HOURS_PER_MONTH = 730

# ── IBM Cloud IKS instance type pricing ($/hr, us-east on-demand) ─────────────
IBM_IKS_RATES: dict[str, float] = {
    "b3c.2x8":               0.064,
    "b3c.4x16":              0.118,
    "b3c.4x16.encrypted":    0.124,
    "b3c.8x32":              0.248,
    "b3c.8x32.encrypted":    0.264,   # Node 10.190.140.14
    "b3c.16x64":             0.480,
    "b3c.16x64.encrypted":   0.512,
    "b3c.32x128":            0.960,
    "b3c.32x128.encrypted":  1.024,
    "m3c.4x32":              0.182,
    "m3c.4x32.encrypted":    0.192,   # Nodes 10.190.140.15 / .5 / .9
    "m3c.8x64":              0.352,
    "m3c.8x64.encrypted":    0.384,
    "m3c.16x128":            0.704,
    "m3c.30x240":            1.320,
    "c3c.4x8":               0.096,
    "c3c.8x16":              0.192,
    "c3c.16x32":             0.384,
    "c3c.32x64":             0.768,
    "u3c.2x4":               0.056,
}

# ── AWS EKS EC2 instance pricing ($/hr, us-east-1 on-demand) ──────────────────
AWS_EC2_RATES: dict[str, float] = {
    "t3.small": 0.021, "t3.medium": 0.042, "t3.large": 0.083,
    "t3.xlarge": 0.166, "t3.2xlarge": 0.333,
    "t3a.medium": 0.038, "t3a.large": 0.075,
    "m5.large": 0.096, "m5.xlarge": 0.192, "m5.2xlarge": 0.384,
    "m5.4xlarge": 0.768, "m5.8xlarge": 1.536,
    "m5a.large": 0.086, "m5a.xlarge": 0.172, "m5a.2xlarge": 0.344,
    "m6i.large": 0.096, "m6i.xlarge": 0.192, "m6i.2xlarge": 0.384,
    "m6i.4xlarge": 0.768, "m6i.8xlarge": 1.536,
    "c5.large": 0.085, "c5.xlarge": 0.170, "c5.2xlarge": 0.340,
    "c5.4xlarge": 0.680, "c5.9xlarge": 1.530,
    "c6i.large": 0.085, "c6i.xlarge": 0.170, "c6i.2xlarge": 0.340,
    "r5.large": 0.126, "r5.xlarge": 0.252, "r5.2xlarge": 0.504,
    "r5.4xlarge": 1.008, "r5.8xlarge": 2.016,
}

# ── GCP GKE machine types ($/hr, us-central1 on-demand) ───────────────────────
GCP_GCE_RATES: dict[str, float] = {
    "e2-small": 0.017, "e2-medium": 0.034,
    "e2-standard-2": 0.067, "e2-standard-4": 0.134,
    "e2-standard-8": 0.268, "e2-standard-16": 0.536, "e2-standard-32": 1.072,
    "n2-standard-2": 0.097, "n2-standard-4": 0.194, "n2-standard-8": 0.388,
    "n2-standard-16": 0.776, "n2-standard-32": 1.552,
    "n2-highmem-2": 0.131, "n2-highmem-4": 0.262, "n2-highmem-8": 0.524,
    "c2-standard-4": 0.209, "c2-standard-8": 0.418, "c2-standard-16": 0.836,
}

# ── Azure AKS VM sizes ($/hr, eastus pay-as-you-go) ───────────────────────────
AZURE_VM_RATES: dict[str, float] = {
    "Standard_B2s": 0.046, "Standard_B4ms": 0.166, "Standard_B8ms": 0.333,
    "Standard_D2s_v3": 0.096, "Standard_D4s_v3": 0.192,
    "Standard_D8s_v3": 0.384, "Standard_D16s_v3": 0.768,
    "Standard_D2s_v5": 0.096, "Standard_D4s_v5": 0.192,
    "Standard_F4s_v2": 0.169, "Standard_F8s_v2": 0.338,
    "Standard_E4s_v3": 0.252, "Standard_E8s_v3": 0.504,
}

# ── Managed K8s control plane fees ($/hr per cluster) ─────────────────────────
CONTROL_PLANE_FEES: dict[str, float] = {
    "IBM Cloud": 0.091,   # IKS Standard tier
    "AWS":       0.100,   # EKS cluster fee
    "GCP":       0.100,   # GKE Standard tier — free for Autopilot
    "Azure":     0.000,   # AKS control plane is free
    "unknown":   0.000,
}

# ── Provider-aware fallback vCPU rates (when instance type unknown) ────────────
PROVIDER_VCPU_RATES: dict[str, dict[str, float]] = {
    "IBM Cloud": {"cpu": 0.048, "mem": 0.006},
    "AWS":       {"cpu": 0.031, "mem": 0.0035},
    "GCP":       {"cpu": 0.033, "mem": 0.0044},
    "Azure":     {"cpu": 0.040, "mem": 0.005},
    "unknown":   {"cpu": 0.031, "mem": 0.0035},
}

# ── Storage class rates ($/GB/month) ──────────────────────────────────────────
STORAGE_CLASS_RATES: dict[str, float] = {
    # IBM Cloud File Storage
    "ibmc-file-bronze":              0.08,
    "ibmc-file-silver":              0.12,
    "ibmc-file-gold":                0.20,
    "ibmc-file-retain-bronze":       0.09,
    "ibmc-file-retain-silver":       0.13,
    "ibmc-file-retain-gold":         0.22,
    # IBM Cloud Block Storage
    "ibmc-block-bronze":             0.09,
    "ibmc-block-silver":             0.13,
    "ibmc-block-gold":               0.20,
    "ibmc-block-retain-bronze":      0.10,
    "ibmc-block-retain-silver":      0.14,
    "ibmc-block-retain-gold":        0.22,
    # ECK custom storage
    "eck-custom-storage-bronze":     0.08,
    "eck-custom-storage-silver":     0.12,
    # AWS EBS
    "gp2": 0.10, "gp3": 0.08, "io1": 0.125, "io2": 0.125, "sc1": 0.025, "st1": 0.045,
    # GCP Persistent Disk
    "pd-ssd": 0.17, "pd-balanced": 0.10, "pd-standard": 0.04,
    "standard": 0.04, "ssd": 0.17,
    # Azure Disk
    "managed-premium": 0.135, "managed-standard": 0.05,
    "default": 0.10,
}

# ── Regional CO₂ intensity (kg CO₂/kWh) ──────────────────────────────────────
# Source: EPA eGRID + cloud provider sustainability reports
REGION_CO2_INTENSITY: dict[str, float] = {
    "us-east": 0.385, "us-east-1": 0.385, "us-east-2": 0.385,
    "us-south": 0.300, "us-west": 0.210, "us-west-1": 0.210, "us-west-2": 0.210,
    "eu-west-1": 0.233, "eu-west": 0.233, "eu-central-1": 0.338,
    "eu-north-1": 0.008,   # Nordic: nearly 100% renewable
    "ap-southeast-1": 0.431, "ap-east": 0.431,
    "ap-northeast-1": 0.506,
    "default": 0.385,
}


# ── Node helpers ───────────────────────────────────────────────────────────────

def resolve_instance_type(node: dict[str, Any]) -> str:
    """
    5-step instance type resolution. Returns "" if nothing found.
    Step 1: direct field on node dict.
    Step 2: standard K8s labels.
    Step 3: IBM-specific label.
    Step 4: AWS nodegroup label (parse from ARN).
    Step 5: finops node_specs field.
    """
    # Step 1
    t = (node.get("instance_type") or "").strip()
    if t:
        return t
    # Steps 2–3: labels
    labels = node.get("labels") or {}
    for key in (
        "node.kubernetes.io/instance-type",
        "beta.kubernetes.io/instance-type",
        "ibm-cloud.kubernetes.io/machine-type",
        "kops.k8s.io/instancegroup",
    ):
        t = (labels.get(key) or "").strip()
        if t:
            return t
    return ""


def detect_provider(node: dict[str, Any], finops: dict[str, Any] | None = None) -> str:
    """
    Detect cloud provider from provider_id prefix, labels, or finops.provider.
    Returns one of: IBM Cloud | AWS | GCP | Azure | unknown
    """
    pid = (node.get("provider_id") or "").lower()
    if pid.startswith("ibm://"):
        return "IBM Cloud"
    if pid.startswith("aws:///") or pid.startswith("aws://"):
        return "AWS"
    if pid.startswith("gce://"):
        return "GCP"
    if pid.startswith("azure://"):
        return "Azure"
    # Label check for IBM
    labels = node.get("labels") or {}
    if labels.get("ibm-cloud.kubernetes.io/region"):
        return "IBM Cloud"
    if labels.get("eks.amazonaws.com/nodegroup"):
        return "AWS"
    if labels.get("cloud.google.com/gke-nodepool"):
        return "GCP"
    if labels.get("kubernetes.azure.com/cluster"):
        return "Azure"
    # Finops field fallback
    if finops:
        p = (finops.get("provider") or "").strip()
        if p:
            return p
    return "unknown"


def _node_hourly(node: dict[str, Any], provider: str) -> tuple[float, str]:
    """
    Returns (hourly_rate, method).
    method: 'instance_lookup' | 'vcpu_fallback'
    """
    instance_type = resolve_instance_type(node)
    rate_tables = {
        "IBM Cloud": IBM_IKS_RATES,
        "AWS":       AWS_EC2_RATES,
        "GCP":       GCP_GCE_RATES,
        "Azure":     AZURE_VM_RATES,
    }
    table = rate_tables.get(provider, {})
    if instance_type and instance_type in table:
        return table[instance_type], "instance_lookup"
    # vCPU fallback
    rates = PROVIDER_VCPU_RATES.get(provider, PROVIDER_VCPU_RATES["unknown"])
    cpu = float(node.get("cpu_capacity") or node.get("cpu_cores") or 0)
    mem = float(node.get("memory_capacity_gb") or node.get("memory_gb") or 0)
    return cpu * rates["cpu"] + mem * rates["mem"], "vcpu_fallback"


def _parse_gi(s: str | Any) -> float:
    """Parse '20Gi' or '10Ti' or '500Mi' to GB float."""
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).strip().upper()
    if s.endswith("TI"):
        return float(s[:-2]) * 1024
    if s.endswith("GI"):
        return float(s[:-2])
    if s.endswith("MI"):
        return float(s[:-2]) / 1024
    if s.endswith("G"):
        return float(s[:-1])
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Main cost computation ──────────────────────────────────────────────────────

def compute_cluster_cost(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Phase 1 cost engine. Reads from _fetch_cluster_context() output.

    Returns dict with:
      total_monthly, compute_monthly, storage_monthly, control_plane_monthly,
      provider, region, confidence, onboarding_date,
      node_costs, namespace_costs, pvc_costs,
      cost_source ('phase1_estimate'), accuracy ('estimated' | 'instance_lookup')
    """
    nodes    = ctx.get("nodes") or []   # from metrics.nodes.items
    finops   = ctx.get("finops") or {}
    pvcs     = ctx.get("pvcs") or []
    ns_res   = ctx.get("namespace_resources") or []   # already list after _extract fix
    pods     = ctx.get("pods") or []

    # If nodes not in ctx (some paths omit it), fall back to finops.node_specs
    if not nodes:
        nodes = finops.get("node_specs") or []

    # Detect provider from first node or finops
    provider = "unknown"
    region   = finops.get("region") or "default"
    if nodes:
        provider = detect_provider(nodes[0], finops)
    if provider == "unknown":
        provider = finops.get("provider") or "unknown"

    # ── Node compute cost ──────────────────────────────────────────────────────
    node_costs: list[dict] = []
    any_instance_lookup = False
    for node in nodes:
        instance_type = resolve_instance_type(node)
        hourly, method = _node_hourly(node, provider)
        monthly = round(hourly * HOURS_PER_MONTH, 2)
        if method == "instance_lookup":
            any_instance_lookup = True
        node_costs.append({
            "name":          node.get("name") or node.get("node_ip") or "unknown",
            "instance_type": instance_type,
            "cpu_cores":     node.get("cpu_capacity") or node.get("cpu_cores") or 0,
            "memory_gb":     node.get("memory_capacity_gb") or node.get("memory_gb") or 0,
            "hourly_rate":   round(hourly, 4),
            "monthly_cost":  monthly,
            "method":        method,
        })

    compute_monthly = round(sum(n["monthly_cost"] for n in node_costs), 2)

    # ── Control plane fee ──────────────────────────────────────────────────────
    control_plane_monthly = round(CONTROL_PLANE_FEES.get(provider, 0) * HOURS_PER_MONTH, 2)

    # ── Storage cost from PVCs ─────────────────────────────────────────────────
    pvc_costs: list[dict] = []
    for pvc in pvcs:
        sc    = pvc.get("storage_class") or "default"
        rate  = STORAGE_CLASS_RATES.get(sc, STORAGE_CLASS_RATES["default"])
        cap   = _parse_gi(pvc.get("capacity") or pvc.get("size") or 0)
        cost  = round(cap * rate, 2)
        pvc_costs.append({
            "name":          pvc.get("name") or "unknown",
            "namespace":     pvc.get("namespace") or "",
            "storage_class": sc,
            "capacity_gb":   cap,
            "rate_per_gb":   rate,
            "monthly_cost":  cost,
        })
    storage_monthly = round(sum(p["monthly_cost"] for p in pvc_costs), 2)

    # ── Namespace cost allocation ──────────────────────────────────────────────
    # ns_res is list of {namespace, cpu_request, memory_request_gb, pod_count}
    total_cpu_request = sum(
        float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        for ns in ns_res
    )
    total_mem_request = sum(
        float(ns.get("memory_request_gb") or (ns.get("total_memory_request_mb") or 0) / 1024 or 0)
        for ns in ns_res
    )

    # If no namespace resources, fall back to pod-level aggregation
    if not ns_res and pods:
        ns_map: dict[str, dict] = {}
        for pod in pods:
            ns = pod.get("namespace") or "unknown"
            if ns not in ns_map:
                ns_map[ns] = {"cpu": 0.0, "mem": 0.0, "pods": 0}
            ns_map[ns]["cpu"] += float(pod.get("cpu_request") or 0)
            ns_map[ns]["mem"] += float(pod.get("memory_request_mb") or 0) / 1024
            ns_map[ns]["pods"] += 1
        ns_res = [{"namespace": k, "cpu_request": v["cpu"],
                   "memory_request_gb": v["mem"], "pod_count": v["pods"]}
                  for k, v in ns_map.items()]
        total_cpu_request = sum(v["cpu_request"] for v in ns_res)
        total_mem_request = sum(v["memory_request_gb"] for v in ns_res)

    total_cluster_cost = compute_monthly + control_plane_monthly
    namespace_costs: list[dict] = []
    for ns in ns_res:
        cpu_req = float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        mem_req = float(ns.get("memory_request_gb") or (ns.get("total_memory_request_mb") or 0) / 1024 or 0)
        cpu_share = (cpu_req / total_cpu_request) if total_cpu_request > 0 else 0
        mem_share = (mem_req / total_mem_request) if total_mem_request > 0 else 0
        # 70% CPU weight, 30% memory weight (industry standard allocation model)
        blended_share = cpu_share * 0.70 + mem_share * 0.30
        ns_cost = round(total_cluster_cost * blended_share, 2)
        namespace_costs.append({
            "namespace":        ns.get("namespace") or "unknown",
            "cpu_request":      round(cpu_req, 3),
            "memory_request_gb":round(mem_req, 3),
            "cpu_share_pct":    round(cpu_share * 100, 1),
            "pod_count":        ns.get("pod_count") or 0,
            "monthly_cost":     ns_cost,
        })
    namespace_costs.sort(key=lambda x: x["monthly_cost"], reverse=True)

    total_monthly = round(compute_monthly + storage_monthly + control_plane_monthly, 2)
    confidence    = "instance_lookup" if any_instance_lookup else "vcpu_fallback"
    accuracy      = "estimated"  # always estimated for Phase 1

    return {
        "total_monthly":          total_monthly,
        "compute_monthly":        compute_monthly,
        "storage_monthly":        storage_monthly,
        "control_plane_monthly":  control_plane_monthly,
        "provider":               provider,
        "region":                 region,
        "confidence":             confidence,
        "accuracy":               accuracy,
        "cost_source":            "phase1_estimate",
        "node_count":             len(node_costs),
        "node_costs":             node_costs,
        "namespace_costs":        namespace_costs,
        "pvc_costs":              pvc_costs,
        "total_cpu_request":      round(total_cpu_request, 3),
        "total_memory_request_gb":round(total_mem_request, 3),
    }


def compute_energy(ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Physics-based energy + carbon calculation.
    Uses CPU cores × 10W (industry standard TDP estimate).
    Does NOT derive from cost — independent of billing.

    Returns dict with:
      monthly_kwh, daily_kwh, annual_kwh_projection,
      co2_kg_monthly, co2_intensity, region,
      node_energy, namespace_energy
    """
    nodes  = ctx.get("nodes") or []
    finops = ctx.get("finops") or {}
    ns_res = ctx.get("namespace_resources") or []
    pods   = ctx.get("pods") or []
    region = finops.get("region") or "default"

    if not nodes:
        nodes = finops.get("node_specs") or []

    WATTS_PER_CPU_CORE    = 10.0    # conservative TDP estimate per core
    WATTS_PER_GB_MEMORY   = 0.375   # DRAM power model
    PUE                   = 1.42    # Power Usage Effectiveness (IBM WDC datacenter typical)

    # Node-level energy
    node_energy: list[dict] = []
    for node in nodes:
        cpu = float(node.get("cpu_capacity") or node.get("cpu_cores") or 0)
        mem = float(node.get("memory_capacity_gb") or node.get("memory_gb") or 0)
        # Monthly kWh = (cpu_watts + mem_watts) × hours × PUE / 1000
        node_kwh = round((cpu * WATTS_PER_CPU_CORE + mem * WATTS_PER_GB_MEMORY)
                         * HOURS_PER_MONTH * PUE / 1000, 2)
        node_energy.append({
            "name":    node.get("name") or node.get("node_ip") or "unknown",
            "cpu":     cpu,
            "mem_gb":  mem,
            "kwh":     node_kwh,
        })

    total_kwh = round(sum(n["kwh"] for n in node_energy), 2)
    # If no node data, fallback to cluster resource totals
    if total_kwh == 0:
        res = ctx.get("resources") or {}
        cpu_cap = float(res.get("cpu_capacity_cores") or 0)
        mem_cap = float(res.get("memory_capacity_gb") or 0)
        total_kwh = round((cpu_cap * WATTS_PER_CPU_CORE + mem_cap * WATTS_PER_GB_MEMORY)
                          * HOURS_PER_MONTH * PUE / 1000, 2)

    co2_intensity = REGION_CO2_INTENSITY.get(region, REGION_CO2_INTENSITY["default"])
    co2_monthly   = round(total_kwh * co2_intensity, 2)

    # Namespace energy: proportional to CPU request share
    total_cpu = sum(
        float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        for ns in ns_res
    )
    namespace_energy: list[dict] = []
    for ns in ns_res:
        cpu_req = float(ns.get("cpu_request") or (ns.get("total_cpu_request_m") or 0) / 1000 or 0)
        share   = (cpu_req / total_cpu) if total_cpu > 0 else 0
        ns_kwh  = round(total_kwh * share, 2)
        ns_co2  = round(ns_kwh * co2_intensity, 2)
        namespace_energy.append({
            "namespace":  ns.get("namespace") or "unknown",
            "cpu_request":round(cpu_req, 3),
            "kwh":        ns_kwh,
            "co2_kg":     ns_co2,
        })
    namespace_energy.sort(key=lambda x: x["kwh"], reverse=True)

    return {
        "monthly_kwh":              total_kwh,
        "daily_kwh":                round(total_kwh / 30, 2),
        "annual_kwh_projection":    round(total_kwh * 12, 2),
        "co2_kg_monthly":           co2_monthly,
        "co2_kg_annual_projection": round(co2_monthly * 12, 2),
        "co2_intensity_kg_per_kwh": co2_intensity,
        "pue":                      PUE,
        "region":                   region,
        "node_energy":              node_energy,
        "namespace_energy":         namespace_energy,
    }


def get_billing_cache(cluster_name: str, billing_month: str | None = None) -> dict | None:
    """
    Check cluster_billing_cache for Phase 2 data.
    Returns None if Phase 2 not connected or no data for this month.
    billing_month format: "2026-07" (current month if None)
    """
    from datetime import datetime
    if not billing_month:
        billing_month = datetime.utcnow().strftime("%Y-%m")
    try:
        from database.db import db_manager
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM cluster_billing_cache WHERE cluster_name = %s AND billing_month = %s",
                (cluster_name, billing_month),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.debug(f"get_billing_cache: {e}")
        return None


def get_discovery_status(cluster_name: str) -> dict:
    """
    Returns discovery connection status for a cluster.
    Used by all cost pages to determine Phase 1 vs Phase 2.
    """
    try:
        from database.db import db_manager
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT provider, status, last_sync_at, last_sync_ok, last_error "
                "FROM cloud_discovery_config WHERE cluster_name = %s",
                (cluster_name,),
            )
            row = cur.fetchone()
            if row and row["status"] == "active" and row["last_sync_ok"]:
                return {
                    "connected":  True,
                    "provider":   row["provider"],
                    "last_sync":  row["last_sync_at"],
                    "accuracy":   "invoice",
                }
    except Exception:
        pass
    return {"connected": False, "provider": None, "last_sync": None, "accuracy": "estimated"}

# Made with Bob
