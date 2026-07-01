#!/bin/bash
set -e

# .bluemix and .kube directories are now mounted directly from host
echo "Using mounted .kube and .bluemix directories from host"

# Fix kubeconfig paths - replace /Users/manasupadhyay with /root
if [ -f "/root/.kube/config" ]; then
    echo "✅ Kubeconfig found at /root/.kube/config"
    
    # Create a temporary fixed kubeconfig
    sed 's|/Users/manasupadhyay/|/root/|g' /root/.kube/config > /tmp/kubeconfig-fixed
    
    # Use the fixed kubeconfig
    export KUBECONFIG=/tmp/kubeconfig-fixed
    echo "✅ Fixed kubeconfig paths for container environment"
else
    echo "❌ Kubeconfig not found at /root/.kube/config"
fi

# Verify .bluemix directory exists
if [ -d "/root/.bluemix" ]; then
    echo "✅ .bluemix directory found"
else
    echo "❌ .bluemix directory not found"
fi

# Execute the main command
exec "$@"

# Made with Bob
