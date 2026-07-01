#!/bin/bash

echo "🛑 Stopping Kubernetes Optimization Platform..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Stop containers
echo "Stopping containers..."
podman stop k8s-opt-backend k8s-opt-postgres k8s-opt-redis 2>/dev/null

echo ""
echo "Removing containers..."
podman rm k8s-opt-backend k8s-opt-postgres k8s-opt-redis 2>/dev/null

echo ""
echo -e "${GREEN}✅ All services stopped!${NC}"
echo ""
echo "📝 Note: Data volumes are preserved. To remove them:"
echo "   podman volume rm k8s-opt-postgres-data k8s-opt-redis-data k8s-opt-backend-logs"
echo ""
echo "To start again:"
echo "   ./START_PLATFORM.sh"

# Made with Bob
