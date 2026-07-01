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
  Error as ErrorIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface OOMEventItem {
  pod_name: string;
  namespace: string;
  cluster_id: string;
  node_name: string;
  oom_count: number;
  last_oom_time: string;
  memory_limit: number;
  memory_at_oom: number;
  memory_request: number;
  recommended_memory: number;
  estimated_cost_increase: number;
  severity: string;
  age_days: number;
}

const OOMEvents: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [pods, setPods] = useState<OOMEventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchData = async (clusterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/pods/oom-events${param}`);
      const data = await response.json();
      setPods(data);
    } catch (err) {
      setError('Failed to fetch OOM events data');
      console.error('Error fetching OOM events:', err);
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ErrorIcon fontSize="small" />;
      case 'high': return <ErrorIcon fontSize="small" />;
      case 'medium': return <WarningIcon fontSize="small" />;
      default: return null;
    }
  };

  const formatMemory = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  // Calculate summary stats
  const totalPods = filteredPods.length;
  const criticalPods = filteredPods.filter(p => p.severity === 'critical').length;
  const highSeverity = filteredPods.filter(p => p.severity === 'high').length;
  const totalOOMEvents = filteredPods.reduce((sum, p) => sum + p.oom_count, 0);
  const totalCostIncrease = filteredPods.reduce((sum, p) => sum + p.estimated_cost_increase, 0);
  const avgOOMPerPod = totalPods > 0 ? totalOOMEvents / totalPods : 0;

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
          <ErrorIcon sx={{ mr: 1, verticalAlign: 'middle' }} color="error" />
          OOM Events
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

      {totalPods === 0 && !loading && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="h6">Great news! No OOM events detected.</Typography>
          <Typography variant="body2">All pods have sufficient memory resources.</Typography>
        </Alert>
      )}

      {totalPods > 0 && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Pods with OOM</Typography>
                  <Typography variant="h4" color="error.main">{totalPods}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Critical Issues</Typography>
                  <Typography variant="h4" color="error.main">{criticalPods}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Total OOM Events</Typography>
                  <Typography variant="h4" color="error.main">{totalOOMEvents}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Cost to Fix</Typography>
                  <Typography variant="h4" color="warning.main">${totalCostIncrease.toFixed(2)}/mo</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>High Severity</Typography>
                  <Typography variant="h4" color="error.main">{highSeverity}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Avg OOM/Pod</Typography>
                  <Typography variant="h4">{avgOOMPerPod.toFixed(1)}</Typography>
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
                  <TableCell>OOM Count</TableCell>
                  <TableCell>Last OOM</TableCell>
                  <TableCell>Current Request</TableCell>
                  <TableCell>Memory Limit</TableCell>
                  <TableCell>Memory at OOM</TableCell>
                  <TableCell>Recommended</TableCell>
                  <TableCell>Increase</TableCell>
                  <TableCell>Cost Impact</TableCell>
                  <TableCell>Severity</TableCell>
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
                    <TableCell>
                      <Chip 
                        label={pod.oom_count} 
                        color={pod.oom_count > 5 ? 'error' : 'warning'}
                        size="small"
                        icon={<ErrorIcon />}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{pod.last_oom_time}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatMemory(pod.memory_request)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatMemory(pod.memory_limit)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="error.main">
                        {formatMemory(pod.memory_at_oom)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <TrendingUpIcon fontSize="small" color="warning" />
                        <Typography variant="body2" fontWeight="bold">
                          {formatMemory(pod.recommended_memory)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="warning.main">
                        +{formatMemory(pod.recommended_memory - pod.memory_request)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="warning.main">
                        ${pod.estimated_cost_increase.toFixed(2)}/mo
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getSeverityIcon(pod.severity) || undefined}
                        label={pod.severity}
                        color={getSeverityColor(pod.severity)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {filteredPods.length === 0 && totalPods > 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="textSecondary">No matching pods found</Typography>
        </Box>
      )}
    </Box>
  );
};

export default OOMEvents;

// Made with Bob
