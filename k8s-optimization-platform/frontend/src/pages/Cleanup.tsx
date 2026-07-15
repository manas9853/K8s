import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button,
  MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import { Refresh, Delete, Schedule, Warning, CheckCircle } from '@mui/icons-material';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import { API_BASE_URL } from '../config/api';

interface CleanupResource {
  resource_type: string;
  resource_name: string;
  namespace: string;
  cluster: string;
  last_used: string;
  days_unused: number;
  monthly_cost: number;
  reason: string;
  risk_level: string;
  dependencies: number;
  can_delete: boolean;
  estimated_savings: number;
}

interface CleanupSummary {
  total_resources: number;
  safe_to_delete: number;
  requires_review: number;
  high_risk: number;
  total_monthly_savings: number;
  total_yearly_savings: number;
  resources_by_type: Record<string, number>;
  resources_by_cluster: Record<string, number>;
}

interface CleanupData {
  summary: CleanupSummary;
  resources: CleanupResource[];
}

const Cleanup: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CleanupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCluster, setFilterCluster] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterRisk, setFilterRisk] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [filterCluster, filterType, filterRisk, clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCluster) params.append('cluster', filterCluster);
      if (filterType) params.append('resource_type', filterType);
      if (filterRisk) params.append('risk_level', filterRisk);
      
      const response = await fetch(`${API_BASE_URL}/v1/cleanup${clusterParam}&${params}`);
      if (!response.ok) throw new Error('Failed to fetch cleanup data');
      setData(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResource = async (resource: CleanupResource) => {
    const key = `${resource.namespace}/${resource.resource_name}`;
    if (!window.confirm(`Delete ${resource.resource_type} "${resource.resource_name}" in namespace "${resource.namespace}"?\nThis action cannot be undone.`)) return;
    setDeleting(key);
    try {
      const res = await fetch(
        `${API_BASE_URL}/v1/cleanup/${encodeURIComponent(resource.resource_type.toLowerCase())}/${encodeURIComponent(resource.resource_name)}?namespace=${encodeURIComponent(resource.namespace)}${clusterParam ? `&cluster=${clusterParam.replace('?cluster_id=', '')}` : ''}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(prev => prev ? {
        ...prev,
        resources: prev.resources.filter(r => !(r.resource_name === resource.resource_name && r.namespace === resource.namespace)),
        summary: { ...prev.summary, total_resources: prev.summary.total_resources - 1 },
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'success';
      case 'Medium': return 'warning';
      case 'High': return 'error';
      default: return 'default';
    }
  };

  const getResourceTypeColor = (type: string) => {
    const colors: Record<string, any> = {
      'Deployment': 'primary',
      'Pod': 'secondary',
      'Service': 'info',
      'Namespace': 'warning',
      'PersistentVolumeClaim': 'error'
    };
    return colors[type] || 'default';
  };

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (!data) return null;

  const clusters = Object.keys(data.summary.resources_by_cluster);
  const resourceTypes = Object.keys(data.summary.resources_by_type);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Resource Cleanup Dashboard</Typography>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography variant="h6" color="text.secondary">Total Resources</Typography><Typography variant="h3">{data.summary.total_resources}</Typography><Typography variant="body2">Cleanup candidates</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ bgcolor: 'success.light', color: 'white' }}><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CheckCircle /><Typography variant="h6">Safe to Delete</Typography></Box><Typography variant="h3">{data.summary.safe_to_delete}</Typography><Typography variant="body2">Low risk resources</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ bgcolor: 'warning.light', color: 'white' }}><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning /><Typography variant="h6">Requires Review</Typography></Box><Typography variant="h3">{data.summary.requires_review}</Typography><Typography variant="body2">Medium/High risk</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ bgcolor: 'primary.main', color: 'white' }}><CardContent><Typography variant="h6">Monthly Savings</Typography><Typography variant="h3">{formatCurrency(data.summary.total_monthly_savings)}</Typography><Typography variant="body2">Yearly: {formatCurrency(data.summary.total_yearly_savings)}</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Filters</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Cluster</InputLabel><Select value={filterCluster} onChange={(e) => setFilterCluster(e.target.value)} label="Cluster"><MenuItem value="">All Clusters</MenuItem>{clusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Resource Type</InputLabel><Select value={filterType} onChange={(e) => setFilterType(e.target.value)} label="Resource Type"><MenuItem value="">All Types</MenuItem>{resourceTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Risk Level</InputLabel><Select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} label="Risk Level"><MenuItem value="">All Risks</MenuItem><MenuItem value="Low">Low</MenuItem><MenuItem value="Medium">Medium</MenuItem><MenuItem value="High">High</MenuItem></Select></FormControl></Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Cleanup Candidates ({data.resources.length})</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Resource Name</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell>Days Unused</TableCell>
                <TableCell>Cost</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell>Deps</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.resources.map((resource, idx) => (
                <TableRow key={idx} sx={{ bgcolor: resource.can_delete ? 'inherit' : 'action.hover' }}>
                  <TableCell><Chip label={resource.resource_type} color={getResourceTypeColor(resource.resource_type)} size="small" /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="bold">{resource.resource_name}</Typography></TableCell>
                  <TableCell>{resource.namespace}</TableCell>
                  <TableCell>{resource.cluster}</TableCell>
                  <TableCell>{resource.last_used}</TableCell>
                  <TableCell><Chip label={`${resource.days_unused}d`} size="small" color={resource.days_unused > 180 ? 'error' : resource.days_unused > 90 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="bold" color={resource.monthly_cost > 0 ? 'error.main' : 'text.secondary'}>{formatCurrency(resource.monthly_cost)}</Typography></TableCell>
                  <TableCell><Chip label={resource.risk_level} color={getRiskColor(resource.risk_level)} size="small" /></TableCell>
                  <TableCell><Chip label={resource.dependencies} size="small" color={resource.dependencies > 0 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Typography variant="body2" sx={{ maxWidth: 250 }}>{resource.reason}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        disabled={!resource.can_delete || deleting === `${resource.namespace}/${resource.resource_name}`}
                        onClick={() => handleDeleteResource(resource)}
                      >
                        {deleting === `${resource.namespace}/${resource.resource_name}` ? 'Deleting…' : 'Delete'}
                      </Button>
                      <Button variant="outlined" size="small" startIcon={<Schedule />}>Schedule</Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Alert severity="info">
          <Typography variant="body2"><strong>Note:</strong> Resources marked as "Requires Review" have dependencies or higher risk levels. Please review carefully before deletion.</Typography>
        </Alert>
      </Box>
    </Container>
  );
};

export default Cleanup;

// Made with Bob
