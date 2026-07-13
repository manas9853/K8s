import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Grid,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface CPUAnalysisItem {
  pod_name: string;
  namespace: string;
  cluster_id: string;
  node_name: string;
  cpu_current: number;
  cpu_average: number;
  cpu_peak: number;
  cpu_request: number;
  cpu_limit: number;
  cpu_utilization: number;
  cpu_throttling: number;
  cpu_waste_percent: number;
  recommendation: string;
  estimated_savings: number;
  status: string;
  age_days: number;
}

const CPUAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [pods, setPods] = useState<CPUAnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchData = async (clusterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/pods/cpu-analysis${param}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPods(data);
    } catch (err) {
      setError('Failed to fetch CPU analysis data');
      console.error('Error fetching CPU analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchData(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const filteredPods = pods.filter(pod =>
    pod.pod_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pod.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return 'success';
      case 'over_provisioned': return 'warning';
      case 'under_provisioned': return 'error';
      case 'throttled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'optimal': return <CheckCircleIcon fontSize="small" />;
      case 'over_provisioned': return <TrendingDownIcon fontSize="small" />;
      case 'under_provisioned': return <TrendingUpIcon fontSize="small" />;
      case 'throttled': return <WarningIcon fontSize="small" />;
      default: return null;
    }
  };

  // Calculate summary stats
  const totalPods = filteredPods.length;
  const overProvisioned = filteredPods.filter(p => p.status === 'over_provisioned').length;
  const underProvisioned = filteredPods.filter(p => p.status === 'under_provisioned').length;
  const throttled = filteredPods.filter(p => p.status === 'throttled').length;
  const optimal = filteredPods.filter(p => p.status === 'optimal').length;
  const totalSavings = filteredPods.reduce((sum, p) => sum + p.estimated_savings, 0);
  const avgUtilization = totalPods > 0 
    ? filteredPods.reduce((sum, p) => sum + p.cpu_utilization, 0) / totalPods 
    : 0;

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
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          <SpeedIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          CPU Analysis
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Cluster</InputLabel>
            <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
              <MenuItem value="all">All Clusters</MenuItem>
              {clusters.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <IconButton onClick={() => fetchData(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Pods</Typography>
              <Typography variant="h4">{totalPods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Over-Provisioned</Typography>
              <Typography variant="h4" color="warning.main">{overProvisioned}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Under-Provisioned</Typography>
              <Typography variant="h4" color="error.main">{underProvisioned}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Potential Savings</Typography>
              <Typography variant="h4" color="success.main">${totalSavings.toFixed(2)}/mo</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Throttled Pods</Typography>
              <Typography variant="h4" color="error.main">{throttled}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Optimal Pods</Typography>
              <Typography variant="h4" color="success.main">{optimal}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg CPU Utilization</Typography>
              <Typography variant="h4">{avgUtilization.toFixed(1)}%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search */}
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search by pod name or namespace..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Pod Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Node</TableCell>
              <TableCell>Current</TableCell>
              <TableCell>Request</TableCell>
              <TableCell>Limit</TableCell>
              <TableCell>Utilization</TableCell>
              <TableCell>Waste</TableCell>
              <TableCell>Throttling</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Recommendation</TableCell>
              <TableCell>Savings</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPods.map((pod, index) => (
              <TableRow key={index} hover>
                <TableCell>
                  <Tooltip title={pod.pod_name}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {pod.pod_name}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip label={pod.namespace} size="small" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                    {pod.node_name}
                  </Typography>
                </TableCell>
                <TableCell>{pod.cpu_current.toFixed(3)}</TableCell>
                <TableCell>{pod.cpu_request.toFixed(3)}</TableCell>
                <TableCell>{pod.cpu_limit.toFixed(3)}</TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(pod.cpu_utilization, 100)}
                      sx={{ width: 60, height: 8, borderRadius: 1 }}
                      color={pod.cpu_utilization > 85 ? 'error' : pod.cpu_utilization > 70 ? 'warning' : 'success'}
                    />
                    <Typography variant="body2">{pod.cpu_utilization.toFixed(1)}%</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography 
                    variant="body2" 
                    color={pod.cpu_waste_percent > 50 ? 'warning.main' : 'text.secondary'}
                  >
                    {pod.cpu_waste_percent.toFixed(1)}%
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography 
                    variant="body2" 
                    color={pod.cpu_throttling > 10 ? 'error.main' : 'text.secondary'}
                  >
                    {pod.cpu_throttling.toFixed(1)}%
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getStatusIcon(pod.status) || undefined}
                    label={pod.status.replace('_', ' ')}
                    color={getStatusColor(pod.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={pod.recommendation}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                      {pod.recommendation}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {pod.estimated_savings > 0 && (
                    <Typography variant="body2" color="success.main">
                      ${pod.estimated_savings.toFixed(2)}/mo
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredPods.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography color="textSecondary">No pods found</Typography>
        </Box>
      )}
    </Box>
  );
};

export default CPUAnalysis;

// Made with Bob
