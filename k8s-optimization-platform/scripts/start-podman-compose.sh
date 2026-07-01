#!/bin/bash

# Kubernetes Optimization Platform - Podman Compose Startup Script
# This script starts all services using Podman Compose with Kubernetes integration

set -e

echo "🚀 Starting Kubernetes Optimization Platform with Podman Compose..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if podman is running
if ! podman info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Podman is not running or not installed${NC}"
    echo "Please install/start Podman and try again"
    exit 1
fi

echo -e "${GREEN}✅ Podman is running${NC}"

# Check if podman-compose is installed
if ! command -v podman-compose &> /dev/null; then
    echo -e "${RED}❌ Error: podman-compose is not installed${NC}"
    echo "Install with: pip3 install podman-compose"
    exit 1
fi

echo -e "${GREEN}✅ podman-compose is installed${NC}"

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
podman-compose down 2>/dev/null || true

echo ""
echo "🔨 Building and starting services with Podman..."
podman-compose up -d --build

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Wait for backend to be healthy
echo "   Checking backend..."
for i in {1..30}; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Backend is healthy${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}   ❌ Backend failed to start${NC}"
        echo "   Check logs with: podman-compose logs backend"
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
    echo "   See PODMAN_COMPOSE_GUIDE.md for troubleshooting"
else
    echo -e "${GREEN}✅ Kubernetes connection successful${NC}"
    echo "   Connected to cluster"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Kubernetes Optimization Platform is running with Podman!${NC}"
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
echo "   View logs:        podman-compose logs -f"
echo "   View backend:     podman-compose logs -f backend"
echo "   Stop services:    podman-compose down"
echo "   Restart:          podman-compose restart"
echo "   List containers:  podman ps"
echo ""
echo "📚 Documentation:"
echo "   Podman Guide:     cat PODMAN_COMPOSE_GUIDE.md"
echo "   K8s Integration:  cat KUBERNETES_INTEGRATION_GUIDE.md"
echo ""
echo "🔧 Troubleshooting:"
echo "   If Kubernetes connection fails:"
echo "   1. Check kubectl: kubectl get nodes"
echo "   2. Check logs: podman-compose logs backend | grep -i kubernetes"
echo "   3. Restart: podman-compose restart backend"
echo "   4. Check kubeconfig: ls -la ~/.kube/config"
echo ""
echo "Press Ctrl+C to stop following logs, or run 'podman-compose logs -f' to view them"
echo ""

# Follow logs
podman-compose logs -f

# Made with Bob
