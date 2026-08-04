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
import { colors } from '../../theme/colors';

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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load killed pods data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <KillIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Kill Pod
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real pod termination status for {data.cluster_name || 'cluster'}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      {actionResult && <Alert severity="info" sx={{ mb: 3 }}>{actionResult}</Alert>}

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>Pods Terminated</Typography>
              <Typography variant="h4" fontWeight="bold" sx={{ color: data.total_killed > 0 ? colors.danger : colors.success }}>
                {data.total_killed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {!hasKilledPods ? (
        <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
            Nothing to display for {data.cluster_name || 'this cluster'}
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.75, mb: data.available_targets.length > 0 ? 2 : 0 }}>
            {data.note || `No pod termination history was returned for ${data.cluster_name || 'this cluster'}.`}
          </Typography>
          {data.available_targets.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 1 }}>
                Available targets from the backend threat context
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {data.available_targets.map((target) => (
                  <Chip
                    key={target}
                    label={target}
                    onClick={() => handleKill(target)}
                    sx={{ bgcolor: colors.surfaceAlt, color: colors.info, border: `1px solid ${colors.border}` }}
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
