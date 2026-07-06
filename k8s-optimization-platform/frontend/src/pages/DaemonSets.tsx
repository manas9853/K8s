import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Badge,
  Tab,
  Tabs,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ComputerIcon from '@mui/icons-material/Computer';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RecommendIcon from '@mui/icons-material/Recommend';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import DnsIcon from '@mui/icons-material/Dns';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:     '#0f1724',
  card:   '#1e2433',
  hover:  '#252e42',
  border: '#2a3245',
  text:   '#e8eaf0',
  muted:  '#8b95a9',
  body:   '#c8cdd8',
  green:  '#4ade80',
  red:    '#f87171',
  yellow: '#f59e0b',
};
const selectSx = {
  color: T.text, fontSize: 13, height: 38,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
  '& .MuiSvgIcon-root': { color: T.muted },
  bgcolor: T.card,
};
const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } };

interface Container {
  name: string;
  image: string;
  ports: Array<{ containerPort: number; protocol: string }>;
  resources: {
    requests?: { [key: string]: string };
    limits?: { [key: string]: string };
  };
}

interface DaemonSet {
  name: string;
  namespace: string;
  desired_number_scheduled: number;
  current_number_scheduled: number;
  number_ready: number;
  number_available: number;
  number_misscheduled: number;
  age: string;
  labels: { [key: string]: string };
  selector: { [key: string]: string };
  containers: Container[];
  created_at: string;
}

interface Investigation {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

interface Recommendation {
  category: 'performance' | 'cost' | 'reliability' | 'security';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  action: string;
}

const DaemonSets: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [daemonsets, setDaemonSets] = useState<DaemonSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDaemonSet, setSelectedDaemonSet] = useState<DaemonSet | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => Promise<void> } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchDaemonSets = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/daemonsets${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setDaemonSets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch daemonsets');
      console.error('Error fetching daemonsets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchDaemonSets(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const fmtTime = (ts: string | null | undefined): string => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ts; }
  };

  const getStatusColor = (ds: DaemonSet): 'success' | 'warning' | 'error' => {
    if (ds.number_ready === ds.desired_number_scheduled && ds.number_misscheduled === 0) {
      return 'success';
    }
    if (ds.number_ready > 0) {
      return 'warning';
    }
    return 'error';
  };

  const getStatusIcon = (ds: DaemonSet) => {
    const color = getStatusColor(ds);
    if (color === 'success') return <CheckCircleIcon color="success" />;
    if (color === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getNodeCoverage = (ds: DaemonSet): number => {
    if (ds.desired_number_scheduled === 0) return 0;
    return Math.round((ds.number_ready / ds.desired_number_scheduled) * 100);
  };

  // Generate investigations
  const generateInvestigations = (ds: DaemonSet): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check node coverage
    if (ds.number_ready < ds.desired_number_scheduled) {
      investigations.push({
        type: 'error',
        title: 'Incomplete Node Coverage',
        description: `Only ${ds.number_ready} of ${ds.desired_number_scheduled} nodes have ready pods`,
        action: 'Check node taints, tolerations, and pod scheduling constraints'
      });
    }

    // Check misscheduled pods
    if (ds.number_misscheduled > 0) {
      investigations.push({
        type: 'error',
        title: 'Misscheduled Pods',
        description: `${ds.number_misscheduled} pods are running on nodes where they should not be`,
        action: 'Review node selectors and affinity rules'
      });
    }

    // Check unavailable pods
    const unavailable = ds.current_number_scheduled - ds.number_available;
    if (unavailable > 0) {
      investigations.push({
        type: 'warning',
        title: 'Unavailable Pods',
        description: `${unavailable} pods are not available`,
        action: 'Check pod readiness probes and resource constraints'
      });
    }

    // Check resource limits
    ds.containers.forEach(container => {
      if (!container.resources.limits) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set CPU and memory limits to prevent node resource exhaustion'
        });
      }
      if (!container.resources.requests) {
        investigations.push({
          type: 'warning',
          title: `No Resource Requests - ${container.name}`,
          description: 'Container has no resource requests set',
          action: 'Set resource requests for proper node resource allocation'
        });
      }
    });

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (ds: DaemonSet): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Performance recommendations
    ds.containers.forEach(container => {
      const cpuRequest = container.resources.requests?.cpu;
      const cpuLimit = container.resources.limits?.cpu;
      
      if (cpuRequest && cpuLimit && cpuRequest !== cpuLimit) {
        recommendations.push({
          category: 'performance',
          priority: 'high',
          title: 'CPU Request/Limit Mismatch',
          description: `Container ${container.name} has different CPU request (${cpuRequest}) and limit (${cpuLimit})`,
          impact: 'May cause CPU throttling on nodes under load',
          action: 'DaemonSets should have equal CPU request/limit for predictable node performance'
        });
      }
    });

    // Reliability recommendations
    if (ds.number_misscheduled > 0) {
      recommendations.push({
        category: 'reliability',
        priority: 'high',
        title: 'Pod Misscheduling',
        description: 'Pods are running on incorrect nodes',
        impact: 'May cause service disruption or security issues',
        action: 'Review and fix node selectors, taints, and tolerations'
      });
    }

    // Security recommendations
    ds.containers.forEach(container => {
      if (container.image.includes(':latest')) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          title: 'Using :latest Tag',
          description: `Container ${container.name} uses :latest image tag`,
          impact: 'Unpredictable updates across all nodes',
          action: 'Pin to specific image version for consistent node-level deployments'
        });
      }
    });

    // Cost recommendations
    const totalPods = ds.desired_number_scheduled;
    if (totalPods > 10) {
      recommendations.push({
        category: 'cost',
        priority: 'medium',
        title: 'High Node Count',
        description: `DaemonSet runs on ${totalPods} nodes`,
        impact: 'Higher resource consumption across cluster',
        action: 'Review if DaemonSet is needed on all nodes or can use node selectors'
      });
    }

    return recommendations;
  };

  const showSnack = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const askConfirm = (label: string, fn: () => Promise<void>) => {
    setConfirmAction({ label, fn });
    setConfirmOpen(true);
  };

  const runConfirmed = async () => {
    if (!confirmAction) return;
    setConfirmOpen(false);
    setActionLoading(true);
    try {
      await confirmAction.fn();
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  /** Enqueue a command, then poll until done/failed (max 60s). */
  const runCommand = async (url: string, opts: RequestInit = {}): Promise<void> => {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);

    const cmdId = body.command_id;
    if (!cmdId) return; // already executed synchronously

    showSnack('Command queued — waiting for agent…');
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2500));
      const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
      if (!poll) continue;
      const status = await poll.json().catch(() => ({}));
      if (status.status === 'done') return;
      if (status.status === 'failed') throw new Error(status.result?.error || 'Command failed');
    }
    throw new Error('Timed out waiting for agent response');
  };

  const handleRestartPods = (ds: DaemonSet) => {
    askConfirm(
      `Restart all pods for DaemonSet "${ds.name}" in namespace "${ds.namespace}"?`,
      async () => {
        await runCommand(
          `${API_BASE_URL}/v1/workloads/daemonsets/${ds.namespace}/${ds.name}/restart`,
          { method: 'POST' }
        );
        showSnack(`Rolling restart triggered for ${ds.name}`);
        fetchDaemonSets(selectedClusterId);
      }
    );
  };

  const handleAutoFix = (ds: DaemonSet, issue: string) => {
    showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
  };

  const filteredDaemonSets = daemonsets.filter(ds =>
    ds.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ds.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDaemonSets = daemonsets.length;
  const healthyDaemonSets = daemonsets.filter(ds => 
    ds.number_ready === ds.desired_number_scheduled && ds.number_misscheduled === 0
  ).length;
  const totalNodes = daemonsets.reduce((sum, ds) => sum + ds.desired_number_scheduled, 0);
  const coveredNodes = daemonsets.reduce((sum, ds) => sum + ds.number_ready, 0);
  const totalIssues = daemonsets.reduce((sum, ds) => 
    sum + generateInvestigations(ds).filter(i => i.type === 'error' || i.type === 'warning').length, 0
  );

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5 };
  const dlgSx = { '& .MuiDialog-paper': { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 2 } };

  if (clustersLoading) {
    return <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: T.green }} /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Typography sx={{ color: T.text }} variant="h5">No clusters attached yet</Typography>
        <Typography sx={{ color: T.muted }} textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')} sx={{ bgcolor: T.green, color: '#000', '&:hover': { bgcolor: '#22c55e' } }}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>DaemonSets</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Node-level workloads running on every cluster node · {filteredDaemonSets.length} of {totalDaemonSets} shown
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange} sx={selectSx} MenuProps={menuProps}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total DaemonSets', value: totalDaemonSets, accent: T.text },
          { label: 'Healthy', value: healthyDaemonSets, accent: T.green, sub: `${totalDaemonSets > 0 ? Math.round((healthyDaemonSets / totalDaemonSets) * 100) : 0}% healthy` },
          { label: 'Node Coverage', value: `${coveredNodes}/${totalNodes}`, accent: T.body, sub: `${totalNodes > 0 ? Math.round((coveredNodes / totalNodes) * 100) : 0}% covered` },
          { label: 'Issues', value: totalIssues, accent: totalIssues > 0 ? T.red : T.green },
        ].map(({ label, value, accent, sub }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>{label}</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</Typography>
                {sub && <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2, bgcolor: '#1a0a0a', color: T.red, border: `1px solid ${T.red}` }}>{error}</Alert>}

      {/* Search and Actions */}
      <Box display="flex" gap={2} mb={2}>
        <TextField
          placeholder="Search daemonsets..."
          variant="outlined"
          size="small"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
            sx: { color: T.text, fontSize: 13, bgcolor: T.card,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
            },
          }}
        />
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchDaemonSets(selectedClusterId)} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* DaemonSets Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#161f30' }}>
              <TableCell sx={headSx}>Status</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={headSx}>Nodes</TableCell>
              <TableCell sx={headSx}>Coverage</TableCell>
              <TableCell sx={headSx}>Issues</TableCell>
              <TableCell sx={headSx}>Age</TableCell>
              <TableCell sx={headSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDaemonSets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  {searchTerm ? 'No daemonsets match your search' : (loading ? 'Loading…' : 'No daemonsets found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredDaemonSets.map((ds) => {
                const investigations = generateInvestigations(ds);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                return (
                  <TableRow key={`${ds.namespace}-${ds.name}`} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Tooltip title={`${ds.number_ready}/${ds.desired_number_scheduled} nodes ready`}>
                        {getStatusIcon(ds)}
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }}>{ds.name}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={ds.namespace} size="small" sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{ds.desired_number_scheduled}</Typography>
                      {ds.number_misscheduled > 0 && (
                        <Typography sx={{ fontSize: 11, color: T.red }}>{ds.number_misscheduled} misscheduled</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{ds.number_ready}/{ds.desired_number_scheduled} ({getNodeCoverage(ds)}%)</Typography>
                      <LinearProgress variant="determinate" value={getNodeCoverage(ds)}
                        sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: T.border,
                          '& .MuiLinearProgress-bar': { bgcolor: getNodeCoverage(ds) === 100 ? T.green : getNodeCoverage(ds) > 50 ? T.yellow : T.red, borderRadius: 2 } }} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={issueCount === 0 ? 'Healthy' : `${issueCount} issues`} size="small"
                        sx={{ bgcolor: issueCount === 0 ? '#052e16' : '#450a0a', color: issueCount === 0 ? T.green : T.red,
                          border: `1px solid ${issueCount === 0 ? T.green+'44' : T.red+'44'}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: T.muted }}>{ds.age}</TableCell>
                    <TableCell sx={cellSx}>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton size="small" sx={{ color: T.muted, '&:hover': { color: T.text } }}
                            onClick={() => { setSelectedDaemonSet(ds); setDetailsOpen(true); }}>
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Restart Pods">
                          <IconButton size="small" sx={{ color: T.muted, '&:hover': { color: T.text } }}
                            onClick={() => handleRestartPods(ds)} disabled={actionLoading}>
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth sx={dlgSx}>
        {selectedDaemonSet && (
          <>
            <DialogTitle sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontWeight: 600, color: T.text }}>{selectedDaemonSet.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>{selectedDaemonSet.namespace}</Typography>
                </Box>
                {getStatusIcon(selectedDaemonSet)}
              </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ borderBottom: `1px solid ${T.border}`, px: 2, '& .MuiTabs-indicator': { bgcolor: T.green } }}>
                {['Overview', 'Investigations', 'Recommendations', 'Diagnostics', 'Actions'].map((lbl) => (
                  <Tab key={lbl} label={lbl} sx={{ color: T.muted, '&.Mui-selected': { color: T.text }, textTransform: 'none', minHeight: 40 }} />
                ))}
              </Tabs>
              <Box sx={{ p: 3 }}>
              {/* Overview Tab */}
              {activeTab === 0 && (
                <Grid container spacing={2}>
                  {[
                    { label: 'Node Coverage', rows: [
                      ['Desired', selectedDaemonSet.desired_number_scheduled],
                      ['Current', selectedDaemonSet.current_number_scheduled],
                      ['Ready', selectedDaemonSet.number_ready],
                      ['Available', selectedDaemonSet.number_available],
                      ...(selectedDaemonSet.number_misscheduled > 0 ? [['Misscheduled', selectedDaemonSet.number_misscheduled]] : []),
                    ]},
                    { label: 'DaemonSet Info', rows: [
                      ['Age', selectedDaemonSet.age],
                      ['Created', fmtTime(selectedDaemonSet.created_at)],
                      ['Coverage', `${getNodeCoverage(selectedDaemonSet)}%`],
                    ]},
                  ].map(({ label, rows }) => (
                    <Grid item xs={12} md={6} key={label as string}>
                      <Card sx={{ bgcolor: T.bg, border: `1px solid ${T.border}`, borderRadius: 1 }}>
                        <CardContent sx={{ p: 2 }}>
                          <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>{label as string}</Typography>
                          {(rows as [string, unknown][]).map(([k, v]) => (
                            <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: `1px solid ${T.border}` }}>
                              <Typography sx={{ fontSize: 12, color: T.muted }}>{k}</Typography>
                              <Typography sx={{ fontSize: 12, color: T.body }}>{String(v)}</Typography>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                  {selectedDaemonSet.containers.length > 0 && (
                    <Grid item xs={12}>
                      <Card sx={{ bgcolor: T.bg, border: `1px solid ${T.border}`, borderRadius: 1 }}>
                        <CardContent sx={{ p: 2 }}>
                          <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>Containers</Typography>
                          {selectedDaemonSet.containers.map((c, i) => (
                            <Box key={i} sx={{ mb: 1.5, pb: 1.5, borderBottom: `1px solid ${T.border}` }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.name}</Typography>
                              <Typography sx={{ fontSize: 12, color: T.muted }}>{c.image}</Typography>
                              <Typography sx={{ fontSize: 12, color: T.body, mt: 0.5 }}>
                                CPU: {c.resources.requests?.cpu || 'N/A'} / {c.resources.limits?.cpu || 'N/A'} &nbsp;·&nbsp; Mem: {c.resources.requests?.memory || 'N/A'} / {c.resources.limits?.memory || 'N/A'}
                              </Typography>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* Investigations Tab */}
              {activeTab === 1 && (
                <Box>
                  {generateInvestigations(selectedDaemonSet).map((inv, idx) => (
                    <Box key={idx} sx={{ mb: 1.5, p: 2, borderRadius: 1, border: `1px solid ${T.border}`,
                      bgcolor: inv.type === 'error' ? '#1a0a0a' : inv.type === 'warning' ? '#1a1200' : '#0a1a0a' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {inv.type === 'error' && <ErrorIcon sx={{ fontSize: 16, color: T.red }} />}
                        {inv.type === 'warning' && <WarningIcon sx={{ fontSize: 16, color: T.yellow }} />}
                        {inv.type === 'info' && <InfoIcon sx={{ fontSize: 16, color: T.green }} />}
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{inv.title}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{inv.description}</Typography>
                      {inv.action && <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>→ {inv.action}</Typography>}
                    </Box>
                  ))}
                  {generateInvestigations(selectedDaemonSet).length === 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${T.green}44`, bgcolor: '#052e16' }}>
                      <Typography sx={{ fontSize: 13, color: T.green }}>No issues found — DaemonSet is healthy</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Recommendations Tab */}
              {activeTab === 2 && (
                <Box>
                  {generateRecommendations(selectedDaemonSet).map((rec, idx) => (
                    <Box key={idx} sx={{ mb: 1.5, p: 2, borderRadius: 1, border: `1px solid ${T.border}`, bgcolor: T.bg }}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Chip label={rec.category} size="small" sx={{ bgcolor: T.border, color: T.text, fontSize: 11, height: 20 }} />
                        <Chip label={rec.priority} size="small" sx={{ bgcolor: rec.priority === 'high' ? '#450a0a' : rec.priority === 'medium' ? '#451a03' : T.border, color: rec.priority === 'high' ? T.red : rec.priority === 'medium' ? T.yellow : T.muted, fontSize: 11, height: 20 }} />
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{rec.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.body, mt: 0.5 }}>{rec.description}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>Impact: {rec.impact}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.muted }}>→ {rec.action}</Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Diagnostics Tab */}
              {activeTab === 3 && (
                <Box>
                  {[
                    { ok: selectedDaemonSet.number_ready === selectedDaemonSet.desired_number_scheduled, label: 'Node Coverage', sub: `${selectedDaemonSet.number_ready}/${selectedDaemonSet.desired_number_scheduled} nodes covered` },
                    { ok: selectedDaemonSet.number_misscheduled === 0, label: 'Scheduling', sub: `${selectedDaemonSet.number_misscheduled} misscheduled pods` },
                    { ok: selectedDaemonSet.containers.every(c => c.resources.limits), label: 'Resource Limits', sub: 'All containers have limits' },
                    { ok: !selectedDaemonSet.containers.some(c => c.image.includes(':latest')), label: 'Image Tags', sub: 'No :latest tags' },
                  ].map(({ ok, label, sub }) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: `1px solid ${T.border}` }}>
                      {ok ? <CheckCircleIcon sx={{ fontSize: 18, color: T.green }} /> : <ErrorIcon sx={{ fontSize: 18, color: T.red }} />}
                      <Box>
                        <Typography sx={{ fontSize: 13, color: T.text }}>{label}</Typography>
                        <Typography sx={{ fontSize: 12, color: T.muted }}>{sub}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Actions Tab */}
              {activeTab === 4 && (
                <Box>
                  <Button variant="contained" fullWidth sx={{ mb: 1, bgcolor: T.green, color: '#000', '&:hover': { bgcolor: '#22c55e' } }}
                    onClick={() => handleRestartPods(selectedDaemonSet)} disabled={actionLoading}
                    startIcon={actionLoading ? <CircularProgress size={16} /> : <RefreshIcon />}>
                    Restart All Pods (Rolling)
                  </Button>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>
                    Replaces pods one at a time across all {selectedDaemonSet.desired_number_scheduled} nodes
                  </Typography>
                </Box>
              )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: `1px solid ${T.border}` }}>
              <Button onClick={() => setDetailsOpen(false)} sx={{ color: T.muted, textTransform: 'none' }}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth sx={dlgSx}>
        <DialogTitle sx={{ borderBottom: `1px solid ${T.border}`, color: T.text }}>Confirm Action</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ color: T.body }}>{confirmAction?.label}</Typography>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}` }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: T.muted, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: T.green, color: '#000', '&:hover': { bgcolor: '#22c55e' }, textTransform: 'none' }} onClick={runConfirmed}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DaemonSets;

// Made with Bob
