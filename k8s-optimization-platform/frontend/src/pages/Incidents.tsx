import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  RestartAlt as RestartIcon,
  Speed as ThrottlingIcon,
  RemoveCircle as EvictionIcon,
  Memory as MemoryIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  Lightbulb as LightbulbIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';

interface Incident {
  incident_id: string;
  type: string;
  severity: string;
  pod_name: string;
  namespace: string;
  cluster: string;
  timestamp: string;
  count: number;
  message: string;
  resource_correlation: any;
}

interface Correlation {
  incident_id: string;
  incident_type: string;
  pod_name: string;
  namespace: string;
  cluster: string;
  root_cause: string;
  confidence: number;
  correlated_metrics: any;
  recommendation: string;
  estimated_fix_time: string;
  priority: string;
}

interface Pattern {
  pattern_id: string;
  pattern_type: string;
  description: string;
  frequency: number;
  affected_pods: string[];
  common_cause: string;
  prevention_steps: string[];
}

const Incidents: React.FC = () => {
  const navigate = useNavigate();
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedCorrelation, setSelectedCorrelation] = useState<Correlation | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchIncidents(),
        fetchCorrelations(),
        fetchPatterns(),
        fetchSummary(),
        fetchTimeline(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncidents = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/incidents/incidents${clusterParam}`);
    const data = await response.json();
    setIncidents(data);
  };

  const fetchCorrelations = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/incidents/correlations${clusterParam}`);
    const data = await response.json();
    setCorrelations(data);
  };

  const fetchPatterns = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/incidents/patterns${clusterParam}`);
    const data = await response.json();
    setPatterns(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/incidents/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const fetchTimeline = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/incidents/timeline${clusterParam}`);
    const data = await response.json();
    setTimeline(data);
  };

  const getIncidentIcon = (type: string) => {
    switch (type) {
      case 'oomkill':
        return <MemoryIcon color="error" />;
      case 'restart':
        return <RestartIcon color="warning" />;
      case 'throttling':
        return <ThrottlingIcon color="info" />;
      case 'eviction':
        return <EvictionIcon color="error" />;
      default:
        return <ErrorIcon />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const incidentTypeData = summary ? Object.entries(summary.by_type || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value: value as number,
  })) : [];

  const severityData = summary ? Object.entries(summary.by_severity || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value: value as number,
    color: name === 'critical' ? '#d32f2f' : name === 'high' ? '#f57c00' : name === 'medium' ? '#fbc02d' : '#4caf50',
  })) : [];

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <LinearProgress sx={{ width: '200px' }} />
      </Box>
    );
  }

  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Incident and alert data is sourced from registered clusters. Connect a cluster via
          the Cluster Onboarding page and incident correlations will appear here automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          AI Incident Correlation
        </Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Incidents
                </Typography>
                <Typography variant="h4">{summary.total_incidents}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  OOMKills
                </Typography>
                <Typography variant="h4" color="error.main">
                  {summary.total_oomkills}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Pod Restarts
                </Typography>
                <Typography variant="h4" color="warning.main">
                  {summary.total_restarts}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Throttling Events
                </Typography>
                <Typography variant="h4" color="info.main">
                  {summary.total_throttling_events}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Incidents by Type
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incidentTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {incidentTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#f44336', '#ff9800', '#2196f3', '#9c27b0'][index % 4]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Incidents by Severity
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="Recent Incidents" />
          <Tab label="Correlations" />
          <Tab label="Patterns" />
          <Tab label="Timeline" />
        </Tabs>

        {/* Tab 0: Recent Incidents */}
        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Pod</TableCell>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Count</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {incidents.map((incident) => (
                    <TableRow key={incident.incident_id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {getIncidentIcon(incident.type)}
                          <Typography variant="body2" sx={{ ml: 1 }}>
                            {incident.type.toUpperCase()}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {incident.pod_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{incident.namespace}</TableCell>
                      <TableCell>{incident.cluster}</TableCell>
                      <TableCell>
                        <Chip
                          label={incident.severity.toUpperCase()}
                          color={getSeverityColor(incident.severity) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip label={incident.count} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(incident.timestamp).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedIncident(incident);
                            const corr = correlations.find(c => c.incident_id === incident.incident_id);
                            setSelectedCorrelation(corr || null);
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

        {/* Tab 1: Correlations */}
        {tabValue === 1 && (
          <Box sx={{ p: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              AI-powered correlation analysis showing root causes and recommendations
            </Alert>
            <List>
              {correlations.map((correlation) => (
                <Accordion key={correlation.incident_id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle1">{correlation.pod_name}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {correlation.root_cause}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${correlation.confidence}% confidence`}
                        color={correlation.confidence > 90 ? 'success' : 'warning'}
                        size="small"
                        sx={{ mr: 2 }}
                      />
                      <Chip
                        label={correlation.priority.toUpperCase()}
                        color={correlation.priority === 'critical' ? 'error' : 'warning'}
                        size="small"
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>
                          Correlated Metrics
                        </Typography>
                        <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                          <pre style={{ fontSize: '12px', margin: 0, overflow: 'auto' }}>
                            {JSON.stringify(correlation.correlated_metrics, null, 2)}
                          </pre>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>
                          Recommendation
                        </Typography>
                        <Alert severity="success" icon={<LightbulbIcon />}>
                          {correlation.recommendation}
                        </Alert>
                        <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                          Estimated fix time: {correlation.estimated_fix_time}
                        </Typography>
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              ))}
            </List>
          </Box>
        )}

        {/* Tab 2: Patterns */}
        {tabValue === 2 && (
          <Box sx={{ p: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Recurring incident patterns detected across your clusters
            </Alert>
            {patterns.map((pattern) => (
              <Accordion key={pattern.pattern_id}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1">{pattern.description}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {pattern.common_cause}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${pattern.frequency} occurrences`}
                      color="error"
                      size="small"
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="subtitle2" gutterBottom>
                    Affected Pods
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    {pattern.affected_pods.map((pod, idx) => (
                      <Chip key={idx} label={pod} size="small" sx={{ mr: 1, mb: 1 }} />
                    ))}
                  </Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Prevention Steps
                  </Typography>
                  <List dense>
                    {pattern.prevention_steps.map((step, idx) => (
                      <ListItem key={idx}>
                        <ListItemIcon>
                          <CheckCircleIcon color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={step} />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        {/* Tab 3: Timeline */}
        {tabValue === 3 && (
          <Box sx={{ p: 2 }}>
            <List>
              {timeline.map((event, idx) => (
                <React.Fragment key={idx}>
                  <ListItem alignItems="flex-start">
                    <ListItemIcon sx={{ mt: 1 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: getSeverityColor(event.severity) === 'error' ? 'error.light' :
                                   getSeverityColor(event.severity) === 'warning' ? 'warning.light' :
                                   getSeverityColor(event.severity) === 'info' ? 'info.light' : 'success.light',
                        }}
                      >
                        {getIncidentIcon(event.incident_type)}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography variant="subtitle2" component="span">
                            {event.incident_type.toUpperCase()} - {event.pod_name}
                          </Typography>
                          <Chip
                            label={event.severity.toUpperCase()}
                            color={getSeverityColor(event.severity) as any}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="textSecondary" display="block">
                            {event.namespace} • {new Date(event.timestamp).toLocaleString()}
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {event.message}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  {idx < timeline.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Box>
        )}
      </Paper>

      {/* Incident Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Incident Details
          {selectedIncident && (
            <Chip
              label={selectedIncident.severity.toUpperCase()}
              color={getSeverityColor(selectedIncident.severity) as any}
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {selectedIncident && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Pod</Typography>
                  <Typography variant="body2">{selectedIncident.pod_name}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Namespace</Typography>
                  <Typography variant="body2">{selectedIncident.namespace}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Cluster</Typography>
                  <Typography variant="body2">{selectedIncident.cluster}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">Occurrences</Typography>
                  <Typography variant="body2">{selectedIncident.count}</Typography>
                </Grid>
              </Grid>

              <Alert severity="error" sx={{ mb: 2 }}>
                {selectedIncident.message}
              </Alert>

              {selectedCorrelation && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    AI Correlation Analysis
                  </Typography>
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'success.light' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Root Cause ({selectedCorrelation.confidence}% confidence)
                    </Typography>
                    <Typography variant="body2">{selectedCorrelation.root_cause}</Typography>
                  </Paper>

                  <Alert severity="success" icon={<LightbulbIcon />} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">Recommendation</Typography>
                    <Typography variant="body2">{selectedCorrelation.recommendation}</Typography>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      Estimated fix time: {selectedCorrelation.estimated_fix_time}
                    </Typography>
                  </Alert>

                  <Typography variant="subtitle2" gutterBottom>
                    Correlated Metrics
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                    <pre style={{ fontSize: '12px', margin: 0, overflow: 'auto' }}>
                      {JSON.stringify(selectedCorrelation.correlated_metrics, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" color="primary">
            Apply Fix
          </Button>
        </DialogActions>
      </Dialog>

      {loading && <LinearProgress />}
    </Box>
  );
};

export default Incidents;

// Made with Bob
