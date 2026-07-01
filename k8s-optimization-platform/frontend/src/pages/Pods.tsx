import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Box, Grid, FormControl, InputLabel, Select,
  MenuItem, CircularProgress, Alert, IconButton, Card, CardContent,
  LinearProgress, Tooltip
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ResourceMetrics {
  current: number;
  average: number;
  peak: number;
  requested: number;
  limit: number;
  utilization_percent: number;
}

interface SmartAnalysis {
  issue: string;
  recommendation: string;
  estimated_savings: number;
  risk_level: string;
}

interface Pod {
  pod_name: string;
  namespace: string;
  cluster_id: string;
  workload_type: string;
  node_name: string;
  cpu_metrics: ResourceMetrics;
  memory_metrics: ResourceMetrics;
  smart_analysis: SmartAnalysis;
  status: string;
  last_restart: string;
  age_days: number;
}

interface Summary {
  total_pods: number;
  over_provisioned: number;
  under_provisioned: number;
  optimized: number;
  total_potential_savings: number;
  avg_cpu_utilization: number;
  avg_memory_utilization: number;
  optimization_opportunities: number;
}

const Pods: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [pods, setPods] = useState<Pod[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, [clusterFilter, namespaceFilter, statusFilter, clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (clusterFilter !== 'all') params.append('cluster', clusterFilter);
      if (namespaceFilter !== 'all') params.append('namespace', namespaceFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await fetch(`${API_BASE_URL}/v1/pods/simulation${clusterParam}&${params}`);
      if (!response.ok) throw new Error('Failed to fetch pods');
      
      const data = await response.json();
      setPods(data || []);
      
      // Calculate summary from simulation data
      const totalPods = data.length;
      const runningPods = data.filter((p: Pod) => p.status === 'running').length;
      const overProvisionedPods = data.filter((p: Pod) =>
        (p.cpu_metrics?.utilization_percent || 0) < 50 || (p.memory_metrics?.utilization_percent || 0) < 50
      ).length;
      const underProvisionedPods = data.filter((p: Pod) =>
        (p.cpu_metrics?.utilization_percent || 0) > 90 || (p.memory_metrics?.utilization_percent || 0) > 90
      ).length;
      const optimizedPods = data.filter((p: Pod) =>
        (p.cpu_metrics?.utilization_percent || 0) >= 50 && (p.cpu_metrics?.utilization_percent || 0) <= 90 &&
        (p.memory_metrics?.utilization_percent || 0) >= 50 && (p.memory_metrics?.utilization_percent || 0) <= 90
      ).length;
      
      const totalSavings = data.reduce((sum: number, p: Pod) =>
        sum + (p.smart_analysis?.estimated_savings || 0), 0
      );
      
      const avgCpuUtil = data.length > 0
        ? data.reduce((sum: number, p: Pod) => sum + (p.cpu_metrics?.utilization_percent || 0), 0) / data.length
        : 0;
      
      const avgMemUtil = data.length > 0
        ? data.reduce((sum: number, p: Pod) => sum + (p.memory_metrics?.utilization_percent || 0), 0) / data.length
        : 0;
      
      setSummary({
        total_pods: totalPods,
        over_provisioned: overProvisionedPods,
        under_provisioned: underProvisionedPods,
        optimized: optimizedPods,
        total_potential_savings: totalSavings,
        avg_cpu_utilization: avgCpuUtil,
        avg_memory_utilization: avgMemUtil,
        optimization_opportunities: overProvisionedPods + underProvisionedPods
      });
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): "success" | "warning" | "error" | "info" => {
    if (status === 'optimized') return 'success';
    if (status === 'over_provisioned') return 'warning';
    return 'error';
  };

  const getRiskColor = (risk: string): "success" | "warning" | "error" => {
    if (risk === 'low') return 'success';
    if (risk === 'medium') return 'warning';
    return 'error';
  };

  const formatMemory = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(0)}MB`;
  const formatStatus = (status: string) => status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const uniqueClusters = Array.from(new Set(pods.map(p => p.cluster_id)));
  const uniqueNamespaces = Array.from(new Set(pods.map(p => p.namespace)));

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Pod Optimization Dashboard</Typography>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Total Pods</Typography><Typography variant="h4">{summary.total_pods}</Typography></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Over Provisioned</Typography><Typography variant="h4" color="warning.main">{summary.over_provisioned}</Typography></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Under Provisioned</Typography><Typography variant="h4" color="error.main">{summary.under_provisioned}</Typography></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Optimized</Typography><Typography variant="h4" color="success.main">{summary.optimized}</Typography></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Potential Savings</Typography><Typography variant="h4" color="success.main">${summary.total_potential_savings.toFixed(0)}/mo</Typography></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Avg CPU Utilization</Typography><Typography variant="h4">{summary.avg_cpu_utilization}%</Typography><LinearProgress variant="determinate" value={summary.avg_cpu_utilization} sx={{ mt: 1 }} /></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Avg Memory Utilization</Typography><Typography variant="h4">{summary.avg_memory_utilization}%</Typography><LinearProgress variant="determinate" value={summary.avg_memory_utilization} sx={{ mt: 1 }} /></CardContent></Card></Grid>
          <Grid item xs={12} sm={6} md={3}><Card><CardContent><Typography color="textSecondary">Optimization Opportunities</Typography><Typography variant="h4" color="info.main">{summary.optimization_opportunities}</Typography></CardContent></Card></Grid>
        </Grid>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}><FormControl fullWidth size="small"><InputLabel>Cluster</InputLabel><Select value={clusterFilter} label="Cluster" onChange={(e) => setClusterFilter(e.target.value)}><MenuItem value="all">All Clusters</MenuItem>{uniqueClusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} sm={4}><FormControl fullWidth size="small"><InputLabel>Namespace</InputLabel><Select value={namespaceFilter} label="Namespace" onChange={(e) => setNamespaceFilter(e.target.value)}><MenuItem value="all">All Namespaces</MenuItem>{uniqueNamespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} sm={4}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}><MenuItem value="all">All Status</MenuItem><MenuItem value="over_provisioned">Over Provisioned</MenuItem><MenuItem value="under_provisioned">Under Provisioned</MenuItem><MenuItem value="optimized">Optimized</MenuItem></Select></FormControl></Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Pod</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">CPU</TableCell>
              <TableCell align="right">Memory</TableCell>
              <TableCell>Analysis</TableCell>
              <TableCell align="right">Savings</TableCell>
              <TableCell>Risk</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pods.map((pod, idx) => (
              <TableRow key={idx} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">{pod.pod_name}</Typography>
                  <Typography variant="caption" color="textSecondary">{pod.namespace} • {pod.cluster_id}</Typography>
                </TableCell>
                <TableCell><Chip label={formatStatus(pod.status)} color={getStatusColor(pod.status)} size="small" /></TableCell>
                <TableCell align="right">
                  <Tooltip title={`Current: ${(pod.cpu_metrics?.current || 0).toFixed(2)} | Avg: ${(pod.cpu_metrics?.average || 0).toFixed(2)} | Requested: ${(pod.cpu_metrics?.requested || 0).toFixed(2)}`}>
                    <Box><Typography variant="body2">{(pod.cpu_metrics?.utilization_percent || 0).toFixed(1)}%</Typography><LinearProgress variant="determinate" value={Math.min(pod.cpu_metrics?.utilization_percent || 0, 100)} color={(pod.cpu_metrics?.utilization_percent || 0) > 80 ? 'error' : 'success'} sx={{ width: 80 }} /></Box>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={`Current: ${formatMemory(pod.memory_metrics?.current || 0)} | Peak: ${formatMemory(pod.memory_metrics?.peak || 0)}`}>
                    <Box><Typography variant="body2">{(pod.memory_metrics?.utilization_percent || 0).toFixed(1)}%</Typography><LinearProgress variant="determinate" value={Math.min(pod.memory_metrics?.utilization_percent || 0, 100)} color={(pod.memory_metrics?.utilization_percent || 0) > 80 ? 'error' : 'success'} sx={{ width: 80 }} /></Box>
                  </Tooltip>
                </TableCell>
                <TableCell><Tooltip title={pod.smart_analysis?.recommendation || ''}><Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{pod.smart_analysis?.issue || 'N/A'}</Typography></Tooltip></TableCell>
                <TableCell align="right"><Typography variant="body2" fontWeight="bold" color={(pod.smart_analysis?.estimated_savings || 0) > 0 ? 'success.main' : 'error.main'}>${(pod.smart_analysis?.estimated_savings || 0).toFixed(0)}</Typography></TableCell>
                <TableCell><Chip label={(pod.smart_analysis?.risk_level || 'unknown').toUpperCase()} color={getRiskColor(pod.smart_analysis?.risk_level || 'low')} size="small" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {pods.length === 0 && <Box sx={{ textAlign: 'center', py: 4 }}><Typography variant="h6" color="textSecondary">No pods found</Typography></Box>}
    </Container>
  );
};

export default Pods;

// Made with Bob
