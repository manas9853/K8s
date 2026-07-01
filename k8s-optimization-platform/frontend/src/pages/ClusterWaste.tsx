import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface ClusterWasteData {
  cluster_name: string;
  total_waste_percentage: number;
  cpu_waste_percentage: number;
  memory_waste_percentage: number;
  storage_waste_percentage: number;
  monthly_waste_cost: number;
  total_pods: number;
  wasted_pods: number;
  efficiency_score: number;
  waste_trend: string;
}

const ClusterWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [clusters, setClusters] = useState<ClusterWasteData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/heatmap/cluster-waste');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (error) {
      console.error('Error fetching cluster waste data:', error);
      // Mock data for development
      setClusters([
        {
          cluster_name: 'prod-cluster-us-east',
          total_waste_percentage: 45,
          cpu_waste_percentage: 52,
          memory_waste_percentage: 38,
          storage_waste_percentage: 45,
          monthly_waste_cost: 4250.50,
          total_pods: 287,
          wasted_pods: 129,
          efficiency_score: 55,
          waste_trend: 'increasing',
        },
        {
          cluster_name: 'prod-cluster-eu-west',
          total_waste_percentage: 32,
          cpu_waste_percentage: 35,
          memory_waste_percentage: 29,
          storage_waste_percentage: 32,
          monthly_waste_cost: 2890.25,
          total_pods: 198,
          wasted_pods: 63,
          efficiency_score: 68,
          waste_trend: 'stable',
        },
        {
          cluster_name: 'staging-cluster',
          total_waste_percentage: 68,
          cpu_waste_percentage: 72,
          memory_waste_percentage: 64,
          storage_waste_percentage: 68,
          monthly_waste_cost: 1245.75,
          total_pods: 145,
          wasted_pods: 99,
          efficiency_score: 32,
          waste_trend: 'increasing',
        },
        {
          cluster_name: 'dev-cluster',
          total_waste_percentage: 58,
          cpu_waste_percentage: 61,
          memory_waste_percentage: 55,
          storage_waste_percentage: 58,
          monthly_waste_cost: 890.40,
          total_pods: 89,
          wasted_pods: 52,
          efficiency_score: 42,
          waste_trend: 'decreasing',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getWasteColor = (percentage: number) => {
    if (percentage >= 60) return 'error';
    if (percentage >= 40) return 'warning';
    return 'success';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') return <TrendingUpIcon color="error" />;
    if (trend === 'decreasing') return <TrendingUpIcon color="success" sx={{ transform: 'rotate(180deg)' }} />;
    return <TrendingUpIcon color="info" sx={{ transform: 'rotate(90deg)' }} />;
  };

  const totalWaste = clusters.reduce((sum, c) => sum + c.monthly_waste_cost, 0);
  const avgWaste = clusters.length > 0 ? clusters.reduce((sum, c) => sum + c.total_waste_percentage, 0) / clusters.length : 0;
  const totalPods = clusters.reduce((sum, c) => sum + c.total_pods, 0);
  const wastedPods = clusters.reduce((sum, c) => sum + c.wasted_pods, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cluster Waste Heatmap
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visualize resource waste across all clusters
          </Typography>
        </Box>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Monthly Waste
              </Typography>
              <Typography variant="h4" color="error.main">
                ${totalWaste.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across {clusters.length} clusters
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Waste
              </Typography>
              <Typography variant="h4" color="warning.main">
                {avgWaste.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per cluster average
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Wasted Pods
              </Typography>
              <Typography variant="h4" color="error.main">
                {wastedPods}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Out of {totalPods} total pods
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Clusters Analyzed
              </Typography>
              <Typography variant="h4" color="primary.main">
                {clusters.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active clusters
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cluster Waste Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Cluster Waste Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cluster Name</TableCell>
                <TableCell align="center">Total Waste</TableCell>
                <TableCell align="center">CPU Waste</TableCell>
                <TableCell align="center">Memory Waste</TableCell>
                <TableCell align="center">Storage Waste</TableCell>
                <TableCell align="right">Monthly Cost</TableCell>
                <TableCell align="center">Efficiency Score</TableCell>
                <TableCell align="center">Trend</TableCell>
                <TableCell align="center">Wasted Pods</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.cluster_name} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {cluster.cluster_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <Chip
                        label={`${cluster.total_waste_percentage}%`}
                        color={getWasteColor(cluster.total_waste_percentage)}
                        size="small"
                      />
                      {cluster.total_waste_percentage >= 50 && (
                        <Tooltip title="High waste detected">
                          <WarningIcon color="error" fontSize="small" />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.cpu_waste_percentage}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.cpu_waste_percentage}
                        color={getWasteColor(cluster.cpu_waste_percentage)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.memory_waste_percentage}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.memory_waste_percentage}
                        color={getWasteColor(cluster.memory_waste_percentage)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.storage_waste_percentage}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.storage_waste_percentage}
                        color={getWasteColor(cluster.storage_waste_percentage)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" color="error.main">
                      ${cluster.monthly_waste_cost.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${cluster.efficiency_score}/100`}
                      color={cluster.efficiency_score >= 70 ? 'success' : cluster.efficiency_score >= 50 ? 'warning' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`Waste is ${cluster.waste_trend}`}>
                      {getTrendIcon(cluster.waste_trend)}
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {cluster.wasted_pods} / {cluster.total_pods}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({((cluster.wasted_pods / cluster.total_pods) * 100).toFixed(1)}%)
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default ClusterWaste;

// Made with Bob
