# API Token Management Guide

## Overview

API tokens are required for cluster agents to authenticate with the central platform. This guide explains how to generate, manage, and use tokens.

## Quick Start

### 1. Generate Your First Token

```bash
# Set admin token (provided by platform administrator)
export ADMIN_TOKEN="admin-secret-token-change-me"

# Generate a token for your cluster
python tools/token-manager.py generate \
  --name "prod-us-west-cluster" \
  --description "Production cluster in US West region" \
  --expires-in-days 365
```

**Output:**
```
✅ Token generated successfully!

Token Name: prod-us-west-cluster
Description: Production cluster in US West region
Created: 2026-06-19T10:00:00
Expires: 2027-06-19T10:00:00

🔑 API Token (save this securely):
xYz123AbC456DeF789GhI012JkL345MnO678PqR901StU234VwX567YzA890BcD123

📋 Token Hash (for reference):
a1b2c3d4e5f6g7h8...

⚠️  IMPORTANT: Save this token now! You won't be able to see it again.
```

### 2. Use Token in Agent Deployment

Update your `deployment.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: platform-credentials
  namespace: k8s-optimization-agent
type: Opaque
stringData:
  api-token: "xYz123AbC456DeF789GhI012JkL345MnO678PqR901StU234VwX567YzA890BcD123"
  platform-url: "https://your-platform.example.com"
```

### 3. Deploy Agent

```bash
kubectl apply -f deployment.yaml
```

---

## Token Management

### List All Tokens

```bash
python tools/token-manager.py list
```

**Output:**
```
📝 Total Tokens: 3

Name                           Status     Created              Usage     
--------------------------------------------------------------------------------
prod-us-west-cluster          ✅ active   2026-06-19T10:00:00  1247      
staging-eu-central            ✅ active   2026-06-18T15:30:00  892       
dev-ap-south                  ❌ revoked  2026-06-15T09:15:00  45        
```

### Get Token Details

```bash
python tools/token-manager.py info a1b2c3d4e5f6g7h8
```

**Output:**
```
📋 Token Information:

Name: prod-us-west-cluster
Description: Production cluster in US West region
Status: active
Created: 2026-06-19T10:00:00
Expires: 2027-06-19T10:00:00
Last Used: 2026-06-19T10:30:00
Usage Count: 1247
Token Hash: a1b2c3d4e5f6g7h8...
```

### Verify Token

```bash
python tools/token-manager.py verify xYz123AbC456DeF789GhI012JkL345MnO678PqR901StU234VwX567YzA890BcD123
```

**Output:**
```
✅ Token is valid!

Status: valid
Name: prod-us-west-cluster
Expires: 2027-06-19T10:00:00
```

### Revoke Token

```bash
python tools/token-manager.py revoke a1b2c3d4e5f6g7h8
```

**Output:**
```
✅ Token a1b2c3d4e5f6g7h8... revoked successfully
```

---

## Using the Token Manager CLI

### Installation

```bash
# Install dependencies
pip install requests

# Make executable
chmod +x tools/token-manager.py
```

### Configuration

Set environment variables:

```bash
export PLATFORM_URL="https://your-platform.example.com"
export ADMIN_TOKEN="your-admin-token"
```

Or use command-line flags:

```bash
python tools/token-manager.py \
  --platform-url "https://your-platform.example.com" \
  --admin-token "your-admin-token" \
  generate --name "my-cluster"
```

### Commands

#### Generate Token

```bash
# Basic usage
python tools/token-manager.py generate --name "cluster-name"

# With description
python tools/token-manager.py generate \
  --name "prod-cluster" \
  --description "Production cluster in AWS"

# With custom expiration
python tools/token-manager.py generate \
  --name "temp-cluster" \
  --expires-in-days 30
```

#### List Tokens

```bash
python tools/token-manager.py list
```

#### Get Token Info

```bash
python tools/token-manager.py info <token-hash>
```

#### Revoke Token

```bash
python tools/token-manager.py revoke <token-hash>
```

#### Verify Token

```bash
python tools/token-manager.py verify <token>
```

---

## API Endpoints

### Generate Token

```bash
curl -X POST https://your-platform.example.com/api/tokens/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-cluster",
    "description": "Production cluster",
    "expires_in_days": 365
  }'
```

### List Tokens

```bash
curl https://your-platform.example.com/api/tokens/list \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Get Token Info

```bash
curl https://your-platform.example.com/api/tokens/<token-hash> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Revoke Token

```bash
curl -X DELETE https://your-platform.example.com/api/tokens/<token-hash> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Verify Token

```bash
curl -X POST https://your-platform.example.com/api/tokens/verify \
  -H "Authorization: Bearer <token>"
```

---

## Security Best Practices

### 1. Token Storage

✅ **DO:**
- Store tokens in Kubernetes Secrets
- Use environment variables
- Encrypt tokens at rest
- Use secret management tools (Vault, AWS Secrets Manager)

❌ **DON'T:**
- Commit tokens to Git
- Store in plain text files
- Share tokens via email/chat
- Hardcode in application code

### 2. Token Rotation

```bash
# Generate new token
NEW_TOKEN=$(python tools/token-manager.py generate \
  --name "prod-cluster-rotated" | grep "API Token" | awk '{print $NF}')

# Update Kubernetes secret
kubectl create secret generic platform-credentials \
  -n k8s-optimization-agent \
  --from-literal=api-token="$NEW_TOKEN" \
  --from-literal=platform-url="$PLATFORM_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart agent to use new token
kubectl rollout restart deployment/k8s-optimization-agent \
  -n k8s-optimization-agent

# Revoke old token
python tools/token-manager.py revoke <old-token-hash>
```

### 3. Token Expiration

- **Production**: 365 days (1 year)
- **Staging**: 180 days (6 months)
- **Development**: 90 days (3 months)
- **Temporary**: 30 days (1 month)

### 4. Access Control

- Only platform administrators should have admin tokens
- Each cluster should have its own unique token
- Revoke tokens immediately when clusters are decommissioned
- Monitor token usage regularly

---

## Troubleshooting

### Token Not Working

```bash
# Verify token is valid
python tools/token-manager.py verify <token>

# Check token status
python tools/token-manager.py info <token-hash>

# Common issues:
# 1. Token expired - Generate new token
# 2. Token revoked - Generate new token
# 3. Wrong platform URL - Check PLATFORM_URL
# 4. Network issues - Check connectivity
```

### Agent Authentication Errors

```bash
# Check agent logs
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent

# Common errors:
# "401 Unauthorized" - Invalid or expired token
# "403 Forbidden" - Token revoked
# "Connection refused" - Wrong platform URL
```

### Regenerate Token

```bash
# 1. Generate new token
python tools/token-manager.py generate --name "cluster-name-new"

# 2. Update secret
kubectl create secret generic platform-credentials \
  -n k8s-optimization-agent \
  --from-literal=api-token="<new-token>" \
  --from-literal=platform-url="$PLATFORM_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart agent
kubectl rollout restart deployment/k8s-optimization-agent \
  -n k8s-optimization-agent

# 4. Verify
kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f
```

---

## Multi-Cluster Token Strategy

### Option 1: One Token Per Cluster (Recommended)

```bash
# Generate unique token for each cluster
python tools/token-manager.py generate --name "prod-us-west"
python tools/token-manager.py generate --name "prod-eu-central"
python tools/token-manager.py generate --name "staging-us-east"
```

**Advantages:**
- Easy to revoke individual clusters
- Better audit trail
- Granular access control

### Option 2: One Token Per Environment

```bash
# Generate token per environment
python tools/token-manager.py generate --name "production-clusters"
python tools/token-manager.py generate --name "staging-clusters"
python tools/token-manager.py generate --name "development-clusters"
```

**Advantages:**
- Fewer tokens to manage
- Simpler rotation process

### Option 3: One Token Per Team

```bash
# Generate token per team
python tools/token-manager.py generate --name "platform-team"
python tools/token-manager.py generate --name "data-team"
python tools/token-manager.py generate --name "ml-team"
```

**Advantages:**
- Team-based access control
- Easier cost allocation

---

## Admin Token Setup

The admin token is used to manage API tokens. Set it during platform deployment:

### Docker Compose

```yaml
services:
  backend:
    environment:
      - ADMIN_TOKEN=your-secure-admin-token-here
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: platform-admin
  namespace: k8s-optimization-platform
type: Opaque
stringData:
  admin-token: "your-secure-admin-token-here"
```

### Generate Secure Admin Token

```bash
# Generate random secure token
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Token Lifecycle

```
┌─────────────┐
│   Generate  │
│    Token    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Active    │◄──────┐
│   (In Use)  │       │
└──────┬──────┘       │
       │              │
       │ Rotation     │
       ▼              │
┌─────────────┐       │
│  Generate   │       │
│  New Token  │───────┘
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Revoke    │
│  Old Token  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Revoked   │
│  (Inactive) │
└─────────────┘
```

---

## Support

For issues or questions:
- Check agent logs: `kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent`
- Verify token: `python tools/token-manager.py verify <token>`
- Contact platform administrator

---

## Summary

✅ Generate tokens using CLI tool or API  
✅ Store tokens securely in Kubernetes Secrets  
✅ Use unique tokens per cluster (recommended)  
✅ Rotate tokens regularly (every 6-12 months)  
✅ Revoke tokens when clusters are decommissioned  
✅ Monitor token usage via platform dashboard  
✅ Keep admin token secure and rotate periodically  