# Kubernetes Cluster Integration Guide

Complete guide to connect your real Kubernetes clusters to the K8s Optimization Platform.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration Methods](#configuration-methods)
4. [Step-by-Step Integration](#step-by-step-integration)
5. [Multiple Clusters](#multiple-clusters)
6. [Troubleshooting](#troubleshooting)
7. [Security Best Practices](#security-best-practices)

---

## Prerequisites

### 1. Kubernetes Access

You need:
- ✅ `kubectl` installed and configured
- ✅ Valid kubeconfig file (`~/.kube/config`)
- ✅ Appropriate RBAC permissions (read access minimum)

### 2. Verify Cluster Access

```bash
# Test cluster connectivity
kubectl cluster-info

# List all contexts
kubectl config get-contexts

# Check current context
kubectl config current-context

# Test API access
kubectl get nodes
kubectl get pods --all-namespaces
```

---

## Quick Start

### Method 1: Using Existing Kubeconfig (Recommended)

**1. Update Backend Configuration**

Edit `k8s-optimization-platform/backend/.env`:

```bash
# Kubernetes Configuration
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=/Users/manasupadhyay/.kube/config
K8S_CONTEXT=your-cluster-context-name

# Or leave empty to use current context
K8S_CONTEXT=
```

**2. Restart Backend**

```bash
cd k8s-optimization-platform/backend
source venv/bin/activate
env -u DEBUG uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**3. Verify Connection**

```bash
# Test cluster API
curl http://localhost:8000/api/v1/clusters/list

# Should return your real clusters
```

---

## Configuration Methods

### Option 1: Local Kubeconfig (Development)

**Best for**: Local development, testing

```bash
# In backend/.env
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=~/.kube/config
K8S_CONTEXT=minikube  # or your context name
```

### Option 2: In-Cluster Configuration (Production)

**Best for**: Running inside Kubernetes

```bash
# In backend/.env
K8S_IN_CLUSTER=true
K8S_CONFIG_PATH=
K8S_CONTEXT=
```

### Option 3: Service Account Token

**Best for**: Production with specific permissions

```bash
# In backend/.env
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=/path/to/custom/kubeconfig
K8S_CONTEXT=production-cluster
```

---

## Step-by-Step Integration

### Step 1: Prepare Kubeconfig

**Option A: Use Existing Config**

```bash
# Copy your kubeconfig
cp ~/.kube/config k8s-optimization-platform/backend/kubeconfig.yaml

# Update .env
K8S_CONFIG_PATH=./kubeconfig.yaml
```

**Option B: Create New Config for Platform**

```bash
# Export specific cluster config
kubectl config view --minify --flatten > platform-kubeconfig.yaml

# Move to backend
mv platform-kubeconfig.yaml k8s-optimization-platform/backend/

# Update .env
K8S_CONFIG_PATH=./platform-kubeconfig.yaml
```

### Step 2: Create Service Account (Recommended)

Create a dedicated service account with read-only access:

```yaml
# k8s-optimization-sa.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k8s-optimization-platform
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-optimization-reader
rules:
  - apiGroups: [""]
    resources:
      - pods
      - nodes
      - namespaces
      - services
      - persistentvolumeclaims
      - configmaps
      - secrets
      - resourcequotas
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources:
      - deployments
      - replicasets
      - statefulsets
      - daemonsets
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources:
      - jobs
      - cronjobs
    verbs: ["get", "list", "watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources:
      - pods
      - nodes
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k8s-optimization-reader-binding
subjects:
  - kind: ServiceAccount
    name: k8s-optimization-platform
    namespace: default
roleRef:
  kind: ClusterRole
  name: k8s-optimization-reader
  apiGroup: rbac.authorization.k8s.io
```

**Apply the configuration:**

```bash
kubectl apply -f k8s-optimization-sa.yaml
```

**Get the token:**

```bash
# Get service account token
kubectl create token k8s-optimization-platform -n default --duration=8760h

# Or for older Kubernetes versions
kubectl get secret $(kubectl get sa k8s-optimization-platform -n default -o jsonpath='{.secrets[0].name}') -n default -o jsonpath='{.data.token}' | base64 -d
```

**Create kubeconfig with token:**

```bash
# Get cluster info
CLUSTER_NAME=$(kubectl config view --minify -o jsonpath='{.clusters[0].name}')
CLUSTER_SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CLUSTER_CA=$(kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
TOKEN=$(kubectl create token k8s-optimization-platform -n default --duration=8760h)

# Create kubeconfig
cat > platform-kubeconfig.yaml <<EOF
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: ${CLUSTER_CA}
    server: ${CLUSTER_SERVER}
  name: ${CLUSTER_NAME}
contexts:
- context:
    cluster: ${CLUSTER_NAME}
    user: k8s-optimization-platform
  name: k8s-optimization-context
current-context: k8s-optimization-context
users:
- name: k8s-optimization-platform
  user:
    token: ${TOKEN}
EOF

# Move to backend
mv platform-kubeconfig.yaml k8s-optimization-platform/backend/
```

### Step 3: Update Backend Configuration

Edit `backend/.env`:

```bash
# Kubernetes Configuration
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=./platform-kubeconfig.yaml
K8S_CONTEXT=k8s-optimization-context
```

### Step 4: Install Kubernetes Python Client

```bash
cd k8s-optimization-platform/backend
source venv/bin/activate
pip install kubernetes
```

### Step 5: Create Kubernetes Client Service

Create `backend/services/k8s_client.py`:

```python
from kubernetes import client, config
from typing import Optional
import os

class KubernetesClient:
    def __init__(self):
        self.k8s_in_cluster = os.getenv('K8S_IN_CLUSTER', 'false').lower() == 'true'
        self.k8s_config_path = os.getenv('K8S_CONFIG_PATH', '~/.kube/config')
        self.k8s_context = os.getenv('K8S_CONTEXT', None)
        
        self._load_config()
        
    def _load_config(self):
        """Load Kubernetes configuration"""
        try:
            if self.k8s_in_cluster:
                # Load in-cluster config
                config.load_incluster_config()
            else:
                # Load from kubeconfig file
                config.load_kube_config(
                    config_file=os.path.expanduser(self.k8s_config_path),
                    context=self.k8s_context if self.k8s_context else None
                )
            print("✅ Kubernetes configuration loaded successfully")
        except Exception as e:
            print(f"❌ Failed to load Kubernetes configuration: {e}")
            raise
    
    def get_core_api(self) -> client.CoreV1Api:
        """Get Core V1 API client"""
        return client.CoreV1Api()
    
    def get_apps_api(self) -> client.AppsV1Api:
        """Get Apps V1 API client"""
        return client.AppsV1Api()
    
    def get_batch_api(self) -> client.BatchV1Api:
        """Get Batch V1 API client"""
        return client.BatchV1Api()
    
    def get_metrics_api(self) -> client.CustomObjectsApi:
        """Get Metrics API client"""
        return client.CustomObjectsApi()

# Global instance
k8s_client = KubernetesClient()
```

### Step 6: Update API Endpoints

Update `backend/api/clusters.py` to use real data:

```python
from fastapi import APIRouter, HTTPException
from services.k8s_client import k8s_client

router = APIRouter()

@router.get("/list")
async def list_clusters():
    """List all Kubernetes clusters"""
    try:
        v1 = k8s_client.get_core_api()
        
        # Get cluster info
        nodes = v1.list_node()
        namespaces = v1.list_namespace()
        pods = v1.list_pod_for_all_namespaces()
        
        return {
            "clusters": [{
                "cluster_id": "current-cluster",
                "name": "Current Cluster",
                "environment": "production",
                "region": "us-west-2",
                "nodes": len(nodes.items),
                "pods": len(pods.items),
                "namespaces": len(namespaces.items),
                "status": "healthy",
                "version": nodes.items[0].status.node_info.kubelet_version if nodes.items else "unknown"
            }]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{cluster_id}/nodes")
async def get_cluster_nodes(cluster_id: str):
    """Get nodes for a cluster"""
    try:
        v1 = k8s_client.get_core_api()
        nodes = v1.list_node()
        
        return {
            "nodes": [
                {
                    "name": node.metadata.name,
                    "status": node.status.conditions[-1].type if node.status.conditions else "Unknown",
                    "cpu_capacity": node.status.capacity.get('cpu', '0'),
                    "memory_capacity": node.status.capacity.get('memory', '0'),
                    "pods": len([p for p in v1.list_pod_for_all_namespaces().items 
                                if p.spec.node_name == node.metadata.name])
                }
                for node in nodes.items
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 7: Restart Backend

```bash
cd k8s-optimization-platform/backend
source venv/bin/activate
env -u DEBUG uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Step 8: Verify Integration

```bash
# Test cluster connection
curl http://localhost:8000/api/v1/clusters/list

# Should return real cluster data
```

---

## Multiple Clusters

### Method 1: Multiple Contexts in Kubeconfig

```yaml
# kubeconfig.yaml
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://cluster1.example.com
  name: cluster1
- cluster:
    server: https://cluster2.example.com
  name: cluster2
contexts:
- context:
    cluster: cluster1
    user: user1
  name: context1
- context:
    cluster: cluster2
    user: user2
  name: context2
current-context: context1
users:
- name: user1
  user:
    token: token1
- name: user2
  user:
    token: token2
```

### Method 2: Multiple Kubeconfig Files

```bash
# In backend/.env
K8S_CONFIG_PATHS=./cluster1.yaml,./cluster2.yaml,./cluster3.yaml
```

### Method 3: Dynamic Cluster Registration

Use the API to register clusters:

```bash
curl -X POST http://localhost:8000/api/v1/clusters/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Cluster",
    "kubeconfig": "base64-encoded-kubeconfig",
    "environment": "production"
  }'
```

---

## Troubleshooting

### Issue 1: Connection Refused

```bash
# Check cluster connectivity
kubectl cluster-info

# Verify kubeconfig
kubectl config view

# Test API server
curl -k https://your-cluster-api-server:6443/version
```

### Issue 2: Permission Denied

```bash
# Check current permissions
kubectl auth can-i get pods --all-namespaces
kubectl auth can-i list nodes

# View service account permissions
kubectl describe clusterrole k8s-optimization-reader
```

### Issue 3: Certificate Errors

```bash
# Skip TLS verification (not recommended for production)
# In backend/.env
K8S_VERIFY_SSL=false

# Or add CA certificate
K8S_CA_CERT=/path/to/ca.crt
```

### Issue 4: Context Not Found

```bash
# List available contexts
kubectl config get-contexts

# Set correct context in .env
K8S_CONTEXT=your-context-name
```

---

## Security Best Practices

### 1. Use Service Accounts

✅ Create dedicated service account
✅ Grant minimum required permissions
✅ Use RBAC for access control
❌ Don't use admin credentials

### 2. Rotate Tokens Regularly

```bash
# Create token with expiration
kubectl create token k8s-optimization-platform --duration=720h

# Rotate every 30 days
```

### 3. Network Security

✅ Use private networks
✅ Enable TLS/SSL
✅ Restrict API server access
✅ Use VPN for remote access

### 4. Audit Logging

```bash
# Enable audit logging in Kubernetes
# Monitor platform access
# Track all API calls
```

### 5. Secrets Management

```bash
# Use Kubernetes secrets for tokens
kubectl create secret generic k8s-opt-token \
  --from-literal=token=your-token

# Mount in pod
# Don't commit tokens to git
```

---

## Testing Integration

### 1. Test Cluster Connection

```bash
curl http://localhost:8000/api/v1/clusters/list
```

### 2. Test Pod Listing

```bash
curl http://localhost:8000/api/v1/pods/list
```

### 3. Test Metrics Collection

```bash
curl http://localhost:8000/api/v1/dashboard/summary
```

### 4. Verify Frontend

Visit http://localhost:3000 and check:
- ✅ Clusters page shows real clusters
- ✅ Pods page shows real pods
- ✅ Metrics are updating
- ✅ No dummy data

---

## Next Steps

1. ✅ Configure kubeconfig
2. ✅ Create service account
3. ✅ Update backend .env
4. ✅ Restart backend
5. ✅ Verify connection
6. ✅ Check frontend
7. ✅ Set up monitoring
8. ✅ Configure alerts

---

## Support

For issues:
1. Check logs: `podman-compose logs backend`
2. Verify kubeconfig: `kubectl config view`
3. Test connectivity: `kubectl get nodes`
4. Review permissions: `kubectl auth can-i`

---

**Made with Bob** - Kubernetes Integration Guide