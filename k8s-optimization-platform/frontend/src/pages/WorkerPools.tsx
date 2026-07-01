import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface WorkerPoolInfo {
  name: string;
  node_count: number;
  instance_type: string;
  cpu_per_node: string;
  memory_per_node: string;
  disk_per_node: string;
  auto_scaling: boolean;
  min_nodes: number;
  max_nodes: number;
  current_utilization: number;
  status: string;
  labels: Record<string, string>;
}

const WorkerPools: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();

  const [pools, setPools] = useState<WorkerPoolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');

  useEffect(() => {
    setSelectedClusterId(activeClusterId || 'all');
  }, [activeClusterId]);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchWorkerPools(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const fetchWorkerPools = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all'
        ? `?cluster_id=${encodeURIComponent(clusterId)}`
        : '';
      const response = await fetch(`${API_BASE_URL}/v1/clusters/worker-pools${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setPools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch worker pools');
    } finally {
      setLoading(false);
    }
  };

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    switch (status.toLowerCase()) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      default: return 'error';
    }
  };

  const getUtilizationColor = (u: number): 'success' | 'warning' | 'error' => {
    if (u < 60) return 'success';
    if (u < 80) return 'warning';
    return 'error';
  };

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Worker pool data is scoped to registered clusters. Connect a cluster via the Cluster
          Onboarding page and worker pool information will appear here automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  const totalNodes = pools.reduce((s, p) => s + p.node_count, 0);
  const autoScalingCount = pools.filter(p => p.auto_scaling).length;
  const avgUtilization = pools.length > 0
    ? pools.reduce((s, p) => s + p.current_utilization, 0) / pools.length
    : 0;

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h4" gutterBottom>Worker Pools</Typography>
          <Typography variant="body2" color="textSecondary">
            Node pool configuration and scaling for{' '}
            {selectedClusterId === 'all'
              ? `all ${clusters.length} clusters`
              : clusters.find(c => c.id === selectedClusterId)?.name ?? selectedClusterId}
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* Summary cards */}
      <Grid container spacing={3} sx={{ my: 2 }}>
        {[
          { label: 'Total Pools', value: loading ? '—' : pools.length },
          { label: 'Total Nodes', value: loading ? '—' : totalNodes },
          { label: 'Auto-Scaling Enabled', value: loading ? '—' : autoScalingCount, color: 'success.main' },
          { label: 'Avg Utilization', value: loading ? '—' : `${avgUtilization.toFixed(1)}%` },
        ].map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>{card.label}</Typography>
                <Typography variant="h4" color={card.color}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {loading && (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      )}

      {!loading && pools.length === 0 && (
        <Alert severity="info">No worker pools found for the selected cluster.</Alert>
      )}

      {/* Pool cards */}
      {!loading && pools.map(pool => (
        <Card key={pool.name} sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6">{pool.name}</Typography>
                <Typography variant="body2" color="textSecondary">{pool.instance_type}</Typography>
              </Box>
              <Box display="flex" gap={1}>
                <Chip
                  label={pool.status}
                  color={getStatusColor(pool.status)}
                  icon={pool.status === 'healthy' ? <CheckCircleIcon /> : <WarningIcon />}
                />
                {pool.auto_scaling && <Chip label="Auto-Scaling" color="info" size="small" />}
              </Box>
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Resource Configuration</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      {[
                        ['CPU per Node', pool.cpu_per_node],
                        ['Memory per Node', pool.memory_per_node],
                        ['Disk per Node', pool.disk_per_node],
                        ['Node Count', pool.node_count],
                      ].map(([label, val]) => (
                        <TableRow key={String(label)}>
                          <TableCell>{label}</TableCell>
                          <TableCell align="right"><strong>{val}</strong></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Scaling Configuration</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      {[
                        ['Auto-Scaling', pool.auto_scaling ? 'Enabled' : 'Disabled'],
                        ['Min Nodes', pool.min_nodes],
                        ['Max Nodes', pool.max_nodes],
                        ['Current Nodes', pool.node_count],
                      ].map(([label, val]) => (
                        <TableRow key={String(label)}>
                          <TableCell>{label}</TableCell>
                          <TableCell align="right"><strong>{val}</strong></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box mt={2}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2">Utilization</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {pool.current_utilization.toFixed(1)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(pool.current_utilization, 100)}
                    color={getUtilizationColor(pool.current_utilization)}
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>
              </Grid>
            </Grid>

            {Object.keys(pool.labels).length > 0 && (
              <Box mt={2}>
                <Typography variant="subtitle2" gutterBottom>Labels</Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                  {Object.entries(pool.labels).map(([k, v]) => (
                    <Chip key={k} label={`${k}: ${v}`} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default WorkerPools;

// Made with Bob
