#!/bin/bash

# Script to connect K8s Optimization Platform to your real IBM Cloud cluster
# This will copy your kubeconfig into the backend container

set -e

echo "🔗 Connecting to Real Kubernetes Cluster"
echo "=========================================="
echo ""

# Step 1: Configure IBM Cloud CLI to get kubeconfig
echo "📋 Step 1: Configuring IBM Cloud cluster access..."
echo "Run this command to configure your cluster:"
echo ""
echo "  ibmcloud ks cluster config --cluster xforce-devops"
echo ""
read -p "Have you run this command? (y/n): " configured

if [ "$configured" != "y" ]; then
    echo "❌ Please run the IBM Cloud command first, then run this script again."
    exit 1
fi

# Step 2: Check if kubeconfig exists
echo ""
echo "📋 Step 2: Checking kubeconfig..."
if [ ! -f ~/.kube/config ]; then
    echo "❌ Kubeconfig not found at ~/.kube/config"
    echo "Please ensure IBM Cloud CLI configured the cluster correctly."
    exit 1
fi

echo "✅ Kubeconfig found at ~/.kube/config"

# Step 3: Create .kube directory in backend
echo ""
echo "📋 Step 3: Creating .kube directory in backend..."
mkdir -p backend/.kube

# Step 4: Copy kubeconfig
echo ""
echo "📋 Step 4: Copying kubeconfig to backend..."
cp ~/.kube/config backend/.kube/config
echo "✅ Kubeconfig copied to backend/.kube/config"

# Step 5: Update docker-compose.yml to mount kubeconfig
echo ""
echo "📋 Step 5: Checking docker-compose.yml configuration..."
if grep -q "/.kube/config" docker-compose.yml; then
    echo "✅ docker-compose.yml already configured for kubeconfig"
else
    echo "⚠️  docker-compose.yml needs to be updated to mount kubeconfig"
    echo "Add this to the backend service volumes:"
    echo "  - ./backend/.kube/config:/root/.kube/config:ro"
fi

# Step 6: Rebuild and restart backend
echo ""
echo "📋 Step 6: Rebuilding backend container..."
podman build -t k8s-opt-backend:latest -f backend/Dockerfile backend/

echo ""
echo "📋 Step 7: Restarting backend container..."
podman restart k8s-opt-backend

echo ""
echo "📋 Step 8: Waiting for backend to start..."
sleep 10

# Step 9: Test connection
echo ""
echo "📋 Step 9: Testing Kubernetes connection..."
echo ""

# Check backend logs for connection status
echo "Backend logs:"
podman logs k8s-opt-backend --tail 20 | grep -i "kubernetes\|cluster\|config" || true

echo ""
echo "Testing API endpoint..."
response=$(curl -s http://localhost:8000/api/clusters)

if echo "$response" | grep -q "xforce-devops\|prod-cluster-a"; then
    echo ""
    echo "✅ SUCCESS! Platform connected to real cluster!"
    echo ""
    echo "Cluster data:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
else
    echo ""
    echo "⚠️  Still showing dummy data. Check backend logs:"
    echo ""
    podman logs k8s-opt-backend --tail 50
fi

echo ""
echo "=========================================="
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Navigate to Clusters page"
echo "3. You should see your real cluster data!"
echo ""
echo "If you still see dummy data, check:"
echo "  - Backend logs: podman logs k8s-opt-backend"
echo "  - Kubeconfig: cat backend/.kube/config"
echo "  - Test kubectl: kubectl get nodes"
echo ""

# Made with Bob
