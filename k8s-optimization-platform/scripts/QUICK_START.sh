#!/bin/bash

# Kubernetes Optimization Platform - Quick Start Script
# This script helps you start all services quickly

set -e

echo "🚀 Kubernetes Optimization Platform - Quick Start"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "Please run this script from the k8s-optimization-platform directory"
    exit 1
fi

print_info "Step 1: Checking prerequisites..."

# Check Python version
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    if [ "$PYTHON_VERSION" == "3.11" ]; then
        print_success "Python 3.11 found"
    else
        print_error "Python 3.11 required, found $PYTHON_VERSION"
        print_info "Please install Python 3.11"
        exit 1
    fi
else
    print_error "Python 3 not found"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    print_success "Node.js found: $(node --version)"
else
    print_error "Node.js not found"
    exit 1
fi

# Check Podman or Docker
if command -v podman &> /dev/null; then
    CONTAINER_CMD="podman"
    COMPOSE_CMD="podman-compose"
    print_success "Podman found"
elif command -v docker &> /dev/null; then
    CONTAINER_CMD="docker"
    COMPOSE_CMD="docker-compose"
    print_success "Docker found"
else
    print_error "Neither Podman nor Docker found"
    exit 1
fi

echo ""
print_info "Step 2: Starting PostgreSQL database..."

# Start database
$COMPOSE_CMD up -d

# Wait for database to be ready
print_info "Waiting for database to be ready (30 seconds)..."
sleep 30

# Check if database is running
if $CONTAINER_CMD ps | grep -q postgres; then
    print_success "Database is running"
else
    print_error "Database failed to start"
    exit 1
fi

echo ""
print_info "Step 3: Initializing database schema..."

# Initialize database
if [ -f "database/schemas/schema.sql" ]; then
    PGPASSWORD=postgres psql -h localhost -U postgres -d k8s_optimization -f database/schemas/schema.sql 2>/dev/null
    if [ $? -eq 0 ]; then
        print_success "Database schema initialized"
    else
        print_error "Failed to initialize database schema"
        print_info "You may need to run this manually:"
        print_info "psql -h localhost -U postgres -d k8s_optimization -f database/schemas/schema.sql"
    fi
else
    print_error "Schema file not found"
fi

echo ""
print_info "Step 4: Setting up backend..."

cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    print_info "Creating virtual environment..."
    python3 -m venv venv
    print_success "Virtual environment created"
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
if ! python -c "import fastapi" 2>/dev/null; then
    print_info "Installing backend dependencies..."
    pip install -r requirements.txt > /dev/null 2>&1
    print_success "Backend dependencies installed"
else
    print_success "Backend dependencies already installed"
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    print_info "Creating .env file..."
    cp .env.example .env
    print_success ".env file created"
fi

cd ..

echo ""
print_info "Step 5: Setting up frontend..."

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_info "Installing frontend dependencies (this may take a few minutes)..."
    npm install --legacy-peer-deps > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        print_success "Frontend dependencies installed"
    else
        print_error "Failed to install frontend dependencies"
        print_info "Please run manually: cd frontend && npm install --legacy-peer-deps"
    fi
else
    print_success "Frontend dependencies already installed"
fi

cd ..

echo ""
echo "=================================================="
print_success "Setup complete!"
echo "=================================================="
echo ""
echo "To start the services:"
echo ""
echo "1. Start Backend (Terminal 1):"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   uvicorn main:app --reload"
echo ""
echo "2. Start Frontend (Terminal 2):"
echo "   cd frontend"
echo "   npm start"
echo ""
echo "3. Access the application:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "For more information, see:"
echo "   - STARTUP_GUIDE.md"
echo "   - README.md"
echo "   - PROJECT_STATUS.md"
echo ""

# Made with Bob
