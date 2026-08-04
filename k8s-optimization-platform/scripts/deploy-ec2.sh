#!/usr/bin/env bash
# =============================================================================
# K8s Optimization Platform — EC2 Deploy Script
# =============================================================================
# Usage:
#   ./scripts/deploy-ec2.sh [OPTIONS]
#
# Options:
#   --ec2-host    <ip/hostname>   EC2 public IP or DNS  (required)
#   --ec2-user    <user>          SSH user              (default: ec2-user)
#   --ssh-key     <path>          Path to .pem key file (required)
#   --push-images                 Build & push Docker images before deploying
#   --backend-only                Only redeploy the backend container
#
# Examples:
#   # First deploy — build images, push, then deploy everything:
#   ./scripts/deploy-ec2.sh --ec2-host 1.2.3.4 --ssh-key ~/.ssh/my-key.pem --push-images
#
#   # Subsequent deploys — backend changed only, images already pushed:
#   ./scripts/deploy-ec2.sh --ec2-host 1.2.3.4 --ssh-key ~/.ssh/my-key.pem --push-images --backend-only
# =============================================================================

set -euo pipefail

# ── defaults ──────────────────────────────────────────────────────────────────
EC2_HOST=""
EC2_USER="ec2-user"
SSH_KEY=""
PUSH_IMAGES=false
BACKEND_ONLY=false

BACKEND_IMAGE="manas2821/k8s-platform-backend:latest"
FRONTEND_IMAGE="manas2821/k8s-platform-frontend:latest"
PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── arg parse ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ec2-host)    EC2_HOST="$2";    shift 2 ;;
    --ec2-user)    EC2_USER="$2";    shift 2 ;;
    --ssh-key)     SSH_KEY="$2";     shift 2 ;;
    --push-images) PUSH_IMAGES=true; shift   ;;
    --backend-only) BACKEND_ONLY=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$EC2_HOST" || -z "$SSH_KEY" ]]; then
  echo "Usage: $0 --ec2-host <ip> --ssh-key <path-to-pem> [--push-images] [--backend-only]"
  exit 1
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo "======================================================"
echo " K8s Optimization Platform — EC2 Deploy"
echo " Host : $EC2_HOST ($EC2_USER)"
echo " Push : $PUSH_IMAGES"
echo " Mode : $([ "$BACKEND_ONLY" = true ] && echo 'backend only' || echo 'full stack')"
echo "======================================================"

# ── Step 1: Build & push Docker images ───────────────────────────────────────
if [ "$PUSH_IMAGES" = true ]; then
  echo ""
  echo "--> [1/4] Building & pushing Docker images..."

  # Backend
  echo "    Building backend image..."
  docker build -t "$BACKEND_IMAGE" "$PLATFORM_DIR/backend"
  echo "    Pushing backend image..."
  docker push "$BACKEND_IMAGE"

  if [ "$BACKEND_ONLY" = false ]; then
    # Frontend — build React app first, then Docker image
    echo "    Building React frontend..."
    (cd "$PLATFORM_DIR/frontend" && npm ci --silent && npm run build)
    echo "    Building frontend image..."
    docker build -t "$FRONTEND_IMAGE" "$PLATFORM_DIR/frontend"
    echo "    Pushing frontend image..."
    docker push "$FRONTEND_IMAGE"
  fi
  echo "    Images pushed successfully."
else
  echo ""
  echo "--> [1/4] Skipping image build (--push-images not set)"
fi

# ── Step 2: Upload docker-compose.yml and backend .env ───────────────────────
echo ""
echo "--> [2/4] Uploading compose file and config..."

# Ensure remote directory exists
ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" "mkdir -p ~/k8s-optimization-platform/backend"

# Upload docker-compose
scp $SCP_OPTS \
  "$PLATFORM_DIR/docker-compose.yml" \
  "$EC2_USER@$EC2_HOST:~/k8s-optimization-platform/docker-compose.yml"

# Upload backend .env (contains DB credentials, API keys — never hardcoded)
if [ -f "$PLATFORM_DIR/backend/.env" ]; then
  scp $SCP_OPTS \
    "$PLATFORM_DIR/backend/.env" \
    "$EC2_USER@$EC2_HOST:~/k8s-optimization-platform/backend/.env"
  echo "    .env uploaded."
else
  echo "    WARNING: backend/.env not found — make sure it already exists on EC2."
fi

# ── Step 3: Install Docker + Docker Compose on EC2 if not present ─────────────
echo ""
echo "--> [3/4] Ensuring Docker is installed on EC2..."
ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash <<'REMOTE_INSTALL'
set -e
if ! command -v docker &>/dev/null; then
  echo "    Installing Docker..."
  sudo yum update -y -q 2>/dev/null || sudo apt-get update -q
  sudo yum install -y docker 2>/dev/null || sudo apt-get install -y docker.io
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  echo "    Docker installed."
else
  echo "    Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null && ! command -v docker-compose &>/dev/null; then
  echo "    Installing Docker Compose plugin..."
  DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
  mkdir -p "$DOCKER_CONFIG/cli-plugins"
  curl -sSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
  chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
  echo "    Docker Compose installed."
else
  echo "    Docker Compose already installed."
fi
REMOTE_INSTALL

# ── Step 4: Pull new images and restart the stack ─────────────────────────────
echo ""
echo "--> [4/4] Deploying on EC2..."

if [ "$BACKEND_ONLY" = true ]; then
  # Hot-swap only the backend — zero-downtime for everything else
  ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash <<REMOTE_DEPLOY
set -e
cd ~/k8s-optimization-platform

echo "    Pulling latest backend image..."
docker pull $BACKEND_IMAGE

echo "    Restarting backend and worker..."
docker compose stop backend worker   2>/dev/null || docker-compose stop backend worker
docker compose rm -f backend worker  2>/dev/null || docker-compose rm -f backend worker
docker compose up -d backend worker  2>/dev/null || docker-compose up -d backend worker

echo "    Waiting for backend health check..."
for i in \$(seq 1 24); do
  if docker compose exec -T backend curl -sf http://localhost:8000/health >/dev/null 2>&1 \
  || docker exec k8s-opt-backend curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    echo "    Backend is healthy."
    break
  fi
  echo "    Waiting... (\$i/24)"
  sleep 5
done
REMOTE_DEPLOY

else
  # Full stack deploy
  ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash <<REMOTE_DEPLOY
set -e
cd ~/k8s-optimization-platform

echo "    Pulling latest images..."
docker compose pull 2>/dev/null || docker-compose pull

echo "    Restarting all services..."
docker compose down --remove-orphans 2>/dev/null || docker-compose down --remove-orphans
docker compose up -d                 2>/dev/null || docker-compose up -d

echo "    Waiting for backend health check (up to 120s)..."
for i in \$(seq 1 24); do
  if docker compose exec -T backend curl -sf http://localhost:8000/health >/dev/null 2>&1 \
  || docker exec k8s-opt-backend curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    echo "    Backend is healthy."
    break
  fi
  echo "    Waiting... (\$i/24)"
  sleep 5
done

echo ""
echo "    Running containers:"
docker compose ps 2>/dev/null || docker-compose ps
REMOTE_DEPLOY
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo " Deploy complete!"
echo " Frontend : http://$EC2_HOST"
echo " API      : http://$EC2_HOST/api/docs"
echo " Health   : http://$EC2_HOST/health"
echo "======================================================"
