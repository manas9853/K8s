# Quick Start Guide - K8s Optimization Platform

## Prerequisites Fixed ✅

The `psycopg2-binary` error has been resolved. PostgreSQL@15 is now installed.

## Step-by-Step Setup

### 1. Run the Setup Script

```bash
cd k8s-optimization-platform
./start-dev.sh
```

This will:
- ✅ Start PostgreSQL container
- ✅ Start Redis container  
- ✅ Initialize database schema
- ✅ Create Python virtual environment
- ✅ Install all Python dependencies (with PostgreSQL support)
- ✅ Setup frontend dependencies

### 2. Start Backend (Terminal 1)

```bash
cd k8s-optimization-platform/backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

### 3. Start Frontend (Terminal 2)

```bash
cd k8s-optimization-platform/frontend
npm start
```

Browser will automatically open to http://localhost:3000

### 4. Verify Everything Works

**Check Backend:**
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-06-16T10:23:00.000Z",
  "version": "1.0.0"
}
```

**Check API Docs:**
Open http://localhost:8000/api/docs in your browser

**Check Database:**
```bash
podman exec -it k8s-opt-postgres psql -U postgres -d k8s_optimization -c "\dt"
```

You should see all the tables listed.

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | React UI |
| Backend API | http://localhost:8000 | FastAPI backend |
| API Docs | http://localhost:8000/api/docs | Interactive API documentation |
| PostgreSQL | localhost:5432 | Database (user: postgres, pass: postgres) |
| Redis | localhost:6379 | Cache & queue |

## Common Issues & Solutions

### Issue: "psycopg2-binary" build error
**Solution:** Already fixed! PostgreSQL@15 is installed and PATH is configured in start-dev.sh

### Issue: Port already in use
**Solution:**
```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9  # Backend
lsof -ti:3000 | xargs kill -9  # Frontend
lsof -ti:5432 | xargs kill -9  # PostgreSQL
```

### Issue: Container won't start
**Solution:**
```bash
# Check logs
podman logs k8s-opt-postgres
podman logs k8s-opt-redis

# Restart containers
podman restart k8s-opt-postgres k8s-opt-redis
```

### Issue: Database connection failed
**Solution:**
```bash
# Wait for PostgreSQL to be ready
podman exec k8s-opt-postgres pg_isready -U postgres

# If not ready, restart
podman restart k8s-opt-postgres
sleep 5
```

### Issue: Frontend won't start
**Solution:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

## Stop Services

```bash
# Stop containers
podman stop k8s-opt-postgres k8s-opt-redis

# Stop backend (Ctrl+C in terminal)
# Stop frontend (Ctrl+C in terminal)
```

## Remove Everything

```bash
# Remove containers
podman rm -f k8s-opt-postgres k8s-opt-redis

# Remove volumes (WARNING: deletes all data)
podman volume rm k8s-optimization-network_postgres_data
podman volume rm k8s-optimization-network_redis_data

# Remove virtual environment
rm -rf backend/venv

# Remove node modules
rm -rf frontend/node_modules
```

## Next Steps

Once everything is running:

1. **Explore the API**: http://localhost:8000/api/docs
2. **Read Implementation Guide**: See IMPLEMENTATION_GUIDE.md
3. **Start Development**: Follow the 7-phase roadmap
4. **Implement Features**: Start with Phase 1 (Core Infrastructure)

## Development Workflow

```bash
# 1. Make changes to backend code
# Backend auto-reloads (--reload flag)

# 2. Make changes to frontend code  
# Frontend auto-reloads (React hot reload)

# 3. Test your changes
curl http://localhost:8000/api/v1/clusters

# 4. Check logs
# Backend: See terminal output
# Frontend: See browser console
# Database: podman logs k8s-opt-postgres
```

## Useful Commands

```bash
# View running containers
podman ps

# View all containers (including stopped)
podman ps -a

# Check container logs
podman logs k8s-opt-postgres
podman logs k8s-opt-redis

# Execute commands in container
podman exec -it k8s-opt-postgres psql -U postgres -d k8s_optimization

# Check Python packages
cd backend && source venv/bin/activate && pip list

# Check npm packages
cd frontend && npm list --depth=0
```

## Ready to Build! 🚀

Your development environment is now fully set up. Start implementing the 24 features following the IMPLEMENTATION_GUIDE.md!