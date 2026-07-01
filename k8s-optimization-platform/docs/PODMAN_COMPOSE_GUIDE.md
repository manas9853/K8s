# Podman Compose Setup Guide

This guide explains how to run the entire Kubernetes Optimization Platform using **Podman Compose** with real Kubernetes cluster integration.

## 🎯 Why Podman?

Podman is a daemonless container engine that's:
- ✅ **Rootless** - More secure, runs without root privileges
- ✅ **Docker-compatible** - Uses same commands and Dockerfiles
- ✅ **Lightweight** - No daemon required
- ✅ **Kubernetes-native** - Can generate Kubernetes YAML

## 📦 What's Included

The setup includes:
- ✅ **Backend API** (FastAPI) - Port 8000
- ✅ **Frontend** (React) - Port 3000
- ✅ **PostgreSQL** (TimescaleDB) - Port 5432
- ✅ **Redis** (Cache) - Port 6379
- ✅ **Prometheus** (Metrics) - Port 9090
- ✅ **Grafana** (Dashboards) - Port 3001
- ✅ **Kubernetes Integration** - Real cluster access via kubeconfig

## 🚀 Quick Start

### Prerequisites

1. **Podman** installed
   ```bash
   # macOS
   brew install podman
   
   # Linux (Fedora/RHEL)
   sudo dnf install podman
   
   # Linux (Ubuntu/Debian)
   sudo apt-get install podman
   ```

2. **podman-compose** installed
   ```bash
   pip3 install podman-compose
   ```

3. **kubectl** configured with access to your cluster
   ```bash
   kubectl cluster-info
   ```

4. **Kubeconfig** file at `~/.kube/config`

### Step 1: Initialize Podman Machine (macOS only)

```bash
# Create and start podman machine
podman machine init
podman machine start

# Verify
podman info
```

### Step 2: Set Kubernetes Context (Optional)

```bash
# List available contexts
kubectl config get-contexts

# Set context (optional - will use current context if not set)
export K8S_CONTEXT=your-cluster-name
```

### Step 3: Start All Services

```bash
cd k8s-optimization-platform

# Start with the automated script (recommended)
./start-podman-compose.sh

# Or manually
podman-compose up -d
```

### Step 4: Verify Services

```bash
# Check all services are running
podman-compose ps

# Test backend API
curl http://localhost:8000/health

# Test Kubernetes connection
curl http://localhost:8000/api/v1/clusters/
```

### Step 5: Access the Platform

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

## 📊 How It Works

### 1. Podman Compose

Podman Compose reads `docker-compose.yml` and:
1. Creates pods for each service
2. Manages networking between containers
3. Handles volume mounts
4. Orchestrates startup order

### 2. Kubernetes Integration

The backend container:
1. Mounts your `~/.kube/config` file (read-only)
2. Uses the Kubernetes Python client to connect
3. Fetches real-time data from your cluster
4. Calculates costs based on resource requests
5. Generates recommendations

### 3. Data Flow

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

## 🛠️ Common Commands

### Start Services

```bash
# Start all services
podman-compose up -d

# Start specific service
podman-compose up -d backend

# Start with rebuild
podman-compose up -d --build
```

### View Logs

```bash
# All services
podman-compose logs -f

# Specific service
podman-compose logs -f backend
podman-compose logs -f frontend

# Last 100 lines
podman-compose logs --tail=100 backend
```

### Stop Services

```bash
# Stop all services
podman-compose down

# Stop and remove volumes
podman-compose down -v

# Stop specific service
podman-compose stop backend
```

### Restart Services

```bash
# Restart all
podman-compose restart

# Restart specific service
podman-compose restart backend
```

### Podman-Specific Commands

```bash
# List all containers
podman ps

# List all pods
podman pod ps

# Inspect container
podman inspect k8s-opt-backend

# Execute command in container
podman exec -it k8s-opt-backend bash

# View container logs
podman logs k8s-opt-backend

# Remove all stopped containers
podman container prune
```

## 🔍 Troubleshooting

### Podman Machine Not Running (macOS)

**Problem**: `Cannot connect to Podman`

**Solution**:
```bash
# Check machine status
podman machine list

# Start machine
podman machine start

# If issues persist, recreate
podman machine stop
podman machine rm
podman machine init
podman machine start
```

### Backend Can't Connect to Kubernetes

**Problem**: Backend returns 503 errors

**Solution**:
```bash
# Check kubeconfig is accessible
ls -la ~/.kube/config

# Test kubectl access
kubectl get nodes

# Check backend logs
podman-compose logs backend | grep -i kubernetes

# Restart backend
podman-compose restart backend
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

### Volume Mount Issues

**Problem**: Kubeconfig not accessible in container

**Solution**:
```bash
# Check file permissions
ls -la ~/.kube/config

# Ensure readable
chmod 644 ~/.kube/config

# Check SELinux (Linux only)
ls -Z ~/.kube/config

# If needed, relabel
chcon -Rt svirt_sandbox_file_t ~/.kube/config
```

### Database Connection Failed

**Problem**: Backend can't connect to PostgreSQL

**Solution**:
```bash
# Check PostgreSQL is running
podman-compose ps postgres

# Check PostgreSQL logs
podman-compose logs postgres

# Restart PostgreSQL
podman-compose restart postgres

# Check network
podman network ls
```

### Frontend Not Loading

**Problem**: Frontend shows blank page

**Solution**:
```bash
# Check frontend logs
podman-compose logs frontend

# Rebuild frontend
podman-compose up -d --build frontend

# Check API URL
podman exec k8s-opt-frontend env | grep REACT_APP_API_URL
```

## 📈 Monitoring

### Health Checks

All services have health checks:

```bash
# Check service health
podman-compose ps

# Backend health
curl http://localhost:8000/health

# Frontend health
curl http://localhost:3000

# Prometheus health
curl http://localhost:9090/-/healthy

# Grafana health
curl http://localhost:3001/api/health
```

### Resource Usage

```bash
# View resource usage
podman stats

# View specific container
podman stats k8s-opt-backend

# View pod resource usage
podman pod stats
```

## 🔐 Security

### Rootless Mode

Podman runs in rootless mode by default:

```bash
# Check if running rootless
podman info | grep rootless

# Should show: rootless: true
```

### Production Deployment

For production, update these settings in `docker-compose.yml`:

```yaml
# Change default passwords
POSTGRES_PASSWORD: your-secure-password
GF_SECURITY_ADMIN_PASSWORD: your-secure-password

# Update secret key
SECRET_KEY: your-secure-random-string-min-32-chars

# Restrict CORS
CORS_ORIGINS: https://your-domain.com
```

## 🎓 Podman vs Docker

### Key Differences

| Feature | Podman | Docker |
|---------|--------|--------|
| Daemon | No daemon | Requires daemon |
| Root | Rootless by default | Requires root |
| Security | More secure | Less secure |
| Kubernetes | Native support | Via Docker Desktop |
| Commands | Same as Docker | Standard |

### Command Equivalents

```bash
# Docker → Podman
docker ps              → podman ps
docker build           → podman build
docker run             → podman run
docker-compose up      → podman-compose up
docker logs            → podman logs
docker exec            → podman exec
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

### Podman Compose (.env)

Create `.env` in project root:

```bash
# Kubernetes context (optional)
K8S_CONTEXT=minikube

# Ports (optional - override defaults)
BACKEND_PORT=8000
FRONTEND_PORT=3000
POSTGRES_PORT=5432
```

## 🚀 Advanced Usage

### Generate Kubernetes YAML

Podman can generate Kubernetes manifests:

```bash
# Generate YAML for all services
podman generate kube k8s-opt-backend > backend-k8s.yaml
podman generate kube k8s-opt-frontend > frontend-k8s.yaml

# Deploy to Kubernetes
kubectl apply -f backend-k8s.yaml
kubectl apply -f frontend-k8s.yaml
```

### Systemd Integration

Run as systemd service:

```bash
# Generate systemd unit file
podman generate systemd --name k8s-opt-backend > ~/.config/systemd/user/k8s-opt-backend.service

# Enable and start
systemctl --user enable k8s-opt-backend
systemctl --user start k8s-opt-backend
```

### Podman Desktop

Use Podman Desktop for GUI management:

```bash
# macOS
brew install podman-desktop

# Or download from: https://podman-desktop.io/
```

## 🎯 Best Practices

### 1. Use Specific Context

Always specify which cluster to use:

```bash
export K8S_CONTEXT=production-cluster
./start-podman-compose.sh
```

### 2. Monitor Logs

Keep an eye on logs during startup:

```bash
podman-compose up -d && podman-compose logs -f
```

### 3. Regular Updates

Update images regularly:

```bash
podman-compose pull
podman-compose up -d --build
```

### 4. Backup Data

Backup PostgreSQL data:

```bash
podman exec k8s-opt-postgres pg_dump -U postgres k8s_optimization > backup.sql
```

### 5. Clean Up

Remove unused resources:

```bash
# Remove stopped containers
podman container prune

# Remove unused images
podman image prune

# Remove unused volumes
podman volume prune
```

## 🚀 Next Steps

1. **Start Services**: `./start-podman-compose.sh`
2. **Verify Connection**: Check http://localhost:8000/api/v1/clusters/
3. **Access Dashboard**: Open http://localhost:3000
4. **Explore Features**: Navigate through all 24 features
5. **Monitor Metrics**: Check Grafana at http://localhost:3001

## 📚 Additional Resources

- [Podman Documentation](https://docs.podman.io/)
- [Podman Compose](https://github.com/containers/podman-compose)
- [Kubernetes Integration Guide](./KUBERNETES_INTEGRATION_GUIDE.md)
- [Switch to Real Data Guide](./SWITCH_TO_REAL_DATA.md)
- [API Documentation](http://localhost:8000/docs)

---

**Made with Bob** - Podman Compose Setup Complete! 🎉