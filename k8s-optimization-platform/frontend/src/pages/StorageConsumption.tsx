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
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface StorageConsumption {
  namespace: string;
  total_capacity: string;
  total_used: string;
  usage_percentage: number;
  pvc_count: number;
  storage_classes: string[];
  trend: string;
  cost_estimate: number;
}

const StorageConsumption: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [consumption, setConsumption] = useState<StorageConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    total_capacity: '0 GB',
    total_used: '0 GB',
    usage_percentage: 0,
    total_cost: 0,
  });

  const fetchConsumption = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/storage/consumption`);
      const data = await response.json();
      setConsumption(data.namespaces || []);
      setTotalStats(data.total || totalStats);
    } catch (error) {
      console.error('Error fetching storage consumption:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsumption();
  }, [clusterParam]);

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'error';
    if (percentage >= 75) return 'warning';
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
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
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
        <IconButton onClick={fetchConsumption} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Total Statistics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Capacity</Typography>
              <Typography variant="h4">{totalStats.total_capacity}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Used</Typography>
              <Typography variant="h4">{totalStats.total_used}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Usage</Typography>
              <Typography variant="h4" color={getUsageColor(totalStats.usage_percentage)}>
                {totalStats.usage_percentage}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={totalStats.usage_percentage}
                color={getUsageColor(totalStats.usage_percentage)}
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Monthly Cost</Typography>
              <Typography variant="h4">${totalStats.total_cost.toFixed(2)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Consumption by Namespace */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Consumption by Namespace</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Namespace</strong></TableCell>
                  <TableCell><strong>Capacity</strong></TableCell>
                  <TableCell><strong>Used</strong></TableCell>
                  <TableCell><strong>Usage</strong></TableCell>
                  <TableCell><strong>PVCs</strong></TableCell>
                  <TableCell><strong>Storage Classes</strong></TableCell>
                  <TableCell><strong>Trend</strong></TableCell>
                  <TableCell><strong>Cost/Month</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">Loading...</TableCell>
                  </TableRow>
                ) : consumption.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Alert severity="info">No storage consumption data available</Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  consumption.map((item) => (
                    <TableRow key={item.namespace}>
                      <TableCell><strong>{item.namespace}</strong></TableCell>
                      <TableCell>{item.total_capacity}</TableCell>
                      <TableCell>{item.total_used}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">{item.usage_percentage}%</Typography>
                          <LinearProgress
                            variant="determinate"
                            value={item.usage_percentage}
                            color={getUsageColor(item.usage_percentage)}
                            sx={{ width: 100 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>{item.pvc_count}</TableCell>
                      <TableCell>
                        {item.storage_classes.map((sc, idx) => (
                          <Chip key={idx} label={sc} size="small" sx={{ mr: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={<TrendingUpIcon />}
                          label={item.trend}
                          size="small"
                          color={item.trend === 'increasing' ? 'warning' : 'default'}
                        />
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
