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
  LinearProgress,
  Chip,
  Tooltip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  Memory as MemoryIcon,
  Storage as StorageIcon,
  NetworkCheck as NetworkIcon,
  Widgets as PodsIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ResourceData {
  capacity_cores?: number;
  requested_cores?: number;
  used_cores?: number;
  utilization_percent?: number;
  available_cores?: number;
  capacity_gb?: number;
  requested_gb?: number;
  used_gb?: number;
  available_gb?: number;
  total_gb?: number;
  ingress_mbps?: number;
  egress_mbps?: number;
  connections?: number;
  total?: number;
  running?: number;
  pending?: number;
  failed?: number;
  succeeded?: number;
}

interface ResourceUtilizationData {
  cluster_name: string;
  timestamp: string;
  cpu: ResourceData;
  memory: ResourceData;
  storage: ResourceData;
  network: ResourceData;
  pods: ResourceData;
}

const ResourceUtilization: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();

  const [data, setData] = useState<ResourceUtilizationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedClusterId, setSelectedClusterId] = useState<string>(
    activeClusterId || 'all'
  );

  // Sync local selector when the global active cluster changes
  useEffect(() => {
    setSelectedClusterId(activeClusterId || 'all');
  }, [activeClusterId]);

  // Only fetch when cluster list is ready and at least one cluster is registered
  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchResourceUtilization(selectedClusterId);
    const interval = setInterval(() => fetchResourceUtilization(selectedClusterId), 30000);
    return () => clearInterval(interval);
  }, [selectedClusterId, clusters, clustersLoading]);

  const fetchResourceUtilization = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all'
        ? `?cluster_id=${encodeURIComponent(clusterId)}`
        : '';
      const response = await fetch(`${API_BASE_URL}/v1/clusters/resource-utilization/all${param}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch resource utilization');
      console.error('Error fetching resource utilization:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getUtilizationColor = (utilization: number): "success" | "warning" | "error" => {
    if (utilization < 60) return 'success';
    if (utilization < 80) return 'warning';
    return 'error';
  };

  const getUtilizationTooltip = (utilization: number): string => {
    if (utilization < 60) return 'Healthy utilization - Resources are well balanced';
    if (utilization < 80) return 'Warning - Consider monitoring resource usage closely';
    return 'Critical - High utilization may cause performance issues';
  };

  // ── Loading cluster list ──────────────────────────────────────────────────
  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // ── No clusters registered — script not run yet ───────────────────────────
  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">
          No clusters attached yet
        </Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Resource utilization is scoped to registered clusters. Run the
          onboarding script or connect a cluster first, then come back here
          to see live utilization data.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/cluster-onboarding')}
        >
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  if (loading && data.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box p={3}>
        <Alert severity="info">No resource utilization data available for the selected cluster.</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header with cluster selector */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Multi-Cluster Resource Utilization
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Real-time resource usage across{' '}
            {selectedClusterId === 'all'
              ? `all ${clusters.length} registered clusters`
              : clusters.find((c) => c.id === selectedClusterId)?.name ?? selectedClusterId}
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select
            value={selectedClusterId}
            label="Cluster"
            onChange={handleClusterChange}
          >
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Render each cluster's resource utilization */}
      {data.map((cluster) => (
        <Box key={cluster.cluster_name} sx={{ mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} mt={3}>
            <Typography variant="h5">
              {cluster.cluster_name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Last updated: {new Date(cluster.timestamp).toLocaleString()}
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {/* CPU Utilization */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <MemoryIcon color="primary" />
                    <Typography variant="h6">CPU Utilization</Typography>
                  </Box>
                  
                  <Box mb={3}>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Utilization</Typography>
                      <Tooltip title={getUtilizationTooltip(cluster.cpu.utilization_percent || 0)} arrow>
                        <Typography variant="h6" color={`${getUtilizationColor(cluster.cpu.utilization_percent || 0)}.main`}>
                          {cluster.cpu.utilization_percent?.toFixed(1)}%
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={getUtilizationTooltip(cluster.cpu.utilization_percent || 0)} arrow>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.cpu.utilization_percent || 0}
                        color={getUtilizationColor(cluster.cpu.utilization_percent || 0)}
                        sx={{ height: 10, borderRadius: 1 }}
                      />
                    </Tooltip>
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Capacity</Typography>
                      <Typography variant="h6">{cluster.cpu.capacity_cores?.toFixed(2)} cores</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Requested</Typography>
                      <Typography variant="h6">{cluster.cpu.requested_cores?.toFixed(2)} cores</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Used</Typography>
                      <Typography variant="h6">{cluster.cpu.used_cores?.toFixed(2)} cores</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Available</Typography>
                      <Typography variant="h6" color="success.main">
                        {cluster.cpu.available_cores?.toFixed(2)} cores
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Memory Utilization */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <StorageIcon color="secondary" />
                    <Typography variant="h6">Memory Utilization</Typography>
                  </Box>
                  
                  <Box mb={3}>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Utilization</Typography>
                      <Tooltip title={getUtilizationTooltip(cluster.memory.utilization_percent || 0)} arrow>
                        <Typography variant="h6" color={`${getUtilizationColor(cluster.memory.utilization_percent || 0)}.main`}>
                          {cluster.memory.utilization_percent?.toFixed(1)}%
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={getUtilizationTooltip(cluster.memory.utilization_percent || 0)} arrow>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.memory.utilization_percent || 0}
                        color={getUtilizationColor(cluster.memory.utilization_percent || 0)}
                        sx={{ height: 10, borderRadius: 1 }}
                      />
                    </Tooltip>
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Capacity</Typography>
                      <Typography variant="h6">{cluster.memory.capacity_gb?.toFixed(2)} GB</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Requested</Typography>
                      <Typography variant="h6">{cluster.memory.requested_gb?.toFixed(2)} GB</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Used</Typography>
                      <Typography variant="h6">{cluster.memory.used_gb?.toFixed(2)} GB</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">Available</Typography>
                      <Typography variant="h6" color="success.main">
                        {cluster.memory.available_gb?.toFixed(2)} GB
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Storage Utilization */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <StorageIcon color="info" />
                    <Typography variant="h6">Storage Utilization</Typography>
                  </Box>
                  
                  <Box mb={3}>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">Utilization</Typography>
                      <Tooltip title={getUtilizationTooltip(cluster.storage.utilization_percent || 0)} arrow>
                        <Typography variant="h6" color={`${getUtilizationColor(cluster.storage.utilization_percent || 0)}.main`}>
                          {cluster.storage.utilization_percent?.toFixed(1)}%
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={getUtilizationTooltip(cluster.storage.utilization_percent || 0)} arrow>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.storage.utilization_percent || 0}
                        color={getUtilizationColor(cluster.storage.utilization_percent || 0)}
                        sx={{ height: 10, borderRadius: 1 }}
                      />
                    </Tooltip>
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Total</Typography>
                      <Typography variant="h6">{cluster.storage.total_gb} GB</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Used</Typography>
                      <Typography variant="h6">{cluster.storage.used_gb} GB</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Available</Typography>
                      <Typography variant="h6" color="success.main">
                        {cluster.storage.available_gb} GB
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Network Metrics */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <NetworkIcon color="success" />
                    <Typography variant="h6">Network Metrics</Typography>
                  </Box>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Ingress</Typography>
                      <Typography variant="h6">{cluster.network.ingress_mbps} Mbps</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Egress</Typography>
                      <Typography variant="h6">{cluster.network.egress_mbps} Mbps</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption" color="textSecondary">Connections</Typography>
                      <Typography variant="h6">{cluster.network.connections}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Pod Distribution */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={3}>
                    <PodsIcon color="primary" />
                    <Typography variant="h6">Pod Distribution</Typography>
                  </Box>
                  
                  <Grid container spacing={3}>
                    <Grid item xs={6} sm={3}>
                      <Box textAlign="center">
                        <Typography variant="h3" color="primary.main">
                          {cluster.pods.total}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Total Pods
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Box textAlign="center">
                        <Typography variant="h3" color="success.main">
                          {cluster.pods.running}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Running
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Tooltip title="Pods waiting for resources or scheduling. Check node capacity if this number is high." arrow>
                        <Box textAlign="center">
                          <Typography variant="h3" color="warning.main">
                            {cluster.pods.pending}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Pending
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Tooltip title="Pods that have failed to start or crashed. Investigate logs and events immediately." arrow>
                        <Box textAlign="center">
                          <Typography variant="h3" color="error.main">
                            {cluster.pods.failed}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Failed
                          </Typography>
                        </Box>
                      </Tooltip>
                    </Grid>
                  </Grid>

                  <Box mt={3} display="flex" gap={1} justifyContent="center">
                    <Chip label={`${cluster.pods.running} Running`} color="success" size="small" />
                    <Tooltip title="Pods waiting for resources or scheduling" arrow>
                      <Chip label={`${cluster.pods.pending} Pending`} color="warning" size="small" />
                    </Tooltip>
                    <Tooltip title="Pods that have failed - requires investigation" arrow>
                      <Chip label={`${cluster.pods.failed} Failed`} color="error" size="small" />
                    </Tooltip>
                    <Chip label={`${cluster.pods.succeeded} Succeeded`} color="info" size="small" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      ))}
    </Box>
  );
};

export default ResourceUtilization;

// Made with Bob
