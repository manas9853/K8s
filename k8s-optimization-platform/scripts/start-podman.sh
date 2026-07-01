#!/bin/bash

echo "🚀 Starting K8s Optimization Platform with Podman..."

# Create network if it doesn't exist
podman network create k8s-opt-network 2>/dev/null || true

# Stop and remove existing containers
echo "Cleaning up existing containers..."
podman stop k8s-opt-postgres k8s-opt-redis k8s-opt-backend k8s-opt-frontend 2>/dev/null || true
podman rm k8s-opt-postgres k8s-opt-redis k8s-opt-backend k8s-opt-frontend 2>/dev/null || true

# Start PostgreSQL
echo "Starting PostgreSQL..."
podman run -d \
  --name k8s-opt-postgres \
  --network k8s-opt-network \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=k8s_optimization \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  docker.io/timescale/timescaledb:latest-pg15

# Start Redis
echo "Starting Redis..."
podman run -d \
  --name k8s-opt-redis \
  --network k8s-opt-network \
  -p 6379:6379 \
  -v redis_data:/data \
  docker.io/redis:7-alpine

# Wait for databases
echo "Waiting for databases to be ready..."
sleep 10

# Build and start Backend
echo "Building Backend..."
cd backend
podman build -t k8s-opt-backend .
echo "Starting Backend..."
podman run -d \
  --name k8s-opt-backend \
  --network k8s-opt-network \
  -p 8000:8000 \
  -v $(pwd):/app \
  -e DATABASE_URL=postgresql://postgres:postgres@k8s-opt-postgres:5432/k8s_optimization \
  -e REDIS_URL=redis://k8s-opt-redis:6379/0 \
  -e DEBUG=true \
  k8s-opt-backend

cd ..

# Build and start Frontend
echo "Building Frontend..."
cd frontend
podman build -t k8s-opt-frontend .
echo "Starting Frontend..."
podman run -d \
  --name k8s-opt-frontend \
  --network k8s-opt-network \
  -p 3000:3000 \
  -v $(pwd)/src:/app/src \
  -e REACT_APP_API_URL=http://localhost:8000 \
  k8s-opt-frontend

cd ..

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Access the platform:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "📝 Check container status:"
echo "   podman ps"
echo ""
echo "📋 View logs:"
echo "   podman logs k8s-opt-backend"
echo "   podman logs k8s-opt-frontend"
echo ""

# Made with Bob
