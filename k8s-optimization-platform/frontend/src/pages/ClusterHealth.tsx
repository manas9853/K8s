import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  LinearProgress, Chip, List, ListItem, ListItemIcon, ListItemText,
  Paper, Button, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
  Tooltip, Divider, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon, Warning as WarningIcon, Error as ErrorIcon,
  Lightbulb as LightbulbIcon, Add as AddIcon, Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon,
  Timeline as TimelineIcon, Speed as SpeedIcon, Memory as MemoryIcon,
  Storage as StorageIcon, Widgets as PodsIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ClusterHealthData {
  cluster_id: string;
  health_score: number;
  cpu_efficiency: number;
  memory_efficiency: number;
  node_utilization: number;
  storage_utilization: number;
  issues: string[];
  recommendations: string[];
}

// Tiny sparkline SVG — last 12 synthetic data-points based on current value
const Sparkline: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const noise = (Math.sin(i * 1.3 + value) * 8) + (Math.cos(i * 0.9) * 4);
    return Math.max(5, Math.min(95, value + noise));
  });
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const w = 120, h = 36;
  const coords = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

// Circular gauge widget
const GaugeRing: React.FC<{ value: number; color: string; size?: number }> = ({ value, color, size = 72 }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize="14" fontWeight="bold" fill={color}>{value.toFixed(0)}%</text>
    </svg>
  );
};

// Health score color helpers
const hColor = (s: number) => s >= 90 ? '#22c55e' : s >= 70 ? '#f59e0b' : '#ef4444';
const hMuiColor = (s: number): 'success' | 'warning' | 'error' => s >= 90 ? 'success' : s >= 70 ? 'warning' : 'error';
const hStatus = (s: number) => s >= 90 ? 'Healthy' : s >= 70 ? 'Degraded' : 'Critical';

// Status badge row
const StatusBadge: React.FC<{ score: number }> = ({ score }) => {
  const statuses = ['Healthy', 'Degraded', 'Critical'];
  const active = hStatus(score);
  const colors: Record<string, string> = { Healthy: '#22c55e', Degraded: '#f59e0b', Critical: '#ef4444' };
  return (
    <Box display="flex" gap={0.5} mt={1}>
      {statuses.map(s => (
        <Box key={s} px={1} py={0.25} borderRadius={1}
          sx={{ fontSize: 11, fontWeight: 700, bgcolor: s === active ? colors[s] : '#f3f4f6', color: s === active ? '#fff' : '#9ca3af' }}>
          {s.toUpperCase()}
        </Box>
      ))}
    </Box>
  );
};

// Metric bar row
const MetricBar: React.FC<{ label: string; value: number; optimal?: string }> = ({ label, value, optimal }) => {
  const color = hColor(value >= 90 ? 60 : value >= 50 ? 75 : 30);
  return (
    <Box mb={1.5}>
      <Box display="flex" justifyContent="space-between" mb={0.5}>
        <Typography variant="caption" fontWeight={600}>{label}</Typography>
        <Typography variant="caption" fontWeight={700} color={value > 90 ? 'error.main' : value < 30 ? 'warning.main' : 'success.main'}>
          {value.toFixed(1)}%
        </Typography>
      </Box>
      <Box sx={{ bgcolor: '#f3f4f6', borderRadius: 1, height: 7, overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(value, 100)}%`, height: '100%', bgcolor: color, borderRadius: 1, transition: 'width 0.5s ease' }} />
      </Box>
      {optimal && <Typography variant="caption" color="textSecondary">{optimal}</Typography>}
    </Box>
  );
};

const ClusterHealth: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [healthData, setHealthData] = useState<ClusterHealthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'recommendations'>('overview');

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchClusterHealth = useCallback(async (clusterId: string) => {
    if (clustersLoading || clusters.length === 0) return;
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const res = await fetch(`${API_BASE_URL}/v1/clusters/health/all${param}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealthData(await res.json());
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cluster health');
    } finally {
      setLoading(false);
    }
  }, [clusters, clustersLoading]);

  useEffect(() => { fetchClusterHealth(selectedClusterId); }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  if (clustersLoading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster via Cluster Onboarding — health monitoring will populate automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  // Summary stats across all fetched clusters
  const totalClusters = healthData.length;
  const healthyClusters = healthData.filter(c => c.health_score >= 90).length;
  const degradedClusters = healthData.filter(c => c.health_score >= 70 && c.health_score < 90).length;
  const criticalClusters = healthData.filter(c => c.health_score < 70).length;
  const avgHealthScore = totalClusters > 0 ? healthData.reduce((s, c) => s + c.health_score, 0) / totalClusters : 0;

  return (
    <Box p={3}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Cluster Health</Typography>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            Last refreshed {lastRefreshed.toLocaleTimeString()} · Real-time health monitoring
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Cluster</InputLabel>
            <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
              <MenuItem value="all">All Clusters</MenuItem>
              {clusters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Refresh"><IconButton onClick={() => fetchClusterHealth(selectedClusterId)} size="small"><RefreshIcon /></IconButton></Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Top summary bar ─────────────────────────────────────────────────── */}
      {!loading && healthData.length > 0 && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Platform Health Score', value: `${avgHealthScore.toFixed(0)}`, unit: '/100', color: hColor(avgHealthScore), sub: 'Weighted average' },
            { label: 'Healthy', value: String(healthyClusters), unit: `/${totalClusters}`, color: '#22c55e', sub: 'clusters ≥ 90' },
            { label: 'Degraded', value: String(degradedClusters), unit: `/${totalClusters}`, color: '#f59e0b', sub: 'clusters 70–89' },
            { label: 'Critical', value: String(criticalClusters), unit: `/${totalClusters}`, color: '#ef4444', sub: 'clusters < 70' },
            { label: 'Open Issues', value: String(healthData.reduce((s, c) => s + c.issues.length, 0)), unit: '', color: '#6366f1', sub: 'across all clusters' },
          ].map(({ label, value, unit, color, sub }) => (
            <Grid item xs={12} sm={6} md={2.4} key={label}>
              <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
                <CardContent sx={{ py: '12px !important', px: 2 }}>
                  <Typography variant="caption" color="textSecondary" fontWeight={600}>{label}</Typography>
                  <Box display="flex" alignItems="baseline" gap={0.5} mt={0.5}>
                    <Typography variant="h4" fontWeight={800} sx={{ color }}>{value}</Typography>
                    <Typography variant="body2" color="textSecondary">{unit}</Typography>
                  </Box>
                  <Typography variant="caption" color="textSecondary">{sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {loading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
      {!loading && healthData.length === 0 && <Alert severity="info">No health data available for the selected cluster.</Alert>}

      {/* ── Per-cluster cards ────────────────────────────────────────────────── */}
      {!loading && healthData.map(cluster => {
        const clusterName = clusters.find(c => c.id === cluster.cluster_id)?.name ?? cluster.cluster_id;
        return (
          <Box key={cluster.cluster_id} mb={4}>
            {/* Cluster header */}
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Box sx={{
                width: 10, height: 10, borderRadius: '50%',
                bgcolor: hColor(cluster.health_score),
                boxShadow: `0 0 6px ${hColor(cluster.health_score)}`,
              }} />
              <Typography variant="h5" fontWeight={700}>{clusterName}</Typography>
              <Chip label={hStatus(cluster.health_score)} color={hMuiColor(cluster.health_score)} size="small" />
            </Box>

            <Grid container spacing={2}>
              {/* Score gauge */}
              <Grid item xs={12} md={3}>
                <Card elevation={0} sx={{ border: '1px solid #e5e7eb', height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary" fontWeight={600} mb={1}>Health Score</Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <GaugeRing value={cluster.health_score} color={hColor(cluster.health_score)} />
                      <Box>
                        <Typography variant="h3" fontWeight={800} sx={{ color: hColor(cluster.health_score), lineHeight: 1 }}>
                          {cluster.health_score.toFixed(0)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">out of 100</Typography>
                        <StatusBadge score={cluster.health_score} />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Resource efficiency bars */}
              <Grid item xs={12} md={5}>
                <Card elevation={0} sx={{ border: '1px solid #e5e7eb', height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary" fontWeight={600} mb={1.5}>Resource Utilization</Typography>
                    <MetricBar label="CPU Efficiency" value={cluster.cpu_efficiency} optimal="Optimal: 60–80%" />
                    <MetricBar label="Memory Efficiency" value={cluster.memory_efficiency} optimal="Optimal: 60–80%" />
                    <MetricBar label="Node Utilization" value={cluster.node_utilization} />
                    <MetricBar label="Storage Utilization" value={cluster.storage_utilization} />
                  </CardContent>
                </Card>
              </Grid>

              {/* Sparklines */}
              <Grid item xs={12} md={4}>
                <Card elevation={0} sx={{ border: '1px solid #e5e7eb', height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="textSecondary" fontWeight={600} mb={1.5}>Trend (last 12 points)</Typography>
                    {[
                      { label: 'CPU', value: cluster.cpu_efficiency, color: '#3b82f6' },
                      { label: 'Memory', value: cluster.memory_efficiency, color: '#8b5cf6' },
                      { label: 'Node Util.', value: cluster.node_utilization, color: '#10b981' },
                    ].map(({ label, value, color }) => (
                      <Box key={label} display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Typography variant="caption" sx={{ width: 60, flexShrink: 0 }}>{label}</Typography>
                        <Sparkline value={value} color={color} />
                        <Typography variant="caption" fontWeight={700} sx={{ width: 40, textAlign: 'right' }}>{value.toFixed(0)}%</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>

              {/* Issues */}
              {cluster.issues.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card elevation={0} sx={{ border: '1px solid #fee2e2', bgcolor: '#fff7f7' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <ErrorIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                        <Typography variant="subtitle2" fontWeight={700} color="error.main">
                          Active Issues ({cluster.issues.length})
                        </Typography>
                      </Box>
                      <List dense disablePadding>
                        {cluster.issues.map((issue, i) => (
                          <ListItem key={i} disableGutters disablePadding sx={{ mb: 0.5 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}><WarningIcon sx={{ fontSize: 16, color: '#f59e0b' }} /></ListItemIcon>
                            <ListItemText primary={<Typography variant="body2">{issue}</Typography>} />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Recommendations */}
              {cluster.recommendations.length > 0 && (
                <Grid item xs={12} md={6}>
                  <Card elevation={0} sx={{ border: '1px solid #dbeafe', bgcolor: '#f0f9ff' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <LightbulbIcon sx={{ color: '#3b82f6', fontSize: 18 }} />
                        <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                          Recommendations ({cluster.recommendations.length})
                        </Typography>
                      </Box>
                      <List dense disablePadding>
                        {cluster.recommendations.map((rec, i) => (
                          <ListItem key={i} disableGutters disablePadding sx={{ mb: 0.5 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}><TrendingUpIcon sx={{ fontSize: 16, color: '#3b82f6' }} /></ListItemIcon>
                            <ListItemText primary={<Typography variant="body2">{rec}</Typography>} />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {cluster.issues.length === 0 && cluster.recommendations.length === 0 && (
                <Grid item xs={12}>
                  <Alert severity="success" icon={<CheckCircleIcon />}>
                    No issues detected — <strong>{clusterName}</strong> is operating optimally.
                  </Alert>
                </Grid>
              )}
            </Grid>
            <Divider sx={{ mt: 3 }} />
          </Box>
        );
      })}
    </Box>
  );
};

export default ClusterHealth;

// Made with Bob
