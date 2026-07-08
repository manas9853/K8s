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
import { RotateRight as RotateIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface RotateSecretResponse {
  action: string;
  secret_name: string;
  namespace: string;
  status: string;
  message: string;
  actions_taken: string[];
  timestamp: string;
}

interface SecretStatus {
  secret_name: string;
  namespace: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const RotateSecretsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [secretName, setSecretName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RotateSecretResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchOptions = async () => {
      try {
        const [nsResponse, secretsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/v1/observability/namespaces${clusterParam ? clusterParam.replace('?cluster=', '?cluster_id=') : ''}`),
          fetch(`${API_BASE_URL}/v1/security/secrets-security/rotation${clusterParam}`),
        ]);
        if (!nsResponse.ok || !secretsResponse.ok) throw new Error('Failed to load rotation options');
        const nsData: string[] = await nsResponse.json();
        const secretData = await secretsResponse.json();
        if (!mounted) return;
        setNamespaces(nsData);
        setSecrets((secretData?.secrets_status ?? []).map((item: any) => ({
          secret_name: item.secret_name,
          namespace: item.namespace,
        })));
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load rotation options');
      } finally {
        if (mounted) setBootstrapLoading(false);
      }
    };

    fetchOptions();

    return () => {
      mounted = false;
    };
  }, [clusterParam]);

  const namespaceSecrets = useMemo(
    () => secrets.filter((secret) => secret.namespace === namespace),
    [secrets, namespace],
  );

  useEffect(() => {
    setSecretName('');
  }, [namespace]);

  const handleRotate = async () => {
    if (!secretName || !namespace) return;
    try {
      setLoading(true);
      setResult(null);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/response/rotate-secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: secretName, namespace }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: RotateSecretResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotation failed');
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
        <RotateIcon sx={{ color: '#90caf9' }} /> Rotate Secrets
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Rotation queued for {result.secret_name}</strong><br />
          Namespace: {result.namespace}<br />
          Status: {result.status}<br />
          Queued at: {formatTimestamp(result.timestamp)}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#e8eaf0' }}>Emergency Secret Rotation</Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', mb: 3 }}>
                Select a namespace first, then choose one of the real secrets returned for that namespace from the cluster security data.
              </Typography>
              <TextField
                select
                fullWidth
                label="Namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                sx={{ mb: 2 }}
                size="small"
                InputLabelProps={{ style: { color: '#8892a4' } }}
                SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
              >
                {namespaces.map((item) => (
                  <MenuItem key={item} value={item}>{item}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Secret Name"
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                sx={{ mb: 3 }}
                size="small"
                disabled={!namespace || namespaceSecrets.length === 0}
                InputLabelProps={{ style: { color: '#8892a4' } }}
                helperText={namespace ? `${namespaceSecrets.length} secret(s) available in ${namespace}` : 'Select a namespace to load secrets'}
                FormHelperTextProps={{ sx: { color: '#8892a4' } }}
              >
                {namespaceSecrets.map((secret) => (
                  <MenuItem key={`${secret.namespace}-${secret.secret_name}`} value={secret.secret_name}>
                    {secret.secret_name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="warning"
                startIcon={<RotateIcon />}
                onClick={handleRotate}
                disabled={loading || !secretName || !namespace}
                fullWidth
              >
                {loading ? 'Rotating...' : 'Rotate Secret Now'}
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
                  ? `${namespaceSecrets.length} secret(s) were found for namespace ${namespace}.`
                  : 'No namespace selected yet.'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const RotateSecrets: React.FC = () => (
  <ClusterGuard>
    <RotateSecretsInner />
  </ClusterGuard>
);

export default RotateSecrets;
