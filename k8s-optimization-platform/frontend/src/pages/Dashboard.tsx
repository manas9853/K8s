import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
} from '@mui/material';
import {
  TrendingDown,
  Storage,
  Memory,
  AccountTree,
  Dns
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import { Add as AddIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ClusterSummary {
  total_clusters: number;
  total_nodes: number;
  total_pods: number;
  total_namespaces: number;
  monthly_cost: number;
  potential_savings: number;
  resources_optimized: number;
  resources_pending: number;
  unused_resources: number;
  cluster_health_score: number;
}

interface SimulationMetrics {
  total_clusters: number;
  total_pods: number;
  current_monthly_cost: number;
  baseline_monthly_cost: number;
  potential_savings: number;
  savings_realized: number;
  optimization_percentage: number;
  last_updated: string;
}

interface ClusterFilter {
  environment: string;
  namespace: string;
  team: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  // 🌐 Cluster-scoped: re-fetches whenever the active cluster changes or is deleted
  const { clusterParam, activeClusterName } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ClusterSummary | null>(null);
  
  const [simulationMetrics, setSimulationMetrics] = useState<SimulationMetrics | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  
  const [filters, setFilters] = useState<ClusterFilter>({
    environment: 'all',
    namespace: 'all',
    team: 'all'
  });

  useEffect(() => {
    fetchDashboardData();
    fetchSimulationMetrics();

    // Poll simulation metrics every 5 seconds for real-time updates
    const interval = setInterval(fetchSimulationMetrics, 5000);
    return () => clearInterval(interval);
    // clusterParam ensures re-fetch when user switches cluster or deletes one
  }, [filters, clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch registered clusters from agent receiver
      const clustersRes = await fetch(`${API_BASE_URL}/agents/clusters`);
      if (!clustersRes.ok) throw new Error('Failed to fetch clusters');
      const clustersData = await clustersRes.json();
      const agentClusters: any[] = clustersData.clusters ?? [];

      // Aggregate metrics across all agent clusters
      let totalNodes = 0, totalPods = 0, totalNamespaces = 0;
      for (const c of agentClusters) {
        const mRes = await fetch(`${API_BASE_URL}/agents/clusters/${c.cluster_name}/metrics`);
        if (!mRes.ok) {
          console.warn(
            `[Dashboard] metrics fetch failed for cluster "${c.cluster_name}": ` +
            `HTTP ${mRes.status} — nodes will count as 0 for this cluster.`
          );
          continue;
        }
        const m = await mRes.json();
        // Prefer nodes.count; fall back to nodes.items.length in case the
        // agent sent items but the count key was missing (e.g. partial payload).
        const nodeItems: unknown[] = m.nodes?.items ?? [];
        totalNodes += m.nodes?.count ?? nodeItems.length;
        totalPods += m.pods?.total ?? 0;
        totalNamespaces += m.namespaces?.count ?? 0;
      }

      setSummary({
        total_clusters: agentClusters.length,
        total_nodes: totalNodes,
        total_pods: totalPods,
        total_namespaces: totalNamespaces,
        monthly_cost: 0,
        potential_savings: 0,
        resources_optimized: 0,
        resources_pending: 0,
        unused_resources: 0,
        cluster_health_score: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSimulationMetrics = async () => {
    try {
      setSimulationLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/simulation/metrics/global${clusterParam}`);
      
      if (response.ok) {
        const data = await response.json();
        setSimulationMetrics(data);
        
        // Update summary with real-time simulation data
        setSummary(prev => prev ? {
          ...prev,
          total_clusters: data.total_clusters,
          total_pods: data.total_pods,
          monthly_cost: data.current_monthly_cost,
          potential_savings: data.potential_savings
        } : null);
      }
    } catch (err) {
      console.error('Failed to fetch simulation metrics:', err);
    } finally {
      setSimulationLoading(false);
    }
  };

  const handleFilterChange = (field: keyof ClusterFilter) => (event: SelectChangeEvent) => {
    setFilters(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
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
          The dashboard aggregates data from all registered clusters. Connect a cluster
          first using the Cluster Onboarding page and metrics will start appearing here.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          {activeClusterName === 'All Clusters'
            ? 'Unified Multi-Cluster Dashboard'
            : `Dashboard — ${activeClusterName}`}
        </Typography>
        {summary && (
          <Chip
            label={`Health Score: ${summary?.cluster_health_score ?? 0}%`}
            color={getHealthColor(summary?.cluster_health_score ?? 0)}
            size="medium"
          />
        )}
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Environment</InputLabel>
              <Select
                value={filters.environment}
                label="Environment"
                onChange={handleFilterChange('environment')}
              >
                <MenuItem value="all">All Environments</MenuItem>
                <MenuItem value="production">Production</MenuItem>
                <MenuItem value="staging">Staging</MenuItem>
                <MenuItem value="qa">QA</MenuItem>
                <MenuItem value="development">Development</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Namespace</InputLabel>
              <Select
                value={filters.namespace}
                label="Namespace"
                onChange={handleFilterChange('namespace')}
              >
                <MenuItem value="all">All Namespaces</MenuItem>
                <MenuItem value="default">default</MenuItem>
                <MenuItem value="kube-system">kube-system</MenuItem>
                <MenuItem value="analytics">analytics</MenuItem>
                <MenuItem value="payments">payments</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Team</InputLabel>
              <Select
                value={filters.team}
                label="Team"
                onChange={handleFilterChange('team')}
              >
                <MenuItem value="all">All Teams</MenuItem>
                <MenuItem value="platform">Platform</MenuItem>
                <MenuItem value="backend">Backend</MenuItem>
                <MenuItem value="frontend">Frontend</MenuItem>
                <MenuItem value="data">Data</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Storage color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="text.secondary">
                  Total Clusters
                </Typography>
              </Box>
              <Typography variant="h3">{summary?.total_clusters ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Across all environments
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Dns color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="text.secondary">
                  Total Nodes
                </Typography>
              </Box>
              <Typography variant="h3">{summary?.total_nodes ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Active compute nodes
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Memory color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="text.secondary">
                  Total Pods
                </Typography>
              </Box>
              <Typography variant="h3">{summary?.total_pods ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Running workloads
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AccountTree color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="text.secondary">
                  Total Namespaces
                </Typography>
              </Box>
              <Typography variant="h3">{summary?.total_namespaces ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Logical partitions
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cost & Optimization */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Monthly Infrastructure Cost
              </Typography>
              <Box display="flex" alignItems="baseline" mb={2}>
                <Typography variant="h3" color="primary">
                  {summary ? formatCurrency(summary.monthly_cost) : '—'}
                </Typography>
                <Typography variant="body1" color="text.secondary" ml={1}>
                  /month
                </Typography>
              </Box>
              {simulationMetrics && (
                <Box mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Baseline: {formatCurrency(simulationMetrics.baseline_monthly_cost)}
                  </Typography>
                </Box>
              )}
              <Box display="flex" alignItems="center">
                <TrendingDown color="success" sx={{ mr: 1 }} />
                <Typography variant="body2" color="success.main">
                  Potential Savings: {summary ? formatCurrency(summary.potential_savings) : '—'}
                </Typography>
              </Box>
              {simulationMetrics && simulationMetrics.savings_realized > 0 && (
                <Box display="flex" alignItems="center" mt={1}>
                  <Typography variant="body2" color="success.main" fontWeight="bold">
                    ✓ Savings Realized: {formatCurrency(simulationMetrics.savings_realized)}
                  </Typography>
                </Box>
              )}
              {simulationMetrics && (
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  Last updated: {new Date(simulationMetrics.last_updated).toLocaleTimeString()}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Optimization Status
              </Typography>
              {simulationMetrics && (
                <Box mb={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2" color="text.secondary">
                      Optimization Progress
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      {simulationMetrics.optimization_percentage.toFixed(2)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={simulationMetrics.optimization_percentage}
                    color="primary"
                    sx={{ height: 8, borderRadius: 4, mb: 2 }}
                  />
                </Box>
              )}
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Typography variant="h4" color="success.main">
                    {summary?.resources_optimized ?? '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Optimized
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="h4" color="warning.main">
                    {summary?.resources_pending ?? '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pending
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="h4" color="error.main">
                    {summary?.unused_resources ?? '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Unused
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Cluster Health Score
              </Typography>
              <Box display="flex" alignItems="center" mb={1}>
                <Box flexGrow={1} mr={2}>
                  <LinearProgress 
                    variant="determinate" 
                    value={summary?.cluster_health_score ?? 0} 
                    color={getHealthColor(summary?.cluster_health_score ?? 0)}
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>
                <Typography variant="h6">
                  {summary?.cluster_health_score ?? 0}%
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Based on CPU efficiency, memory efficiency, node utilization, storage utilization, and cleanup status
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;

// Made with Bob