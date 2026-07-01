# Connect to Real Kubernetes Cluster

## Current Status
✅ Frontend is loading successfully
✅ Backend is running
⏳ Need to connect to real IBM Cloud Kubernetes cluster

## Step 1: Configure IBM Cloud Kubernetes Cluster

```bash
# Login to IBM Cloud (if not already logged in)
ibmcloud login

# Set target region (adjust as needed)
ibmcloud target -r us-south

# Configure kubectl to use your cluster
ibmcloud ks cluster config --cluster xforce-devops

# Verify connection
kubectl get nodes
kubectl get namespaces
```

## Step 2: Copy Kubeconfig to Backend Container

The backend needs access to your kubeconfig file:

```bash
# Check where kubeconfig was created
ls -la ~/.kube/config

# Copy kubeconfig to project directory
cp ~/.kube/config k8s-optimization-platform/backend/.kube/config

# Restart backend to pick up new config
cd k8s-optimization-platform
podman-compose restart backend

# Verify backend can connect
podman logs k8s-opt-backend | tail -20
```

## Step 3: Verify Real Data is Loading

```bash
# Test clusters endpoint
curl http://localhost:8000/api/clusters

# Should return real cluster data, not dummy data

# Test dashboard endpoint
curl http://localhost:8000/api/dashboard

# Should show real metrics from your cluster
```

## Step 4: Refresh Frontend

Open browser and refresh: **http://localhost:3000**

You should now see:
- Real cluster names
- Real node counts
- Real pod counts
- Real namespace data
- Real resource utilization

## Troubleshooting

### Issue: Backend can't connect to cluster

**Check kubeconfig location:**
```bash
podman exec k8s-opt-backend ls -la /tmp/.kube/config
```

**Check backend logs:**
```bash
podman logs k8s-opt-backend | grep -i "kubernetes\|cluster\|error"
```

**Verify kubeconfig is valid:**
```bash
kubectl cluster-info
kubectl get nodes
```

### Issue: Certificate errors

If you see certificate errors, the kubeconfig might have expired:

```bash
# Refresh cluster config
ibmcloud ks cluster config --cluster xforce-devops --admin

# Copy new config
cp ~/.kube/config k8s-optimization-platform/backend/.kube/config

# Restart backend
cd k8s-optimization-platform
podman-compose restart backend
```

### Issue: Still seeing dummy data

**Check if backend is using real K8s client:**
```bash
# Check backend environment
podman exec k8s-opt-backend env | grep K8S

# Should show:
# K8S_CONFIG_PATH=/tmp/.kube/config
```

**Verify kubeconfig exists in container:**
```bash
podman exec k8s-opt-backend cat /tmp/.kube/config
```

**Check backend can reach cluster:**
```bash
podman exec k8s-opt-backend kubectl get nodes
```

## Alternative: Mount Kubeconfig as Volume

If copying doesn't work, mount it as a volume:

Edit `docker-compose.yml`:
```yaml
backend:
  volumes:
    - ~/.kube/config:/tmp/.kube/config:ro
```

Then restart:
```bash
podman-compose down backend
podman-compose up -d backend
```

## Verification Checklist

✅ IBM Cloud CLI logged in
✅ Cluster config downloaded
✅ kubectl can access cluster
✅ Kubeconfig copied to backend
✅ Backend restarted
✅ Backend logs show no errors
✅ API returns real cluster data
✅ Frontend displays real data

## Quick Commands

```bash
# Full setup in one go
ibmcloud ks cluster config --cluster xforce-devops
cp ~/.kube/config k8s-optimization-platform/backend/.kube/config
cd k8s-optimization-platform
podman-compose restart backend
podman logs -f k8s-opt-backend

# Test real data
curl http://localhost:8000/api/clusters | jq
curl http://localhost:8000/api/dashboard | jq

# Open dashboard
open http://localhost:3000  # macOS
```

## What Data Will Show

Once connected, you'll see:

**Dashboard:**
- Real cluster names (e.g., "xforce-devops")
- Actual node count
- Actual pod count
- Real namespace list
- Live resource utilization

**Clusters Page:**
- Your IBM Cloud cluster details
- Real node information
- Actual resource capacity
- Live health status

**Pods Page:**
- All pods from your cluster
- Real CPU/Memory usage
- Actual requests and limits
- Live pod status

**Recommendations:**
- Based on real usage patterns
- Actual over/under-provisioned resources
- Real cost savings opportunities

## Next Steps

After connecting to real cluster:

1. ✅ Verify all data is real (no dummy data)
2. ✅ Check all 24 features work with real data
3. ✅ Test recommendations engine
4. ✅ Try one-click optimizations
5. ✅ Generate reports

## Support

If you encounter issues:
1. Check backend logs: `podman logs k8s-opt-backend`
2. Verify kubectl works: `kubectl get nodes`
3. Test API directly: `curl http://localhost:8000/api/clusters`
4. See [`KUBERNETES_TROUBLESHOOTING.md`](KUBERNETES_TROUBLESHOOTING.md)