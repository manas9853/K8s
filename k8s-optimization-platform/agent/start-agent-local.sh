#!/bin/bash

# Start Agent Locally Script
# This script starts the K8s Optimization Agent locally for development/testing

set -e

echo "=========================================="
echo "Starting K8s Optimization Agent Locally"
echo "=========================================="
echo ""

# Check if platform is running
echo "Checking if platform backend is running..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ ERROR: Platform backend is not running on localhost:8000"
    echo ""
    echo "Please start the platform first:"
    echo "  cd k8s-optimization-platform"
    echo "  ./scripts/START_PLATFORM.sh"
    echo ""
    exit 1
fi
echo "✅ Platform backend is running"
echo ""

# Check if kubectl is configured
echo "Checking Kubernetes access..."
if ! kubectl get nodes > /dev/null 2>&1; then
    echo "❌ ERROR: Cannot access Kubernetes cluster"
    echo ""
    echo "Please configure kubectl access:"
    echo "  ibmcloud ks cluster config --cluster dns-pipeline"
    echo ""
    exit 1
fi

CLUSTER_NAME=$(kubectl config current-context | sed 's/.*\///')
NODE_COUNT=$(kubectl get nodes --no-headers | wc -l | tr -d ' ')
echo "✅ Connected to cluster: $CLUSTER_NAME ($NODE_COUNT nodes)"
echo ""

# Set environment variables
export PLATFORM_URL="http://localhost:8000"
export API_TOKEN="a10e5cecf5d5f0eb8a27dd61966b0bb7fb63c8734e87fe198d61835be5a9a90c"
export CLUSTER_NAME="dns-pipeline"
export ENVIRONMENT="production"
export COLLECTION_INTERVAL="30"

echo "Environment Configuration:"
echo "  PLATFORM_URL: $PLATFORM_URL"
echo "  CLUSTER_NAME: $CLUSTER_NAME"
echo "  ENVIRONMENT: $ENVIRONMENT"
echo "  COLLECTION_INTERVAL: ${COLLECTION_INTERVAL}s"
echo ""

# Setup virtual environment if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
    echo ""
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo "✅ Virtual environment activated"
echo ""

# Check if dependencies are installed
echo "Checking Python dependencies..."
if ! python3 -c "import kubernetes" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
    echo ""
fi
echo "✅ Dependencies installed"
echo ""

echo "=========================================="
echo "Starting Agent..."
echo "=========================================="
echo ""
echo "The agent will:"
echo "  1. Register with platform at http://localhost:8000"
echo "  2. Collect metrics from cluster: $CLUSTER_NAME"
echo "  3. Send metrics every ${COLLECTION_INTERVAL} seconds"
echo ""
echo "View dashboard at: http://localhost:3000"
echo "Navigate to: Operations > Clusters > Cluster Health"
echo ""
echo "Press Ctrl+C to stop the agent"
echo ""
echo "=========================================="
echo ""

# Run the agent
python3 agent.py

# Made with Bob
