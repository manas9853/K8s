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
import ScheduleIcon from '@mui/icons-material/Schedule';
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
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
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

interface JobTemplate {
  completions: number | null;
  parallelism: number | null;
  backoff_limit: number;
  containers: Container[];
}

interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule_time: string | null;
  last_successful_time: string | null;
  age: string;
  labels: { [key: string]: string };
  job_template: JobTemplate;
  concurrency?: string;
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

const CronJobs: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCronJob, setSelectedCronJob] = useState<CronJob | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => Promise<void> } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchCronJobs = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/cronjobs${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setCronJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cronjobs');
      console.error('Error fetching cronjobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchCronJobs(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getCronJobStatus = (cronJob: CronJob): 'success' | 'warning' | 'error' | 'suspended' => {
    if (cronJob.suspend) return 'suspended';
    if (!cronJob.last_schedule_time) return 'warning';
    if (cronJob.active > 0) return 'success';
    
    // Check if last schedule was recent (within expected interval)
    const lastSchedule = new Date(cronJob.last_schedule_time);
    const now = new Date();
    const hoursSinceLastRun = (now.getTime() - lastSchedule.getTime()) / (1000 * 60 * 60);
    
    // If daily job hasn't run in >25 hours, or hourly job hasn't run in >2 hours
    if (cronJob.schedule.includes('daily') && hoursSinceLastRun > 25) return 'error';
    if (cronJob.schedule.includes('hourly') && hoursSinceLastRun > 2) return 'error';
    
    return 'success';
  };

  const getStatusIcon = (cronJob: CronJob) => {
    const status = getCronJobStatus(cronJob);
    if (status === 'success') return <CheckCircleIcon color="success" />;
    if (status === 'error') return <ErrorIcon color="error" />;
    if (status === 'suspended') return <PauseIcon color="disabled" />;
    return <WarningIcon color="warning" />;
  };

  const getStatusLabel = (cronJob: CronJob): string => {
    if (cronJob.suspend) return 'Suspended';
    if (cronJob.active > 0) return 'Running';
    if (!cronJob.last_schedule_time) return 'Never Run';
    return 'Scheduled';
  };

  const parseSchedule = (schedule: string): string => {
    if (schedule === '@yearly' || schedule === '@annually') return 'Yearly';
    if (schedule === '@monthly') return 'Monthly';
    if (schedule === '@weekly') return 'Weekly';
    if (schedule === '@daily' || schedule === '@midnight') return 'Daily';
    if (schedule === '@hourly') return 'Hourly';

    const parts = schedule.split(' ');
    if (parts.length !== 5) return schedule;
    const [minute, hour, day, month, weekday] = parts;

    // Every N minutes: */N * * * *
    if (minute.startsWith('*/') && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      const n = parseInt(minute.slice(2), 10);
      return n === 1 ? 'Every minute' : `Every ${n} minutes`;
    }
    // Every N hours: 0 */N * * *
    if (hour.startsWith('*/') && day === '*' && month === '*' && weekday === '*') {
      const n = parseInt(hour.slice(2), 10);
      return n === 1 ? 'Hourly' : `Every ${n} hours`;
    }
    // Every minute: * * * * *
    if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      return 'Every minute';
    }
    // Daily at specific time: M H * * *
    if (day === '*' && month === '*' && weekday === '*' && !hour.includes('*') && !hour.includes('/')) {
      return `Daily at ${hour.padStart(2,'0')}:${minute.padStart(2,'0')}`;
    }
    return schedule;
  };

  const getNextRunTime = (cronJob: CronJob): string => {
    if (cronJob.suspend) return 'Suspended';
    if (!cronJob.last_schedule_time) return 'Unknown';

    const lastRun = new Date(cronJob.last_schedule_time);
    const sched = cronJob.schedule;

    // Compute interval from schedule
    let intervalMs = 0;
    if (sched === '@hourly') intervalMs = 3600_000;
    else if (sched === '@daily' || sched === '@midnight') intervalMs = 86400_000;
    else if (sched === '@weekly') intervalMs = 7 * 86400_000;
    else {
      const parts = sched.split(' ');
      if (parts.length === 5) {
        const [minute, hour] = parts;
        if (minute.startsWith('*/')) intervalMs = parseInt(minute.slice(2), 10) * 60_000;
        else if (hour.startsWith('*/')) intervalMs = parseInt(hour.slice(2), 10) * 3600_000;
        else intervalMs = 86400_000; // daily fallback
      }
    }
    if (!intervalMs) return 'Check schedule';
    const nextRun = new Date(lastRun.getTime() + intervalMs);
    return nextRun.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  const fmtTime = (ts: string | null | undefined): string => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ts; }
  };

  const getTimeSinceLastRun = (cronJob: CronJob): string => {
    if (!cronJob.last_schedule_time) return 'Never';

    const lastRun = new Date(cronJob.last_schedule_time);
    const now = new Date();
    const diffMs = now.getTime() - lastRun.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  // Generate investigations
  const generateInvestigations = (cronJob: CronJob): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check if suspended
    if (cronJob.suspend) {
      investigations.push({
        type: 'warning',
        title: 'CronJob Suspended',
        description: 'This CronJob is currently suspended and will not create new jobs',
        action: 'Resume CronJob if scheduled execution is needed'
      });
    }

    // Check if never run
    if (!cronJob.last_schedule_time) {
      investigations.push({
        type: 'error',
        title: 'Never Executed',
        description: 'CronJob has never successfully created a job',
        action: 'Check schedule syntax and controller logs'
      });
    }

    // Check for stale execution
    if (cronJob.last_schedule_time && !cronJob.suspend) {
      const lastRun = new Date(cronJob.last_schedule_time);
      const now = new Date();
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      
      if (cronJob.schedule.includes('daily') && hoursSinceLastRun > 25) {
        investigations.push({
          type: 'error',
          title: 'Missed Schedule',
          description: `Daily job hasn't run in ${Math.floor(hoursSinceLastRun)} hours`,
          action: 'Check CronJob controller and cluster resources'
        });
      }
    }

    // Check resource limits
    cronJob.job_template.containers.forEach(container => {
      if (!container.resources.limits) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set limits to prevent resource exhaustion during scheduled runs'
        });
      }
    });

    // Check backoff limit
    if (cronJob.job_template.backoff_limit === 0) {
      investigations.push({
        type: 'warning',
        title: 'No Retry Policy',
        description: 'Backoff limit is 0 - jobs will not retry on failure',
        action: 'Consider setting backoff_limit > 0 for reliability'
      });
    }

    // Check for multiple active jobs
    if (cronJob.active > 1) {
      investigations.push({
        type: 'warning',
        title: 'Multiple Active Jobs',
        description: `${cronJob.active} jobs are currently running`,
        action: 'Check if jobs are taking too long or overlapping'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (cronJob: CronJob): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Schedule optimization
    if (cronJob.schedule === '@daily' && cronJob.namespace.includes('system')) {
      recommendations.push({
        category: 'performance',
        priority: 'low',
        title: 'Off-Peak Scheduling',
        description: 'System maintenance job runs at midnight',
        impact: 'May impact production workloads',
        action: 'Consider scheduling during off-peak hours (e.g., 2-4 AM)'
      });
    }

    // Reliability recommendations
    if (cronJob.job_template.backoff_limit < 3) {
      recommendations.push({
        category: 'reliability',
        priority: 'medium',
        title: 'Low Retry Limit',
        description: `Backoff limit is ${cronJob.job_template.backoff_limit}`,
        impact: 'Jobs may fail without adequate retry attempts',
        action: 'Increase backoff_limit to 3-6 for better reliability'
      });
    }

    // Cost recommendations
    if (!cronJob.last_schedule_time && parseInt(cronJob.age.replace('d', '')) > 30) {
      recommendations.push({
        category: 'cost',
        priority: 'high',
        title: 'Unused CronJob',
        description: 'CronJob has never run and is over 30 days old',
        impact: 'Unnecessary resource allocation',
        action: 'Delete if no longer needed or fix configuration'
      });
    }

    // Security recommendations
    cronJob.job_template.containers.forEach(container => {
      if (container.image.includes(':latest')) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          title: 'Using :latest Tag',
          description: `Container ${container.name} uses :latest image tag`,
          impact: 'Unpredictable scheduled job behavior',
          action: 'Pin to specific image version for reproducible executions'
        });
      }
    });

    // Performance recommendations
    if (cronJob.active > 0 && !cronJob.job_template.parallelism) {
      recommendations.push({
        category: 'performance',
        priority: 'low',
        title: 'No Parallelism Set',
        description: 'Job template has no parallelism configuration',
        impact: 'Sequential execution may be slow',
        action: 'Set parallelism if job can benefit from parallel processing'
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

  /** Enqueue a command, then poll until done/failed (max 90s). Returns final result body. */
  const runCommand = async (url: string, opts: RequestInit = {}): Promise<any> => {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);

    const cmdId = body.command_id;
    if (!cmdId) return body;

    showSnack('Command queued — waiting for agent…');
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2500));
      const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
      if (!poll) continue;
      const status = await poll.json().catch(() => ({}));
      if (status.status === 'done') return status.result || {};
      if (status.status === 'failed') throw new Error(status.result?.error || 'Command failed');
    }
    throw new Error('Timed out waiting for agent response');
  };

  const handleSuspendResume = (cronJob: CronJob) => {
    const newSuspend = !cronJob.suspend;
    const actionLabel = newSuspend ? 'Suspend' : 'Resume';
    askConfirm(
      `${actionLabel} CronJob "${cronJob.name}" in namespace "${cronJob.namespace}"?`,
      async () => {
        await runCommand(
          `${API_BASE_URL}/v1/workloads/cronjobs/${cronJob.namespace}/${cronJob.name}/suspend`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suspend: newSuspend }),
          }
        );
        showSnack(`CronJob "${cronJob.name}" ${newSuspend ? 'suspended' : 'resumed'}`);
        setCronJobs(prev =>
          prev.map(cj =>
            cj.name === cronJob.name && cj.namespace === cronJob.namespace
              ? { ...cj, suspend: newSuspend }
              : cj
          )
        );
        if (selectedCronJob?.name === cronJob.name) {
          setSelectedCronJob({ ...cronJob, suspend: newSuspend });
        }
      }
    );
  };

  const handleTriggerNow = (cronJob: CronJob) => {
    askConfirm(
      `Trigger an immediate job run for CronJob "${cronJob.name}" in namespace "${cronJob.namespace}"?`,
      async () => {
        const result = await runCommand(
          `${API_BASE_URL}/v1/workloads/cronjobs/${cronJob.namespace}/${cronJob.name}/trigger`,
          { method: 'POST' }
        );
        showSnack(`Job "${result.job_name || 'manual'}" created from CronJob "${cronJob.name}"`);
        fetchCronJobs(selectedClusterId);
      }
    );
  };

  const handleAutoFix = (cronJob: CronJob, issue: string) => {
    navigate(`/recommendations?resource=${encodeURIComponent(cronJob.name)}&namespace=${encodeURIComponent(cronJob.namespace)}&issue=${encodeURIComponent(issue)}`);
  };

  const filteredCronJobs = cronJobs.filter(cronJob =>
    cronJob.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cronJob.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCronJobs = cronJobs.length;
  const activeCronJobs = cronJobs.filter(cj => !cj.suspend).length;
  const suspendedCronJobs = cronJobs.filter(cj => cj.suspend).length;
  const runningJobs = cronJobs.filter(cj => cj.active > 0).length;
  const totalIssues = cronJobs.reduce((sum, cronJob) => 
    sum + generateInvestigations(cronJob).filter(i => i.type === 'error' || i.type === 'warning').length, 0
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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>CronJobs</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Manage scheduled and recurring job execution · {filteredCronJobs.length} of {totalCronJobs} shown
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
          { label: 'Total CronJobs', value: totalCronJobs, accent: T.text },
          { label: 'Active', value: activeCronJobs, accent: T.green, sub: `${suspendedCronJobs} suspended` },
          { label: 'Running Jobs', value: runningJobs, accent: T.yellow, sub: 'Currently executing' },
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
          placeholder="Search cronjobs..."
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
          <IconButton onClick={() => fetchCronJobs(selectedClusterId)} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* CronJobs Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#161f30' }}>
              <TableCell sx={headSx}>Status</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={headSx}>Schedule</TableCell>
              <TableCell sx={headSx}>Last Run</TableCell>
              <TableCell sx={headSx}>Next Run</TableCell>
              <TableCell sx={headSx}>Issues</TableCell>
              <TableCell sx={headSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCronJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  {searchTerm ? 'No cronjobs match your search' : (loading ? 'Loading…' : 'No cronjobs found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredCronJobs.map((cronJob) => {
                const investigations = generateInvestigations(cronJob);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${cronJob.namespace}-${cronJob.name}`} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Tooltip title={getStatusLabel(cronJob)}>
                        {getStatusIcon(cronJob)}
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }}>{cronJob.name}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={cronJob.namespace} size="small" sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Tooltip title={cronJob.schedule}>
                        <Typography sx={{ fontSize: 12, color: T.body }}>{parseSchedule(cronJob.schedule)}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{getTimeSinceLastRun(cronJob)}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: cronJob.suspend ? T.red : T.muted }}>
                        {getNextRunTime(cronJob)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip
                        label={issueCount === 0 ? 'Healthy' : `${issueCount} issues`}
                        size="small"
                        sx={{ bgcolor: issueCount === 0 ? '#052e16' : '#450a0a', color: issueCount === 0 ? T.green : T.red, border: `1px solid ${issueCount === 0 ? T.green+'44' : T.red+'44'}`, fontSize: 11, height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            sx={{ color: T.muted, '&:hover': { color: T.text } }}
                            onClick={() => {
                              setSelectedCronJob(cronJob);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={cronJob.suspend ? "Resume" : "Suspend"}>
                          <IconButton
                            size="small"
                            sx={{ color: cronJob.suspend ? T.green : T.yellow, '&:hover': { bgcolor: T.hover } }}
                            onClick={() => handleSuspendResume(cronJob)}
                            disabled={actionLoading}
                          >
                            {cronJob.suspend ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
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
        {selectedCronJob && (
          <>
            <DialogTitle sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontWeight: 600, color: T.text }}>{selectedCronJob.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>{selectedCronJob.namespace}</Typography>
                </Box>
                {getStatusIcon(selectedCronJob)}
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
                    { label: 'Schedule', rows: [
                      ['Expression', selectedCronJob.schedule],
                      ['Parsed', parseSchedule(selectedCronJob.schedule)],
                      ['Status', selectedCronJob.suspend ? 'Suspended' : 'Active'],
                      ['Active Jobs', selectedCronJob.active],
                      ['Last Scheduled', getTimeSinceLastRun(selectedCronJob)],
                      ['Next Run', getNextRunTime(selectedCronJob)],
                    ]},
                    { label: 'Job Template', rows: [
                      ['Completions', selectedCronJob.job_template.completions ?? 'N/A'],
                      ['Parallelism', selectedCronJob.job_template.parallelism ?? 'N/A'],
                      ['Backoff Limit', selectedCronJob.job_template.backoff_limit],
                      ['Concurrency', selectedCronJob.concurrency || 'Allow'],
                      ['Age', selectedCronJob.age],
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
                </Grid>
              )}

              {/* Investigations Tab */}
              {activeTab === 1 && (
                <Box>
                  {generateInvestigations(selectedCronJob).map((inv, idx) => (
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
                  {generateInvestigations(selectedCronJob).length === 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${T.green}44`, bgcolor: '#052e16' }}>
                      <Typography sx={{ fontSize: 13, color: T.green }}>No issues found — CronJob is healthy</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Recommendations Tab */}
              {activeTab === 2 && (
                <Box>
                  {generateRecommendations(selectedCronJob).map((rec, idx) => (
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
                    { ok: !selectedCronJob.suspend, label: 'Schedule Status', sub: selectedCronJob.suspend ? 'Suspended' : 'Active' },
                    { ok: !!selectedCronJob.last_schedule_time, label: 'Last Execution', sub: getTimeSinceLastRun(selectedCronJob) },
                    { ok: selectedCronJob.job_template.containers.every(c => c.resources.limits), label: 'Resource Limits', sub: 'All containers have limits' },
                    { ok: !selectedCronJob.job_template.containers.some(c => c.image.includes(':latest')), label: 'Image Tags', sub: 'No :latest tags' },
                  ].map(({ ok, label, sub }) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: `1px solid ${T.border}` }}>
                      {ok ? <CheckCircleIcon sx={{ fontSize: 18, color: T.green }} /> : <WarningIcon sx={{ fontSize: 18, color: T.yellow }} />}
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
                  <Button variant="contained" fullWidth sx={{ mb: 1, bgcolor: selectedCronJob.suspend ? T.green : T.yellow, color: '#000', '&:hover': { opacity: 0.9 } }}
                    onClick={() => handleSuspendResume(selectedCronJob)} disabled={actionLoading}
                    startIcon={actionLoading ? <CircularProgress size={16} /> : (selectedCronJob.suspend ? <PlayArrowIcon /> : <PauseIcon />)}>
                    {selectedCronJob.suspend ? 'Resume CronJob' : 'Suspend CronJob'}
                  </Button>
                  <Button variant="outlined" fullWidth sx={{ mb: 1, color: T.text, borderColor: T.border }}
                    onClick={() => handleTriggerNow(selectedCronJob)} disabled={actionLoading}>
                    Trigger Job Now
                  </Button>
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
          <Button variant="contained" sx={{ bgcolor: T.yellow, color: '#000', '&:hover': { opacity: 0.9 }, textTransform: 'none' }} onClick={runConfirmed}>Confirm</Button>
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

export default CronJobs;

// Made with Bob
