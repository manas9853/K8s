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

      // Fetch cluster list directly from the agent receiver endpoint — this
      // endpoint has no org-scoping gate and always returns registered clusters.
      const listRes = await fetch(`${API_BASE_URL}/agents/clusters`);
      if (!listRes.ok) throw new Error(`Failed to fetch clusters: HTTP ${listRes.status}`);
      const listData = await listRes.json();
      const allClusters: { cluster_name: string }[] = listData.clusters ?? [];

      // If a specific cluster is selected, filter down to it
      const targetClusters = activeClusterName === 'All Clusters'
        ? allClusters
        : allClusters.filter(c => c.cluster_name === activeClusterName);

      let totalNodes = 0;
      let totalPods = 0;
      let totalNamespaces = 0;
      let totalHealthScore = 0;
      let monthlyCost = 0;
      let potentialSavings = 0;
      let clustersWithMetrics = 0;

      // Cost constants — matches backend _calculate_costs()
      const CPU_COST_PER_CORE_HOUR = 0.04;
      const MEMORY_COST_PER_GB_HOUR = 0.005;
      const HOURS_PER_MONTH = 730;

      for (const cluster of targetClusters) {
        const mRes = await fetch(`${API_BASE_URL}/agents/clusters/${encodeURIComponent(cluster.cluster_name)}/metrics`);
        if (!mRes.ok) continue;
        const m = await mRes.json();

        const nodesData = m.nodes ?? {};
        const podsData = m.pods ?? {};
        const namespacesData = m.namespaces ?? {};
        const resourcesData = m.resources ?? {};

        const nodeItems: unknown[] = nodesData.items ?? [];
        totalNodes += nodesData.count ?? nodeItems.length;
        totalPods += podsData.total ?? 0;
        totalNamespaces += namespacesData.count ?? 0;

        const cpuCap: number = nodesData.cpu_capacity_cores ?? resourcesData.cpu_capacity_cores ?? 0;
        const memCap: number = nodesData.memory_capacity_gb ?? resourcesData.memory_capacity_gb ?? 0;
        const cpuReq: number = resourcesData.cpu_requested_cores ?? 0;
        const memReq: number = resourcesData.memory_requested_gb ?? 0;

        // Health score — same band logic as backend _calculate_health_score()
        const cpuPct = cpuCap > 0 ? (cpuReq / cpuCap) * 100 : 0;
        const memPct = memCap > 0 ? (memReq / memCap) * 100 : 0;
        const avgPct = (cpuPct + memPct) / 2;
        let score = 65;
        if (avgPct >= 60 && avgPct <= 80) score = 95;
        else if ((avgPct >= 50 && avgPct < 60) || (avgPct > 80 && avgPct <= 85)) score = 85;
        else if ((avgPct >= 40 && avgPct < 50) || (avgPct > 85 && avgPct <= 90)) score = 75;
        totalHealthScore += score;
        clustersWithMetrics++;

        const clusterCost = (cpuReq * CPU_COST_PER_CORE_HOUR + memReq * MEMORY_COST_PER_GB_HOUR) * HOURS_PER_MONTH;
        monthlyCost += clusterCost;
        potentialSavings += clusterCost * 0.30;
      }

      const totalClusters = targetClusters.length;

      setSummary({
        total_clusters: totalClusters,
        total_nodes: totalNodes,
        total_pods: totalPods,
        total_namespaces: totalNamespaces,
        monthly_cost: Math.round(monthlyCost * 100) / 100,
        potential_savings: Math.round(potentialSavings * 100) / 100,
        resources_optimized: 0,
        resources_pending: totalPods,
        unused_resources: 0,
        cluster_health_score: clustersWithMetrics > 0 ? Math.round(totalHealthScore / clustersWithMetrics) : 0,
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
        // Only pull cost/savings from simulation — do NOT overwrite cluster/pod
        // counts which come from real agent metrics fetched in fetchDashboardData.
        setSummary(prev => prev ? {
          ...prev,
          monthly_cost: data.current_monthly_cost || prev.monthly_cost,
          potential_savings: data.potential_savings || prev.potential_savings,
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