#!/usr/bin/env bash
# One-command local deploy for podman (or docker-compose — both work).
#
# Usage:
#   ./local-deploy.sh          # build + start everything
#   ./local-deploy.sh down     # stop and remove containers (keeps volumes)
#   ./local-deploy.sh logs     # tail backend logs
#   ./local-deploy.sh reset    # stop AND wipe volumes (fresh Postgres/Redis)

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.local.yml"

# Prefer podman-compose, fall back to docker-compose, fall back to
# `podman compose` / `docker compose` (the newer built-in subcommand form).
if command -v podman-compose &>/dev/null; then
    COMPOSE=(podman-compose -f "$COMPOSE_FILE")
elif command -v podman &>/dev/null && podman compose version &>/dev/null 2>&1; then
    COMPOSE=(podman compose -f "$COMPOSE_FILE")
elif command -v docker-compose &>/dev/null; then
    COMPOSE=(docker-compose -f "$COMPOSE_FILE")
elif command -v docker &>/dev/null; then
    COMPOSE=(docker compose -f "$COMPOSE_FILE")
else
    echo "Neither podman-compose/podman nor docker-compose/docker were found on PATH." >&2
    echo "Install podman-compose (pip install podman-compose) and try again." >&2
    exit 1
fi

echo "Using: ${COMPOSE[*]}"

case "${1:-up}" in
    up)
        echo "Building and starting all services (first run pulls/builds images, can take a few minutes)..."
        "${COMPOSE[@]}" up -d --build
        echo ""
        echo "Waiting for backend health check..."
        for i in $(seq 1 30); do
            if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
                echo "Backend is up."
                break
            fi
            sleep 2
        done
        echo ""
        echo "──────────────────────────────────────────────────────────"
        echo " Dashboard:    http://localhost:8080"
        echo " Backend API:  http://localhost:8000/docs   (FastAPI Swagger UI)"
        echo " Grafana:      http://localhost:3000         (admin / admin)"
        echo " Prometheus:   http://localhost:9090"
        echo "──────────────────────────────────────────────────────────"
        echo ""
        echo "The dashboard will show no cluster data until an agent reports in."
        echo "To connect a real cluster's agent to this local backend, generate"
        echo "a token first:"
        echo ""
        echo "  curl -X POST http://localhost:8000/api/tokens/generate \\"
        echo "    -H 'Authorization: Bearer <ADMIN_TOKEN from backend/.env.local>' \\"
        echo "    -H 'Content-Type: application/json' -d '{\"cluster_name\": \"my-cluster\"}'"
        echo ""
        echo "Then deploy the agent against this backend (adjust PLATFORM_URL to"
        echo "wherever this machine is reachable from that cluster, not localhost"
        echo "unless the agent runs on this same machine):"
        echo ""
        echo "  cd agent && ./deploy.sh my-cluster <token-from-above> http://<this-machine>:8000"
        ;;
    down)
        "${COMPOSE[@]}" down
        ;;
    reset)
        "${COMPOSE[@]}" down -v
        echo "Volumes wiped — next 'up' starts with a clean Postgres/Redis."
        ;;
    logs)
        "${COMPOSE[@]}" logs -f backend
        ;;
    *)
        echo "Usage: $0 [up|down|reset|logs]" >&2
        exit 1
        ;;
esac
