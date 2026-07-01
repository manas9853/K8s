# Agent Build and Deployment Guide

## Prerequisites
- Docker installed locally
- Access to a container registry (Docker Hub, IBM Cloud Container Registry, etc.)
- kubectl configured for your target cluster

## Step 1: Build the Docker Image

```bash
cd k8s-optimization-platform/agent
docker build -t k8s-optimization-agent:latest .
```

## Step 2: Tag and Push to Registry

### Option A: Docker Hub
```bash
# Login to Docker Hub
docker login

# Tag the image
docker tag k8s-optimization-agent:latest YOUR_DOCKERHUB_USERNAME/k8s-optimization-agent:latest

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/k8s-optimization-agent:latest
```

### Option B: IBM Cloud Container Registry
```bash
# Login to IBM Cloud
ibmcloud login

# Target your region
ibmcloud cr region-set us-south

# Login to container registry
ibmcloud cr login

# Create namespace (if not exists)
ibmcloud cr namespace-add k8s-optimization

# Tag the image
docker tag k8s-optimization-agent:latest us.icr.io/k8s-optimization/k8s-optimization-agent:latest

# Push to IBM Cloud Container Registry
docker push us.icr.io/k8s-optimization/k8s-optimization-agent:latest
```

## Step 3: Update Deployment YAML

Edit `deployment.yaml` and replace line 114:

```yaml
# FROM:
image: your-registry/k8s-optimization-agent:latest

# TO (Docker Hub):
image: YOUR_DOCKERHUB_USERNAME/k8s-optimization-agent:latest

# OR (IBM Cloud):
image: us.icr.io/k8s-optimization/k8s-optimization-agent:latest
```

## Step 4: Update Configuration

Edit the ConfigMap section in `deployment.yaml` (lines 88-91):

```yaml
data:
  CLUSTER_NAME: "your-actual-cluster-name"  # e.g., "xforce-devops"
  ENVIRONMENT: "production"                  # or "staging", "development"
  COLLECTION_INTERVAL: "30"                  # seconds between collections
```

Edit the Secret section (lines 72-76) with your platform URL:

```yaml
stringData:
  platform-url: "http://your-platform-url:8000"  # Your backend API URL
  api-token: "your-secure-token-here"            # Generate a secure token
```

## Step 5: Deploy to Cluster

```bash
# Apply the deployment
kubectl apply -f deployment.yaml --validate=false

# Check deployment status
kubectl get pods -n k8s-optimization-agent

# View logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f
```

## Step 6: Verify Agent is Working

```bash
# Check if agent is collecting data
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent --tail=50

# You should see logs like:
# INFO: Starting K8s Optimization Agent
# INFO: Cluster: your-cluster-name
# INFO: Collecting metrics...
# INFO: Sent 150 pod metrics to platform
```

## Troubleshooting

### ImagePullBackOff Error
- Verify image exists in registry: `docker pull YOUR_IMAGE`
- Check image name in deployment matches registry
- For private registries, create imagePullSecret

### CrashLoopBackOff Error
- Check logs: `kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent`
- Verify PLATFORM_URL is accessible from cluster
- Check API_TOKEN is correct

### Permission Errors
- Verify ServiceAccount has correct RBAC permissions
- Check ClusterRole and ClusterRoleBinding are created

## Quick Deploy Script

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

# Configuration
REGISTRY="YOUR_DOCKERHUB_USERNAME"  # or us.icr.io/k8s-optimization
IMAGE_NAME="k8s-optimization-agent"
TAG="latest"

# Build
echo "Building Docker image..."
docker build -t ${IMAGE_NAME}:${TAG} .

# Tag
echo "Tagging image..."
docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY}/${IMAGE_NAME}:${TAG}

# Push
echo "Pushing to registry..."
docker push ${REGISTRY}/${IMAGE_NAME}:${TAG}

# Deploy
echo "Deploying to Kubernetes..."
kubectl apply -f deployment.yaml --validate=false

# Wait for rollout
echo "Waiting for deployment..."
kubectl rollout status deployment/k8s-optimization-agent -n k8s-optimization-agent

# Show status
echo "Deployment complete!"
kubectl get pods -n k8s-optimization-agent
```

Make it executable:
```bash
chmod +x deploy.sh
./deploy.sh