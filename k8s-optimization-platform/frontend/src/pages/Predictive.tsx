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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Prediction {
  prediction_id: string;
  pod_name: string;
  namespace: string;
  cluster: string;
  prediction_type: string;
  predicted_at: string;
  predicted_event_time: string;
  confidence: number;
  current_metrics: any;
  predicted_metrics: any;
  recommendation: string;
  auto_action: string;
  status: string;
}

const PredictiveInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchPredictions(),
        fetchActions(),
        fetchAlerts(),
        fetchSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPredictions = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/predictive/predictions${clusterParam}`);
    const data = await response.json();
    setPredictions(data);
  };

  const fetchActions = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/predictive/actions${clusterParam}`);
    const data = await response.json();
    setActions(data);
  };

  const fetchAlerts = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/predictive/alerts${clusterParam}`);
    const data = await response.json();
    setAlerts(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/predictive/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const getPredictionIcon = (type: string) => {
    switch (type) {
      case 'oom_risk':
        return <MemoryIcon color="error" />;
      case 'cpu_exhaustion':
        return <SpeedIcon color="warning" />;
      case 'storage_exhaustion':
        return <StorageIcon color="info" />;
      default:
        return <WarningIcon />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'auto_scaled':
        return 'success';
      case 'pending':
        return 'warning';
      case 'monitoring':
        return 'info';
      default:
        return 'default';
    }
  };

  const typeData = summary ? Object.entries(summary.by_type || {}).map(([name, value]) => ({
    name: name.replace('_', ' ').toUpperCase(),
    value: value as number,
  })) : [];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Predictive Scaling & Self-Healing
        </Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Predictions
                </Typography>
                <Typography variant="h4">{summary.active_predictions}</Typography>
                <Typography variant="caption" color="success.main">
                  {summary.success_rate * 100}% accuracy
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Auto-Scaled
                </Typography>
                <Typography variant="h4" color="success.main">
                  {summary.auto_scaled}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Incidents Prevented
                </Typography>
                <Typography variant="h4" color="primary.main">
                  {summary.prevented_incidents}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Time Saved
                </Typography>
                <Typography variant="h4">{summary.time_saved}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Predictions by Type
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#f44336', '#ff9800', '#2196f3', '#9c27b0'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Alerts
            </Typography>
            <List>
              {alerts.slice(0, 3).map((alert) => (
                <ListItem key={alert.alert_id}>
                  <ListItemText
                    primary={alert.message}
                    secondary={`${alert.pod_name} • ${alert.namespace}`}
                  />
                  <Chip
                    label={alert.severity.toUpperCase()}
                    color={alert.severity === 'critical' ? 'error' : 'warning'}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="Predictions" />
          <Tab label="Auto-Scaling Actions" />
          <Tab label="Alerts" />
        </Tabs>

        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Pod</TableCell>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Predicted Time</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {predictions.map((pred) => (
                    <TableRow key={pred.prediction_id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {getPredictionIcon(pred.prediction_type)}
                          <Typography variant="body2" sx={{ ml: 1 }}>
                            {pred.prediction_type.replace('_', ' ').toUpperCase()}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{pred.pod_name}</TableCell>
                      <TableCell>{pred.namespace}</TableCell>
                      <TableCell>
                        <Chip
                          label={`${(pred.confidence * 100).toFixed(0)}%`}
                          color={pred.confidence > 0.9 ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(pred.predicted_event_time).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={pred.status.toUpperCase()}
                          color={getStatusColor(pred.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedPrediction(pred);
                            setOpenDialog(true);
                          }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Action Type</TableCell>
                    <TableCell>Pod</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Executed At</TableCell>
                    <TableCell>Result</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {actions.map((action) => (
                    <TableRow key={action.action_id}>
                      <TableCell>{action.action_type.replace('_', ' ').toUpperCase()}</TableCell>
                      <TableCell>{action.pod_name}</TableCell>
                      <TableCell>{action.trigger.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(action.executed_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={<CheckCircleIcon />}
                          label={action.result.toUpperCase()}
                          color="success"
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tabValue === 2 && (
          <Box sx={{ p: 2 }}>
            {alerts.map((alert) => (
              <Alert
                key={alert.alert_id}
                severity={alert.severity === 'critical' ? 'error' : 'warning'}
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle2">{alert.message}</Typography>
                <Typography variant="caption">
                  {alert.pod_name} • {alert.namespace} • {alert.cluster}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {alert.actions_taken.map((action: string, idx: number) => (
                    <Chip key={idx} label={action} size="small" sx={{ mr: 1 }} />
                  ))}
                </Box>
              </Alert>
            ))}
          </Box>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Prediction Details</DialogTitle>
        <DialogContent>
          {selectedPrediction && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Pod</Typography>
                  <Typography variant="body2">{selectedPrediction.pod_name}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Confidence</Typography>
                  <Typography variant="body2">{(selectedPrediction.confidence * 100).toFixed(0)}%</Typography>
                </Grid>
              </Grid>
              <Alert severity="warning" sx={{ mb: 2 }}>
                {selectedPrediction.recommendation}
              </Alert>
              <Typography variant="subtitle2" gutterBottom>Current Metrics</Typography>
              <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
                <pre style={{ fontSize: '12px', margin: 0 }}>
                  {JSON.stringify(selectedPrediction.current_metrics, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom>Predicted Metrics</Typography>
              <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                <pre style={{ fontSize: '12px', margin: 0 }}>
                  {JSON.stringify(selectedPrediction.predicted_metrics, null, 2)}
                </pre>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" color="primary">
            Enable Auto-Healing
          </Button>
        </DialogActions>
      </Dialog>

      {loading && <LinearProgress />}
    </Box>
  );
};

const Predictive: React.FC = () => (
  <ClusterGuard><PredictiveInner /></ClusterGuard>
);

export default Predictive;

// Made with Bob
