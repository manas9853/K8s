# 🔗 Connect to Real Kubernetes Cluster - Quick Guide

## Current Status
✅ API redirect issue **FIXED** - API now returns data without 307 redirects
✅ Platform showing **dummy data** (Production Cluster A, Staging Cluster B)
⏳ Need to connect to **real IBM Cloud cluster** (xforce-devops)

## Why Dummy Data?
The backend logs show:
```
❌ Failed to load Kubernetes configuration
Platform will use dummy data until Kubernetes is configured
```

The backend container cannot access your `~/.kube/config` file.

## Solution: 3 Simple Steps

### Step 1: Configure IBM Cloud Cluster
```bash
# Get your cluster kubeconfig
ibmcloud ks cluster config --cluster xforce-devops

# Verify it works
kubectl get nodes
```

### Step 2: Copy Kubeconfig to Backend
```bash
cd k8s-optimization-platform

# Create .kube directory
mkdir -p backend/.kube

# Copy your kubeconfig
cp ~/.kube/config backend/.kube/config

# Verify the copy
ls -la backend/.kube/config
```

### Step 3: Rebuild & Restart Backend
```bash
# Rebuild backend with kubeconfig
podman build -t k8s-opt-backend:latest -f backend/Dockerfile backend/

# Restart backend
podman restart k8s-opt-backend

# Wait for startup
sleep 10

# Check logs for success
podman logs k8s-opt-backend --tail 30 | grep -i "kubernetes\|cluster"
```

### Step 4: Verify Real Data
```bash
# Test API - should show your real cluster now
curl http://localhost:8000/api/clusters | python3 -m json.tool

# Expected: Should show "xforce-devops" or your real cluster name
# Not: "Production Cluster A" or "Staging Cluster B"
```

## Troubleshooting

### Still Seeing Dummy Data?

**Check 1: Kubeconfig exists in container**
```bash
podman exec k8s-opt-backend ls -la /root/.kube/config
```

**Check 2: Backend logs**
```bash
podman logs k8s-opt-backend --tail 50
```

Look for:
- ✅ `Kubernetes configuration loaded successfully`
- ❌ `Failed to load Kubernetes configuration`

**Check 3: Test kubectl from your machine**
```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

### Common Issues

**Issue 1: "Failed to load Kubernetes configuration"**
- Solution: Ensure `backend/.kube/config` exists and is valid
- Run: `cat backend/.kube/config` to verify

**Issue 2: "Connection refused" or timeout**
- Solution: Your kubeconfig might have expired
- Run: `ibmcloud ks cluster config --cluster xforce-devops` again

**Issue 3: Still dummy data after restart**
- Solution: Backend might be caching. Force rebuild:
```bash
podman stop k8s-opt-backend
podman rm k8s-opt-backend
podman-compose up -d backend
```

## What Happens When Connected?

Once connected, you'll see:

### In Backend Logs:
```
✅ Kubernetes configuration loaded successfully
INFO: Kubernetes client initialized
INFO: Connected to cluster: xforce-devops
```

### In API Response:
```json
[
  {
    "id": "xforce-devops",
    "name": "xforce-devops",
    "environment": "production",
    "version": "1.28.x",
    "node_count": <actual_count>,
    "pod_count": <actual_count>,
    "namespace_count": <actual_count>,
    ...
  }
]
```

### In Dashboard:
- Real cluster name
- Real node count
- Real pod count
- Real namespace count
- Actual resource usage

## Alternative: Use Environment Variable

If copying kubeconfig doesn't work, you can set the path:

1. Edit `docker-compose.yml`:
```yaml
backend:
  environment:
    - K8S_CONFIG_PATH=/root/.kube/config
  volumes:
    - ~/.kube/config:/root/.kube/config:ro
```

2. Restart:
```bash
podman-compose down
podman-compose up -d
```

## Quick Test Script

Run this to test everything:
```bash
#!/bin/bash
echo "Testing Kubernetes Connection..."
echo ""
echo "1. Checking kubeconfig..."
ls -la ~/.kube/config && echo "✅ Host kubeconfig exists" || echo "❌ No kubeconfig"
echo ""
echo "2. Checking backend kubeconfig..."
ls -la backend/.kube/config && echo "✅ Backend kubeconfig exists" || echo "❌ No backend kubeconfig"
echo ""
echo "3. Testing kubectl..."
kubectl get nodes && echo "✅ kubectl works" || echo "❌ kubectl failed"
echo ""
echo "4. Testing API..."
curl -s http://localhost:8000/api/clusters | grep -q "xforce-devops" && echo "✅ Real data!" || echo "⚠️  Still dummy data"
```

## Need Help?

Check these files for more details:
- `CONNECT_TO_REAL_CLUSTER.sh` - Automated setup script
- `backend/services/k8s_client.py` - Kubernetes client code
- `backend/api/clusters.py` - Clusters API implementation

Run backend logs to see what's happening:
```bash
podman logs k8s-opt-backend -f