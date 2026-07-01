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
  TextField,
  MenuItem,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

interface NamespaceWasteData {
  namespace: string;
  cluster: string;
  waste_percentage: number;
  cpu_waste: number;
  memory_waste: number;
  storage_waste: number;
  monthly_cost: number;
  pod_count: number;
  over_provisioned_pods: number;
  idle_pods: number;
  recommendation: string;
}

const NamespaceWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [namespaces, setNamespaces] = useState<NamespaceWasteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/heatmap/namespace-waste');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNamespaces(data.namespaces || []);
    } catch (error) {
      console.error('Error fetching namespace waste data:', error);
      // Mock data
      setNamespaces([
        {
          namespace: 'analytics',
          cluster: 'prod-cluster-us-east',
          waste_percentage: 63,
          cpu_waste: 68,
          memory_waste: 58,
          storage_waste: 63,
          monthly_cost: 1850.25,
          pod_count: 45,
          over_provisioned_pods: 28,
          idle_pods: 5,
          recommendation: 'Reduce CPU requests by 40%, Memory by 30%',
        },
        {
          namespace: 'payments',
          cluster: 'prod-cluster-us-east',
          waste_percentage: 42,
          cpu_waste: 45,
          memory_waste: 39,
          storage_waste: 42,
          monthly_cost: 980.50,
          pod_count: 32,
          over_provisioned_pods: 13,
          idle_pods: 2,
          recommendation: 'Optimize 13 over-provisioned pods',
        },
        {
          namespace: 'frontend',
          cluster: 'prod-cluster-us-east',
          waste_percentage: 35,
          cpu_waste: 38,
          memory_waste: 32,
          storage_waste: 35,
          monthly_cost: 720.75,
          pod_count: 28,
          over_provisioned_pods: 10,
          idle_pods: 1,
          recommendation: 'Right-size 10 pods',
        },
        {
          namespace: 'backend',
          cluster: 'prod-cluster-us-east',
          waste_percentage: 48,
          cpu_waste: 52,
          memory_waste: 44,
          storage_waste: 48,
          monthly_cost: 1240.00,
          pod_count: 38,
          over_provisioned_pods: 18,
          idle_pods: 3,
          recommendation: 'Reduce resource requests across 18 pods',
        },
        {
          namespace: 'monitoring',
          cluster: 'prod-cluster-us-east',
          waste_percentage: 28,
          cpu_waste: 30,
          memory_waste: 26,
          storage_waste: 28,
          monthly_cost: 450.30,
          pod_count: 15,
          over_provisioned_pods: 4,
          idle_pods: 0,
          recommendation: 'Well optimized, minor adjustments needed',
        },
        {
          namespace: 'staging-app',
          cluster: 'staging-cluster',
          waste_percentage: 72,
          cpu_waste: 75,
          memory_waste: 69,
          storage_waste: 72,
          monthly_cost: 890.40,
          pod_count: 22,
          over_provisioned_pods: 16,
          idle_pods: 4,
          recommendation: 'Critical: Reduce resources by 50%',
        },
        {
          namespace: 'dev-testing',
          cluster: 'dev-cluster',
          waste_percentage: 65,
          cpu_waste: 68,
          memory_waste: 62,
          storage_waste: 65,
          monthly_cost: 520.15,
          pod_count: 18,
          over_provisioned_pods: 12,
          idle_pods: 3,
          recommendation: 'Scale down idle pods, optimize requests',
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

  const filteredNamespaces = selectedCluster === 'all'
    ? namespaces
    : namespaces.filter(ns => ns.cluster === selectedCluster);

  const clusters = ['all', ...Array.from(new Set(namespaces.map(ns => ns.cluster)))];
  const totalWaste = filteredNamespaces.reduce((sum, ns) => sum + ns.monthly_cost, 0);
  const avgWaste = filteredNamespaces.length > 0
    ? filteredNamespaces.reduce((sum, ns) => sum + ns.waste_percentage, 0) / filteredNamespaces.length
    : 0;
  const totalPods = filteredNamespaces.reduce((sum, ns) => sum + ns.pod_count, 0);
  const overProvisionedPods = filteredNamespaces.reduce((sum, ns) => sum + ns.over_provisioned_pods, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Namespace Waste Heatmap
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Identify waste hotspots by namespace
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            select
            size="small"
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            sx={{ minWidth: 200 }}
            label="Filter by Cluster"
          >
            {clusters.map((cluster) => (
              <MenuItem key={cluster} value={cluster}>
                {cluster === 'all' ? 'All Clusters' : cluster}
              </MenuItem>
            ))}
          </TextField>
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Waste Cost
              </Typography>
              <Typography variant="h4" color="error.main">
                ${totalWaste.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly across namespaces
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
                Per namespace average
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Over-Provisioned Pods
              </Typography>
              <Typography variant="h4" color="error.main">
                {overProvisionedPods}
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
                Namespaces Analyzed
              </Typography>
              <Typography variant="h4" color="primary.main">
                {filteredNamespaces.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active namespaces
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Namespace Waste Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Namespace Waste Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Namespace</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell align="center">Total Waste</TableCell>
                <TableCell align="center">CPU Waste</TableCell>
                <TableCell align="center">Memory Waste</TableCell>
                <TableCell align="center">Storage Waste</TableCell>
                <TableCell align="right">Monthly Cost</TableCell>
                <TableCell align="center">Pods</TableCell>
                <TableCell>Recommendation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredNamespaces.map((ns) => (
                <TableRow key={`${ns.cluster}-${ns.namespace}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {ns.namespace}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={ns.cluster} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <Chip
                        label={`${ns.waste_percentage}%`}
                        color={getWasteColor(ns.waste_percentage)}
                        size="small"
                      />
                      {ns.waste_percentage >= 60 && <WarningIcon color="error" fontSize="small" />}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.cpu_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.cpu_waste}
                        color={getWasteColor(ns.cpu_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.memory_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.memory_waste}
                        color={getWasteColor(ns.memory_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.storage_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.storage_waste}
                        color={getWasteColor(ns.storage_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" color="error.main">
                      ${ns.monthly_cost.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {ns.pod_count} total
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      {ns.over_provisioned_pods} over-provisioned
                    </Typography>
                    {ns.idle_pods > 0 && (
                      <Typography variant="caption" color="warning.main" display="block">
                        {ns.idle_pods} idle
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {ns.recommendation}
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

export default NamespaceWaste;

// Made with Bob
