# Scripts

This folder contains all shell scripts for the K8s Optimization Platform.

## 🚀 Quick Start Scripts

### Platform Management
- **START_PLATFORM.sh** - Start the entire platform
- **start-podman-compose.sh** - Start with Podman Compose
- **STOP_PLATFORM.sh** - Stop all containers
- **RESTART_PLATFORM.sh** - Restart platform

### Build & Deploy
- **REBUILD_FRONTEND_NOW.sh** - Rebuild frontend container
- **rebuild-backend.sh** - Rebuild backend container
- **rebuild-frontend.sh** - Alternative frontend rebuild
- **SWITCH_TO_PRODUCTION.sh** - Switch to production mode

## 🔍 Monitoring & Status

### Health Checks
- **CHECK_STATUS.sh** - Check all container status
- **CHECK_ALL_STATUS.sh** - Comprehensive status check
- **CHECK_FRONTEND.sh** - Frontend health check
- **CHECK_FRONTEND_LOGS.sh** - View frontend logs
- **CHECK_BACKEND_LOGS.sh** - View backend logs

### Testing
- **test-api.sh** - Test backend APIs
- **test-all-apis.sh** - Test all endpoints
- **test-frontend.sh** - Test frontend

## 🔗 Cluster Connection

### Connect to Kubernetes
- **connect-cluster.sh** - Connect to K8s cluster
- **CONNECT_TO_REAL_CLUSTER.sh** - Connect to real cluster
- **setup-kubeconfig.sh** - Setup kubeconfig

## 🛠️ Utility Scripts

### Fixes & Troubleshooting
- **FIX_RECOMMENDATIONS_FRONTEND.sh** - Fix recommendations display
- **fix-cors.sh** - Fix CORS issues
- **fix-permissions.sh** - Fix file permissions

### Data Management
- **generate-test-data.sh** - Generate test data
- **backup-data.sh** - Backup platform data
- **restore-data.sh** - Restore from backup

## 📋 Usage Examples

### Start Platform
```bash
cd k8s-optimization-platform
./scripts/START_PLATFORM.sh
```

### Check Status
```bash
./scripts/CHECK_STATUS.sh
```

### Rebuild Frontend
```bash
./scripts/REBUILD_FRONTEND_NOW.sh
```

### Connect Cluster
```bash
./scripts/connect-cluster.sh
```

### Test APIs
```bash
./scripts/test-api.sh
```

## 🔧 Script Categories

### 1. Platform Control (8 scripts)
- Start, stop, restart platform
- Build and deploy containers

### 2. Monitoring (7 scripts)
- Status checks
- Log viewing
- Health monitoring

### 3. Testing (5 scripts)
- API testing
- Frontend testing
- Integration testing

### 4. Cluster Management (3 scripts)
- Connect to clusters
- Setup kubeconfig
- Cluster validation

### 5. Utilities (5 scripts)
- Fixes and troubleshooting
- Data management
- Permissions

## ⚙️ Script Conventions

All scripts follow these conventions:

### Naming
- **UPPERCASE.sh** - Main/important scripts
- **lowercase.sh** - Utility scripts
- **kebab-case.sh** - Multi-word scripts

### Structure
```bash
#!/bin/bash
# Script description
# Usage: ./script.sh [options]

set -e  # Exit on error

# Main logic here
```

### Exit Codes
- `0` - Success
- `1` - General error
- `2` - Missing dependency
- `3` - Configuration error

## 🚨 Important Notes

### Before Running Scripts

1. **Make executable**:
   ```bash
   chmod +x scripts/*.sh
   ```

2. **Run from project root**:
   ```bash
   cd k8s-optimization-platform
   ./scripts/SCRIPT_NAME.sh
   ```

3. **Check dependencies**:
   - podman or docker
   - kubectl (for cluster scripts)
   - jq (for JSON parsing)
   - curl (for API testing)

### Common Issues

**Permission Denied**:
```bash
chmod +x scripts/SCRIPT_NAME.sh
```

**Script Not Found**:
```bash
# Run from project root
cd k8s-optimization-platform
./scripts/SCRIPT_NAME.sh
```

**Podman Not Found**:
```bash
# Install podman or use docker
alias podman=docker
```

## 📊 Script Statistics

- Total Scripts: 28
- Platform Control: 8
- Monitoring: 7
- Testing: 5
- Cluster Management: 3
- Utilities: 5

## 🔗 Related Documentation

See `../docs/` folder for:
- **DOCKER_COMPOSE_GUIDE.md** - Container setup
- **CONNECT_REAL_CLUSTER.md** - Cluster connection
- **REFRESH_BUTTON_TROUBLESHOOTING.md** - Common issues

## 💡 Tips

### Quick Commands

```bash
# Start everything
./scripts/START_PLATFORM.sh

# Check if running
./scripts/CHECK_STATUS.sh

# View logs
./scripts/CHECK_BACKEND_LOGS.sh
./scripts/CHECK_FRONTEND_LOGS.sh

# Test APIs
./scripts/test-api.sh

# Rebuild if needed
./scripts/REBUILD_FRONTEND_NOW.sh
./scripts/rebuild-backend.sh
```

### Debugging

```bash
# Run with debug output
bash -x ./scripts/SCRIPT_NAME.sh

# Check script syntax
bash -n ./scripts/SCRIPT_NAME.sh
```

## 🆘 Need Help?

1. Check script comments for usage
2. Review related docs in `../docs/`
3. Run with `-h` or `--help` flag (if supported)
4. Check exit codes for error details