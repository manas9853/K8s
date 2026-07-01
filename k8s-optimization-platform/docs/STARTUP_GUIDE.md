# Kubernetes Optimization Platform - Startup Guide

## Prerequisites Checklist

✅ **Completed:**
- Python 3.11 installed (NOT 3.14)
- PostgreSQL 15 installed via Homebrew
- Node.js and npm installed
- Podman installed (Docker alternative)
- python-json-logger installed
- TypeScript downgraded to 4.9.5

## Quick Start

### 1. Start Database (PostgreSQL + TimescaleDB)

```bash
cd k8s-optimization-platform
podman-compose up -d
```

Wait for database to be ready (~30 seconds).

### 2. Initialize Database Schema

```bash
cd database/schemas
psql -h localhost -U postgres -d k8s_optimization -f schema.sql
```

Password: `postgres`

### 3. Start Backend API

```bash
cd backend
source venv/bin/activate  # Activate virtual environment
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: http://localhost:8000
API Documentation: http://localhost:8000/docs

### 4. Start Frontend (New Terminal)

```bash
cd frontend
npm start
```

Frontend will be available at: http://localhost:3000

## Verification Steps

### Check Backend Health
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-06-16T10:37:00Z"
}
```

### Check Database Connection
```bash
curl http://localhost:8000/api/v1/clusters
```

### Check Frontend
Open browser: http://localhost:3000

## Troubleshooting

### Backend Issues

**Issue: ModuleNotFoundError**
```bash
cd backend
pip install -r requirements.txt
```

**Issue: Database connection failed**
```bash
# Check if PostgreSQL is running
podman ps

# Restart database
podman-compose down
podman-compose up -d
```

**Issue: Port 8000 already in use**
```bash
# Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>
```

### Frontend Issues

**Issue: npm install fails**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**Issue: Port 3000 already in use**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

**Issue: TypeScript errors**
- Already fixed by downgrading to TypeScript 4.9.5
- If issues persist, run: `npm install --legacy-peer-deps`

### Database Issues

**Issue: TimescaleDB extension not found**
```bash
# Connect to database
psql -h localhost -U postgres -d k8s_optimization

# Create extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

**Issue: Schema not loaded**
```bash
cd database/schemas
psql -h localhost -U postgres -d k8s_optimization -f schema.sql
```

## Development Workflow

### 1. Make Backend Changes
- Edit files in `backend/`
- FastAPI auto-reloads on file changes
- Check logs in terminal

### 2. Make Frontend Changes
- Edit files in `frontend/src/`
- React auto-reloads on file changes
- Check browser console for errors

### 3. Database Changes
- Edit `database/schemas/schema.sql`
- Apply changes:
```bash
psql -h localhost -U postgres -d k8s_optimization -f schema.sql
```

### 4. Add New API Endpoint
1. Create router in `backend/api/`
2. Add router to `backend/main.py`
3. Test at http://localhost:8000/docs

### 5. Add New Frontend Page
1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Add navigation in `frontend/src/components/Layout.tsx`

## Environment Variables

### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your settings:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/k8s_optimization
REDIS_URL=redis://localhost:6379
DEBUG=true
LOG_LEVEL=INFO
```

### Frontend (.env)
```bash
cd frontend
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

## Useful Commands

### Backend
```bash
# Run tests
cd backend
pytest

# Format code
black .
isort .

# Lint code
flake8 .
mypy .

# Generate API client
cd backend
python -m fastapi_codegen
```

### Frontend
```bash
# Run tests
cd frontend
npm test

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Database
```bash
# Backup database
pg_dump -h localhost -U postgres k8s_optimization > backup.sql

# Restore database
psql -h localhost -U postgres -d k8s_optimization < backup.sql

# Connect to database
psql -h localhost -U postgres -d k8s_optimization

# List tables
\dt

# Describe table
\d clusters
```

## Next Steps

1. ✅ Start all services
2. ✅ Verify health checks
3. 🔄 Implement cluster discovery
4. 🔄 Build dashboards
5. 🔄 Implement recommendations engine
6. 🔄 Add AI features

## Support

For issues or questions:
1. Check logs in terminal
2. Check browser console (F12)
3. Review API docs: http://localhost:8000/docs
4. Check database logs: `podman logs k8s-optimization-platform-postgres-1`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│                   http://localhost:3000                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend API (FastAPI)                      │
│                   http://localhost:8000                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL + TimescaleDB)             │
│                   localhost:5432                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Metrics
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Kubernetes Clusters                         │
│              (Production, Staging, QA, Dev)                  │
└─────────────────────────────────────────────────────────────┘
```

## Performance Tips

1. **Backend**: Use async/await for database queries
2. **Frontend**: Use React.memo() for expensive components
3. **Database**: Create indexes on frequently queried columns
4. **API**: Enable response caching with Redis
5. **Frontend**: Use code splitting with React.lazy()

## Security Checklist

- [ ] Change default database password
- [ ] Enable HTTPS in production
- [ ] Add authentication/authorization
- [ ] Validate all user inputs
- [ ] Use environment variables for secrets
- [ ] Enable CORS only for trusted origins
- [ ] Add rate limiting
- [ ] Enable SQL injection protection
- [ ] Add request logging
- [ ] Use secure session management

## Production Deployment

See `DEPLOYMENT_GUIDE.md` for production deployment instructions.