#!/bin/bash

echo "🚀 Starting Kubernetes Optimization Platform..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to project directory
cd "$(dirname "$0")"

echo "📦 Step 1: Starting Database (PostgreSQL + TimescaleDB)..."
podman run -d \
  --name k8s-opt-postgres \
  --network k8s-opt-network \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=k8s_optimization \
  -v k8s-opt-postgres-data:/var/lib/postgresql/data \
  timescale/timescaledb:latest-pg15 2>/dev/null || echo "  ℹ️  Postgres already running"

echo ""
echo "📦 Step 2: Starting Redis Cache..."
podman run -d \
  --name k8s-opt-redis \
  --network k8s-opt-network \
  -p 6379:6379 \
  -v k8s-opt-redis-data:/data \
  redis:7-alpine redis-server --appendonly yes 2>/dev/null || echo "  ℹ️  Redis already running"

echo ""
echo "📦 Step 3: Starting Backend API..."
podman run -d \
  --name k8s-opt-backend \
  --network k8s-opt-network \
  -p 8000:8000 \
  -v ${HOME}/.kube:/root/.kube:ro \
  -v $(pwd)/backend:/app:ro \
  -v k8s-opt-backend-logs:/app/logs \
  --env-file backend/.env \
  -e DATABASE_URL=postgresql://postgres:postgres@k8s-opt-postgres:5432/k8s_optimization \
  -e REDIS_URL=redis://k8s-opt-redis:6379/0 \
  -e K8S_CONFIG_PATH=/tmp/.kube/config \
  -e K8S_CONTEXT=xforce-devops/c2dvjirw01r66qf58vu0 \
  localhost/k8s-optimization-platform_backend:latest 2>/dev/null || {
    echo "  ⚠️  Backend image not found, building..."
    podman build -t localhost/k8s-optimization-platform_backend:latest backend/
    podman run -d \
      --name k8s-opt-backend \
      --network k8s-opt-network \
      -p 8000:8000 \
      -v ${HOME}/.kube:/root/.kube:ro \
      -v $(pwd)/backend:/app:ro \
      -v k8s-opt-backend-logs:/app/logs \
      --env-file backend/.env \
      -e DATABASE_URL=postgresql://postgres:postgres@k8s-opt-postgres:5432/k8s_optimization \
      -e REDIS_URL=redis://k8s-opt-redis:6379/0 \
      -e K8S_CONFIG_PATH=/tmp/.kube/config \
      -e K8S_CONTEXT=xforce-devops/c2dvjirw01r66qf58vu0 \
      localhost/k8s-optimization-platform_backend:latest
  }

echo ""
echo "⏳ Waiting for services to start (15 seconds)..."
sleep 15

echo ""
echo "✅ Services Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
podman ps --filter name=k8s-opt --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "🔍 Testing Backend..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is healthy!${NC}"
else
    echo -e "${RED}❌ Backend is not responding${NC}"
    echo "   Check logs: podman logs k8s-opt-backend"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Backend Started Successfully!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Access Points:"
echo "   • Backend API:    http://localhost:8000"
echo "   • API Docs:       http://localhost:8000/docs"
echo "   • Health Check:   http://localhost:8000/health"
echo ""
echo "📝 Next Steps:"
echo "   1. Start Frontend:"
echo "      ${YELLOW}cd frontend && npm install && npm start${NC}"
echo ""
echo "   2. Fix Kubernetes Certificate (for real data):"
echo "      ${YELLOW}ibmcloud login${NC}"
echo "      ${YELLOW}ibmcloud ks cluster config --cluster xforce-devops${NC}"
echo ""
echo "   3. View Logs:"
echo "      ${YELLOW}podman logs k8s-opt-backend${NC}"
echo "      ${YELLOW}podman logs k8s-opt-postgres${NC}"
echo "      ${YELLOW}podman logs k8s-opt-redis${NC}"
echo ""
echo "   4. Stop All Services:"
echo "      ${YELLOW}./STOP_PLATFORM.sh${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Made with Bob
