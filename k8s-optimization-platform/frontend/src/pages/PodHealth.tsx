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
  LinearProgress,
  List,
  ListItem,
  ListItemText,
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
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Favorite as FavoriteIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PodHealthItem {
  pod_name: string;
  namespace: string;
  cluster_id: string;
  node_name: string;
  status: string;
  ready: boolean;
  restarts: number;
  cpu_health: string;
  memory_health: string;
  overall_health: string;
  health_score: number;
  issues: string[];
  recommendations: string[];
  age_days: number;
}

const PodHealth: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [pods, setPods] = useState<PodHealthItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchData = async (clusterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/pods/pod-health${param}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPods(data);
    } catch (err) {
      setError('Failed to fetch pod health data');
      console.error('Error fetching pod health:', err);
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

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'success';
      case 'degraded': return 'warning';
      case 'unhealthy': return 'error';
      case 'warning': return 'warning';
      case 'critical': return 'error';
      default: return 'default';
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy': return <CheckCircleIcon fontSize="small" />;
      case 'degraded': return <WarningIcon fontSize="small" />;
      case 'unhealthy': return <ErrorIcon fontSize="small" />;
      case 'warning': return <WarningIcon fontSize="small" />;
      case 'critical': return <ErrorIcon fontSize="small" />;
      default: return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'error';
  };

  // Calculate summary stats
  const totalPods = filteredPods.length;
  const healthyPods = filteredPods.filter(p => p.overall_health === 'healthy').length;
  const degradedPods = filteredPods.filter(p => p.overall_health === 'degraded').length;
  const unhealthyPods = filteredPods.filter(p => p.overall_health === 'unhealthy').length;
  const avgHealthScore = totalPods > 0 
    ? filteredPods.reduce((sum, p) => sum + p.health_score, 0) / totalPods 
    : 0;
  const notReadyPods = filteredPods.filter(p => !p.ready).length;
  const cpuIssues = filteredPods.filter(p => p.cpu_health !== 'healthy').length;
  const memoryIssues = filteredPods.filter(p => p.memory_health !== 'healthy').length;

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
          <FavoriteIcon sx={{ mr: 1, verticalAlign: 'middle' }} color="error" />
          Pod Health
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
              <Typography color="textSecondary" gutterBottom>Healthy</Typography>
              <Typography variant="h4" color="success.main">{healthyPods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Degraded</Typography>
              <Typography variant="h4" color="warning.main">{degradedPods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Unhealthy</Typography>
              <Typography variant="h4" color="error.main">{unhealthyPods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg Health Score</Typography>
              <Typography variant="h4" color={getScoreColor(avgHealthScore) + '.main'}>
                {avgHealthScore.toFixed(0)}/100
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Not Ready</Typography>
              <Typography variant="h4" color="error.main">{notReadyPods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>CPU Issues</Typography>
              <Typography variant="h4" color="warning.main">{cpuIssues}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Memory Issues</Typography>
              <Typography variant="h4" color="warning.main">{memoryIssues}</Typography>
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
              <TableCell>Status</TableCell>
              <TableCell>Ready</TableCell>
              <TableCell>Restarts</TableCell>
              <TableCell>Health Score</TableCell>
              <TableCell>CPU Health</TableCell>
              <TableCell>Memory Health</TableCell>
              <TableCell>Overall Health</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Recommendations</TableCell>
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
                  <Chip 
                    label={pod.status} 
                    color={pod.status === 'Running' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {pod.ready ? (
                    <Chip label="Yes" color="success" size="small" icon={<CheckCircleIcon />} />
                  ) : (
                    <Chip label="No" color="error" size="small" icon={<ErrorIcon />} />
                  )}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={pod.restarts} 
                    color={pod.restarts > 5 ? 'error' : pod.restarts > 0 ? 'warning' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <LinearProgress
                      variant="determinate"
                      value={pod.health_score}
                      sx={{ width: 60, height: 8, borderRadius: 1 }}
                      color={getScoreColor(pod.health_score)}
                    />
                    <Typography variant="body2" fontWeight="bold">
                      {pod.health_score}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getHealthIcon(pod.cpu_health) || undefined}
                    label={pod.cpu_health}
                    color={getHealthColor(pod.cpu_health)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getHealthIcon(pod.memory_health) || undefined}
                    label={pod.memory_health}
                    color={getHealthColor(pod.memory_health)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getHealthIcon(pod.overall_health) || undefined}
                    label={pod.overall_health}
                    color={getHealthColor(pod.overall_health)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {pod.issues.length > 0 ? (
                    <Tooltip 
                      title={
                        <List dense>
                          {pod.issues.map((issue, i) => (
                            <ListItem key={i}>
                              <ListItemText primary={issue} />
                            </ListItem>
                          ))}
                        </List>
                      }
                    >
                      <Chip 
                        label={`${pod.issues.length} issue${pod.issues.length > 1 ? 's' : ''}`}
                        color="error"
                        size="small"
                      />
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">None</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip 
                    title={
                      <List dense>
                        {pod.recommendations.map((rec, i) => (
                          <ListItem key={i}>
                            <ListItemText primary={rec} />
                          </ListItem>
                        ))}
                      </List>
                    }
                  >
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {pod.recommendations[0]}
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
          <Typography color="textSecondary">No pods found</Typography>
        </Box>
      )}
    </Box>
  );
};

export default PodHealth;

// Made with Bob
