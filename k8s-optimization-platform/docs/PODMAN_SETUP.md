# Podman Setup Guide for K8s Optimization Platform

## Issue: Docker Credential Helper Error

The error you're seeing is related to Docker Desktop credential helper not being available in Podman.

## Solution Options

### Option 1: Use Podman Directly (Recommended for macOS)

Instead of using docker-compose, use podman-compose or run containers individually:

```bash
# Install podman-compose if not already installed
brew install podman-compose

# Start services with podman-compose
cd k8s-optimization-platform
podman-compose up -d
```

### Option 2: Fix Docker Credential Helper

Remove the Docker credential helper configuration:

```bash
# Edit or create ~/.docker/config.json
mkdir -p ~/.docker
cat > ~/.docker/config.json << 'EOF'
{
  "auths": {}
}
EOF
```

Then try again:
```bash
podman compose up -d
```

### Option 3: Start Services Individually (Quick Start)

For development, you can start just the essential services:

#### 1. Start PostgreSQL
```bash
podman run -d \
  --name k8s-opt-postgres \
  -e POSTGRES_DB=k8s_optimization \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg15
```

#### 2. Start Redis
```bash
podman run -d \
  --name k8s-opt-redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### 3. Initialize Database
```bash
# Wait a few seconds for PostgreSQL to start
sleep 5

# Copy schema file
podman cp database/schemas/schema.sql k8s-opt-postgres:/tmp/schema.sql

# Execute schema
podman exec k8s-opt-postgres psql -U postgres -d k8s_optimization -f /tmp/schema.sql
```

#### 4. Start Backend (Development Mode)
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env to use localhost instead of container names
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/k8s_optimization
# REDIS_URL=redis://localhost:6379/0

# Run backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 5. Start Frontend (Development Mode)
```bash
# In a new terminal
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

### Option 4: Simplified Docker Compose (No Build)

Create a minimal docker-compose file for just databases:

```bash
cat > docker-compose-minimal.yml << 'EOF'
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    container_name: k8s-opt-postgres
    environment:
      POSTGRES_DB: k8s_optimization
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schemas:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    container_name: k8s-opt-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF

# Start minimal services
podman compose -f docker-compose-minimal.yml up -d
```

Then run backend and frontend locally as shown in Option 3.

## Recommended Development Setup

For macOS with Podman, I recommend **Option 3** (Individual Services):

1. **Databases in containers** (PostgreSQL + Redis)
2. **Backend running locally** (easier debugging, hot reload)
3. **Frontend running locally** (faster development)

This gives you:
- ✅ Fast development cycle
- ✅ Easy debugging
- ✅ No credential issues
- ✅ Full control over each service

## Quick Start Commands

```bash
# 1. Start databases
podman run -d --name k8s-opt-postgres \
  -e POSTGRES_DB=k8s_optimization \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg15

podman run -d --name k8s-opt-redis \
  -p 6379:6379 \
  redis:7-alpine

# 2. Initialize database
sleep 5
podman cp database/schemas/schema.sql k8s-opt-postgres:/tmp/schema.sql
podman exec k8s-opt-postgres psql -U postgres -d k8s_optimization -f /tmp/schema.sql

# 3. Start backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload

# 4. Start frontend (in new terminal)
cd frontend
npm install
npm start
```

## Verify Setup

```bash
# Check containers
podman ps

# Check backend
curl http://localhost:8000/health

# Check frontend
open http://localhost:3000

# Check database
podman exec -it k8s-opt-postgres psql -U postgres -d k8s_optimization -c "\dt"
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port
lsof -ti:5432 | xargs kill -9
lsof -ti:6379 | xargs kill -9
```

### Container Won't Start
```bash
# Check logs
podman logs k8s-opt-postgres
podman logs k8s-opt-redis

# Remove and recreate
podman rm -f k8s-opt-postgres k8s-opt-redis
# Then run the start commands again
```

### Database Connection Failed
```bash
# Verify PostgreSQL is ready
podman exec k8s-opt-postgres pg_isready -U postgres

# Test connection
podman exec -it k8s-opt-postgres psql -U postgres -d k8s_optimization
```

## Next Steps

Once services are running:

1. Access API documentation: http://localhost:8000/api/docs
2. Access frontend: http://localhost:3000
3. Start implementing features from IMPLEMENTATION_GUIDE.md
4. Use the existing cluster data from your current directory

Good luck! 🚀