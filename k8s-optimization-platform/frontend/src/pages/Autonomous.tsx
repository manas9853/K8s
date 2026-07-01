import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  LinearProgress,
  Alert,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  PlayArrow as ApplyIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  AutoMode as AutoIcon,
  PanTool as ManualIcon,
  AssistWalker as AssistedIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface Mode {
  mode: string;
  name: string;
  description: string;
  features: string[];
  risk: string;
  automation_level: number;
}

interface OptimizationTask {
  task_id: string;
  mode: string;
  cluster: string;
  namespace: string;
  resource_type: string;
  resource_name: string;
  optimization_type: string;
  current_config: Record<string, any>;
  recommended_config: Record<string, any>;
  estimated_savings: number;
  risk_level: string;
  status: string;
  requires_approval: boolean;
  auto_approved: boolean;
  created_at: string;
  updated_at: string;
  applied_at?: string;
  approved_by?: string;
}

interface ModeStats {
  mode: string;
  total_tasks: number;
  pending_approval: number;
  auto_approved: number;
  manually_approved: number;
  rejected: number;
  applied: number;
  failed: number;
  total_savings: number;
  avg_approval_time: number;
}

const Autonomous: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [modes, setModes] = useState<Mode[]>([]);
  const [currentMode, setCurrentMode] = useState<string>('assisted');
  const [tasks, setTasks] = useState<OptimizationTask[]>([]);
  const [stats, setStats] = useState<ModeStats[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<OptimizationTask | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalReason, setApprovalReason] = useState('');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchModes(),
        fetchTasks(),
        fetchStats(),
        fetchSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchModes = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/autonomous/modes${clusterParam}`);
    const data = await response.json();
    setModes(data.modes || []);
    setCurrentMode(data.current_config?.global || 'assisted');
  };

  const fetchTasks = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/autonomous/tasks${clusterParam}`);
    const data = await response.json();
    setTasks(data);
  };

  const fetchStats = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/autonomous/stats${clusterParam}`);
    const data = await response.json();
    setStats(data.stats || []);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/autonomous/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const handleModeChange = async (newMode: string) => {
    try {
      await fetch('/api/v1/autonomous/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: newMode,
          enabled: true,
        }),
      });
      setCurrentMode(newMode);
      fetchData();
    } catch (error) {
      console.error('Error updating mode:', error);
    }
  };

  const handleApprovalClick = (task: OptimizationTask, action: 'approve' | 'reject') => {
    setSelectedTask(task);
    setApprovalAction(action);
    setApprovalDialogOpen(true);
  };

  const handleApprovalSubmit = async () => {
    if (!selectedTask) return;

    try {
      await fetch(`${API_BASE_URL}/v1/autonomous/tasks/${selectedTask.task_id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: selectedTask.task_id,
          action: approvalAction,
          reason: approvalReason,
        }),
      });
      setApprovalDialogOpen(false);
      setApprovalReason('');
      fetchData();
    } catch (error) {
      console.error('Error processing approval:', error);
    }
  };

  const handleApplyTask = async (taskId: string) => {
    try {
      await fetch(`${API_BASE_URL}/v1/autonomous/tasks/${taskId}/apply`, {
        method: 'POST',
      });
      fetchData();
    } catch (error) {
      console.error('Error applying task:', error);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'info';
      case 'applied':
        return 'success';
      case 'rejected':
        return 'error';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'manual':
        return <ManualIcon />;
      case 'assisted':
        return <AssistedIcon />;
      case 'autonomous':
        return <AutoIcon />;
      default:
        return <SettingsIcon />;
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filterStatus !== 'all' && task.status !== filterStatus) return false;
    if (filterMode !== 'all' && task.mode !== filterMode) return false;
    return true;
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Autonomous Optimization Modes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure automation level for infrastructure optimization
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setConfigDialogOpen(true)}
          >
            Configure
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Current Mode
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Pending Approval
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.pending_approval}
                </Typography>
                <Typography variant="body2" color="white">
                  {summary.total_tasks} total tasks
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Auto-Approved
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.auto_approved}
                </Typography>
                <Typography variant="body2" color="white">
                  {summary.applied} applied
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Total Savings
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  ${summary.total_savings?.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="white">
                  ${summary.avg_savings_per_task?.toFixed(0)}/task avg
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Mode Selection */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select Optimization Mode
        </Typography>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {modes.map((mode) => (
            <Grid item xs={12} md={4} key={mode.mode}>
              <Card
                sx={{
                  cursor: 'pointer',
                  border: currentMode === mode.mode ? 2 : 1,
                  borderColor: currentMode === mode.mode ? 'primary.main' : 'divider',
                  '&:hover': { borderColor: 'primary.main' },
                }}
                onClick={() => handleModeChange(mode.mode)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    {getModeIcon(mode.mode)}
                    <Typography variant="h6">{mode.name}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {mode.description}
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Automation Level
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={mode.automation_level}
                      sx={{ mt: 0.5, height: 8, borderRadius: 1 }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Chip label={`Risk: ${mode.risk}`} size="small" color={getRiskColor(mode.risk)} />
                    <Chip label={`${mode.automation_level}% Auto`} size="small" />
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Features:
                  </Typography>
                  {mode.features.map((feature, idx) => (
                    <Typography key={idx} variant="caption" display="block" sx={{ ml: 1 }}>
                      • {feature}
                    </Typography>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)}>
          <Tab label="Optimization Tasks" />
          <Tab label="Statistics" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {selectedTab === 0 && (
        <Paper sx={{ p: 3 }}>
          {/* Filters */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="applied">Applied</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Mode</InputLabel>
              <Select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} label="Mode">
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="manual">Manual</MenuItem>
                <MenuItem value="assisted">Assisted</MenuItem>
                <MenuItem value="autonomous">Autonomous</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Tasks Table */}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Task ID</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Cluster</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Savings</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow key={task.task_id}>
                    <TableCell>{task.task_id}</TableCell>
                    <TableCell>
                      <Chip label={task.mode} size="small" icon={getModeIcon(task.mode)} />
                    </TableCell>
                    <TableCell>{task.cluster}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{task.resource_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {task.namespace}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={task.optimization_type.replace(/_/g, ' ')} size="small" />
                    </TableCell>
                    <TableCell>${task.estimated_savings.toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip label={task.risk_level} size="small" color={getRiskColor(task.risk_level)} />
                    </TableCell>
                    <TableCell>
                      <Chip label={task.status} size="small" color={getStatusColor(task.status)} />
                      {task.auto_approved && (
                        <Chip label="Auto" size="small" sx={{ ml: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      {task.status === 'pending' && (
                        <>
                          <Tooltip title="Approve">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleApprovalClick(task, 'approve')}
                            >
                              <ApproveIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleApprovalClick(task, 'reject')}
                            >
                              <RejectIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {task.status === 'approved' && (
                        <Tooltip title="Apply">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleApplyTask(task.task_id)}
                          >
                            <ApplyIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {selectedTab === 1 && (
        <Grid container spacing={3}>
          {stats.map((stat) => (
            <Grid item xs={12} md={4} key={stat.mode}>
              <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  {getModeIcon(stat.mode)}
                  <Typography variant="h6">
                    {stat.mode.charAt(0).toUpperCase() + stat.mode.slice(1)} Mode
                  </Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Total Tasks
                    </Typography>
                    <Typography variant="h6">{stat.total_tasks}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Applied
                    </Typography>
                    <Typography variant="h6">{stat.applied}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Pending
                    </Typography>
                    <Typography variant="h6">{stat.pending_approval}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Auto-Approved
                    </Typography>
                    <Typography variant="h6">{stat.auto_approved}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Rejected
                    </Typography>
                    <Typography variant="h6">{stat.rejected}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Avg Time
                    </Typography>
                    <Typography variant="h6">{stat.avg_approval_time}m</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      Total Savings
                    </Typography>
                    <Typography variant="h5" color="success.main" fontWeight="bold">
                      ${stat.total_savings.toLocaleString()}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onClose={() => setApprovalDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {approvalAction === 'approve' ? 'Approve' : 'Reject'} Optimization Task
        </DialogTitle>
        <DialogContent>
          {selectedTask && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Task:</strong> {selectedTask.task_id}
                </Typography>
                <Typography variant="body2">
                  <strong>Resource:</strong> {selectedTask.resource_name}
                </Typography>
                <Typography variant="body2">
                  <strong>Savings:</strong> ${selectedTask.estimated_savings.toLocaleString()}/month
                </Typography>
              </Alert>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Reason (optional)"
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={approvalAction === 'approve' ? 'success' : 'error'}
            onClick={handleApprovalSubmit}
          >
            {approvalAction === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Autonomous;

// Made with Bob
