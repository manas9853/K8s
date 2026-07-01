#!/bin/bash

# Quick script to connect to real Kubernetes cluster

set -e

echo "=========================================="
echo "Connect to Real Kubernetes Cluster"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: Run this from k8s-optimization-platform directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Configuring IBM Cloud Kubernetes cluster...${NC}"
echo "Running: ibmcloud ks cluster config --cluster xforce-devops"
echo ""

if ibmcloud ks cluster config --cluster xforce-devops; then
    echo -e "${GREEN}✓ Cluster configured successfully${NC}"
else
    echo -e "${RED}✗ Failed to configure cluster${NC}"
    echo ""
    echo "Please ensure:"
    echo "1. You're logged in: ibmcloud login"
    echo "2. Cluster name is correct: xforce-devops"
    echo "3. You have access to the cluster"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Verifying kubectl connection...${NC}"
if kubectl get nodes > /dev/null 2>&1; then
    echo -e "${GREEN}✓ kubectl can access cluster${NC}"
    echo ""
    kubectl get nodes
else
    echo -e "${RED}✗ kubectl cannot access cluster${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Copying kubeconfig to backend...${NC}"

# Create .kube directory if it doesn't exist
mkdir -p backend/.kube

# Copy kubeconfig
if [ -f ~/.kube/config ]; then
    cp ~/.kube/config backend/.kube/config
    echo -e "${GREEN}✓ Kubeconfig copied to backend/.kube/config${NC}"
else
    echo -e "${RED}✗ Kubeconfig not found at ~/.kube/config${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 4: Restarting backend to load new config...${NC}"
podman-compose restart backend

echo ""
echo "Waiting for backend to start..."
sleep 5

echo ""
echo -e "${YELLOW}Step 5: Checking backend logs...${NC}"
podman logs k8s-opt-backend --tail 20

echo ""
echo -e "${YELLOW}Step 6: Testing API with real data...${NC}"
echo ""

# Test clusters endpoint
echo "Testing /api/clusters endpoint..."
if curl -s http://localhost:8000/api/clusters | grep -q "xforce-devops"; then
    echo -e "${GREEN}✓ API returning real cluster data!${NC}"
else
    echo -e "${YELLOW}⚠ API may still be using dummy data${NC}"
    echo "Check backend logs: podman logs k8s-opt-backend"
fi

echo ""
echo "Testing /api/dashboard endpoint..."
curl -s http://localhost:8000/api/dashboard | head -20

echo ""
echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Open dashboard: http://localhost:3000"
echo "2. Refresh the page to see real data"
echo "3. Check that cluster name shows 'xforce-devops'"
echo "4. Verify node/pod counts match your cluster"
echo ""
echo "To verify real data:"
echo "  curl http://localhost:8000/api/clusters | jq"
echo "  curl http://localhost:8000/api/dashboard | jq"
echo ""
echo "To check backend logs:"
echo "  podman logs -f k8s-opt-backend"
echo ""

# Made with Bob
