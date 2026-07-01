#!/bin/bash

# Kubernetes Optimization Platform - Docker Compose Startup Script
# This script starts all services using Docker Compose with Kubernetes integration

set -e

echo "🚀 Starting Kubernetes Optimization Platform with Docker Compose..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"

# Check if kubectl is configured
if ! kubectl cluster-info > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Warning: kubectl is not configured or cluster is not accessible${NC}"
    echo "The platform will start but won't be able to connect to Kubernetes"
    echo "To fix this, configure kubectl and restart the services"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ kubectl is configured${NC}"
    CURRENT_CONTEXT=$(kubectl config current-context)
    echo "   Current context: $CURRENT_CONTEXT"
    
    # Ask if user wants to use this context
    read -p "Use this context? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Available contexts:"
        kubectl config get-contexts
        echo ""
        read -p "Enter context name: " CONTEXT_NAME
        export K8S_CONTEXT=$CONTEXT_NAME
        echo "Using context: $K8S_CONTEXT"
    else
        export K8S_CONTEXT=$CURRENT_CONTEXT
    fi
fi

echo ""
echo "📦 Stopping any existing containers..."
docker-compose down 2>/dev/null || true

echo ""
echo "🔨 Building and starting services..."
docker-compose up -d --build

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for backend to be healthy
echo "   Checking backend..."
for i in {1..30}; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Backend is healthy${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}   ❌ Backend failed to start${NC}"
        echo "   Check logs with: docker-compose logs backend"
        exit 1
    fi
    sleep 2
done

# Wait for frontend to be healthy
echo "   Checking frontend..."
for i in {1..30}; do
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Frontend is healthy${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}   ⚠️  Frontend may still be starting${NC}"
        break
    fi
    sleep 2
done

# Check Kubernetes connection
echo ""
echo "🔍 Testing Kubernetes connection..."
CLUSTER_RESPONSE=$(curl -s http://localhost:8000/api/v1/clusters/ || echo "error")

if echo "$CLUSTER_RESPONSE" | grep -q "error\|503\|Kubernetes not configured"; then
    echo -e "${YELLOW}⚠️  Kubernetes connection not available${NC}"
    echo "   The platform is running but can't connect to Kubernetes"
    echo "   See DOCKER_COMPOSE_GUIDE.md for troubleshooting"
else
    echo -e "${GREEN}✅ Kubernetes connection successful${NC}"
    echo "   Connected to cluster"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Kubernetes Optimization Platform is running!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Access the platform:"
echo "   Frontend:    http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs:    http://localhost:8000/docs"
echo "   Grafana:     http://localhost:3001 (admin/admin)"
echo "   Prometheus:  http://localhost:9090"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker-compose logs -f"
echo "   View backend:     docker-compose logs -f backend"
echo "   Stop services:    docker-compose down"
echo "   Restart:          docker-compose restart"
echo ""
echo "📚 Documentation:"
echo "   Docker Guide:     cat DOCKER_COMPOSE_GUIDE.md"
echo "   K8s Integration:  cat KUBERNETES_INTEGRATION_GUIDE.md"
echo ""
echo "🔧 Troubleshooting:"
echo "   If Kubernetes connection fails:"
echo "   1. Check kubectl: kubectl get nodes"
echo "   2. Check logs: docker-compose logs backend | grep -i kubernetes"
echo "   3. Restart: docker-compose restart backend"
echo ""
echo "Press Ctrl+C to stop following logs, or run 'docker-compose logs -f' to view them"
echo ""

# Follow logs
docker-compose logs -f

# Made with Bob
