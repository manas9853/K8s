import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Button,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface NamespaceConsumption {
  namespace: string;
  total_capacity: string;
  total_used: string;
  total_free: string;
  usage_percentage: number;
  pvc_count: number;
  unbound_pvcs: number;
  storage_classes: string[];
  cost_estimate: number;
  has_real_usage: boolean;
}

interface TotalStats {
  total_capacity: string;
  total_used: string;
  usage_percentage: number;
  total_cost: number;
}

const StorageConsumption: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [consumption, setConsumption] = useState<NamespaceConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalStats, setTotalStats] = useState<TotalStats>({
    total_capacity: '0Gi',
    total_used: '0Gi',
    usage_percentage: 0,
    total_cost: 0,
  });

  const fetchConsumption = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/storage/consumption${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setConsumption(data.namespaces || []);
      if (data.total) setTotalStats(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch storage consumption');
      console.error('Error fetching storage consumption:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsumption();
  }, [clusterParam]);

  const getUsageColor = (pct: number): 'error' | 'warning' | 'success' | 'primary' => {
    if (pct >= 85) return 'error';
    if (pct >= 60) return 'warning';
    if (pct > 0)   return 'primary';
    return 'success';
  };

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">Storage Consumption</Typography>
        </Box>
        <IconButton onClick={fetchConsumption} color="primary"><RefreshIcon /></IconButton>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Provisioned</Typography>
              <Typography variant="h4">{totalStats.total_capacity}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Used</Typography>
              <Typography variant="h4">{totalStats.total_used}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Utilization</Typography>
              <Typography variant="h4" color={`${getUsageColor(totalStats.usage_percentage)}.main`}>
                {totalStats.usage_percentage}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(totalStats.usage_percentage, 100)}
                color={getUsageColor(totalStats.usage_percentage)}
                sx={{ mt: 1, height: 6, borderRadius: 3 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Est. Monthly Cost</Typography>
              <Typography variant="h4">${totalStats.total_cost.toFixed(2)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Consumption by Namespace</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Namespace</strong></TableCell>
                  <TableCell><strong>Provisioned</strong></TableCell>
                  <TableCell><strong>Used</strong></TableCell>
                  <TableCell><strong>Free</strong></TableCell>
                  <TableCell><strong>Utilization</strong></TableCell>
                  <TableCell><strong>PVCs</strong></TableCell>
                  <TableCell><strong>Unbound</strong></TableCell>
                  <TableCell><strong>Storage Classes</strong></TableCell>
                  <TableCell><strong>Cost/Month</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center"><CircularProgress size={24} /></TableCell>
                  </TableRow>
                ) : consumption.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Alert severity="info">No storage consumption data available</Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  consumption.map((item) => (
                    <TableRow key={item.namespace} hover>
                      <TableCell><strong>{item.namespace}</strong></TableCell>
                      <TableCell>{item.total_capacity}</TableCell>
                      <TableCell>
                        {item.has_real_usage ? (
                          <Typography variant="body2">{item.total_used}</Typography>
                        ) : (
                          <Tooltip title="PVCs not mounted — no filesystem stats available" arrow>
                            <Chip label="N/A" size="small" variant="outlined" />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={item.has_real_usage && item.usage_percentage >= 85 ? 'error' : 'text.secondary'}>
                          {item.total_free}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 160 }}>
                        {item.has_real_usage ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(item.usage_percentage, 100)}
                                color={getUsageColor(item.usage_percentage)}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                            </Box>
                            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                              {item.usage_percentage}%
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>{item.pvc_count}</TableCell>
                      <TableCell>
                        {item.unbound_pvcs > 0 ? (
                          <Tooltip title="PVCs not mounted by any pod — potential cost saving" arrow>
                            <Chip
                              icon={<WarningIcon />}
                              label={item.unbound_pvcs}
                              size="small"
                              color="warning"
                            />
                          </Tooltip>
                        ) : (
                          <Chip label="0" size="small" color="success" />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.storage_classes.map((sc) => (
                          <Chip key={sc} label={sc} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>${item.cost_estimate.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default StorageConsumption;

// Made with Bob
