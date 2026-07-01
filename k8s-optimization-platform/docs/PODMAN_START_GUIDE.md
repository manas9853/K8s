# 🚀 Starting K8s Optimization Platform with Podman

## Prerequisites

1. **Podman Machine** must be running:
   ```bash
   # Check if Podman machine exists
   podman machine list
   
   # If not running, start it
   podman machine start
   
   # If machine doesn't exist, create and start it
   podman machine init
   podman machine start
   ```

2. **Verify Podman is working**:
   ```bash
   podman ps
   # Should show running containers or empty list (not an error)
   ```

## Quick Start

### Option 1: Using the Start Script (Recommended)

```bash
cd k8s-optimization-platform
./start-podman.sh
```

This script will:
- Create a Podman network
- Start PostgreSQL database
- Start Redis cache
- Build and start the Backend API
- Build and start the Frontend React app

### Option 2: Manual Start

If the script fails, you can start services manually:

```bash
cd k8s-optimization-platform

# 1. Create network
podman network create k8s-opt-network

# 2. Start PostgreSQL
podman run -d \
  --name k8s-opt-postgres \
  --network k8s-opt-network \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=k8s_optimization \
  -p 5432:5432 \
  docker.io/timescale/timescaledb:latest-pg15

# 3. Start Redis
podman run -d \
  --name k8s-opt-redis \
  --network k8s-opt-network \
  -p 6379:6379 \
  docker.io/redis:7-alpine

# 4. Build and start Backend
cd backend
podman build -t k8s-opt-backend .
podman run -d \
  --name k8s-opt-backend \
  --network k8s-opt-network \
  -p 8000:8000 \
  -v $(pwd):/app \
  -e DATABASE_URL=postgresql://postgres:postgres@k8s-opt-postgres:5432/k8s_optimization \
  -e REDIS_URL=redis://k8s-opt-redis:6379/0 \
  -e DEBUG=true \
  k8s-opt-backend

# 5. Build and start Frontend
cd ../frontend
podman build -t k8s-opt-frontend .
podman run -d \
  --name k8s-opt-frontend \
  --network k8s-opt-network \
  -p 3000:3000 \
  -v $(pwd)/src:/app/src \
  k8s-opt-frontend
```

## Accessing the Platform

Once all containers are running:

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Checking Status

```bash
# View all running containers
podman ps

# Check specific container logs
podman logs k8s-opt-backend
podman logs k8s-opt-frontend
podman logs k8s-opt-postgres
podman logs k8s-opt-redis

# Follow logs in real-time
podman logs -f k8s-opt-backend
```

## Stopping Services

```bash
# Stop all containers
podman stop k8s-opt-backend k8s-opt-frontend k8s-opt-postgres k8s-opt-redis

# Remove containers
podman rm k8s-opt-backend k8s-opt-frontend k8s-opt-postgres k8s-opt-redis

# Remove network
podman network rm k8s-opt-network
```

## Troubleshooting

### Podman Machine Issues

If you get "unable to connect to Podman socket" error:

```bash
# Stop the machine
podman machine stop

# Start it again
podman machine start

# If that doesn't work, remove and recreate
podman machine rm podman-machine-default
podman machine init
podman machine start
```

### Container Build Failures

```bash
# Clean up old images
podman image prune -a

# Rebuild without cache
cd backend
podman build --no-cache -t k8s-opt-backend .

cd ../frontend
podman build --no-cache -t k8s-opt-frontend .
```

### Port Already in Use

```bash
# Find what's using the port
lsof -ti:8000  # Backend port
lsof -ti:3000  # Frontend port

# Kill the process
kill -9 $(lsof -ti:8000)
kill -9 $(lsof -ti:3000)
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
podman ps | grep postgres

# Check PostgreSQL logs
podman logs k8s-opt-postgres

# Restart PostgreSQL
podman restart k8s-opt-postgres
```

## Development Mode

For development with hot-reload:

```bash
# Backend (with volume mount for code changes)
cd backend
podman run -d \
  --name k8s-opt-backend \
  --network k8s-opt-network \
  -p 8000:8000 \
  -v $(pwd):/app \
  -e DEBUG=true \
  k8s-opt-backend

# Frontend (with volume mount for code changes)
cd frontend
podman run -d \
  --name k8s-opt-frontend \
  --network k8s-opt-network \
  -p 3000:3000 \
  -v $(pwd)/src:/app/src \
  k8s-opt-frontend
```

## All 24 Features Available

Once the platform is running, you can access all 24 features:

1. Unified Multi-Cluster Dashboard
2. Executive Overview Dashboard
3. Recommendations Engine
4. Pod Optimization Dashboard
5. Cost Savings Analytics
6. Resource Cleanup Detection
7. One-Click Auto-Fix System
8. Rollback Engine
9. AI Optimization Copilot
10. Autonomous Optimization Modes
11. Cluster Scoring System
12. Team-Based Cost Accountability
13. Waste Heatmap Visualization
14. Root Cause Analysis
15. What-If Simulation Engine
16. CI/CD Cost Guardrails
17. AI Incident Correlation
18. Predictive Scaling & Self-Healing
19. Smart Cleanup Engine
20. Carbon Footprint Dashboard
21. Cross-Cluster Benchmarking
22. AI Executive Reports
23. Audit & Compliance System
24. Platform Engineering Command Center

Navigate through the sidebar menu to explore each feature!

## Support

For issues or questions:
1. Check container logs: `podman logs <container-name>`
2. Verify all containers are running: `podman ps`
3. Check Podman machine status: `podman machine list`
4. Review this guide's troubleshooting section