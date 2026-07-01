# Kubernetes Optimization Platform - Multi-Cluster Agent

## Overview

The K8s Optimization Agent is a lightweight Python application that runs inside your Kubernetes clusters to collect metrics and send them to the central optimization platform. This enables real-time monitoring and optimization across multiple clusters in any cloud environment.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Central Platform                          │
│                  (FastAPI Backend)                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Agent Receiver API                           │  │
│  │  - /api/agent/register                               │  │
│  │  - /api/agent/metrics                                │  │
│  │  - /api/agent/heartbeat                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTPS + Token Auth
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Agent      │  │   Agent      │  │   Agent      │
│  (AWS EKS)   │  │  (GCP GKE)   │  │ (Azure AKS)  │
│              │  │              │  │              │
│ Collects:    │  │ Collects:    │  │ Collects:    │
│ - Nodes      │  │ - Nodes      │  │ - Nodes      │
│ - Pods       │  │ - Pods       │  │ - Pods       │
│ - Resources  │  │ - Resources  │  │ - Resources  │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Features

- **Cloud Agnostic**: Works with any Kubernetes cluster (AWS EKS, GCP GKE, Azure AKS, IBM Cloud, on-premises)
- **Lightweight**: Minimal resource footprint (64Mi memory, 50m CPU)
- **Secure**: Token-based authentication, read-only RBAC permissions
- **Real-time**: Configurable collection interval (default: 30 seconds)
- **Resilient**: Automatic retry logic and error handling
- **Auto-discovery**: Automatically detects cloud provider and cluster metadata

## Prerequisites

- Kubernetes cluster (v1.19+)
- `kubectl` configured with cluster access
- Docker or Podman for building images (optional)
- Access to the central platform URL

## Quick Start

### 1. Generate API Token

First, generate an API token from the central platform:

```bash
# This will be provided by your platform administrator
export API_TOKEN="your-secure-token-here"
export PLATFORM_URL="https://your-platform.example.com"
```

### 2. Configure Agent

Edit the `deployment.yaml` file and update:

```yaml
# In Secret section
stringData:
  api-token: "YOUR_API_TOKEN_HERE"
  platform-url: "http://your-platform-url:8000"

# In ConfigMap section
data:
  CLUSTER_NAME: "my-cluster"           # Unique cluster identifier
  ENVIRONMENT: "production"             # production/staging/qa/development
  COLLECTION_INTERVAL: "30"             # Seconds between collections
```

### 3. Build Agent Image (Optional)

If you want to build your own image:

```bash
# Using Docker
docker build -t your-registry/k8s-optimization-agent:latest .
docker push your-registry/k8s-optimization-agent:latest

# Using Podman
podman build -t your-registry/k8s-optimization-agent:latest .
podman push your-registry/k8s-optimization-agent:latest
```

Update the image in `deployment.yaml`:

```yaml
image: your-registry/k8s-optimization-agent:latest
```

### 4. Deploy Agent

```bash
# Deploy to your cluster
kubectl apply -f deployment.yaml

# Verify deployment
kubectl get pods -n k8s-optimization-agent

# Check logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLATFORM_URL` | Yes | - | Central platform URL |
| `API_TOKEN` | Yes | - | Authentication token |
| `CLUSTER_NAME` | Yes | - | Unique cluster identifier |
| `ENVIRONMENT` | Yes | - | Environment type (production/staging/qa/development) |
| `COLLECTION_INTERVAL` | No | 30 | Seconds between metric collections |

### RBAC Permissions

The agent requires read-only access to:

- Nodes
- Namespaces
- Pods
- Deployments, ReplicaSets, StatefulSets, DaemonSets
- Services
- ConfigMaps and Secrets (metadata only)
- PersistentVolumes and PersistentVolumeClaims

All permissions are defined in the `ClusterRole` in `deployment.yaml`.

## Metrics Collected

The agent collects the following metrics every collection interval:

### Node Metrics
- Total node count
- Total CPU capacity (cores)
- Total memory capacity (GB)
- Node conditions and status

### Namespace Metrics
- Total namespace count
- Namespace list

### Pod Metrics
- Running pods
- Pending pods
- Failed pods
- Succeeded pods
- Total pod count

### Resource Metrics
- Total CPU requests (cores)
- Total memory requests (GB)
- CPU utilization percentage
- Memory utilization percentage

## Multi-Cloud Deployment

### AWS EKS

```bash
# Configure kubectl for EKS
aws eks update-kubeconfig --name your-cluster --region us-west-2

# Deploy agent
kubectl apply -f deployment.yaml
```

### GCP GKE

```bash
# Configure kubectl for GKE
gcloud container clusters get-credentials your-cluster --zone us-central1-a

# Deploy agent
kubectl apply -f deployment.yaml
```

### Azure AKS

```bash
# Configure kubectl for AKS
az aks get-credentials --resource-group your-rg --name your-cluster

# Deploy agent
kubectl apply -f deployment.yaml
```

### IBM Cloud Kubernetes

```bash
# Configure kubectl for IBM Cloud
ibmcloud ks cluster config --cluster your-cluster

# Deploy agent
kubectl apply -f deployment.yaml
```

## Monitoring

### Check Agent Status

```bash
# View agent pods
kubectl get pods -n k8s-optimization-agent

# View agent logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f

# Check agent events
kubectl get events -n k8s-optimization-agent
```

### Verify Platform Connection

```bash
# Check if agent is registered
curl -H "Authorization: Bearer $API_TOKEN" \
  $PLATFORM_URL/api/agent/clusters

# Check cluster metrics
curl -H "Authorization: Bearer $API_TOKEN" \
  $PLATFORM_URL/api/agent/clusters/your-cluster/metrics
```

## Troubleshooting

### Agent Not Starting

```bash
# Check pod status
kubectl describe pod -n k8s-optimization-agent -l app=k8s-optimization-agent

# Common issues:
# 1. Invalid API token - Check secret configuration
# 2. Network connectivity - Verify platform URL is accessible
# 3. RBAC permissions - Verify ServiceAccount has correct permissions
```

### Metrics Not Appearing

```bash
# Check agent logs for errors
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent --tail=100

# Verify platform is receiving data
curl -H "Authorization: Bearer $API_TOKEN" \
  $PLATFORM_URL/api/agent/clusters/your-cluster/status
```

### High Resource Usage

```bash
# Check agent resource usage
kubectl top pod -n k8s-optimization-agent

# Adjust collection interval if needed
kubectl set env deployment/k8s-optimization-agent \
  -n k8s-optimization-agent \
  COLLECTION_INTERVAL=60
```

## Security Best Practices

1. **Use Secrets**: Store API tokens in Kubernetes Secrets, never in ConfigMaps
2. **Network Policies**: Restrict agent egress to platform URL only
3. **RBAC**: Agent uses minimal read-only permissions
4. **TLS**: Always use HTTPS for platform communication
5. **Token Rotation**: Regularly rotate API tokens
6. **Image Security**: Scan agent images for vulnerabilities

## Upgrading

```bash
# Update agent image
kubectl set image deployment/k8s-optimization-agent \
  -n k8s-optimization-agent \
  agent=your-registry/k8s-optimization-agent:v2.0.0

# Verify rollout
kubectl rollout status deployment/k8s-optimization-agent \
  -n k8s-optimization-agent
```

## Uninstalling

```bash
# Remove agent from cluster
kubectl delete -f deployment.yaml

# Verify removal
kubectl get all -n k8s-optimization-agent
```

## Support

For issues or questions:
- Check logs: `kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent`
- Review platform documentation
- Contact platform administrator

## License

Copyright © 2026 Kubernetes Optimization Platform