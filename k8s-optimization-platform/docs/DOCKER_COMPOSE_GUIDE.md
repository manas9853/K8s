# Docker Compose Setup Guide

This guide explains how to run the entire Kubernetes Optimization Platform using Docker Compose with real Kubernetes cluster integration.

## 🎯 What's Included

The Docker Compose setup includes:
- ✅ **Backend API** (FastAPI) - Port 8000
- ✅ **Frontend** (React) - Port 3000
- ✅ **PostgreSQL** (TimescaleDB) - Port 5432
- ✅ **Redis** (Cache) - Port 6379
- ✅ **Prometheus** (Metrics) - Port 9090
- ✅ **Grafana** (Dashboards) - Port 3001
- ✅ **Kubernetes Integration** - Real cluster access via kubeconfig

## 🚀 Quick Start

### Prerequisites

1. **Docker & Docker Compose** installed
2. **kubectl** configured with access to your cluster
3. **Kubeconfig** file at `~/.kube/config`

### Step 1: Set Kubernetes Context (Optional)

If you have multiple clusters, set the context you want to use:

```bash
# List available contexts
kubectl config get-contexts

# Set context (optional - will use current context if not set)
export K8S_CONTEXT=your-cluster-name
```

### Step 2: Start All Services

```bash
cd k8s-optimization-platform

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
```

### Step 3: Verify Services

```bash
# Check all services are running
docker-compose ps

# Test backend API
curl http://localhost:8000/health

# Test Kubernetes connection
curl http://localhost:8000/api/v1/clusters/
```

### Step 4: Access the Platform

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

## 🔧 Configuration

### Kubernetes Access

The backend container automatically mounts your kubeconfig:

```yaml
volumes:
  - ${HOME}/.kube:/root/.kube:ro
```

Environment variables:
```bash
K8S_IN_CLUSTER=false              # Running outside cluster
K8S_CONFIG_PATH=/root/.kube/config  # Path inside container
K8S_CONTEXT=your-cluster-name     # Optional: specific context
```

### Cost Rates

Adjust in `docker-compose.yml`:

```yaml
CPU_COST_PER_CORE_HOUR: 0.031      # $0.031 per vCPU hour
MEMORY_COST_PER_GB_HOUR: 0.004     # $0.004 per GB hour
STORAGE_COST_PER_GB_MONTH: 0.10    # $0.10 per GB month
```

### Database

PostgreSQL with TimescaleDB:
- **Host**: localhost:5432
- **Database**: k8s_optimization
- **User**: postgres
- **Password**: postgres

### Redis Cache

- **Host**: localhost:6379
- **TTL**: 3600 seconds (1 hour)

## 📊 How It Works

### 1. Kubernetes Integration

The backend container:
1. Mounts your `~/.kube/config` file (read-only)
2. Uses the Kubernetes Python client to connect
3. Fetches real-time data from your cluster
4. Calculates costs based on resource requests
5. Generates recommendations

### 2. Data Flow

```
Kubernetes Cluster
       ↓
   kubeconfig
       ↓
Backend Container → PostgreSQL (stores data)
       ↓              ↓
   Redis Cache    Prometheus (metrics)
       ↓              ↓
   Frontend ←─── Grafana (visualizations)
```

### 3. Real Data Sources

The platform fetches:
- **Pods**: All pods with resource requests/limits
- **Nodes**: Node capacity and allocatable resources
- **Namespaces**: All namespaces in the cluster
- **Metrics**: CPU/Memory usage (requires metrics-server)
- **Version**: Kubernetes cluster version

## 🛠️ Common Commands

### Start Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d backend

# Start with rebuild
docker-compose up -d --build
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop specific service
docker-compose stop backend
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Update Services

```bash
# Pull latest images
docker-compose pull

# Rebuild and restart
docker-compose up -d --build
```

## 🔍 Troubleshooting

### Backend Can't Connect to Kubernetes

**Problem**: Backend returns 503 errors

**Solution**:
```bash
# Check kubeconfig is accessible
ls -la ~/.kube/config

# Test kubectl access
kubectl get nodes

# Check backend logs
docker-compose logs backend | grep -i kubernetes

# Restart backend
docker-compose restart backend
```

### Port Already in Use

**Problem**: `Address already in use`

**Solution**:
```bash
# Find process using port 8000
lsof -ti:8000

# Kill process
lsof -ti:8000 | xargs kill -9

# Or change port in docker-compose.yml
ports:
  - "8001:8000"  # Use 8001 instead
```

### Database Connection Failed

**Problem**: Backend can't connect to PostgreSQL

**Solution**:
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Wait for health check
docker-compose ps
```

### Frontend Not Loading

**Problem**: Frontend shows blank page

**Solution**:
```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose up -d --build frontend

# Check API URL
docker-compose exec frontend env | grep REACT_APP_API_URL
```

### Kubernetes Permissions

**Problem**: "Forbidden" errors when accessing cluster

**Solution**:
```bash
# Check RBAC permissions
kubectl auth can-i list pods --all-namespaces

# Create service account with read permissions
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k8s-optimizer
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-optimizer-reader
rules:
- apiGroups: [""]
  resources: ["pods", "nodes", "namespaces", "services"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["pods", "nodes"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k8s-optimizer-reader-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: k8s-optimizer-reader
subjects:
- kind: ServiceAccount
  name: k8s-optimizer
  namespace: default
EOF
```

## 📈 Monitoring

### Health Checks

All services have health checks:

```bash
# Check service health
docker-compose ps

# Backend health
curl http://localhost:8000/health

# Frontend health
curl http://localhost:3000

# Prometheus health
curl http://localhost:9090/-/healthy

# Grafana health
curl http://localhost:3001/api/health
```

### Metrics

View metrics in Prometheus:
- Backend metrics: http://localhost:9090/targets
- Query metrics: http://localhost:9090/graph

View dashboards in Grafana:
- Login: http://localhost:3001 (admin/admin)
- Pre-configured dashboards available

## 🔐 Security

### Production Deployment

For production, update these settings in `docker-compose.yml`:

```yaml
# Change default passwords
POSTGRES_PASSWORD: your-secure-password
GF_SECURITY_ADMIN_PASSWORD: your-secure-password

# Update secret key
SECRET_KEY: your-secure-random-string-min-32-chars

# Enable HTTPS
# Add nginx reverse proxy with SSL certificates

# Restrict CORS
CORS_ORIGINS: https://your-domain.com

# Enable authentication
# Add JWT authentication for API endpoints
```

### Network Security

```yaml
# Restrict external access
ports:
  - "127.0.0.1:8000:8000"  # Only localhost
  - "127.0.0.1:5432:5432"  # Only localhost
```

## 📝 Environment Variables

### Backend (.env)

Create `backend/.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/k8s_optimization

# Redis
REDIS_URL=redis://redis:6379/0

# Kubernetes
K8S_IN_CLUSTER=false
K8S_CONFIG_PATH=/root/.kube/config
K8S_CONTEXT=your-cluster-name

# Costs
CPU_COST_PER_CORE_HOUR=0.031
MEMORY_COST_PER_GB_HOUR=0.004

# Security
SECRET_KEY=change-this-to-a-secure-random-string

# Logging
LOG_LEVEL=INFO
```

### Docker Compose (.env)

Create `.env` in project root:

```bash
# Kubernetes context (optional)
K8S_CONTEXT=minikube

# Ports (optional - override defaults)
BACKEND_PORT=8000
FRONTEND_PORT=3000
POSTGRES_PORT=5432
```

## 🎓 Best Practices

### 1. Use Specific Context

Always specify which cluster to use:

```bash
export K8S_CONTEXT=production-cluster
docker-compose up -d
```

### 2. Monitor Logs

Keep an eye on logs during startup:

```bash
docker-compose up -d && docker-compose logs -f
```

### 3. Regular Updates

Update images regularly:

```bash
docker-compose pull
docker-compose up -d --build
```

### 4. Backup Data

Backup PostgreSQL data:

```bash
docker-compose exec postgres pg_dump -U postgres k8s_optimization > backup.sql
```

### 5. Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

## 🚀 Next Steps

1. **Start Services**: `docker-compose up -d`
2. **Verify Connection**: Check http://localhost:8000/api/v1/clusters/
3. **Access Dashboard**: Open http://localhost:3000
4. **Explore Features**: Navigate through all 24 features
5. **Monitor Metrics**: Check Grafana at http://localhost:3001

## 📚 Additional Resources

- [Kubernetes Integration Guide](./KUBERNETES_INTEGRATION_GUIDE.md)
- [Switch to Real Data Guide](./SWITCH_TO_REAL_DATA.md)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [API Documentation](http://localhost:8000/docs)

---

**Made with Bob** - Docker Compose Setup Complete! 🎉