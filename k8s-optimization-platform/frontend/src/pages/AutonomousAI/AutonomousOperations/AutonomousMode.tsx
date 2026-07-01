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
  AutoMode as AutoModeIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import axios from 'axios';

interface OptimizationActivity {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  result: string;
  savings: string;
}

interface AutonomousModeData {
  mode: string;
  status: string;
  autonomous_enabled: boolean;
  optimizations_today: number;
  total_savings_today: string;
  success_rate: number;
  recent_activities: OptimizationActivity[];
}

const AutonomousMode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AutonomousModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/operations/autonomous-mode');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch autonomous mode data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const toggleAutonomous = async () => {
    try {
      await axios.post('/api/v1/autonomous-ai/operations/autonomous-mode/toggle');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle autonomous mode');
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Autonomous Mode</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Autonomous Mode</Typography>
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
            Autonomous Mode
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Fully automated optimization with AI-powered decision making
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Autonomous Toggle */}
      <Alert severity={data.autonomous_enabled ? 'success' : 'warning'} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AutoModeIcon />
            <Typography variant="body2">
              <strong>Autonomous Mode:</strong> {data.autonomous_enabled ? 'Active - System is automatically optimizing your infrastructure' : 'Inactive - Switch to enable full automation'}
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={data.autonomous_enabled}
                onChange={toggleAutonomous}
                color="primary"
              />
            }
            label={data.autonomous_enabled ? 'Enabled' : 'Disabled'}
          />
        </Box>
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Optimizations Today
              </Typography>
              <Typography variant="h4" color="primary">
                {data.optimizations_today}
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
              <Typography variant="h4" color="success.main">
                {data.total_savings_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Success Rate
              </Typography>
              <Typography variant="h4" color={data.success_rate >= 95 ? 'success.main' : 'warning.main'}>
                {data.success_rate}%
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
              <Chip
                label={data.status}
                color={data.autonomous_enabled ? 'success' : 'default'}
                icon={data.autonomous_enabled ? <CheckCircleIcon /> : <WarningIcon />}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activities */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Recent Autonomous Activities
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Savings</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recent_activities.map((activity) => (
                <TableRow key={activity.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(activity.timestamp).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{activity.action}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{activity.resource}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={activity.result}
                      size="small"
                      color={activity.result === 'Success' ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="success.main" fontWeight="medium">
                      {activity.savings}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Info Boxes */}
      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom color="success.main">
              Benefits of Autonomous Mode
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Continuous 24/7 optimization without human intervention
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Immediate response to resource inefficiencies
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Maximum cost savings through proactive optimization
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • AI learns from your infrastructure patterns over time
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom color="warning.main">
              Safety Guardrails
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Only applies changes with {'<'} 5% risk score
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Automatic rollback on failure detection
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              • Respects resource limits and quotas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Complete audit trail of all changes
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AutonomousMode;

// Made with Bob
