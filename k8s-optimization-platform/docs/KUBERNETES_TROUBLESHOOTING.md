# Kubernetes Connection Troubleshooting Guide

## 🔍 Current Issue

Your backend logs show:
```
❌ Failed to load Kubernetes configuration: File does not exist: 
/Users/manasupadhyay/.bluemix/plugins/container-service/clusters/xforce-devops-c2dvjirw01r66qf58vu0/ca-aaa00-xforce-devops.pem
```

This means your kubeconfig references an IBM Cloud (IKS) cluster with a missing certificate file.

## 🎯 Solutions

### Solution 1: Refresh IBM Cloud Cluster Config (Recommended)

If you're using IBM Cloud Kubernetes Service (IKS):

```bash
# Login to IBM Cloud
ibmcloud login

# Target your resource group
ibmcloud target -g <your-resource-group>

# List clusters
ibmcloud ks clusters

# Download fresh cluster config
ibmcloud ks cluster config --cluster xforce-devops-c2dvjirw01r66qf58vu0

# Verify connection
kubectl get nodes
```

This will regenerate the certificate files and update your kubeconfig.

### Solution 2: Use Different Cluster Context

If you have multiple clusters configured:

```bash
# List all contexts
kubectl config get-contexts

# Switch to a different context
kubectl config use-context <context-name>

# Verify
kubectl get nodes

# Restart backend
podman-compose restart backend
```

### Solution 3: Set Specific Context in Environment

```bash
# Export the working context
export K8S_CONTEXT=minikube  # or your working context name

# Restart with specific context
podman-compose down
podman-compose up -d
```

### Solution 4: Fix Kubeconfig Manually

Edit your kubeconfig to remove the broken cluster:

```bash
# Backup current config
cp ~/.kube/config ~/.kube/config.backup

# Edit config
nano ~/.kube/config

# Remove or fix the xforce-devops cluster entry
# Look for sections with certificate-authority: /Users/manasupadhyay/.bluemix/...
# Either remove them or update the path
```

## 🔧 Quick Fix for Testing

If you want to test with a local cluster:

### Option A: Use Minikube

```bash
# Install minikube
brew install minikube

# Start minikube
minikube start

# Verify
kubectl get nodes

# Restart backend
podman-compose restart backend
```

### Option B: Use Kind (Kubernetes in Docker)

```bash
# Install kind
brew install kind

# Create cluster
kind create cluster --name test-cluster

# Verify
kubectl get nodes

# Restart backend
podman-compose restart backend
```

## 📝 Update Backend Configuration

Once you have a working cluster, update the backend environment:

### Method 1: Update docker-compose.yml

```yaml
backend:
  environment:
    K8S_CONTEXT: minikube  # or your working context
```

### Method 2: Update backend/.env

```bash
cd k8s-optimization-platform/backend
echo "K8S_CONTEXT=minikube" >> .env
```

### Method 3: Set Environment Variable

```bash
export K8S_CONTEXT=minikube
podman-compose up -d
```

## ✅ Verify Connection

After fixing, verify the connection:

```bash
# Check kubectl works
kubectl get nodes

# Check backend logs
podman-compose logs backend | grep -i kubernetes

# Should see: "✅ Kubernetes client initialized successfully"

# Test API
curl http://localhost:8000/api/v1/clusters/

# Should return real cluster data, not 503 error
```

## 🎓 Understanding the Error

### What Happened?

1. Your kubeconfig references an IBM Cloud cluster
2. The cluster config includes a certificate file path
3. The certificate file is missing (possibly expired or deleted)
4. Kubernetes client can't load the config
5. Backend falls back to dummy data

### Why Certificate is Missing?

- IBM Cloud certificates expire periodically
- You need to refresh cluster config regularly
- Use `ibmcloud ks cluster config` to regenerate

### How Backend Handles This?

The backend gracefully handles the error:
```python
try:
    config.load_kube_config()
except Exception as e:
    logger.error(f"Failed to load Kubernetes configuration: {e}")
    logger.warning("Platform will use dummy data until Kubernetes is configured")
```

## 🚀 Recommended Workflow

### For IBM Cloud Users:

```bash
# 1. Refresh cluster config
ibmcloud ks cluster config --cluster xforce-devops-c2dvjirw01r66qf58vu0

# 2. Verify kubectl
kubectl get nodes

# 3. Restart backend
cd k8s-optimization-platform
podman-compose restart backend

# 4. Check logs
podman-compose logs backend | tail -20

# 5. Test API
curl http://localhost:8000/api/v1/clusters/
```

### For Local Development:

```bash
# 1. Start minikube
minikube start

# 2. Verify
kubectl get nodes

# 3. Set context
export K8S_CONTEXT=minikube

# 4. Restart services
podman-compose down
podman-compose up -d

# 5. Verify connection
curl http://localhost:8000/api/v1/clusters/
```

## 📊 Expected Output After Fix

### Backend Logs (Success):
```
✅ Kubernetes client initialized successfully
Connected to cluster: minikube
Cluster version: v1.28.0
```

### API Response (Success):
```json
{
  "id": "minikube",
  "name": "minikube",
  "node_count": 1,
  "pod_count": 12,
  "namespace_count": 4,
  "version": "1.28.0"
}
```

### Backend Logs (Still Failing):
```
❌ Failed to load Kubernetes configuration
Platform will use dummy data
```

### API Response (Still Failing):
```json
{
  "error": "Kubernetes not configured",
  "message": "Please configure Kubernetes connection",
  "setup_guide": "See KUBERNETES_INTEGRATION_GUIDE.md"
}
```

## 🔐 Security Note

The backend mounts your kubeconfig as read-only:
```yaml
volumes:
  - ${HOME}/.kube:/root/.kube:ro
```

This means:
- ✅ Backend can read your kubeconfig
- ✅ Backend can connect to clusters
- ❌ Backend cannot modify your kubeconfig
- ❌ Backend cannot access files outside .kube directory

## 📚 Additional Resources

- [IBM Cloud Kubernetes Service Docs](https://cloud.ibm.com/docs/containers)
- [Kubernetes Python Client](https://github.com/kubernetes-client/python)
- [Kubeconfig Documentation](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/)

## 🆘 Still Having Issues?

If none of these solutions work:

1. **Check kubeconfig syntax**:
   ```bash
   kubectl config view
   ```

2. **Validate certificate paths**:
   ```bash
   grep -r "certificate-authority:" ~/.kube/config
   # Check if all paths exist
   ```

3. **Test with fresh kubeconfig**:
   ```bash
   mv ~/.kube/config ~/.kube/config.old
   # Reconfigure your cluster
   ```

4. **Check backend has access**:
   ```bash
   podman exec k8s-opt-backend ls -la /root/.kube/
   podman exec k8s-opt-backend cat /root/.kube/config
   ```

---

**Made with Bob** - Kubernetes Troubleshooting Guide