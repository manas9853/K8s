# Quick Start Guide - Multi-Cluster Agent Deployment

This guide will help you deploy the K8s Optimization Agent to your clusters in under 5 minutes.

## Prerequisites

- Kubernetes cluster with `kubectl` access
- API token from platform administrator
- Platform URL

## Step 1: Get Your Credentials

Contact your platform administrator to get:
- **API Token**: Your authentication token
- **Platform URL**: The central platform endpoint

```bash
export API_TOKEN="your-token-here"
export PLATFORM_URL="https://platform.example.com"
```

## Step 2: Download Deployment Files

```bash
# Clone or download the agent files
curl -O https://your-repo/agent/deployment.yaml
```

## Step 3: Configure for Your Cluster

Edit `deployment.yaml` and replace these values:

```yaml
# Line 42-44: Update Secret
stringData:
  api-token: "YOUR_API_TOKEN_HERE"        # ← Replace with your token
  platform-url: "http://your-platform-url:8000"  # ← Replace with platform URL

# Line 52-54: Update ConfigMap
data:
  CLUSTER_NAME: "my-cluster"              # ← Give your cluster a unique name
  ENVIRONMENT: "production"               # ← Choose: production/staging/qa/development
  COLLECTION_INTERVAL: "30"               # ← Optional: seconds between collections
```

## Step 4: Deploy to Cluster

```bash
# Apply the deployment
kubectl apply -f deployment.yaml

# Expected output:
# namespace/k8s-optimization-agent created
# serviceaccount/k8s-optimization-agent created
# clusterrole.rbac.authorization.k8s.io/k8s-optimization-agent created
# clusterrolebinding.rbac.authorization.k8s.io/k8s-optimization-agent created
# secret/platform-credentials created
# configmap/agent-config created
# deployment.apps/k8s-optimization-agent created
```

## Step 5: Verify Deployment

```bash
# Check if pod is running
kubectl get pods -n k8s-optimization-agent

# Expected output:
# NAME                                      READY   STATUS    RESTARTS   AGE
# k8s-optimization-agent-xxxxxxxxxx-xxxxx   1/1     Running   0          30s

# View logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent

# Expected output:
# Starting K8s Optimization Agent...
# Cluster: my-cluster
# Environment: production
# Platform URL: https://platform.example.com
# Registering cluster with platform...
# Cluster registered successfully
# Starting metrics collection (interval: 30s)...
# Metrics sent successfully
```

## Step 6: Verify in Platform

Open your platform dashboard and verify:
1. Navigate to **Operations > Clusters**
2. Your cluster should appear in the list
3. Metrics should be updating every 30 seconds

## Common Deployment Scenarios

### Scenario 1: AWS EKS

```bash
# Configure kubectl
aws eks update-kubeconfig --name my-cluster --region us-west-2

# Deploy agent
kubectl apply -f deployment.yaml
```

### Scenario 2: GCP GKE

```bash
# Configure kubectl
gcloud container clusters get-credentials my-cluster --zone us-central1-a

# Deploy agent
kubectl apply -f deployment.yaml
```

### Scenario 3: Azure AKS

```bash
# Configure kubectl
az aks get-credentials --resource-group my-rg --name my-cluster

# Deploy agent
kubectl apply -f deployment.yaml
```

### Scenario 4: IBM Cloud

```bash
# Configure kubectl
ibmcloud ks cluster config --cluster my-cluster

# Deploy agent
kubectl apply -f deployment.yaml
```

### Scenario 5: Multiple Clusters

Deploy to each cluster with unique names:

```bash
# Cluster 1 - Production
sed -i 's/CLUSTER_NAME: "my-cluster"/CLUSTER_NAME: "prod-us-west"/' deployment.yaml
sed -i 's/ENVIRONMENT: "production"/ENVIRONMENT: "production"/' deployment.yaml
kubectl apply -f deployment.yaml

# Cluster 2 - Staging
sed -i 's/CLUSTER_NAME: "prod-us-west"/CLUSTER_NAME: "staging-us-east"/' deployment.yaml
sed -i 's/ENVIRONMENT: "production"/ENVIRONMENT: "staging"/' deployment.yaml
kubectl apply -f deployment.yaml
```

## Troubleshooting

### Problem: Pod not starting

```bash
# Check pod status
kubectl describe pod -n k8s-optimization-agent -l app=k8s-optimization-agent

# Common fixes:
# 1. Verify API token is correct in Secret
# 2. Check platform URL is accessible from cluster
# 3. Ensure RBAC permissions are applied
```

### Problem: "Connection refused" in logs

```bash
# Verify platform URL is accessible
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v $PLATFORM_URL/health

# If connection fails:
# 1. Check firewall rules
# 2. Verify platform is running
# 3. Check network policies
```

### Problem: "Unauthorized" in logs

```bash
# Verify API token
kubectl get secret platform-credentials -n k8s-optimization-agent -o yaml

# Update token if needed
kubectl create secret generic platform-credentials \
  -n k8s-optimization-agent \
  --from-literal=api-token="$API_TOKEN" \
  --from-literal=platform-url="$PLATFORM_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart agent
kubectl rollout restart deployment/k8s-optimization-agent -n k8s-optimization-agent
```

## Next Steps

1. **Monitor Multiple Clusters**: Deploy agent to all your clusters
2. **Set Up Alerts**: Configure platform alerts for cluster health
3. **Review Recommendations**: Check platform for optimization opportunities
4. **Automate Deployments**: Use GitOps (ArgoCD/Flux) for agent management

## One-Line Deployment (Advanced)

For quick testing, use this one-liner (replace values):

```bash
kubectl create namespace k8s-optimization-agent && \
kubectl create secret generic platform-credentials \
  -n k8s-optimization-agent \
  --from-literal=api-token="YOUR_TOKEN" \
  --from-literal=platform-url="https://platform.example.com" && \
kubectl create configmap agent-config \
  -n k8s-optimization-agent \
  --from-literal=CLUSTER_NAME="my-cluster" \
  --from-literal=ENVIRONMENT="production" \
  --from-literal=COLLECTION_INTERVAL="30" && \
kubectl apply -f deployment.yaml
```

## Uninstall

```bash
# Remove agent from cluster
kubectl delete -f deployment.yaml

# Verify removal
kubectl get all -n k8s-optimization-agent
```

## Support

- **Documentation**: See [README.md](README.md) for detailed information
- **Logs**: `kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f`
- **Status**: Check platform dashboard under Operations > Clusters

---

**Deployment Time**: ~2 minutes per cluster  
**Resource Usage**: 64Mi memory, 50m CPU  
**Collection Interval**: 30 seconds (configurable)