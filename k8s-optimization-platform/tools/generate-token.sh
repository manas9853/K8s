#!/bin/bash
# Simple token generator for K8s Optimization Platform

# Generate a secure random token
TOKEN=$(openssl rand -hex 32)

echo "=========================================="
echo "Generated API Token for Agent"
echo "=========================================="
echo ""
echo "Token: $TOKEN"
echo ""
echo "Save this token securely!"
echo ""
echo "To update the Kubernetes secret, run:"
echo ""
echo "kubectl create secret generic platform-credentials \\"
echo "  --from-literal=platform-url=\"YOUR_PLATFORM_URL\" \\"
echo "  --from-literal=api-token=\"$TOKEN\" \\"
echo "  --namespace=k8s-optimization-agent \\"
echo "  --dry-run=client -o yaml | kubectl apply -f -"
echo ""
echo "=========================================="

# Made with Bob
