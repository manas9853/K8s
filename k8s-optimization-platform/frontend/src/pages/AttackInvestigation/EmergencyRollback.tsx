import React, { useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { Replay as RollbackIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface RollbackResponse {
  action: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  status: string;
  message: string;
  actions_taken: string[];
  timestamp: string;
}

interface DeploymentItem {
  name: string;
  namespace: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const EmergencyRollbackInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [resourceType, setResourceType] = useState('deployment');
  const [resourceName, setResourceName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RollbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchOptions = async () => {
      try {
        const [nsResponse, deploymentsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/observability/namespaces${clusterParam ? clusterParam.replace('?cluster=', '?cluster_id=') : ''}`),
          fetch(`${API_BASE_URL}/v1/workloads/deployments${clusterParam ? clusterParam.replace('?cluster=', '?cluster_id=') : ''}`),
        ]);
        if (!nsResponse.ok || !deploymentsResponse.ok) throw new Error('Failed to load rollback options');
        const nsData: string[] = await nsResponse.json();
        const deploymentsData: DeploymentItem[] = await deploymentsResponse.json();
        if (!mounted) return;
        setNamespaces(nsData);
        setDeployments(deploymentsData);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load rollback options');
      } finally {
        if (mounted) setBootstrapLoading(false);
      }
    };

    fetchOptions();

    return () => {
      mounted = false;
    };
  }, [clusterParam]);

  const namespaceDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.namespace === namespace),
    [deployments, namespace],
  );

  useEffect(() => {
    setResourceName('');
  }, [namespace]);

  const handleRollback = async () => {
    if (!resourceName || !namespace) return;
    try {
      setLoading(true);
      setResult(null);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/response/emergency-rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: resourceType, name: resourceName, namespace }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: RollbackResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <LinearProgress sx={{ width: 240 }} />
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#e8eaf0' }}>
        <RollbackIcon sx={{ color: '#90caf9' }} /> Emergency Rollback
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Rollback queued for {result.resource_name}</strong><br />
          Namespace: {result.namespace}<br />
          Status: {result.status}<br />
          Queued at: {formatTimestamp(result.timestamp)}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#e8eaf0' }}>Emergency Rollback</Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', mb: 3 }}>
                Select a namespace first, then choose one of the real deployments returned for that namespace.
              </Typography>
              <TextField
                select
                fullWidth
                label="Resource Type"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
              >
                <MenuItem value="deployment">Deployment</MenuItem>
              </TextField>
              <TextField
                select
                fullWidth
                label="Namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
              >
                {namespaces.map((item) => (
                  <MenuItem key={item} value={item}>{item}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Resource Name"
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                sx={{ mb: 3 }}
                size="small"
                disabled={!namespace || namespaceDeployments.length === 0}
                helperText={namespace ? `${namespaceDeployments.length} deployment(s) available in ${namespace}` : 'Select a namespace to load deployments'}
                FormHelperTextProps={{ sx: { color: '#8892a4' } }}
              >
                {namespaceDeployments.map((deployment) => (
                  <MenuItem key={`${deployment.namespace}-${deployment.name}`} value={deployment.name}>
                    {deployment.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="error"
                startIcon={<RollbackIcon />}
                onClick={handleRollback}
                disabled={loading || !resourceName || !namespace}
                fullWidth
              >
                {loading ? 'Rolling back...' : 'Execute Emergency Rollback'}
              </Button>
              {loading && <LinearProgress sx={{ mt: 1 }} />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#e8eaf0' }}>Selection status</Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.8 }}>
                {namespace
                  ? `${namespaceDeployments.length} deployment(s) were found for namespace ${namespace}.`
                  : 'No namespace selected yet.'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const EmergencyRollback: React.FC = () => (
  <ClusterGuard>
    <EmergencyRollbackInner />
  </ClusterGuard>
);

export default EmergencyRollback;
