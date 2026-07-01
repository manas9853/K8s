import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Paper,
  LinearProgress,
  Alert,
  Button,
  TextField,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Block as BlockIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface TimelineEvent {
  timestamp: string;
  event_type: string;
  severity: string;
  description: string;
  actor: string;
  resource: string;
  action_taken: string;
  details: Record<string, any>;
}

interface IncidentTimelineData {
  incident_id: string;
  title: string;
  status: string;
  severity: string;
  start_time: string;
  end_time: string | null;
  duration: string;
  events: TimelineEvent[];
  summary: {
    total_events: number;
    critical_events: number;
    actions_taken: number;
    resources_affected: number;
  };
}

const IncidentTimelineInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [incidentId, setIncidentId] = useState('INC-2024-001');
  const [timelineData, setTimelineData] = useState<IncidentTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimelineData();
  }, [incidentId]);

  const fetchTimelineData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/incident-timeline/${incidentId}${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTimelineData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch timeline data');
      console.error('Error fetching timeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    if (!severity) return 'default';
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const getEventIcon = (eventType: string) => {
    if (!eventType) return <InfoIcon />;
    switch (eventType.toLowerCase()) {
      case 'detection':
        return <SecurityIcon />;
      case 'alert':
        return <WarningIcon />;
      case 'action':
        return <PlayArrowIcon />;
      case 'containment':
        return <BlockIcon />;
      case 'resolution':
        return <CheckCircleIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const getEventColor = (eventType: string) => {
    if (!eventType) return 'default';
    switch (eventType.toLowerCase()) {
      case 'detection':
        return 'primary';
      case 'alert':
        return 'warning';
      case 'action':
        return 'info';
      case 'containment':
        return 'error';
      case 'resolution':
        return 'success';
      default:
        return 'grey';
    }
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading timeline data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!timelineData) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="info">No timeline data available</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom>
          <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Incident Timeline
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label="Incident ID"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="INC-2024-001">INC-2024-001</MenuItem>
            <MenuItem value="INC-2024-002">INC-2024-002</MenuItem>
            <MenuItem value="INC-2024-003">INC-2024-003</MenuItem>
          </TextField>
          <Button variant="contained" color="primary" onClick={fetchTimelineData}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Incident Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                {timelineData.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Chip
                  label={timelineData.severity}
                  color={getSeverityColor(timelineData.severity) as any}
                  size="small"
                />
                <Chip label={timelineData.status} size="small" />
                <Chip label={`ID: ${timelineData.incident_id}`} size="small" variant="outlined" />
              </Box>
              <Typography variant="body2" color="textSecondary">
                Start Time: {timelineData.start_time}
              </Typography>
              {timelineData.end_time && (
                <Typography variant="body2" color="textSecondary">
                  End Time: {timelineData.end_time}
                </Typography>
              )}
              <Typography variant="body2" color="textSecondary">
                Duration: {timelineData.duration}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{timelineData.summary.total_events}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Events
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#ffebee' }}>
                    <Typography variant="h4" color="error">
                      {timelineData.summary.critical_events}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Critical Events
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{timelineData.summary.actions_taken}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Actions Taken
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4">{timelineData.summary.resources_affected}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Resources Affected
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Event Timeline
          </Typography>
          <Box sx={{ mt: 2 }}>
            {timelineData.events.map((event, index) => (
              <Box key={index}>
                <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                      <Typography variant="body2" color="textSecondary">
                        {event.timestamp}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          label={event.event_type}
                          size="small"
                          color={getEventColor(event.event_type) as any}
                          icon={getEventIcon(event.event_type)}
                        />
                        <Chip
                          label={event.severity}
                          size="small"
                          color={getSeverityColor(event.severity) as any}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={9}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        {event.description}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        Actor: {event.actor}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        Resource: {event.resource}
                      </Typography>
                      {event.action_taken && (
                        <Box sx={{ mt: 1 }}>
                          <Chip
                            label={`Action: ${event.action_taken}`}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        </Box>
                      )}
                      {Object.keys(event.details).length > 0 && (
                        <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                          <Typography variant="caption" fontWeight="bold">
                            Details:
                          </Typography>
                          {Object.entries(event.details).map(([key, value]) => (
                            <Typography key={key} variant="caption" display="block">
                              {key}: {String(value)}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
                {index < timelineData.events.length - 1 && <Divider sx={{ my: 1 }} />}
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

const IncidentTimeline: React.FC = () => (
  <ClusterGuard><IncidentTimelineInner /></ClusterGuard>
);

export default IncidentTimeline;

// Made with Bob
