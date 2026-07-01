#!/bin/bash

# Kubernetes Integration Setup Script
# This script helps you quickly integrate your Kubernetes clusters

set -e

echo "=========================================="
echo "Kubernetes Integration Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    echo "Please install kubectl first: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

echo -e "${GREEN}✓ kubectl is installed${NC}"

# Check cluster connectivity
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
    echo "Please configure kubectl first:"
    echo "  kubectl config view"
    echo "  kubectl config use-context <context-name>"
    exit 1
fi

echo -e "${GREEN}✓ Connected to Kubernetes cluster${NC}"
echo ""

# Get cluster info
CLUSTER_NAME=$(kubectl config current-context)
echo "Current cluster: ${CLUSTER_NAME}"
echo ""

# Show available contexts
echo "Available contexts:"
kubectl config get-contexts
echo ""

# Ask user for configuration
read -p "Use current context '${CLUSTER_NAME}'? (y/n): " use_current

if [ "$use_current" = "y" ] || [ "$use_current" = "Y" ]; then
    CONTEXT_NAME=$CLUSTER_NAME
else
    read -p "Enter context name: " CONTEXT_NAME
fi

# Get kubeconfig path
KUBECONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"
echo "Using kubeconfig: $KUBECONFIG_PATH"
echo ""

# Update backend .env
ENV_FILE="backend/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file from .env.example..."
    cp backend/.env.example "$ENV_FILE"
fi

# Update Kubernetes configuration
echo "Updating $ENV_FILE..."

# Use sed to update or add K8S configuration
if grep -q "K8S_IN_CLUSTER=" "$ENV_FILE"; then
    sed -i.bak "s|K8S_IN_CLUSTER=.*|K8S_IN_CLUSTER=false|" "$ENV_FILE"
else
    echo "K8S_IN_CLUSTER=false" >> "$ENV_FILE"
fi

if grep -q "K8S_CONFIG_PATH=" "$ENV_FILE"; then
    sed -i.bak "s|K8S_CONFIG_PATH=.*|K8S_CONFIG_PATH=$KUBECONFIG_PATH|" "$ENV_FILE"
else
    echo "K8S_CONFIG_PATH=$KUBECONFIG_PATH" >> "$ENV_FILE"
fi

if grep -q "K8S_CONTEXT=" "$ENV_FILE"; then
    sed -i.bak "s|K8S_CONTEXT=.*|K8S_CONTEXT=$CONTEXT_NAME|" "$ENV_FILE"
else
    echo "K8S_CONTEXT=$CONTEXT_NAME" >> "$ENV_FILE"
fi

# Clean up backup file
rm -f "$ENV_FILE.bak"

echo -e "${GREEN}✓ Configuration updated${NC}"
echo ""

# Install kubernetes Python package
echo "Installing Kubernetes Python client..."
cd backend
if [ -d "venv" ]; then
    source venv/bin/activate
    pip install kubernetes
else
    echo -e "${YELLOW}Warning: Virtual environment not found${NC}"
    echo "Please run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
fi
cd ..

echo ""
echo -e "${GREEN}✓ Kubernetes integration configured!${NC}"
echo ""
echo "Configuration:"
echo "  Cluster: $CONTEXT_NAME"
echo "  Kubeconfig: $KUBECONFIG_PATH"
echo "  In-cluster: false"
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "  2. Test connection: curl http://localhost:8000/api/v1/clusters/list"
echo "  3. Open frontend: http://localhost:3000"
echo ""
echo "For detailed instructions, see: KUBERNETES_INTEGRATION_GUIDE.md"
echo ""

# Made with Bob