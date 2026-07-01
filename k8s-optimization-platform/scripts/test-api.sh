#!/bin/bash

echo "Testing API endpoints..."
echo ""

echo "1. Testing health endpoint (should respond immediately):"
timeout 5 curl -s http://localhost:8000/health || echo "TIMEOUT or ERROR"
echo ""
echo ""

echo "2. Testing clusters endpoint (checking if it hangs):"
timeout 10 curl -s http://localhost:8000/api/clusters || echo "TIMEOUT - API is hanging!"
echo ""
echo ""

echo "3. Checking backend logs for errors:"
podman logs k8s-opt-backend --tail 30

# Made with Bob
