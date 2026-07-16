# K8s Optimization Platform — Deployment Guide

Everything needed to deploy this platform from scratch on any Linux server.
All persistent data lives in **Supabase** (Postgres) and **Upstash** (Redis) —
deleting the server loses nothing except the running process.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Firebase Hosting                                        │
│  https://k8s-6d5ba.web.app  ← frontend (React)         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS  (API_BASE_URL)
┌────────────────────────▼────────────────────────────────┐
│  Your Server  (any cloud VM)                            │
│  ┌───────────┐  ┌────────────────────────────────────┐  │
│  │  Nginx    │  │  Docker Compose                    │  │
│  │  :80/:443 ├──►  backend   :8000  (FastAPI)        │  │
│  └───────────┘  │  worker    (Celery)                │  │
│                 │  prometheus :9090                   │  │
│                 │  grafana    :3000                   │  │
│                 └────────────────────────────────────┘  │
└────────────────────┬──────────────┬─────────────────────┘
                     │              │
          ┌──────────▼──┐   ┌───────▼──────────┐
          │  Supabase   │   │  Upstash Redis   │
          │  (Postgres) │   │  (TLS / Celery)  │
          └─────────────┘   └──────────────────┘

Remote clusters → agent pod → POST /api/agents/* → backend
```

---

## Prerequisites

- Linux VM (any cloud — tested on AWS EC2 Amazon Linux 2023)
- Docker + Docker Compose installed
- Ports 80 and 443 open in security group / firewall
- A Supabase project (free tier works)
- An Upstash Redis instance (free tier works)

---

## Step 1 — Clone the repo

```bash
git clone <your-repo-url> k8s-optimization-platform
cd k8s-optimization-platform
```

---

## Step 2 — Create the .env file

```bash
cp backend/.env.example backend/.env
nano backend/.env          # fill in real values (see table below)
```

### Required values to fill in

| Key | Where to get it |
|-----|----------------|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection String |
| `REDIS_URL` | Upstash → Database → REST → Connection details (use `rediss://`) |
| `CELERY_BROKER_URL` | Same as `REDIS_URL` |
| `CELERY_RESULT_BACKEND` | Same as `REDIS_URL` |
| `SECRET_KEY` | `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `JWT_SECRET_KEY` | Same command |
| `ADMIN_TOKEN` | `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` — used to generate cluster agent tokens |
| `OPENAI_API_KEY` | platform.openai.com (optional — AI Copilot features only) |
| `CORS_ORIGINS` | Your server IP + `https://k8s-6d5ba.web.app,https://k8s-6d5ba.firebaseapp.com` |

> **Upstash TLS note:** The `REDIS_URL` must use `rediss://` (double-s) and end with
> `?ssl_cert_reqs=CERT_REQUIRED`. Plain `redis://` will fail with SSL errors.

---

## Step 3 — Pull and start

```bash
docker compose pull          # pull latest images from Docker Hub
docker compose up -d         # start all services
docker compose ps            # verify all are healthy
```

Expected output:
```
k8s-opt-backend    Up (healthy)
k8s-opt-worker     Up (healthy)
k8s-opt-frontend   Up (healthy)
k8s-opt-prometheus Up (healthy)
k8s-opt-grafana    Up (healthy)
```

---

## Step 4 — Verify the backend is working

```bash
curl http://localhost:8000/health
# → {"status":"healthy","version":"1.0.0"}

curl http://localhost:8000/health/db
# → {"status":"healthy","clusters":<N>}
```

---

## Step 5 — Update frontend API URL (if server IP changed)

The frontend is hosted on Firebase and points to the backend.
If your new server has a different IP/domain, update it:

```bash
# Edit the frontend config
nano frontend/src/config/api.ts
# Change API_BASE_URL to your new server's URL

# Rebuild and deploy
cd frontend
npm install
npm run build
firebase deploy --only hosting
```

---

## Step 6 — Re-deploy cluster agents

Each K8s cluster runs a lightweight agent pod that pushes data to the backend.
When the backend moves to a new URL, you need to update the agents.

### Generate a new API token (or reuse existing)

```bash
curl -X POST http://YOUR_NEW_SERVER/api/tokens/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"xforce-devops","org_id":"xforce-devops","expires_in_days":365}'
# → {"token":"<NEW_TOKEN>", ...}
```

### Redeploy agent on each cluster

```bash
# Switch to the cluster
kubectl config use-context <cluster-context>

# Run the deploy script
cd agent
./deploy.sh <CLUSTER_NAME> <NEW_TOKEN> http://YOUR_NEW_SERVER
```

---

## Docker images (Docker Hub)

| Image | Description |
|-------|-------------|
| `manas2821/k8s-platform-backend:latest` | Backend API + Celery worker |
| `manas2821/k8s-platform-frontend:latest` | Nginx-served React build (legacy — Firebase is used instead) |
| `manas2821/k8s-optimization-agent:latest` | Cluster agent (deployed inside each K8s cluster) |

To rebuild the backend image after a code change:

```bash
# On your server, after pulling latest code:
cd ~/k8s-platform-backend     # or wherever your source is
docker build -t manas2821/k8s-platform-backend:latest .
docker push manas2821/k8s-platform-backend:latest   # optional — updates Docker Hub

# Restart containers with new image
cd ~/K8s/k8s-optimization-platform
docker compose stop backend worker
docker compose rm -f backend worker
docker compose up -d backend worker
```

---

## Data persistence

| Data | Lives in | Survives server deletion? |
|------|----------|--------------------------|
| Cluster registrations | Supabase `agent_clusters` | ✅ Yes |
| Metrics history | Supabase `agent_metrics` | ✅ Yes |
| API tokens | Supabase `api_tokens` | ✅ Yes |
| User registry | Supabase `platform_users` (SQLite fallback) | ✅ Yes |
| Frontend | Firebase Hosting | ✅ Yes |
| Redis queues/cache | Upstash (persistent) | ✅ Yes |
| Prometheus metrics | Docker volume (local) | ❌ Lost on delete |
| Grafana dashboards | Docker volume (local) | ❌ Lost on delete |

> Prometheus/Grafana data is supplementary — the platform works without it.
> Real cluster data comes from the agents via Supabase, not from Prometheus.

---

## Supabase connection string format

```
postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
```

Special characters in the password must be URL-encoded:
- `@` → `%40`
- `#` → `%23`
- `!` → `%21`

---

## Nginx reverse proxy (recommended for production)

Put this in `/etc/nginx/conf.d/k8s-platform.conf`:

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP_OR_DOMAIN;

    # Backend API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        # SSE support
        proxy_buffering    off;
        proxy_cache        off;
    }

    # Health checks
    location /health {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Made with Bob
