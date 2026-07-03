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
    showSnack(`Auto-fix for "${issue}" is not yet automated — see Recommendations for manual steps.`, 'error');
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
            Jobs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage batch processing and one-time task execution
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
                <WorkIcon color="primary" />
                <Typography color="text.secondary" gutterBottom>
                  Total Jobs
                </Typography>
              </Box>
              <Typography variant="h4">{totalJobs}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Completed</Typography>
              <Typography variant="h4" color="success.main">{completedJobs}</Typography>
              <Typography variant="body2" color="text.secondary">
                {totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0}% success rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Running</Typography>
              <Typography variant="h4" color="info.main">{runningJobs}</Typography>
              <Typography variant="body2" color="text.secondary">
                {failedJobs} failed
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
          placeholder="Search jobs..."
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
          <IconButton onClick={() => fetchJobs(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Jobs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Completions</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">
                    {searchTerm ? 'No jobs match your search' : 'No jobs found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => {
                const investigations = generateInvestigations(job);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${job.namespace}-${job.name}`} hover>
                    <TableCell>
                      <Tooltip title={getStatusLabel(job)}>
                        {getStatusIcon(job)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">{job.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={job.namespace} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%' }}>
                        <Typography variant="body2">
                          {job.succeeded}/{job.completions || '?'}
                        </Typography>
                        {job.completions && (
                          <LinearProgress 
                            variant="determinate" 
                            value={getCompletionPercentage(job)}
                            color={getJobStatus(job) === 'error' ? 'error' : 'primary'}
                            sx={{ mt: 0.5 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDuration(job.duration)}</Typography>
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
                    <TableCell>{job.age}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setSelectedJob(job);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        {getJobStatus(job) !== 'running' && (
                          <Tooltip title="Delete Job">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteJob(job)}
                              disabled={actionLoading}
                            >
                              <DeleteIcon />
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

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredJobs.length} of {totalJobs} jobs
        </Typography>
      </Box>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
        {selectedJob && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedJob.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedJob.namespace}
                  </Typography>
                </Box>
                {getStatusIcon(selectedJob)}
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
                          <Typography variant="subtitle2" gutterBottom>Execution Status</Typography>
                          <Typography>Completions: {selectedJob.completions || 'N/A'}</Typography>
                          <Typography>Parallelism: {selectedJob.parallelism || 'N/A'}</Typography>
                          <Typography>Active: {selectedJob.active}</Typography>
                          <Typography color="success.main">Succeeded: {selectedJob.succeeded}</Typography>
                          {selectedJob.failed > 0 && (
                            <Typography color="error">Failed: {selectedJob.failed}</Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Timing</Typography>
                          <Typography>Duration: <strong>{formatDuration(selectedJob.duration)}</strong></Typography>
                          <Typography>Age: {selectedJob.age}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Started: {fmtTime(selectedJob.start_time)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Completed: {fmtTime(selectedJob.completion_time)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Containers</Typography>
                          {selectedJob.containers.map((container, idx) => (
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
                    {selectedJob.conditions.length > 0 && (
                      <Grid item xs={12}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="subtitle2" gutterBottom>Conditions</Typography>
                            {selectedJob.conditions.map((condition, idx) => (
                              <Box key={idx} mb={1}>
                                <Box display="flex" alignItems="center" gap={1}>
                                  {condition.status === 'True' ? 
                                    <CheckCircleIcon color="success" fontSize="small" /> : 
                                    <ErrorIcon color="error" fontSize="small" />
                                  }
                                  <Typography variant="body2" fontWeight="medium">{condition.type}</Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                  {condition.reason}: {condition.message}
                                </Typography>
                              </Box>
                            ))}
                          </CardContent>
                        </Card>
                      </Grid>
                    )}
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
                  {generateInvestigations(selectedJob).map((inv, idx) => (
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
                              onClick={() => handleAutoFix(selectedJob, inv.title)}
                            >
                              Auto-Fix
                            </Button>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedJob).length === 0 && (
                    <Alert severity="success">No issues found - Job is healthy!</Alert>
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
                  {generateRecommendations(selectedJob).map((rec, idx) => (
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
                          onClick={() => handleAutoFix(selectedJob, rec.title)}
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
                        <CheckCircleIcon color={selectedJob.failed === 0 ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Execution Status"
                        secondary={`${selectedJob.succeeded} succeeded, ${selectedJob.failed} failed`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <TimerIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Duration"
                        secondary={formatDuration(selectedJob.duration)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Security Checks"
                        secondary="Image tags, resource limits"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SpeedIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Performance"
                        secondary="Parallelism and completion time analysis"
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
                          <Typography variant="subtitle2" gutterBottom>Job Management</Typography>
                          {getJobStatus(selectedJob) !== 'running' && (
                            <Button
                              variant="contained"
                              color="error"
                              fullWidth
                              sx={{ mb: 1 }}
                              onClick={() => handleDeleteJob(selectedJob)}
                              disabled={actionLoading}
                              startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
                            >
                              Delete Job
                            </Button>
                          )}
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            View Pod Logs
                          </Button>
                          <Button variant="outlined" fullWidth>
                            View Events
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
                          <Button variant="outlined" fullWidth>
                            Update Image Tags
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
          <Button variant="contained" color="error" onClick={runConfirmed}>Confirm Delete</Button>
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
