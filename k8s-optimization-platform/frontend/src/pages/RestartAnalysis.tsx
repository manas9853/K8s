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
  RestartAlt as RestartIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface RestartAnalysisItem {
  pod_name: string;
  namespace: string;
  cluster_id: string;
  node_name: string;
  restart_count: number;
  last_restart_time: string;
  restart_reason: string;
  cpu_at_restart: number;
  memory_at_restart: number;
  oom_kills: number;
  crash_loop: boolean;
  recommendation: string;
  severity: string;
  age_days: number;
}

const RestartAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [pods, setPods] = useState<RestartAnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchData = async (clusterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/pods/restart-analysis${param}`);
      const data = await response.json();
      setPods(data);
    } catch (err) {
      setError('Failed to fetch restart analysis data');
      console.error('Error fetching restart analysis:', err);
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
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ErrorIcon fontSize="small" />;
      case 'high': return <ErrorIcon fontSize="small" />;
      case 'medium': return <WarningIcon fontSize="small" />;
      case 'low': return <InfoIcon fontSize="small" />;
      default: return null;
    }
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'OOMKilled': return 'error';
      case 'CrashLoopBackOff': return 'error';
      case 'Error': return 'warning';
      default: return 'default';
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
  const crashLoops = filteredPods.filter(p => p.crash_loop).length;
  const oomKilled = filteredPods.filter(p => p.restart_reason === 'OOMKilled').length;
  const totalRestarts = filteredPods.reduce((sum, p) => sum + p.restart_count, 0);
  const avgRestarts = totalPods > 0 ? totalRestarts / totalPods : 0;

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
          <RestartIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Restart Analysis
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
              <Typography color="textSecondary" gutterBottom>Pods with Restarts</Typography>
              <Typography variant="h4">{totalPods}</Typography>
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
              <Typography color="textSecondary" gutterBottom>Crash Loops</Typography>
              <Typography variant="h4" color="error.main">{crashLoops}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>OOM Killed</Typography>
              <Typography variant="h4" color="error.main">{oomKilled}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Restarts</Typography>
              <Typography variant="h4">{totalRestarts}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg Restarts/Pod</Typography>
              <Typography variant="h4">{avgRestarts.toFixed(1)}</Typography>
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
              <TableCell>Restart Count</TableCell>
              <TableCell>Last Restart</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>OOM Kills</TableCell>
              <TableCell>Crash Loop</TableCell>
              <TableCell>CPU at Restart</TableCell>
              <TableCell>Memory at Restart</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Recommendation</TableCell>
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
                    label={pod.restart_count} 
                    color={pod.restart_count > 10 ? 'error' : pod.restart_count > 5 ? 'warning' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{pod.last_restart_time}</Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={pod.restart_reason} 
                    color={getReasonColor(pod.restart_reason)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {pod.oom_kills > 0 ? (
                    <Chip 
                      label={pod.oom_kills} 
                      color="error" 
                      size="small"
                      icon={<ErrorIcon />}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">0</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {pod.crash_loop ? (
                    <Chip label="Yes" color="error" size="small" />
                  ) : (
                    <Typography variant="body2" color="text.secondary">No</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{pod.cpu_at_restart.toFixed(3)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatMemory(pod.memory_at_restart)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getSeverityIcon(pod.severity) || undefined}
                    label={pod.severity}
                    color={getSeverityColor(pod.severity)}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredPods.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography color="textSecondary">No pods with restarts found</Typography>
        </Box>
      )}
    </Box>
  );
};

export default RestartAnalysis;

// Made with Bob
