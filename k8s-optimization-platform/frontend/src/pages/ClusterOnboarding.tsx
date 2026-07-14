import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Alert,
  IconButton,
  Chip,
  Grid,
  Paper,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const ADMIN_TOKEN = 'admin-secret-token-change-me'; // In production, get from auth

interface TokenData {
  token: string;
  name: string;
  created_at: string;
  expires_at: string;
}

const ClusterOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [clusterName, setClusterName] = useState('');
  const [clusterDescription, setClusterDescription] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [platformUrl] = useState(() => {
    // Use the backend API URL from env var if available
    if (process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL.replace(/\/$/, '');
    }
    // Fallback for local dev
    return 'http://localhost:8000';
  });
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [showYamlDialog, setShowYamlDialog] = useState(false);

  const steps = [
    'Cluster Information',
    'Generate Token',
    'Deploy Agent',
    'Verify Connection'
  ];

  const handleGenerateToken = async () => {
    if (!clusterName) {
      setError('Cluster name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/tokens/generate`,
        {
          name: clusterName,
          description: clusterDescription,
          expires_in_days: 365,
          org_id: 'xforce-devops'
        },
        {
          headers: {
            'Authorization': `Bearer ${ADMIN_TOKEN}`
          }
        }
      );

      setTokenData(response.data);
      setActiveStep(1);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateDeploymentYaml = () => {
    return `---
apiVersion: v1
kind: Namespace
metadata:
  name: k8s-optimization-agent

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k8s-optimization-agent
  namespace: k8s-optimization-agent

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-optimization-agent
rules:
  - apiGroups: [""]
    resources: ["nodes", "namespaces", "pods", "services", "persistentvolumes", "persistentvolumeclaims", "configmaps", "secrets"]
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
    verbs: ["get", "list"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses", "networkpolicies"]
    verbs: ["get", "list"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles", "rolebindings", "clusterroles", "clusterrolebindings"]
    verbs: ["get", "list"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k8s-optimization-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: k8s-optimization-agent
subjects:
  - kind: ServiceAccount
    name: k8s-optimization-agent
    namespace: k8s-optimization-agent

---
apiVersion: v1
kind: Secret
metadata:
  name: platform-credentials
  namespace: k8s-optimization-agent
type: Opaque
stringData:
  api-token: "${tokenData?.token || 'YOUR_TOKEN_HERE'}"
  platform-url: "${platformUrl}"

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-config
  namespace: k8s-optimization-agent
data:
  CLUSTER_NAME: "${clusterName}"
  ENVIRONMENT: "${environment}"
  COLLECTION_INTERVAL: "30"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: k8s-optimization-agent
  namespace: k8s-optimization-agent
  labels:
    app: k8s-optimization-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: k8s-optimization-agent
  template:
    metadata:
      labels:
        app: k8s-optimization-agent
    spec:
      serviceAccountName: k8s-optimization-agent
      containers:
        - name: agent
          image: manas2821/k8s-optimization-agent:latest
          imagePullPolicy: Always
          env:
            - name: PLATFORM_URL
              valueFrom:
                secretKeyRef:
                  name: platform-credentials
                  key: platform-url
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: platform-credentials
                  key: api-token
            - name: CLUSTER_NAME
              valueFrom:
                configMapKeyRef:
                  name: agent-config
                  key: CLUSTER_NAME
            - name: ENVIRONMENT
              valueFrom:
                configMapKeyRef:
                  name: agent-config
                  key: ENVIRONMENT
            - name: COLLECTION_INTERVAL
              valueFrom:
                configMapKeyRef:
                  name: agent-config
                  key: COLLECTION_INTERVAL
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL`;
  };

  const downloadYaml = () => {
    const yaml = generateDeploymentYaml();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clusterName}-agent-deployment.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const kubectlCommand = `kubectl apply -f ${clusterName}-agent-deployment.yaml`;
  const verifyCommand = `kubectl get pods -n k8s-optimization-agent`;
  const logsCommand = `kubectl logs -n k8s-optimization-agent -l app=k8s-optimization-agent -f`;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        🚀 Cluster Onboarding
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Connect a new Kubernetes cluster to the optimization platform in 3 easy steps
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Step 0: Cluster Information */}
          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Step 1: Enter Cluster Information
              </Typography>
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Cluster Name"
                    value={clusterName}
                    onChange={(e) => setClusterName(e.target.value)}
                    placeholder="prod-us-west-1"
                    required
                    helperText="Unique identifier for your cluster"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Environment"
                    select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    SelectProps={{ native: true }}
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="qa">QA</option>
                    <option value="development">Development</option>
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    value={clusterDescription}
                    onChange={(e) => setClusterDescription(e.target.value)}
                    placeholder="Production cluster in US West region"
                    multiline
                    rows={2}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Platform URL"
                    value={platformUrl}
                    disabled
                    helperText="Auto-detected from current browser location"
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={handleGenerateToken}
                  disabled={!clusterName || loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <RocketLaunchIcon />}
                >
                  {loading ? 'Generating...' : 'Generate Token & Continue'}
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 1: Token Generated */}
          {activeStep === 1 && tokenData && (
            <Box>
              <Alert severity="success" sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  ✅ Token Generated Successfully!
                </Typography>
                <Typography variant="body2">
                  Your API token has been created. Keep it secure - you won't be able to see it again.
                </Typography>
              </Alert>

              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Token Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">
                      Name: <strong>{tokenData.name}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2" color="text.secondary">
                      Expires: <strong>{new Date(tokenData.expires_at).toLocaleDateString()}</strong>
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.900', color: 'white' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">API Token</Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(tokenData.token, 'token')}
                    sx={{ color: 'white' }}
                  >
                    {copied === 'token' ? <CheckCircleIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {tokenData.token}
                </Typography>
              </Paper>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
                <Button onClick={() => setActiveStep(0)}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(2)}
                >
                  Continue to Deployment
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 2: Deploy Agent */}
          {activeStep === 2 && tokenData && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Step 3: Deploy Agent to Your Cluster
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Deploy the agent to your Kubernetes cluster using the generated YAML file
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Button
                  variant="contained"
                  startIcon={<CloudDownloadIcon />}
                  onClick={downloadYaml}
                  sx={{ mr: 2 }}
                >
                  Download YAML
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setShowYamlDialog(true)}
                >
                  View YAML
                </Button>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle1" gutterBottom>
                Deployment Commands
              </Typography>

              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.900', color: 'white' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">1. Apply the deployment</Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(kubectlCommand, 'kubectl')}
                    sx={{ color: 'white' }}
                  >
                    {copied === 'kubectl' ? <CheckCircleIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {kubectlCommand}
                </Typography>
              </Paper>

              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.900', color: 'white' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">2. Verify deployment</Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(verifyCommand, 'verify')}
                    sx={{ color: 'white' }}
                  >
                    {copied === 'verify' ? <CheckCircleIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {verifyCommand}
                </Typography>
              </Paper>

              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.900', color: 'white' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">3. Check logs</Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(logsCommand, 'logs')}
                    sx={{ color: 'white' }}
                  >
                    {copied === 'logs' ? <CheckCircleIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Box>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {logsCommand}
                </Typography>
              </Paper>

              <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                  <strong>Expected Output:</strong> You should see the agent pod running and logs showing "Cluster registered successfully" and "Metrics sent successfully"
                </Typography>
              </Alert>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
                <Button onClick={() => setActiveStep(1)}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(3)}
                >
                  Verify Connection
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 3: Verify Connection */}
          {activeStep === 3 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Step 4: Verify Connection
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Check if your cluster is successfully connected and sending data
              </Typography>

              <Alert severity="success" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  Your cluster should appear in the dashboard within 30 seconds. Check the Multi-Cluster Dashboard to see your cluster.
                </Typography>
              </Alert>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" color="primary">
                        1
                      </Typography>
                      <Typography variant="body2">
                        Agent registers with platform
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" color="primary">
                        2
                      </Typography>
                      <Typography variant="body2">
                        Starts collecting metrics every 30s
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" color="primary">
                        3
                      </Typography>
                      <Typography variant="body2">
                        Data appears in dashboard
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Button
                  variant="contained"
                  onClick={() => navigate('/')}
                  fullWidth
                >
                  Go to Dashboard
                </Button>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setActiveStep(0);
                    setClusterName('');
                    setClusterDescription('');
                    setTokenData(null);
                  }}
                  fullWidth
                >
                  Onboard Another Cluster
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* YAML Dialog */}
      <Dialog
        open={showYamlDialog}
        onClose={() => setShowYamlDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Deployment YAML
          <IconButton
            onClick={() => handleCopy(generateDeploymentYaml(), 'yaml')}
            sx={{ float: 'right' }}
          >
            {copied === 'yaml' ? <CheckCircleIcon /> : <ContentCopyIcon />}
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Paper sx={{ p: 2, bgcolor: 'grey.900', color: 'white', maxHeight: '500px', overflow: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.875rem' }}>
              {generateDeploymentYaml()}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowYamlDialog(false)}>Close</Button>
          <Button onClick={downloadYaml} variant="contained">
            Download
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClusterOnboarding;

// Made with Bob
