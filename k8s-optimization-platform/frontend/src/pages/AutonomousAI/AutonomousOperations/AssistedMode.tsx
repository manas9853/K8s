import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import axios from 'axios';

interface AutoApprovalRule {
  id: string;
  name: string;
  condition: string;
  enabled: boolean;
  applied_count: number;
}

interface RecentAction {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  status: string;
  auto_approved: boolean;
}

interface AssistedModeData {
  mode: string;
  status: string;
  auto_approval_enabled: boolean;
  auto_approved_today: number;
  manual_reviews_today: number;
  total_savings_today: string;
  rules: AutoApprovalRule[];
  recent_actions: RecentAction[];
}

const AssistedMode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AssistedModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/operations/assisted-mode');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch assisted mode data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const toggleAutoApproval = async () => {
    try {
      await axios.post('/api/v1/autonomous-ai/operations/assisted-mode/toggle');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle auto-approval');
    }
  };

  const toggleRule = async (ruleId: string) => {
    try {
      await axios.post(`/api/v1/autonomous-ai/operations/assisted-mode/rules/${ruleId}/toggle`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle rule');
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Assisted Mode</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Assisted Mode</Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Assisted Mode
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Automatic approval for low-risk optimizations with manual review for high-risk changes
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Auto-Approval Toggle */}
      <Alert severity={data.auto_approval_enabled ? 'success' : 'warning'} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2">
            <strong>Auto-Approval Status:</strong> {data.auto_approval_enabled ? 'Enabled' : 'Disabled'}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={data.auto_approval_enabled}
                onChange={toggleAutoApproval}
                color="primary"
              />
            }
            label={data.auto_approval_enabled ? 'Enabled' : 'Disabled'}
          />
        </Box>
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Auto-Approved Today
              </Typography>
              <Typography variant="h4" color="success.main">
                {data.auto_approved_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Manual Reviews Today
              </Typography>
              <Typography variant="h4" color="warning.main">
                {data.manual_reviews_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Savings Today
              </Typography>
              <Typography variant="h4" color="primary">
                {data.total_savings_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Mode Status
              </Typography>
              <Chip label={data.status} color="primary" />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Auto-Approval Rules */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Auto-Approval Rules
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Rule Name</TableCell>
                <TableCell>Condition</TableCell>
                <TableCell>Applied Count</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rules.map((rule) => (
                <TableRow key={rule.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {rule.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {rule.condition}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={rule.applied_count} size="small" color="info" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rule.enabled ? 'Enabled' : 'Disabled'}
                      size="small"
                      color={rule.enabled ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.id)}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Recent Actions */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Recent Actions
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Approval Type</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recent_actions.map((action) => (
                <TableRow key={action.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(action.timestamp).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{action.action}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{action.resource}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={action.auto_approved ? 'Auto-Approved' : 'Manual'}
                      size="small"
                      color={action.auto_approved ? 'success' : 'warning'}
                      icon={action.auto_approved ? <CheckCircleIcon /> : <ScheduleIcon />}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={action.status}
                      size="small"
                      color={action.status === 'Applied' ? 'success' : 'info'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Info Box */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          How Assisted Mode Works
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              Low-Risk Changes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Automatically approved and applied based on predefined rules (e.g., savings {'>'} $100, risk = low)
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              High-Risk Changes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Require manual review and approval before being applied to your cluster
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              Customizable Rules
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure auto-approval rules based on your organization's risk tolerance and policies
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default AssistedMode;

// Made with Bob
