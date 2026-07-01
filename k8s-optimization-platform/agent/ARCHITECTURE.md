# Multi-Cluster Agent Architecture

## Overview

The K8s Optimization Platform uses a distributed agent-based architecture to monitor multiple Kubernetes clusters across different cloud providers in real-time.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Central Platform (Backend)                       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Agent Receiver API                          │ │
│  │                                                                │ │
│  │  POST /api/agent/register      - Register new cluster        │ │
│  │  POST /api/agent/metrics       - Receive metrics             │ │
│  │  POST /api/agent/heartbeat     - Health check                │ │
│  │  GET  /api/agent/clusters      - List all clusters           │ │
│  │  GET  /api/agent/clusters/{id}/metrics - Get cluster metrics │ │
│  │  GET  /api/agent/clusters/{id}/status  - Get cluster status  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   In-Memory Storage                            │ │
│  │                                                                │ │
│  │  cluster_registry: Dict[cluster_name, cluster_info]          │ │
│  │  cluster_metrics:  Dict[cluster_name, latest_metrics]        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
                    HTTPS + Bearer Token Authentication
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  Agent Pod    │          │  Agent Pod    │          │  Agent Pod    │
│  (AWS EKS)    │          │  (GCP GKE)    │          │ (Azure AKS)   │
│               │          │               │          │               │
│  ┌─────────┐  │          │  ┌─────────┐  │          │  ┌─────────┐  │
│  │ Agent   │  │          │  │ Agent   │  │          │  │ Agent   │  │
│  │ Process │  │          │  │ Process │  │          │  │ Process │  │
│  └─────────┘  │          │  └─────────┘  │          │  └─────────┘  │
│       │       │          │       │       │          │       │       │
│       ▼       │          │       ▼       │          │       ▼       │
│  ┌─────────┐  │          │  ┌─────────┐  │          │  ┌─────────┐  │
│  │ K8s API │  │          │  │ K8s API │  │          │  │ K8s API │  │
│  │ Client  │  │          │  │ Client  │  │          │  │ Client  │  │
│  └─────────┘  │          │  └─────────┘  │          │  └─────────┘  │
│       │       │          │       │       │          │       │       │
│       ▼       │          │       ▼       │          │       ▼       │
│  ┌─────────┐  │          │  ┌─────────┐  │          │  ┌─────────┐  │
│  │ K8s API │  │          │  │ K8s API │  │          │  │ K8s API │  │
│  │ Server  │  │          │  │ Server  │  │          │  │ Server  │  │
│  └─────────┘  │          │  └─────────┘  │          │  └─────────┘  │
└───────────────┘          └───────────────┘          └───────────────┘
```

## Components

### 1. Agent (agent.py)

**Purpose**: Lightweight Python application that runs in each Kubernetes cluster

**Responsibilities**:
- Register cluster with central platform on startup
- Collect metrics from Kubernetes API every 30 seconds (configurable)
- Send metrics to central platform via REST API
- Send heartbeat signals to maintain connection status
- Handle errors and retry failed requests

**Key Features**:
- Uses in-cluster Kubernetes configuration
- Minimal resource footprint (64Mi memory, 50m CPU)
- Automatic cloud provider detection
- Graceful error handling and retries

**Metrics Collected**:
```python
{
    "nodes": {
        "total": 4,
        "cpu_capacity": 16.0,
        "memory_capacity": 64.0
    },
    "namespaces": {
        "total": 42,
        "list": ["default", "kube-system", ...]
    },
    "pods": {
        "running": 287,
        "pending": 2,
        "failed": 0,
        "succeeded": 15,
        "total": 304
    },
    "resources": {
        "cpu_requests": 8.5,
        "memory_requests": 32.0,
        "cpu_utilization": 53.1,
        "memory_utilization": 50.0
    }
}
```

### 2. Agent Receiver API (agent_receiver.py)

**Purpose**: Backend API endpoints that receive data from agents

**Endpoints**:

#### POST /api/agent/register
Register a new cluster with the platform
```json
{
    "cluster_name": "prod-us-west",
    "environment": "production",
    "cloud_provider": "aws",
    "region": "us-west-2",
    "version": "1.28"
}
```

#### POST /api/agent/metrics
Receive metrics from agent (called every 30s)
```json
{
    "cluster_name": "prod-us-west",
    "timestamp": "2026-06-19T10:00:00Z",
    "nodes": {...},
    "namespaces": {...},
    "pods": {...},
    "resources": {...}
}
```

#### POST /api/agent/heartbeat
Receive heartbeat from agent
```json
{
    "cluster_name": "prod-us-west",
    "timestamp": "2026-06-19T10:00:00Z",
    "status": "healthy"
}
```

#### GET /api/agent/clusters
List all registered clusters
```json
{
    "total_clusters": 3,
    "clusters": [
        {
            "cluster_name": "prod-us-west",
            "environment": "production",
            "status": "active",
            "health": "healthy",
            "has_metrics": true,
            "metrics_age": 15.2
        }
    ]
}
```

### 3. Deployment Manifest (deployment.yaml)

**Components**:
- **Namespace**: `k8s-optimization-agent`
- **ServiceAccount**: For in-cluster API access
- **ClusterRole**: Read-only permissions for resources
- **ClusterRoleBinding**: Binds role to service account
- **Secret**: Stores API token and platform URL
- **ConfigMap**: Stores cluster configuration
- **Deployment**: Runs agent pod

**RBAC Permissions** (Read-Only):
- Nodes
- Namespaces
- Pods
- Deployments, ReplicaSets, StatefulSets, DaemonSets
- Services
- ConfigMaps, Secrets (metadata only)
- PersistentVolumes, PersistentVolumeClaims

## Data Flow

### 1. Agent Startup Flow

```
1. Agent starts in cluster
2. Loads in-cluster Kubernetes config
3. Reads environment variables (PLATFORM_URL, API_TOKEN, etc.)
4. Registers with platform via POST /api/agent/register
5. Platform stores cluster info in cluster_registry
6. Agent receives success response
7. Agent starts metrics collection loop
```

### 2. Metrics Collection Flow

```
Every 30 seconds (configurable):

1. Agent queries Kubernetes API:
   - List all nodes
   - List all namespaces
   - List all pods
   - Calculate resource requests

2. Agent formats metrics into JSON

3. Agent sends metrics via POST /api/agent/metrics

4. Platform receives metrics:
   - Validates cluster is registered
   - Stores metrics in cluster_metrics
   - Updates last_seen timestamp
   - Returns success response

5. Agent logs success and waits for next interval
```

### 3. Heartbeat Flow

```
Every 60 seconds:

1. Agent sends heartbeat via POST /api/agent/heartbeat

2. Platform updates cluster status:
   - Updates last_seen timestamp
   - Updates health status
   - Returns success response

3. Platform monitors cluster health:
   - < 60s since last seen: healthy
   - 60-300s since last seen: warning
   - > 300s since last seen: critical
```

## Security

### Authentication

- **Token-Based**: Each agent uses a Bearer token for authentication
- **Token Storage**: Tokens stored in Kubernetes Secrets
- **Token Validation**: Platform validates token on every request

### Authorization

- **RBAC**: Agent uses minimal read-only permissions
- **Namespace Isolation**: Agent runs in dedicated namespace
- **Non-Root**: Agent runs as non-root user (UID 1000)
- **Read-Only Filesystem**: Container uses read-only root filesystem

### Network Security

- **TLS**: All communication uses HTTPS
- **Egress Only**: Agent only makes outbound connections
- **Network Policies**: Can restrict agent egress to platform URL only

## Scalability

### Horizontal Scaling

- **Multiple Clusters**: Platform can handle unlimited clusters
- **Concurrent Requests**: FastAPI handles concurrent agent requests
- **Async Processing**: Agent receiver uses async/await

### Vertical Scaling

- **Agent Resources**: Minimal footprint (64Mi memory, 50m CPU)
- **Platform Resources**: Can scale backend pods as needed
- **Database**: Future: Move from in-memory to persistent storage

### Performance

- **Collection Interval**: Configurable (default: 30s)
- **Batch Processing**: Future: Batch metrics from multiple agents
- **Caching**: Future: Cache frequently accessed data

## High Availability

### Agent HA

- **Single Replica**: One agent per cluster (sufficient for metrics collection)
- **Auto-Restart**: Kubernetes restarts failed pods automatically
- **Retry Logic**: Agent retries failed requests with exponential backoff

### Platform HA

- **Multiple Replicas**: Run multiple backend pods
- **Load Balancing**: Distribute agent requests across pods
- **Health Checks**: Platform exposes /health endpoint

## Monitoring

### Agent Monitoring

```bash
# Check agent status
kubectl get pods -n k8s-optimization-agent

# View agent logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f

# Check agent metrics
kubectl top pod -n k8s-optimization-agent
```

### Platform Monitoring

```bash
# Check registered clusters
curl -H "Authorization: Bearer $TOKEN" \
  $PLATFORM_URL/api/agent/clusters

# Check cluster health
curl -H "Authorization: Bearer $TOKEN" \
  $PLATFORM_URL/api/agent/clusters/prod-us-west/status

# Check platform health
curl $PLATFORM_URL/api/agent/health
```

## Future Enhancements

### Phase 1 (Current)
- ✅ Agent collects basic metrics
- ✅ Platform receives and stores metrics
- ✅ In-memory storage
- ✅ Token authentication

### Phase 2 (Planned)
- [ ] Persistent storage (PostgreSQL/MongoDB)
- [ ] Historical metrics storage
- [ ] Metrics aggregation and analytics
- [ ] Advanced health checks

### Phase 3 (Future)
- [ ] Agent auto-update mechanism
- [ ] Metrics compression
- [ ] WebSocket for real-time updates
- [ ] Agent clustering for HA

### Phase 4 (Advanced)
- [ ] Custom metrics collection
- [ ] Plugin system for extensibility
- [ ] Multi-tenancy support
- [ ] Advanced security features

## Troubleshooting

### Common Issues

1. **Agent not connecting**
   - Check platform URL is accessible
   - Verify API token is correct
   - Check firewall rules

2. **Metrics not updating**
   - Check agent logs for errors
   - Verify RBAC permissions
   - Check collection interval

3. **High resource usage**
   - Increase collection interval
   - Check for memory leaks
   - Review log verbosity

## References

- [Agent README](README.md) - Detailed deployment guide
- [Quick Start](QUICKSTART.md) - 5-minute deployment guide
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)