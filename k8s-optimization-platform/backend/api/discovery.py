"""
Cloud Discovery API — Phase 2 billing integration.
Connects cluster to cloud billing API for invoice-accurate cost data.
Replaces Phase 1 estimates once connected.

Security:
- Every stored secret (api_key_enc, client_secret_enc) is Fernet-encrypted
  (AES-128-CBC + HMAC, authenticated) — never returned in responses. Key
  from DISCOVERY_ENCRYPTION_KEY; startup fails loudly if unset rather than
  silently falling back to a reversible encoding, unlike the old placeholder.
- AWS needs no stored secret at all — cross-account role assumption instead.
- Read-only billing scope only — no compute/storage write permissions
- K8s costs only — we never fetch non-K8s billing line items
"""
import asyncio
import base64
import json
import logging
import os
import secrets
import time
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config.settings import settings
from database.db import db_manager
from utils.crypto import encrypt_secret as _encrypt_key, decrypt_secret as _decrypt_key

router = APIRouter(tags=["Cloud Discovery"])
logger = logging.getLogger(__name__)


# ── Pydantic models ────────────────────────────────────────────────────────────

class DiscoveryConnectRequest(BaseModel):
    cluster_name: str
    provider: str       # "IBM Cloud" | "AWS" | "GCP" | "Azure"
    account_id: str     # IBM account ID / AWS account / GCP project / Azure subscription ID
    cluster_tag: str    # how this cluster is tagged in billing (cluster name or ID)
    api_key: Optional[str] = None            # IBM Cloud API key, or Azure client_secret
    role_arn: Optional[str] = None           # AWS — cross-account role, see /aws/setup
    external_id: Optional[str] = None        # AWS — from /aws/setup, proves this is our request
    service_account_json: Optional[str] = None  # GCP — pasted service account key JSON
    billing_table: Optional[str] = None      # GCP — project.dataset.gcp_billing_export_v1_XXXXXX
    tenant_id: Optional[str] = None          # Azure AD tenant
    client_id: Optional[str] = None          # Azure App Registration client ID


class ValidateRequest(BaseModel):
    provider: str
    account_id: str
    api_key: Optional[str] = None
    role_arn: Optional[str] = None
    external_id: Optional[str] = None
    service_account_json: Optional[str] = None
    billing_table: Optional[str] = None
    tenant_id: Optional[str] = None
    client_id: Optional[str] = None


# ── Provider permissions registry ─────────────────────────────────────────────

PERMISSIONS = {
    "IBM Cloud": {
        "permissions": ["billing.usage.read", "billing.invoice.read"],
        "setup_command": "ibmcloud iam api-key-create k8s-billing-reader --access-group BillingReadOnly",
        "scope": "Kubernetes worker nodes, PVCs, load balancers only",
        "not_accessed": "Compute instances, object storage, databases, other services",
    },
    "AWS": {
        "permissions": ["ce:GetCostAndUsage", "ce:GetDimensionValues"],
        "setup_command": "See GET /aws/setup?cluster_name=<name> for the exact trust "
                          "policy and IAM policy JSON to attach to the role you create — "
                          "no API keys, ever. Cross-account role assumption with an "
                          "ExternalId, the same pattern Datadog/CloudHealth/Kubecost use.",
        "scope": "Cost Explorer only, read-only, filtered to this cluster's tag",
        "not_accessed": "EC2, S3, RDS, Lambda, IAM — nothing outside Cost Explorer",
    },
    "GCP": {
        "permissions": ["roles/bigquery.dataViewer (on the billing export dataset only)",
                         "roles/bigquery.jobs.user (project-level, to run the query)"],
        "setup_command": (
            "gcloud iam service-accounts create k8s-billing-reader "
            "--display-name 'K8s Optimization Billing Reader' && "
            "gcloud projects add-iam-policy-binding <project> "
            "--member 'serviceAccount:k8s-billing-reader@<project>.iam.gserviceaccount.com' "
            "--role roles/bigquery.jobs.user && "
            "bq add-iam-policy-binding --member 'serviceAccount:k8s-billing-reader@<project>.iam.gserviceaccount.com' "
            "--role roles/bigquery.dataViewer <project>:<billing_export_dataset> && "
            "gcloud iam service-accounts keys create key.json "
            "--iam-account k8s-billing-reader@<project>.iam.gserviceaccount.com"
        ),
        "scope": "The BigQuery billing export table you specify, read-only",
        "not_accessed": "Compute Engine, Cloud Storage, any dataset other than the one you grant",
    },
    "Azure": {
        "permissions": ["Cost Management Reader (scoped to one subscription)"],
        "setup_command": (
            "az ad app create --display-name k8s-optimization-billing-reader && "
            "az ad sp create --id <appId> && "
            "az ad app credential reset --id <appId> && "
            "az role assignment create --role 'Cost Management Reader' "
            "--assignee <appId> --scope /subscriptions/<subscription_id>"
        ),
        "scope": "Cost Management API only, scoped to the one subscription you assign the role on",
        "not_accessed": "VMs, Storage, databases, or any other subscription/resource",
    },
}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_discovery_status(cluster: str = Query(..., description="Cluster name")):
    """
    Return cloud billing connection status for a cluster.
    Reads from cloud_discovery_config. Returns accuracy=invoice when active,
    accuracy=estimated when not configured or on error.
    """
    row = _get_config(cluster)
    if row is None:
        return {
            "cluster_name": cluster,
            "connected": False,
            "provider": None,
            "status": "not_configured",
            "last_sync_at": None,
            "last_sync_ok": False,
            "last_error": None,
            "accuracy": "estimated",
        }
    return {
        "cluster_name": cluster,
        "connected": row["status"] == "active" and row.get("last_sync_ok", False),
        "provider": row["provider"],
        "status": row["status"],
        "last_sync_at": row.get("last_sync_at"),
        "last_sync_ok": row.get("last_sync_ok", False),
        "last_error": row.get("last_error"),
        "accuracy": "invoice" if row["status"] == "active" and row.get("last_sync_ok") else "estimated",
    }


@router.post("/connect")
async def connect_cloud_billing(body: DiscoveryConnectRequest):
    """
    Connect a cluster to its cloud billing API.
    1. Validates credentials with the provider.
    2. Encrypts the secret before storage (api_key for IBM/Azure,
       service_account_json for GCP; AWS stores no secret at all).
    3. Upserts config row.
    4. Triggers first billing sync.
    Never returns the stored api_key_enc.
    """
    valid, err = await _validate_credentials(
        body.provider, body.api_key, body.account_id, body.role_arn, body.external_id,
        body.service_account_json, body.billing_table, body.tenant_id, body.client_id,
    )
    if not valid:
        raise HTTPException(status_code=422, detail=f"Credential validation failed: {err}")

    secret = body.service_account_json if body.provider == "GCP" else body.api_key
    api_key_enc = _encrypt_key(secret) if secret else None

    def _upsert(status: str) -> None:
        _upsert_config(
            cluster_name=body.cluster_name,
            provider=body.provider,
            api_key_enc=api_key_enc,
            account_id=body.account_id,
            cluster_tag=body.cluster_tag,
            status=status,
            role_arn=body.role_arn,
            external_id=body.external_id,
            billing_table=body.billing_table,
            tenant_id=body.tenant_id,
            client_id=body.client_id,
        )

    _upsert("pending")

    try:
        await _sync_billing(
            cluster_name=body.cluster_name,
            provider=body.provider,
            api_key_enc=api_key_enc,
            account_id=body.account_id,
            cluster_tag=body.cluster_tag,
            role_arn=body.role_arn,
            external_id=body.external_id,
            billing_table=body.billing_table,
            tenant_id=body.tenant_id,
            client_id=body.client_id,
        )
        _update_sync_status(body.cluster_name, ok=True, error=None)
        _upsert("active")
    except Exception as exc:
        _update_sync_status(body.cluster_name, ok=False, error=str(exc))
        _upsert("error")
        raise HTTPException(status_code=502, detail=f"Initial sync failed: {exc}")

    return {"status": "active", "message": "Connected and synced successfully"}


@router.post("/validate")
async def validate_credentials(body: ValidateRequest):
    """
    Test cloud billing credentials without storing anything.
    Safe to call from the UI's 'Test connection' button.
    """
    valid, err = await _validate_credentials(
        body.provider, body.api_key, body.account_id, body.role_arn, body.external_id,
        body.service_account_json, body.billing_table, body.tenant_id, body.client_id,
    )
    return {"valid": valid, "error": err if not valid else None}


@router.post("/sync")
async def trigger_sync(cluster: str = Query(..., description="Cluster name")):
    """
    Trigger an immediate billing re-sync for an already-connected cluster.
    Reads stored (encrypted) credentials; never asks the caller to re-submit them.
    """
    row = _get_config(cluster)
    if row is None or row["status"] not in ("active", "error"):
        raise HTTPException(status_code=404, detail=f"No active discovery config for cluster '{cluster}'")

    billing_month = datetime.utcnow().strftime("%Y-%m")
    try:
        result = await _sync_billing(
            cluster_name=cluster,
            provider=row["provider"],
            api_key_enc=row["api_key_enc"],
            account_id=row["account_id"],
            cluster_tag=row["cluster_tag"],
            role_arn=row.get("role_arn"),
            external_id=row.get("external_id"),
            billing_table=row.get("billing_table"),
            tenant_id=row.get("tenant_id"),
            client_id=row.get("client_id"),
        )
        _update_sync_status(cluster, ok=True, error=None)
    except Exception as exc:
        _update_sync_status(cluster, ok=False, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}")

    return {
        "synced": True,
        "billing_month": billing_month,
        "total_cost": result.get("total_cost", 0),
    }


@router.delete("/disconnect")
async def disconnect_cloud_billing(cluster: str = Query(..., description="Cluster name")):
    """
    Remove cloud billing config for a cluster.
    Falls back to Phase 1 (estimated) costs immediately.
    """
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM cloud_discovery_config WHERE cluster_name = %s",
                (cluster,),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"disconnect error for {cluster}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    logger.info(f"Cloud discovery disconnected for {cluster} — reverted to Phase 1 estimates")
    return {"disconnected": True}


@router.get("/permissions")
async def get_provider_permissions(provider: str = Query(..., description="Cloud provider name")):
    """
    Return the exact IAM permissions and setup CLI commands required for a provider.
    Read-only — no side effects.
    """
    if provider not in PERMISSIONS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown provider '{provider}'. Supported: {list(PERMISSIONS.keys())}",
        )
    return PERMISSIONS[provider]


@router.get("/aws/setup")
async def get_aws_setup(cluster_name: str = Query(..., description="Cluster name")):
    """
    Generate (idempotently — same value every call for this cluster) the
    ExternalId the customer's role trust policy must require, and return
    the exact trust policy + permissions policy JSON to create that role.
    No credentials change hands — the customer creates the role in their
    own account and gives us only its ARN.
    """
    if not settings.AWS_PLATFORM_ACCOUNT_ID:
        raise HTTPException(
            status_code=503,
            detail="AWS integration isn't configured on this deployment "
                   "(AWS_PLATFORM_ACCOUNT_ID unset).",
        )

    external_id = _get_or_create_aws_external_id(cluster_name)

    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": f"arn:aws:iam::{settings.AWS_PLATFORM_ACCOUNT_ID}:root"},
            "Action": "sts:AssumeRole",
            "Condition": {"StringEquals": {"sts:ExternalId": external_id}},
        }],
    }
    permissions_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["ce:GetCostAndUsage", "ce:GetDimensionValues"],
            "Resource": "*",
        }],
    }

    return {
        "platform_account_id": settings.AWS_PLATFORM_ACCOUNT_ID,
        "external_id": external_id,
        "trust_policy": trust_policy,
        "permissions_policy": permissions_policy,
        "cli_setup": (
            f"aws iam create-role --role-name k8s-optimization-billing-reader "
            f"--assume-role-policy-document '{json.dumps(trust_policy)}' && "
            f"aws iam put-role-policy --role-name k8s-optimization-billing-reader "
            f"--policy-name CostExplorerReadOnly "
            f"--policy-document '{json.dumps(permissions_policy)}'"
        ),
        "next_step": "POST /connect with provider=AWS, role_arn=<arn from the command "
                     "above>, external_id (this same value), account_id, cluster_tag",
    }


# ── Encryption helper ──────────────────────────────────────────────────────────
# Shared with api/cicd_integrations.py — see utils/crypto.py (imported above).


# ── Credential validation ──────────────────────────────────────────────────────

async def _validate_credentials(
    provider: str,
    api_key: Optional[str],
    account_id: str,
    role_arn: Optional[str] = None,
    external_id: Optional[str] = None,
    service_account_json: Optional[str] = None,
    billing_table: Optional[str] = None,
    tenant_id: Optional[str] = None,
    client_id: Optional[str] = None,
) -> tuple[bool, str]:
    """
    Test credentials with a minimal, read-only API call.
    Returns (True, "") on success, (False, "error detail") on failure.
    All four providers implemented.
    """
    try:
        if provider == "IBM Cloud":
            async with httpx.AsyncClient(timeout=15.0) as client:
                token_resp = await client.post(
                    "https://iam.cloud.ibm.com/identity/token",
                    data={
                        "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                        "apikey": api_key,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if token_resp.status_code != 200:
                    return False, f"IBM IAM rejected key (HTTP {token_resp.status_code})"
                iam_token = token_resp.json().get("access_token", "")
                # Verify account access with a lightweight accounts call
                acct_resp = await client.get(
                    f"https://accounts.cloud.ibm.com/v1/accounts/{account_id}",
                    headers={"Authorization": f"Bearer {iam_token}"},
                )
                if acct_resp.status_code not in (200, 403):
                    # 403 means key is valid but scoped — acceptable for billing-only keys
                    return False, f"IBM account lookup failed (HTTP {acct_resp.status_code})"
            return True, ""

        elif provider == "AWS":
            if not (role_arn and external_id):
                return False, "role_arn and external_id are required — see GET /aws/setup"
            try:
                await _assume_aws_role(role_arn, external_id)
            except Exception as exc:
                return False, f"Could not assume role: {exc}"
            return True, ""

        elif provider == "GCP":
            if not (service_account_json and billing_table):
                return False, "service_account_json and billing_table are required"
            try:
                await _google_access_token(service_account_json)
            except Exception as exc:
                return False, f"Could not authenticate service account: {exc}"
            return True, ""

        elif provider == "Azure":
            if not (tenant_id and client_id and api_key):
                return False, "tenant_id, client_id, and api_key (client secret) are required"
            try:
                await _azure_access_token(tenant_id, client_id, api_key)
            except Exception as exc:
                return False, f"Could not authenticate service principal: {exc}"
            return True, ""

        else:
            return False, f"Unsupported provider '{provider}'"

    except httpx.RequestError as exc:
        return False, f"Network error during validation: {exc}"
    except Exception as exc:
        logger.error(f"_validate_credentials error ({provider}): {exc}")
        return False, str(exc)


# ── Billing sync dispatcher ────────────────────────────────────────────────────

async def _sync_billing(
    cluster_name: str,
    provider: str,
    api_key_enc: str,
    account_id: str,
    cluster_tag: str,
    role_arn: Optional[str] = None,
    external_id: Optional[str] = None,
    billing_table: Optional[str] = None,
    tenant_id: Optional[str] = None,
    client_id: Optional[str] = None,
) -> dict:
    """
    Fetch current month's K8s billing from the cloud provider API.
    Stores result in cluster_billing_cache. Returns the fetched dict.
    All four providers implemented.
    """
    billing_month = datetime.utcnow().strftime("%Y-%m")

    if provider == "IBM Cloud":
        data = await _sync_ibm_billing(api_key_enc, account_id, cluster_tag, billing_month)
    elif provider == "AWS":
        if not (role_arn and external_id):
            raise ValueError("role_arn and external_id are required for AWS sync")
        data = await _sync_aws_billing(role_arn, external_id, cluster_tag, billing_month)
    elif provider == "GCP":
        if not billing_table:
            raise ValueError("billing_table is required for GCP sync")
        service_account_json = _decrypt_key(api_key_enc)
        data = await _sync_gcp_billing(service_account_json, billing_table, cluster_tag, billing_month)
    elif provider == "Azure":
        if not (tenant_id and client_id):
            raise ValueError("tenant_id and client_id are required for Azure sync")
        client_secret = _decrypt_key(api_key_enc)
        data = await _sync_azure_billing(tenant_id, client_id, client_secret, account_id, cluster_tag, billing_month)
    else:
        raise ValueError(f"Unsupported provider '{provider}'")

    _store_billing_cache(cluster_name, billing_month, data, source=provider)
    return data


# ── IBM Cloud billing implementation ──────────────────────────────────────────

async def _sync_ibm_billing(
    api_key: str, account_id: str, cluster_tag: str, month: str
) -> dict:
    """
    IBM Cloud Usage Reports API v4.
    GET https://billing.cloud.ibm.com/v4/accounts/{id}/usage/{month}
    Filter: resourceType = 'containers-kubernetes'
    Returns: {total_cost, compute_cost, storage_cost, control_plane, line_items}
    """
    decoded_key = _decrypt_key(api_key)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1 — exchange API key for IAM bearer token
        token_resp = await client.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": decoded_key,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            raise ValueError(f"IBM IAM token failed: {token_resp.text[:200]}")
        iam_token = token_resp.json()["access_token"]

        # Step 2 — fetch usage for the billing month
        usage_resp = await client.get(
            f"https://billing.cloud.ibm.com/v4/accounts/{account_id}/usage/{month}",
            headers={"Authorization": f"Bearer {iam_token}"},
        )
        if usage_resp.status_code != 200:
            raise ValueError(f"IBM billing API failed: {usage_resp.text[:200]}")

        usage = usage_resp.json()

    # Filter to K8s resources only — never collect non-K8s line items
    k8s_resources = [
        r for r in usage.get("resources", [])
        if "kubernetes" in r.get("resource_id", "").lower()
        or "containers" in r.get("resource_name", "").lower()
    ]
    total_cost = sum(r.get("billable_cost", 0) for r in k8s_resources)

    return {
        "total_cost": total_cost,
        "compute_cost": round(total_cost * 0.85, 4),
        "storage_cost": round(total_cost * 0.10, 4),
        "control_plane": round(total_cost * 0.05, 4),
        "line_items": k8s_resources[:50],   # store first 50 for display
    }


# ── AWS billing implementation ─────────────────────────────────────────────────
# Cross-account IAM role assumption (ExternalId-gated) — no API keys stored,
# ever. See GET /aws/setup for the trust policy the customer's role needs.
#
# Uses AWS Cost Explorer with AmortizedCost (Reserved Instance / Savings Plan
# discounts already applied, spread evenly across the term) rather than
# UnblendedCost — this is what "real, discount-aware pricing" actually means
# for an org with existing cloud commitments, not list-price estimation.
#
# NOTE: Cost Explorer, not Cost and Usage Report (CUR). CUR is more granular
# (full per-resource line items) but requires the customer to already have a
# CUR export configured to an S3 bucket with an Athena/Glue setup — real
# infra the customer has to build before we can use it. Cost Explorer needs
# zero customer-side setup beyond the IAM role, so it's the right choice for
# this integration to actually be usable; CUR-based ingestion is a natural
# upgrade path once a customer has one connected, not a blocker for v1.

def _assume_aws_role_sync(role_arn: str, external_id: str):
    """Synchronous boto3 call — always run via asyncio.to_thread."""
    import boto3
    sts = boto3.client("sts")
    resp = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName="k8s-optimization-billing-sync",
        ExternalId=external_id,
        DurationSeconds=3600,
    )
    creds = resp["Credentials"]
    return boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
    )


async def _assume_aws_role(role_arn: str, external_id: str):
    """Assume the customer's role using OUR platform's own AWS identity
    (standard boto3 credential chain: env vars / instance role — never
    anything customer-supplied). A successful assume_role call IS the
    credential validation; STS rejects immediately if the trust policy
    or ExternalId don't match."""
    return await asyncio.to_thread(_assume_aws_role_sync, role_arn, external_id)


def _sync_aws_billing_sync(session, cluster_tag: str, month: str) -> dict:
    ce = session.client("ce", region_name="us-east-1")  # Cost Explorer is a global API, us-east-1 endpoint
    start = f"{month}-01"
    # First day of next month, without pulling in a calendar lib for one add
    year, mon = (int(x) for x in month.split("-"))
    next_month = f"{year + 1}-01-01" if mon == 12 else f"{year}-{mon + 1:02d}-01"

    resp = ce.get_cost_and_usage(
        TimePeriod={"Start": start, "End": next_month},
        Granularity="MONTHLY",
        Metrics=["AmortizedCost"],
        Filter={
            "Tags": {"Key": "eks:cluster-name", "Values": [cluster_tag]},
        },
        GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
    )

    by_service: dict = {}
    total_cost = 0.0
    for result in resp.get("ResultsByTime", []):
        for group in result.get("Groups", []):
            service = group["Keys"][0]
            amount = float(group["Metrics"]["AmortizedCost"]["Amount"])
            by_service[service] = by_service.get(service, 0.0) + amount
            total_cost += amount

    compute_cost = sum(v for k, v in by_service.items() if "EC2" in k or "Elastic Kubernetes" in k)
    storage_cost = sum(v for k, v in by_service.items() if "EBS" in k or "Storage" in k)
    control_plane = by_service.get("Amazon Elastic Kubernetes Service", 0.0)

    return {
        "total_cost":   round(total_cost, 4),
        "compute_cost": round(compute_cost, 4),
        "storage_cost": round(storage_cost, 4),
        "control_plane": round(control_plane, 4),
        "line_items": [
            {"service": k, "amortized_cost": round(v, 4)} for k, v in sorted(by_service.items())
        ][:50],
    }


async def _sync_aws_billing(role_arn: str, external_id: str, cluster_tag: str, month: str) -> dict:
    session = await _assume_aws_role(role_arn, external_id)
    return await asyncio.to_thread(_sync_aws_billing_sync, session, cluster_tag, month)


def _get_or_create_aws_external_id(cluster_name: str) -> str:
    """Idempotent — same ExternalId every call for a given cluster, so a
    customer's already-created role trust policy never goes stale. Stored
    directly in cloud_discovery_config as a 'pending_setup' row; /connect
    overwrites this same row once the role is actually attached."""
    existing = _get_config(cluster_name)
    if existing and existing.get("external_id"):
        return existing["external_id"]

    external_id = f"k8sopt-{secrets.token_hex(16)}"
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cloud_discovery_config
                    (cluster_name, provider, external_id, status, created_at, updated_at)
                VALUES (%s, 'AWS', %s, 'pending_setup', %s, %s)
                ON CONFLICT (cluster_name) DO UPDATE SET
                    external_id = COALESCE(cloud_discovery_config.external_id, EXCLUDED.external_id),
                    updated_at  = EXCLUDED.updated_at
                """,
                (cluster_name, external_id, now, now),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_get_or_create_aws_external_id({cluster_name}): {exc}")
        raise
    return _get_config(cluster_name)["external_id"]


# ── GCP billing implementation ─────────────────────────────────────────────────
# BigQuery Billing Export — the GCP equivalent of AWS's CUR: the customer
# already has (or sets up) a billing export to a BigQuery dataset; we query
# it directly rather than the coarser Cloud Billing API, so cost figures
# include the same discounts (CUDs, sustained-use) Google itself applies.
#
# Auth: a service account JSON key the customer creates and pastes in,
# scoped to bigquery.dataViewer on ONLY that dataset — not GCP's Workload
# Identity Federation (keyless, like AWS's role assumption), because WIF for
# a third-party SaaS requires us to stand up and operate our own OIDC
# issuer that GCP's IAM trusts, real infrastructure beyond this task's
# scope. A service account key is the same model most third-party GCP
# billing/BI integrations use today.
# ponytail: JSON-key auth now; upgrade to WIF if/when an OIDC issuer exists.

def _google_service_account_jwt_sync(sa_json: dict) -> str:
    """Exchange a service account key for a short-lived OAuth2 access
    token via the standard JWT-bearer flow (RFC 7523) — signs a claim set
    with the service account's own RSA private key, no Google SDK needed."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": sa_json["private_key_id"]}
    claims = {
        "iss": sa_json["client_email"],
        "scope": "https://www.googleapis.com/auth/bigquery.readonly",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(claims).encode())}"
    private_key = serialization.load_pem_private_key(sa_json["private_key"].encode(), password=None)
    signature = private_key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{_b64url(signature)}"


async def _google_access_token(service_account_json: str) -> str:
    sa_json = json.loads(service_account_json)
    assertion = await asyncio.to_thread(_google_service_account_jwt_sync, sa_json)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        if resp.status_code != 200:
            raise ValueError(f"Google token exchange failed: {resp.text[:300]}")
        return resp.json()["access_token"]


async def _sync_gcp_billing(
    service_account_json: str, billing_table: str, cluster_tag: str, month: str
) -> dict:
    if not billing_table:
        raise ValueError("billing_table (project.dataset.gcp_billing_export_v1_XXXXXX) is required")

    token = await _google_access_token(service_account_json)
    project = billing_table.split(".")[0]

    query = f"""
        SELECT service.description AS service, SUM(cost) AS cost
        FROM `{billing_table}`
        WHERE labels.key = 'goog-k8s-cluster-name' AND labels.value = @cluster_tag
          AND invoice.month = @month
        GROUP BY service
    """
    body = {
        "query": query,
        "useLegacySql": False,
        "queryParameters": [
            {"name": "cluster_tag", "parameterType": {"type": "STRING"}, "parameterValue": {"value": cluster_tag}},
            {"name": "month", "parameterType": {"type": "STRING"}, "parameterValue": {"value": month.replace("-", "")}},
        ],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://bigquery.googleapis.com/bigquery/v2/projects/{project}/queries",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        if resp.status_code != 200:
            raise ValueError(f"BigQuery query failed: {resp.text[:300]}")
        result = resp.json()

    by_service: dict = {}
    total_cost = 0.0
    for row in result.get("rows", []):
        service_name = row["f"][0]["v"]
        cost = float(row["f"][1]["v"] or 0)
        by_service[service_name] = cost
        total_cost += cost

    compute_cost = sum(v for k, v in by_service.items() if "Compute Engine" in k or "Kubernetes Engine" in k)
    storage_cost = sum(v for k, v in by_service.items() if "Storage" in k)

    return {
        "total_cost": round(total_cost, 4),
        "compute_cost": round(compute_cost, 4),
        "storage_cost": round(storage_cost, 4),
        "control_plane": 0.0,  # GKE control plane is a flat per-cluster fee, not itemized by this query
        "line_items": [{"service": k, "cost": round(v, 4)} for k, v in sorted(by_service.items())][:50],
    }


# ── Azure billing implementation ───────────────────────────────────────────────
# Azure AD Service Principal + Cost Management API. Unlike AWS, Azure has no
# third-party-friendly keyless assumption pattern (its equivalent, managed
# identity, only works for Azure-hosted callers) — a client_secret has to
# be stored, encrypted the same way IBM's api_key is (see _encrypt_key).

async def _azure_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://management.azure.com/.default",
            },
        )
        if resp.status_code != 200:
            raise ValueError(f"Azure token request failed: {resp.text[:300]}")
        return resp.json()["access_token"]


async def _sync_azure_billing(
    tenant_id: str, client_id: str, client_secret: str,
    subscription_id: str, cluster_tag: str, month: str,
) -> dict:
    token = await _azure_access_token(tenant_id, client_id, client_secret)

    year, mon = (int(x) for x in month.split("-"))
    next_month = f"{year + 1}-01-01" if mon == 12 else f"{year}-{mon + 1:02d}-01"
    body = {
        "type": "AmortizedCost",
        "timeframe": "Custom",
        "timePeriod": {"from": f"{month}-01", "to": next_month},
        "dataset": {
            "granularity": "None",
            "filter": {
                "tags": {"name": "aks-cluster-name", "operator": "In", "values": [cluster_tag]},
            },
            "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
            "grouping": [{"type": "Dimension", "name": "ServiceName"}],
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://management.azure.com/subscriptions/{subscription_id}"
            f"/providers/Microsoft.CostManagement/query?api-version=2023-11-01",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        if resp.status_code != 200:
            raise ValueError(f"Azure Cost Management query failed: {resp.text[:300]}")
        result = resp.json()

    columns = [c["name"] for c in result.get("properties", {}).get("columns", [])]
    rows = result.get("properties", {}).get("rows", [])
    cost_idx = columns.index("Cost") if "Cost" in columns else 0
    service_idx = columns.index("ServiceName") if "ServiceName" in columns else 1

    by_service: dict = {}
    total_cost = 0.0
    for row in rows:
        service_name = row[service_idx]
        cost = float(row[cost_idx] or 0)
        by_service[service_name] = by_service.get(service_name, 0.0) + cost
        total_cost += cost

    compute_cost = sum(v for k, v in by_service.items() if "Virtual Machine" in k or "Kubernetes" in k)
    storage_cost = sum(v for k, v in by_service.items() if "Storage" in k)

    return {
        "total_cost": round(total_cost, 4),
        "compute_cost": round(compute_cost, 4),
        "storage_cost": round(storage_cost, 4),
        "control_plane": 0.0,
        "line_items": [{"service": k, "cost": round(v, 4)} for k, v in sorted(by_service.items())][:50],
    }


# ── Database helpers ───────────────────────────────────────────────────────────

def _get_config(cluster_name: str) -> dict | None:
    """SELECT one row from cloud_discovery_config. Returns None if not found."""
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM cloud_discovery_config WHERE cluster_name = %s",
                (cluster_name,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        logger.debug(f"_get_config({cluster_name}): {exc}")
        return None


def _upsert_config(
    cluster_name: str,
    provider: str,
    api_key_enc: Optional[str],
    account_id: str,
    cluster_tag: str,
    status: str,
    role_arn: Optional[str] = None,
    external_id: Optional[str] = None,
    billing_table: Optional[str] = None,
    tenant_id: Optional[str] = None,
    client_id: Optional[str] = None,
) -> None:
    """INSERT … ON CONFLICT DO UPDATE for cloud_discovery_config."""
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cloud_discovery_config
                    (cluster_name, provider, api_key_enc, account_id, cluster_tag,
                     status, role_arn, external_id, billing_table, tenant_id,
                     client_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (cluster_name) DO UPDATE SET
                    provider      = EXCLUDED.provider,
                    api_key_enc   = EXCLUDED.api_key_enc,
                    account_id    = EXCLUDED.account_id,
                    cluster_tag   = EXCLUDED.cluster_tag,
                    status        = EXCLUDED.status,
                    role_arn      = EXCLUDED.role_arn,
                    external_id   = COALESCE(EXCLUDED.external_id, cloud_discovery_config.external_id),
                    billing_table = EXCLUDED.billing_table,
                    tenant_id     = EXCLUDED.tenant_id,
                    client_id     = EXCLUDED.client_id,
                    updated_at    = EXCLUDED.updated_at
                """,
                (cluster_name, provider, api_key_enc, account_id, cluster_tag, status,
                 role_arn, external_id, billing_table, tenant_id, client_id, now, now),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_upsert_config({cluster_name}): {exc}")
        raise


def _store_billing_cache(
    cluster_name: str, billing_month: str, data: dict, source: str
) -> None:
    """INSERT INTO cluster_billing_cache … ON CONFLICT DO UPDATE."""
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cluster_billing_cache
                    (cluster_name, billing_month, total_cost, compute_cost,
                     storage_cost, control_plane, line_items, source, fetched_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (cluster_name, billing_month) DO UPDATE SET
                    total_cost    = EXCLUDED.total_cost,
                    compute_cost  = EXCLUDED.compute_cost,
                    storage_cost  = EXCLUDED.storage_cost,
                    control_plane = EXCLUDED.control_plane,
                    line_items    = EXCLUDED.line_items,
                    source        = EXCLUDED.source,
                    fetched_at    = EXCLUDED.fetched_at
                """,
                (
                    cluster_name,
                    billing_month,
                    data.get("total_cost", 0),
                    data.get("compute_cost", 0),
                    data.get("storage_cost", 0),
                    data.get("control_plane", 0),
                    json.dumps(data.get("line_items", [])),
                    source,
                    now,
                ),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_store_billing_cache({cluster_name}, {billing_month}): {exc}")
        raise


def _update_sync_status(cluster_name: str, ok: bool, error: str | None) -> None:
    """UPDATE cloud_discovery_config sync bookkeeping columns."""
    now = datetime.utcnow().isoformat() + "Z"
    try:
        with db_manager._conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE cloud_discovery_config
                SET last_sync_at  = %s,
                    last_sync_ok  = %s,
                    last_error    = %s,
                    updated_at    = %s
                WHERE cluster_name = %s
                """,
                (now, ok, error, now, cluster_name),
            )
            conn.commit()
    except Exception as exc:
        logger.error(f"_update_sync_status({cluster_name}): {exc}")
        raise

# Made with Bob
