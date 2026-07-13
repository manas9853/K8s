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
import WorkIcon from '@mui/icons-material/Work';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RecommendIcon from '@mui/icons-material/Recommend';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import TimerIcon from '@mui/icons-material/Timer';
import DeleteIcon from '@mui/icons-material/Delete';
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

interface Job {
  name: string;
  namespace: string;
  completions: number | null;
  parallelism: number | null;
  active: number;
  succeeded: number;
  failed: number;
  start_time: string | null;
  completion_time: string | null;
  duration: string | null;
  age: string;
  labels: { [key: string]: string };
  selector: { [key: string]: string };
  containers: Container[];
  conditions: Array<{
    type: string;
    status: string;
    reason: string;
    message: string;
    last_transition_time?: string;
  }>;
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

const Jobs: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => Promise<void> } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchJobs = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/jobs${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchJobs(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getJobStatus = (job: Job): 'success' | 'warning' | 'error' | 'running' => {
    if (job.failed > 0 && job.active === 0 && job.succeeded === 0) return 'error';
    if (job.succeeded > 0 && job.active === 0) return 'success';
    if (job.active > 0) return 'running';
    if (job.failed > 0) return 'error';
    return 'warning';
  };

  const getStatusIcon = (job: Job) => {
    const status = getJobStatus(job);
    if (status === 'success') return <CheckCircleIcon color="success" />;
    if (status === 'error') return <ErrorIcon color="error" />;
    if (status === 'running') return <CircularProgress size={20} />;
    return <WarningIcon color="warning" />;
  };

  const getStatusLabel = (job: Job): string => {
    if (job.active > 0) return 'Running';
    if (job.succeeded > 0) return 'Completed';
    if (job.failed > 0) return 'Failed';
    return 'Pending';
  };

  const getCompletionPercentage = (job: Job): number => {
    if (!job.completions || job.completions === 0) return 0;
    return Math.round((job.succeeded / job.completions) * 100);
  };

  /** Format raw seconds (string or number) → human-readable e.g. "7s", "3m 45s", "665d" */
  const formatDuration = (raw: string | null | undefined): string => {
    if (!raw) return '-';
    const secs = parseInt(raw, 10);
    if (isNaN(secs)) return raw;
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    return `${Math.floor(secs / 86400)}d`;
  };

  /** Format ISO timestamp to a locale-friendly short string. */
  const fmtTime = (ts: string | null | undefined): string => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ts; }
  };

  // Generate investigations
  const generateInvestigations = (job: Job): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check for failures
    if (job.failed > 0) {
      const failedCondition = job.conditions.find(c => c.type === 'Failed');
      investigations.push({
        type: 'error',
        title: 'Job Failed',
        description: failedCondition?.message || `Job has ${job.failed} failed pod(s)`,
        action: 'Check pod logs and events for failure reasons'
      });
    }

    // Check for stuck jobs
    if (job.active > 0 && !job.start_time) {
      investigations.push({
        type: 'warning',
        title: 'Job Not Starting',
        description: 'Job has active pods but no start time recorded',
        action: 'Check pod scheduling and resource availability'
      });
    }

    // Check for long-running jobs
    if (job.active > 0 && job.duration && parseInt(job.duration) > 3600) {
      investigations.push({
        type: 'warning',
        title: 'Long Running Job',
        description: `Job has been running for ${job.duration}`,
        action: 'Review job logic and consider timeout settings'
      });
    }

    // Check resource limits
    job.containers.forEach(container => {
      if (!container.resources.limits) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set limits to prevent resource exhaustion during batch processing'
        });
      }
    });

    // Check completion status
    if (job.completions && job.succeeded < job.completions && job.active === 0 && job.failed === 0) {
      investigations.push({
        type: 'warning',
        title: 'Incomplete Job',
        description: `Only ${job.succeeded} of ${job.completions} completions achieved`,
        action: 'Job may have been manually stopped or timed out'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (job: Job): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Performance recommendations
    if (job.parallelism === 1 && job.completions && job.completions > 10) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        title: 'Low Parallelism',
        description: `Job runs ${job.completions} completions with parallelism of 1`,
        impact: 'Slow batch processing time',
        action: 'Increase parallelism to speed up job completion'
      });
    }

    // Reliability recommendations
    if (job.failed > 0) {
      recommendations.push({
        category: 'reliability',
        priority: 'high',
        title: 'Job Failures Detected',
        description: `Job has ${job.failed} failed attempts`,
        impact: 'Batch processing incomplete or unreliable',
        action: 'Implement retry logic and error handling'
      });
    }

    // Cost recommendations
    if (job.succeeded > 0 && job.completion_time) {
      recommendations.push({
        category: 'cost',
        priority: 'low',
        title: 'Completed Job Cleanup',
        description: 'Job has completed but resources still allocated',
        impact: 'Unnecessary resource consumption',
        action: 'Configure TTL or manual cleanup for completed jobs'
      });
    }

    // Security recommendations
    job.containers.forEach(container => {
      if (container.image.includes(':latest')) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          title: 'Using :latest Tag',
          description: `Container ${container.name} uses :latest image tag`,
          impact: 'Unpredictable batch job behavior',
          action: 'Pin to specific image version for reproducible jobs'
        });
      }
    });

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

  /** Enqueue a command, then poll until done/failed (max 90s). */
  const runCommand = async (url: string, opts: RequestInit = {}): Promise<void> => {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);

    const cmdId = body.command_id;
    if (!cmdId) return;

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

  const handleDeleteJob = (job: Job) => {
    askConfirm(
      `Delete Job "${job.name}" in namespace "${job.namespace}"? This will also delete its pods.`,
      async () => {
        await runCommand(
          `${API_BASE_URL}/v1/workloads/jobs/${job.namespace}/${job.name}`,
          { method: 'DELETE' }
        );
        showSnack(`Job "${job.name}" deleted`);
        setDetailsOpen(false);
        fetchJobs(selectedClusterId);
      }
    );
  };

  const handleAutoFix = (job: Job, issue: string) => {
    navigate(`/recommendations?resource=${encodeURIComponent(job.name)}&namespace=${encodeURIComponent(job.namespace)}&issue=${encodeURIComponent(issue)}`);
  };

  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.succeeded > 0 && j.active === 0).length;
  const failedJobs = jobs.filter(j => j.failed > 0).length;
  const runningJobs = jobs.filter(j => j.active > 0).length;
  const totalIssues = jobs.reduce((sum, job) => 
    sum + generateInvestigations(job).filter(i => i.type === 'error' || i.type === 'warning').length, 0
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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Jobs</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Manage batch processing and one-time task execution · {filteredJobs.length} of {totalJobs} shown
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
          { label: 'Total Jobs', value: totalJobs, accent: T.text },
          { label: 'Completed', value: completedJobs, accent: T.green, sub: `${totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0}% success rate` },
          { label: 'Running', value: runningJobs, accent: T.yellow, sub: `${failedJobs} failed` },
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
          placeholder="Search jobs..."
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
          <IconButton onClick={() => fetchJobs(selectedClusterId)} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Jobs Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#161f30' }}>
              <TableCell sx={headSx}>Status</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={headSx}>Completions</TableCell>
              <TableCell sx={headSx}>Duration</TableCell>
              <TableCell sx={headSx}>Issues</TableCell>
              <TableCell sx={headSx}>Age</TableCell>
              <TableCell sx={headSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  {searchTerm ? 'No jobs match your search' : (loading ? 'Loading…' : 'No jobs found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => {
                const investigations = generateInvestigations(job);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${job.namespace}-${job.name}`} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Tooltip title={getStatusLabel(job)}>
                        {getStatusIcon(job)}
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }}>{job.name}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={job.namespace} size="small" sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Box sx={{ width: '100%' }}>
                        <Typography sx={{ fontSize: 12, color: T.body }}>
                          {job.succeeded}/{job.completions || '?'}
                        </Typography>
                        {job.completions && (
                          <LinearProgress
                            variant="determinate"
                            value={getCompletionPercentage(job)}
                            sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: T.border,
                              '& .MuiLinearProgress-bar': { bgcolor: getJobStatus(job) === 'error' ? T.red : T.green, borderRadius: 2 } }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{formatDuration(job.duration)}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip
                        label={issueCount === 0 ? 'Healthy' : `${issueCount} issues`}
                        size="small"
                        sx={{ bgcolor: issueCount === 0 ? '#052e16' : '#450a0a', color: issueCount === 0 ? T.green : T.red, border: `1px solid ${issueCount === 0 ? T.green+'44' : T.red+'44'}`, fontSize: 11, height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: T.muted }}>{job.age}</TableCell>
                    <TableCell sx={cellSx}>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            sx={{ color: T.muted, '&:hover': { color: T.text } }}
                            onClick={() => {
                              setSelectedJob(job);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {getJobStatus(job) !== 'running' && (
                          <Tooltip title="Delete Job">
                            <IconButton
                              size="small"
                              sx={{ color: T.red, '&:hover': { bgcolor: '#450a0a' } }}
                              onClick={() => handleDeleteJob(job)}
                              disabled={actionLoading}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
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
        {selectedJob && (
          <>
            <DialogTitle sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontWeight: 600, color: T.text }}>{selectedJob.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>{selectedJob.namespace}</Typography>
                </Box>
                {getStatusIcon(selectedJob)}
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
                    { label: 'Execution Status', rows: [
                      ['Completions', selectedJob.completions || 'N/A'],
                      ['Parallelism', selectedJob.parallelism || 'N/A'],
                      ['Active', selectedJob.active],
                      ['Succeeded', selectedJob.succeeded],
                      ...(selectedJob.failed > 0 ? [['Failed', selectedJob.failed]] : []),
                    ]},
                    { label: 'Timing', rows: [
                      ['Duration', formatDuration(selectedJob.duration)],
                      ['Age', selectedJob.age],
                      ['Started', fmtTime(selectedJob.start_time)],
                      ['Completed', fmtTime(selectedJob.completion_time)],
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
                  {selectedJob.containers.length > 0 && (
                    <Grid item xs={12}>
                      <Card sx={{ bgcolor: T.bg, border: `1px solid ${T.border}`, borderRadius: 1 }}>
                        <CardContent sx={{ p: 2 }}>
                          <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>Containers</Typography>
                          {selectedJob.containers.map((c, i) => (
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
                  {generateInvestigations(selectedJob).map((inv, idx) => (
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
                  {generateInvestigations(selectedJob).length === 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${T.green}44`, bgcolor: '#052e16' }}>
                      <Typography sx={{ fontSize: 13, color: T.green }}>No issues found — Job is healthy</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Recommendations Tab */}
              {activeTab === 2 && (
                <Box>
                  {generateRecommendations(selectedJob).map((rec, idx) => (
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
                    { ok: selectedJob.failed === 0, label: 'Execution Status', sub: `${selectedJob.succeeded} succeeded, ${selectedJob.failed} failed` },
                    { ok: true, label: 'Duration', sub: formatDuration(selectedJob.duration) },
                    { ok: selectedJob.containers.every(c => c.resources.limits), label: 'Resource Limits', sub: 'All containers have limits' },
                    { ok: !selectedJob.containers.some(c => c.image.includes(':latest')), label: 'Image Tags', sub: 'No :latest tags used' },
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
                  {getJobStatus(selectedJob) !== 'running' && (
                    <Button variant="contained" fullWidth sx={{ mb: 1, bgcolor: T.red, color: '#fff', '&:hover': { bgcolor: '#dc2626' } }}
                      onClick={() => handleDeleteJob(selectedJob)} disabled={actionLoading}
                      startIcon={actionLoading ? <CircularProgress size={16} /> : <DeleteIcon />}>
                      Delete Job
                    </Button>
                  )}
                  <Button variant="outlined" fullWidth sx={{ mb: 1, color: T.muted, borderColor: T.border }}>View Pod Logs</Button>
                  <Button variant="outlined" fullWidth sx={{ color: T.muted, borderColor: T.border }}>View Events</Button>
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
          <Button variant="contained" sx={{ bgcolor: T.red, color: '#fff', '&:hover': { bgcolor: '#dc2626' }, textTransform: 'none' }} onClick={runConfirmed}>Confirm Delete</Button>
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

export default Jobs;

// Made with Bob
