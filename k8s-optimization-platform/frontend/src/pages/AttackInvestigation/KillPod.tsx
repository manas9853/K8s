import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Delete as KillIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface KillPodStatus {
  killed_pods: unknown[];
  total_killed: number;
  available_targets: string[];
  cluster_name?: string;
  note?: string;
}

const KillPodInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<KillPodStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/kill-pod${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: KillPodStatus = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load killed pods data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const handleKill = async (name: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/response/kill-pod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, namespace: 'unknown' }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setActionResult(`${result.pod_name}: ${result.message}`);
    } catch (err) {
      setActionResult(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const hasKilledPods = useMemo(
    () => (data?.killed_pods?.length ?? 0) > 0,
    [data],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load killed pods data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <KillIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Kill Pod
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real pod termination status for {data.cluster_name || 'cluster'}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      {actionResult && <Alert severity="info" sx={{ mb: 3 }}>{actionResult}</Alert>}

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>Pods Terminated</Typography>
              <Typography variant="h4" fontWeight="bold" sx={{ color: data.total_killed > 0 ? '#ef5350' : '#a5d6a7' }}>
                {data.total_killed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {!hasKilledPods ? (
        <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
            Nothing to display for {data.cluster_name || 'this cluster'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.75, mb: data.available_targets.length > 0 ? 2 : 0 }}>
            {data.note || `No pod termination history was returned for ${data.cluster_name || 'this cluster'}.`}
          </Typography>
          {data.available_targets.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mb: 1 }}>
                Available targets from the backend threat context
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {data.available_targets.map((target) => (
                  <Chip
                    key={target}
                    label={target}
                    onClick={() => handleKill(target)}
                    sx={{ bgcolor: '#131d2e', color: '#90caf9', border: '1px solid #2a3245' }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Paper>
      ) : null}
    </Box>
  );
};

const KillPod: React.FC = () => (
  <ClusterGuard>
    <KillPodInner />
  </ClusterGuard>
);

export default KillPod;
