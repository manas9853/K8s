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
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  Error as ErrorIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';

interface RootCause {
  type: string;
  description: string;
  confidence: number;
}

interface Incident {
  id: string;
  type: string;
  severity: string;
  resource: string;
  namespace: string;
  timestamp: string;
  description: string;
  root_causes: RootCause[];
  recommended_actions: string[];
  related_events: Array<{
    timestamp: string;
    event: string;
    severity: string;
  }>;
}

interface InvestigatorData {
  summary: {
    total_incidents: number;
    critical: number;
    resolved: number;
    investigating: number;
  };
  recent_incidents: Incident[];
}

const IncidentInvestigator: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<InvestigatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/copilot/incident-investigator');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch incident data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getIncidentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'oomkill': return <MemoryIcon />;
      case 'cpu throttling': return <SpeedIcon />;
      case 'pod restart': return <ErrorIcon />;
      default: return <WarningIcon />;
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Incident Investigator</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Incident Investigator</Typography>
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
            Incident Investigator
          </Typography>
          <Typography variant="body1" color="text.secondary">
            AI-powered root cause analysis and incident correlation
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Incidents
              </Typography>
              <Typography variant="h4">
                {data.summary.total_incidents}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Critical
              </Typography>
              <Typography variant="h4" color="error">
                {data.summary.critical}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Investigating
              </Typography>
              <Typography variant="h4" color="warning.main">
                {data.summary.investigating}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Resolved
              </Typography>
              <Typography variant="h4" color="success.main">
                {data.summary.resolved}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Recent Incidents
          </Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          {data.recent_incidents.map((incident) => (
            <Accordion key={incident.id}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  {getIncidentIcon(incident.type)}
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {incident.type} - {incident.resource}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip
                        label={incident.severity}
                        size="small"
                        color={getSeverityColor(incident.severity)}
                      />
                      <Chip
                        label={incident.namespace}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={new Date(incident.timestamp).toLocaleString()}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Description
                    </Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {incident.description}
                    </Alert>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Root Cause Analysis
                    </Typography>
                    <List>
                      {incident.root_causes.map((cause, idx) => (
                        <ListItem key={idx} sx={{ px: 0 }}>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {cause.type}
                                </Typography>
                                <Chip
                                  label={`${cause.confidence}% confidence`}
                                  size="small"
                                  color={cause.confidence >= 80 ? 'success' : 'warning'}
                                />
                              </Box>
                            }
                            secondary={cause.description}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" gutterBottom>
                      Recommended Actions
                    </Typography>
                    <List>
                      {incident.recommended_actions.map((action, idx) => (
                        <ListItem key={idx} sx={{ px: 0 }}>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                                <Typography variant="body2">{action}</Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<TrendingUpIcon />}
                      size="small"
                      sx={{ mt: 1 }}
                    >
                      Apply Fixes
                    </Button>
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Related Events
                    </Typography>
                    <List>
                      {incident.related_events.map((event, idx) => (
                        <ListItem key={idx}>
                          <ListItemText
                            primary={event.event}
                            secondary={new Date(event.timestamp).toLocaleString()}
                          />
                          <Chip
                            label={event.severity}
                            size="small"
                            color={getSeverityColor(event.severity)}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Investigation Tips
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              Correlation Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary">
              AI correlates events across pods, nodes, and namespaces to identify patterns
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              Root Cause Detection
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Machine learning identifies the most likely root causes with confidence scores
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" gutterBottom>
              Automated Remediation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Apply recommended fixes automatically or schedule them for maintenance windows
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default IncidentInvestigator;

// Made with Bob
