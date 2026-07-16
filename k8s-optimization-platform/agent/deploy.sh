#!/usr/bin/env bash
# =============================================================================
# K8s Optimization Agent — Deploy Script
# =============================================================================
# Usage:
#   ./deploy.sh <cluster-name> <api-token> <platform-url> [environment]
#
# Examples:
#   ./deploy.sh Dns-pipeline  mytoken123  https://api.myplatform.com
#   ./deploy.sh xforce-devops mytoken456  https://api.myplatform.com  staging
#
# This script always does a full REPLACE of the ClusterRole so you never get
# stale/incomplete permissions when re-deploying to a cluster that already had
# an older version of the agent installed.
# =============================================================================

set -euo pipefail

# ── args ──────────────────────────────────────────────────────────────────────
CLUSTER_NAME="${1:-}"
API_TOKEN="${2:-}"
PLATFORM_URL="${3:-}"
ENVIRONMENT="${4:-production}"

if [[ -z "$CLUSTER_NAME" || -z "$API_TOKEN" || -z "$PLATFORM_URL" ]]; then
  echo "Usage: $0 <cluster-name> <api-token> <platform-url> [environment]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_YAML="$SCRIPT_DIR/deployment.yaml"

echo "==> Deploying agent to cluster context: $(kubectl config current-context)"
echo "    CLUSTER_NAME : $CLUSTER_NAME"
echo "    ENVIRONMENT  : $ENVIRONMENT"
echo "    PLATFORM_URL : $PLATFORM_URL"
echo ""

# ── Step 1: Namespace + ServiceAccount (safe to apply) ────────────────────────
echo "--> Applying Namespace and ServiceAccount..."
kubectl apply -f "$DEPLOY_YAML" \
  --field-manager=k8s-optimization-agent \
  --force-conflicts=true 2>/dev/null || true

# ── Step 2: Force-replace the ClusterRole ─────────────────────────────────────
# kubectl apply does a merge-patch and silently keeps an old ClusterRole if one
# already exists.  We use 'replace --force' on just the ClusterRole to guarantee
# the version in deployment.yaml is always what the cluster has.
echo "--> Force-replacing ClusterRole (ensures permissions are always up to date)..."
kubectl replace --force -f - <<'CLUSTERROLE_EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-optimization-agent
  labels:
    app.kubernetes.io/name: k8s-optimization-agent
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - namespaces
      - pods
      - services
      - endpoints
      - events
      - secrets
      - configmaps
      - persistentvolumes
      - persistentvolumeclaims
      - serviceaccounts
      - resourcequotas
      - limitranges
      - replicationcontrollers
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources:
      - deployments
      - replicasets
      - statefulsets
      - daemonsets
      - controllerrevisions
    verbs: ["get", "list"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses", "networkpolicies", "ingressclasses"]
    verbs: ["get", "list"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles", "clusterroles", "rolebindings", "clusterrolebindings"]
    verbs: ["get", "list"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses", "volumeattachments", "csinodes", "csidrivers"]
    verbs: ["get", "list"]
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get", "list"]
  - apiGroups: ["policy"]
    resources: ["poddisruptionbudgets"]
    verbs: ["get", "list"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes", "pods"]
    verbs: ["get", "list"]
  - apiGroups: ["apiextensions.k8s.io"]
    resources: ["customresourcedefinitions"]
    verbs: ["get", "list"]
  - nonResourceURLs: ["/metrics", "/healthz", "/version"]
    verbs: ["get"]
CLUSTERROLE_EOF

# ── Step 3: Patch Secret with real credentials ─────────────────────────────────
echo "--> Patching Secret with credentials..."
kubectl create secret generic platform-credentials \
  --namespace k8s-optimization-agent \
  --from-literal=api-token="$API_TOKEN" \
  --from-literal=platform-url="$PLATFORM_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Step 4: Patch ConfigMap with cluster identity ──────────────────────────────
echo "--> Patching ConfigMap with cluster identity..."
kubectl patch configmap agent-config \
  --namespace k8s-optimization-agent \
  --type merge \
  -p "{\"data\":{\"CLUSTER_NAME\":\"$CLUSTER_NAME\",\"ENVIRONMENT\":\"$ENVIRONMENT\"}}"

# ── Step 5: Restart the agent pod ─────────────────────────────────────────────
echo "--> Restarting agent deployment..."
kubectl rollout restart deployment/k8s-optimization-agent -n k8s-optimization-agent
kubectl rollout status  deployment/k8s-optimization-agent -n k8s-optimization-agent --timeout=120s

# ── Step 6: Verify permissions ────────────────────────────────────────────────
echo ""
echo "==> Permission check:"
SA="system:serviceaccount:k8s-optimization-agent:k8s-optimization-agent"
for resource in nodes pods services endpoints events serviceaccounts persistentvolumeclaims; do
  result=$(kubectl auth can-i list "$resource" --as="$SA" 2>/dev/null)
  printf "    %-30s %s\n" "list $resource" "$result"
done

echo ""
echo "==> Done. Agent deployed for cluster '$CLUSTER_NAME'."
