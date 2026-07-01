#!/bin/bash

# Kubernetes Optimization Platform - Development Startup Script
# For macOS with Podman

set -e

echo "🚀 Starting K8s Optimization Platform (Development Mode)"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if podman is installed
if ! command -v podman &> /dev/null; then
    echo -e "${RED}❌ Podman is not installed. Please install it first:${NC}"
    echo "   brew install podman"
    exit 1
fi

# Function to check if container is running
container_running() {
    podman ps --format "{{.Names}}" | grep -q "^$1$"
}

# Function to wait for service
wait_for_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}⏳ Waiting for $service to be ready...${NC}"
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost $port 2>/dev/null; then
            echo -e "${GREEN}✅ $service is ready!${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    echo -e "${RED}❌ $service failed to start${NC}"
    return 1
}

# 1. Start PostgreSQL
echo ""
echo "📦 Starting PostgreSQL + TimescaleDB..."
if container_running "k8s-opt-postgres"; then
    echo -e "${GREEN}✅ PostgreSQL already running${NC}"
else
    podman run -d \
        --name k8s-opt-postgres \
        -e POSTGRES_DB=k8s_optimization \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -p 5432:5432 \
        timescale/timescaledb:latest-pg15
    
    wait_for_service "PostgreSQL" 5432
    
    # Initialize database
    echo "🔧 Initializing database schema..."
    sleep 2
    podman cp database/schemas/schema.sql k8s-opt-postgres:/tmp/schema.sql
    podman exec k8s-opt-postgres psql -U postgres -d k8s_optimization -f /tmp/schema.sql
    echo -e "${GREEN}✅ Database initialized${NC}"
fi

# 2. Start Redis
echo ""
echo "📦 Starting Redis..."
if container_running "k8s-opt-redis"; then
    echo -e "${GREEN}✅ Redis already running${NC}"
else
    podman run -d \
        --name k8s-opt-redis \
        -p 6379:6379 \
        redis:7-alpine
    
    wait_for_service "Redis" 6379
fi

# 3. Setup Backend
echo ""
echo "🐍 Setting up Backend..."
cd backend

# Add PostgreSQL to PATH for psycopg2 compilation
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
export LDFLAGS="-L/opt/homebrew/opt/postgresql@15/lib"
export CPPFLAGS="-I/opt/homebrew/opt/postgresql@15/include"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
fi

echo -e "${GREEN}✅ Backend setup complete${NC}"

# 4. Setup Frontend
echo ""
echo "⚛️  Setting up Frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

echo -e "${GREEN}✅ Frontend setup complete${NC}"

# Summary
echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo "=================================================="
echo ""
echo "Services Status:"
echo "  ✅ PostgreSQL: http://localhost:5432"
echo "  ✅ Redis: http://localhost:6379"
echo ""
echo "To start the application:"
echo ""
echo "  1. Start Backend (Terminal 1):"
echo "     cd backend"
echo "     source venv/bin/activate"
echo "     uvicorn main:app --reload"
echo ""
echo "  2. Start Frontend (Terminal 2):"
echo "     cd frontend"
echo "     npm start"
echo ""
echo "Then access:"
echo "  🌐 Frontend: http://localhost:3000"
echo "  🔧 Backend API: http://localhost:8000"
echo "  📚 API Docs: http://localhost:8000/api/docs"
echo ""
echo "To stop services:"
echo "  podman stop k8s-opt-postgres k8s-opt-redis"
echo ""
echo "To remove services:"
echo "  podman rm -f k8s-opt-postgres k8s-opt-redis"
echo ""

# Made with Bob
