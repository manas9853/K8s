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
    // Parse cron schedule to human-readable format
    if (schedule === '@yearly' || schedule === '@annually') return 'Once a year';
    if (schedule === '@monthly') return 'Once a month';
    if (schedule === '@weekly') return 'Once a week';
    if (schedule === '@daily' || schedule === '@midnight') return 'Once a day';
    if (schedule === '@hourly') return 'Once an hour';
    
    // Parse standard cron format: minute hour day month weekday
    const parts = schedule.split(' ');
    if (parts.length === 5) {
      const [minute, hour, day, month, weekday] = parts;
      
      if (minute === '*' && hour === '*') return 'Every minute';
      if (hour === '*') return `Every hour at minute ${minute}`;
      if (day === '*' && month === '*' && weekday === '*') {
        return `Daily at ${hour}:${minute.padStart(2, '0')}`;
      }
    }
    
    return schedule;
  };

  const getNextRunTime = (cronJob: CronJob): string => {
    if (cronJob.suspend) return 'Suspended';
    if (!cronJob.last_schedule_time) return 'Unknown';
    
    const lastRun = new Date(cronJob.last_schedule_time);
    const schedule = cronJob.schedule;
    
    // Simple next run calculation
    if (schedule === '@daily' || schedule === '@midnight') {
      const nextRun = new Date(lastRun);
      nextRun.setDate(nextRun.getDate() + 1);
      return nextRun.toLocaleString();
    }
    if (schedule === '@hourly') {
      const nextRun = new Date(lastRun);
      nextRun.setHours(nextRun.getHours() + 1);
      return nextRun.toLocaleString();
    }
    
    return 'Check schedule';
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
    return 'Recently';
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
    showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
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
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h4" gutterBottom>
            CronJobs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage scheduled and recurring job execution
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <ScheduleIcon color="primary" />
                <Typography color="text.secondary" gutterBottom>
                  Total CronJobs
                </Typography>
              </Box>
              <Typography variant="h4">{totalCronJobs}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Active</Typography>
              <Typography variant="h4" color="success.main">{activeCronJobs}</Typography>
              <Typography variant="body2" color="text.secondary">
                {suspendedCronJobs} suspended
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Running Jobs</Typography>
              <Typography variant="h4" color="info.main">{runningJobs}</Typography>
              <Typography variant="body2" color="text.secondary">
                Currently executing
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <Badge badgeContent={totalIssues} color="error">
                  <BugReportIcon color="action" />
                </Badge>
                <Typography color="text.secondary" gutterBottom>Issues</Typography>
              </Box>
              <Typography variant="h4" color={totalIssues > 0 ? "error.main" : "success.main"}>
                {totalIssues}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchCronJobs(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* CronJobs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell>Next Run</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCronJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">
                    {searchTerm ? 'No cronjobs match your search' : 'No cronjobs found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredCronJobs.map((cronJob) => {
                const investigations = generateInvestigations(cronJob);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${cronJob.namespace}-${cronJob.name}`} hover>
                    <TableCell>
                      <Tooltip title={getStatusLabel(cronJob)}>
                        {getStatusIcon(cronJob)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">{cronJob.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={cronJob.namespace} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={cronJob.schedule}>
                        <Typography variant="body2">{parseSchedule(cronJob.schedule)}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{getTimeSinceLastRun(cronJob)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {getNextRunTime(cronJob)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Badge badgeContent={issueCount} color="error">
                        <Chip 
                          label={issueCount === 0 ? "Healthy" : `${issueCount} issues`}
                          size="small"
                          color={issueCount === 0 ? "success" : "error"}
                        />
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setSelectedCronJob(cronJob);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={cronJob.suspend ? "Resume" : "Suspend"}>
                          <IconButton
                            size="small"
                            color={cronJob.suspend ? "success" : "warning"}
                            onClick={() => handleSuspendResume(cronJob)}
                            disabled={actionLoading}
                          >
                            {cronJob.suspend ? <PlayArrowIcon /> : <PauseIcon />}
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

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredCronJobs.length} of {totalCronJobs} cronjobs
        </Typography>
      </Box>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
        {selectedCronJob && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedCronJob.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedCronJob.namespace}
                  </Typography>
                </Box>
                {getStatusIcon(selectedCronJob)}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Overview" />
                <Tab label="Investigations" />
                <Tab label="Recommendations" />
                <Tab label="Diagnostics" />
                <Tab label="Actions" />
              </Tabs>

              {/* Overview Tab */}
              {activeTab === 0 && (
                <Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Schedule Information</Typography>
                          <Typography>Schedule: {parseSchedule(selectedCronJob.schedule)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Cron: {selectedCronJob.schedule}
                          </Typography>
                          <Divider sx={{ my: 1 }} />
                          <Typography>Status: {selectedCronJob.suspend ? 'Suspended' : 'Active'}</Typography>
                          <Typography>Active Jobs: {selectedCronJob.active}</Typography>
                          <Typography>Last Run: {getTimeSinceLastRun(selectedCronJob)}</Typography>
                          <Typography>Next Run: {getNextRunTime(selectedCronJob)}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Job Template</Typography>
                          <Typography>Completions: {selectedCronJob.job_template.completions || 'N/A'}</Typography>
                          <Typography>Parallelism: {selectedCronJob.job_template.parallelism || 'N/A'}</Typography>
                          <Typography>Backoff Limit: {selectedCronJob.job_template.backoff_limit}</Typography>
                          <Typography>Age: {selectedCronJob.age}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Containers</Typography>
                          {selectedCronJob.job_template.containers.map((container, idx) => (
                            <Box key={idx} mb={2}>
                              <Typography variant="body2" fontWeight="medium">{container.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{container.image}</Typography>
                              <Box mt={1}>
                                <Typography variant="caption">
                                  CPU: {container.resources.requests?.cpu || 'N/A'} / {container.resources.limits?.cpu || 'N/A'}
                                </Typography>
                                <br />
                                <Typography variant="caption">
                                  Memory: {container.resources.requests?.memory || 'N/A'} / {container.resources.limits?.memory || 'N/A'}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Investigations Tab */}
              {activeTab === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <TroubleshootIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Active Investigations
                  </Typography>
                  {generateInvestigations(selectedCronJob).map((inv, idx) => (
                    <Accordion key={idx}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {inv.type === 'error' && <ErrorIcon color="error" />}
                          {inv.type === 'warning' && <WarningIcon color="warning" />}
                          {inv.type === 'info' && <InfoIcon color="info" />}
                          <Typography>{inv.title}</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>{inv.description}</Typography>
                        {inv.action && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Recommended Action:
                            </Typography>
                            <Typography variant="body2">{inv.action}</Typography>
                            <Button 
                              size="small" 
                              variant="contained" 
                              sx={{ mt: 1 }}
                              onClick={() => handleAutoFix(selectedCronJob, inv.title)}
                            >
                              Auto-Fix
                            </Button>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedCronJob).length === 0 && (
                    <Alert severity="success">No issues found - CronJob is healthy!</Alert>
                  )}
                </Box>
              )}

              {/* Recommendations Tab */}
              {activeTab === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <RecommendIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Optimization Recommendations
                  </Typography>
                  {generateRecommendations(selectedCronJob).map((rec, idx) => (
                    <Card key={idx} sx={{ mb: 2 }} variant="outlined">
                      <CardContent>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Chip 
                            label={rec.category} 
                            size="small" 
                            color={
                              rec.category === 'security' ? 'error' :
                              rec.category === 'performance' ? 'warning' :
                              rec.category === 'cost' ? 'info' : 'success'
                            }
                          />
                          <Chip 
                            label={rec.priority} 
                            size="small" 
                            variant="outlined"
                            color={
                              rec.priority === 'high' ? 'error' :
                              rec.priority === 'medium' ? 'warning' : 'default'
                            }
                          />
                        </Box>
                        <Typography variant="subtitle2" gutterBottom>{rec.title}</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {rec.description}
                        </Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="caption" color="text.secondary">Impact:</Typography>
                        <Typography variant="body2" paragraph>{rec.impact}</Typography>
                        <Typography variant="caption" color="text.secondary">Action:</Typography>
                        <Typography variant="body2">{rec.action}</Typography>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          sx={{ mt: 1 }}
                          onClick={() => handleAutoFix(selectedCronJob, rec.title)}
                        >
                          Apply Recommendation
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {/* Diagnostics Tab */}
              {activeTab === 3 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <HealthAndSafetyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Health Checks & Validations
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={!selectedCronJob.suspend ? "success" : "warning"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Schedule Status"
                        secondary={selectedCronJob.suspend ? 'Suspended' : 'Active'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <AccessTimeIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Last Execution"
                        secondary={getTimeSinceLastRun(selectedCronJob)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <TimerIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Next Scheduled Run"
                        secondary={getNextRunTime(selectedCronJob)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Security Checks"
                        secondary="Image tags, resource limits, retry policy"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SpeedIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Performance"
                        secondary="Schedule optimization and execution efficiency"
                      />
                    </ListItem>
                  </List>
                </Box>
              )}

              {/* Actions Tab */}
              {activeTab === 4 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <BuildIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Available Actions
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Schedule Management</Typography>
                          <Button
                            variant="contained"
                            color={selectedCronJob.suspend ? "success" : "warning"}
                            fullWidth
                            sx={{ mb: 1 }}
                            onClick={() => handleSuspendResume(selectedCronJob)}
                            disabled={actionLoading}
                            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
                          >
                            {selectedCronJob.suspend ? 'Resume CronJob' : 'Suspend CronJob'}
                          </Button>
                          <Button
                            variant="contained"
                            color="primary"
                            fullWidth
                            sx={{ mb: 1 }}
                            onClick={() => handleTriggerNow(selectedCronJob)}
                            disabled={actionLoading}
                            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
                          >
                            Trigger Job Now
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Automated Fixes</Typography>
                          <Button variant="contained" color="success" fullWidth sx={{ mb: 1 }}>
                            Apply All Safe Recommendations
                          </Button>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            Fix Resource Limits
                          </Button>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            Update Image Tags
                          </Button>
                          <Button variant="outlined" fullWidth>
                            Optimize Schedule
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmAction?.label}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={runConfirmed}>Confirm</Button>
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
