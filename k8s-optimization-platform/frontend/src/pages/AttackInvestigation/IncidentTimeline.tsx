import React, { useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  PlayArrow as PlayArrowIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface TimelineEvent {
  timestamp: string;
  event_type: string;
  severity: string;
  description: string;
  actor: string;
  resource: string;
  action_taken: string;
  details: Record<string, unknown>;
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
  cluster_name?: string;
}

interface ActiveThreat {
  id: string;
  name: string;
  severity: string;
  status: string;
  affected_pods: string[];
  affected_namespaces: string[];
  first_seen: string;
  indicators: string[];
}

interface ActiveThreatsResponse {
  threats: ActiveThreat[];
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
  info: '#90caf9',
};

const EVENT_ACCENT: Record<string, string> = {
  detection: '#90caf9',
  analysis: '#ffa726',
  incident_created: '#a78bfa',
  action: '#60a5fa',
  containment: '#ef5350',
  resolution: '#a5d6a7',
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getSeverityColor(severity: string) {
  return SEVERITY_COLOR[(severity || '').toLowerCase()] || '#8892a4';
}

function getEventIcon(eventType: string) {
  switch ((eventType || '').toLowerCase()) {
    case 'detection':
      return <SecurityIcon sx={{ fontSize: 18 }} />;
    case 'analysis':
      return <WarningIcon sx={{ fontSize: 18 }} />;
    case 'action':
      return <PlayArrowIcon sx={{ fontSize: 18 }} />;
    case 'containment':
      return <BlockIcon sx={{ fontSize: 18 }} />;
    case 'resolution':
      return <CheckCircleIcon sx={{ fontSize: 18 }} />;
    default:
      return <InfoIcon sx={{ fontSize: 18 }} />;
  }
}

const IncidentTimelineInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [threats, setThreats] = useState<ActiveThreat[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [timelineData, setTimelineData] = useState<IncidentTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchThreats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/active-threats${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: ActiveThreatsResponse = await response.json();
        if (!mounted) return;
        const items = Array.isArray(result.threats) ? result.threats : [];
        setThreats(items);
        if (items.length > 0) {
          setIncidentId((current) => current || `INC-${new Date().getFullYear()}-001`);
        } else {
          setIncidentId('');
          setTimelineData(null);
        }
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load incidents');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchThreats();

    return () => {
      mounted = false;
    };
  }, [clusterParam]);

  useEffect(() => {
    if (!incidentId) return;
    let mounted = true;

    const fetchTimelineData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/incident-timeline/${incidentId}${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: IncidentTimelineData = await response.json();
        if (!mounted) return;
        setTimelineData(data);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch timeline data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchTimelineData();
    return () => {
      mounted = false;
    };
  }, [incidentId, clusterParam]);

  const incidentOptions = useMemo(
    () => threats.map((threat, index) => ({
      value: `INC-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
      label: `INC-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')} · ${threat.name}`,
      threat,
    })),
    [threats],
  );

  const selectedIncident = useMemo(
    () => incidentOptions.find((option) => option.value === incidentId)?.threat,
    [incidentId, incidentOptions],
  );

  if (loading && !timelineData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!timelineData || incidentOptions.length === 0) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Paper sx={{ p: 4, bgcolor: '#1e2433', border: '1px solid #2a3245', maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            No incident timeline data available
          </Typography>
          <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.7 }}>
            This page uses real incident ids derived from the current active threats feed. No threat-backed incidents were returned for the selected cluster.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SecurityIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Incident Timeline
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real incident history for {timelineData.cluster_name || 'cluster'} · {timelineData.incident_id}
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1.5} flexWrap="wrap">
          <TextField
            select
            label="Incident"
            value={incidentId}
            onChange={(event) => setIncidentId(event.target.value)}
            size="small"
            SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: '#1e2433', color: '#e8eaf0' } } } }}
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{
              minWidth: 320,
              '& .MuiOutlinedInput-root': {
                color: '#e8eaf0',
                bgcolor: '#1e2433',
                '& fieldset': { borderColor: '#2a3245' },
                '&:hover fieldset': { borderColor: '#90caf9' },
              },
            }}
          >
            {incidentOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            onClick={() => setIncidentId((current) => current)}
            sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Events', value: timelineData.summary.total_events, color: '#90caf9' },
          { label: 'Critical Events', value: timelineData.summary.critical_events, color: '#ef5350' },
          { label: 'Actions Taken', value: timelineData.summary.actions_taken, color: '#a5d6a7' },
          { label: 'Resources Affected', value: timelineData.summary.resources_affected, color: '#ffa726' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
          Incident Summary
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
          <Chip label={timelineData.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: getSeverityColor(timelineData.severity), fontWeight: 'bold' }} />
          <Chip label={timelineData.status.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold' }} />
          <Chip label={timelineData.incident_id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4' }} />
        </Box>
        <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7, mb: 1 }}>
          {timelineData.title} was detected from live threat signals in the cluster and converted into an incident timeline using the active threat feed.
        </Typography>
        {selectedIncident && (
          <Stack spacing={0.75}>
            {selectedIncident.indicators.slice(0, 3).map((indicator) => (
              <Typography key={indicator} variant="body2" sx={{ color: '#8892a4' }}>
                • {indicator}
              </Typography>
            ))}
          </Stack>
        )}
        <Divider sx={{ my: 2, borderColor: '#2a3245' }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>Start Time</Typography>
            <Typography variant="body2" sx={{ color: '#e8eaf0' }}>{formatTimestamp(timelineData.start_time)}</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>End Time</Typography>
            <Typography variant="body2" sx={{ color: '#e8eaf0' }}>{formatTimestamp(timelineData.end_time)}</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>Duration</Typography>
            <Typography variant="body2" sx={{ color: '#e8eaf0' }}>{timelineData.duration}</Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Event Timeline
          </Typography>
        </Box>
        <Box px={2} pb={2}>
          {timelineData.events.map((event, index) => {
            const accent = EVENT_ACCENT[(event.event_type || '').toLowerCase()] || '#90caf9';
            return (
              <Box key={`${event.timestamp}-${index}`}>
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                      <Box display="flex" alignItems="center" gap={1} mb={1} sx={{ color: accent }}>
                        {getEventIcon(event.event_type)}
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: accent }}>
                          {event.event_type.replace(/_/g, ' ').toUpperCase()}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#8892a4' }}>
                        {formatTimestamp(event.timestamp)}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip label={event.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: getSeverityColor(event.severity), fontWeight: 'bold', fontSize: 10 }} />
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={9}>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#e8eaf0' }} gutterBottom>
                        {event.description}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#8892a4' }} gutterBottom>
                        Actor: {event.actor}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#8892a4' }} gutterBottom>
                        Resource: {event.resource}
                      </Typography>
                      {event.action_taken && (
                        <Chip label={`Action: ${event.action_taken}`} size="small" sx={{ mt: 1, bgcolor: '#2a3245', color: '#a5d6a7' }} />
                      )}
                      {Object.keys(event.details || {}).length > 0 && (
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: '#1e2433', borderRadius: 1, border: '1px solid #2a3245' }}>
                          <Typography variant="caption" fontWeight="bold" sx={{ color: '#8892a4' }}>
                            Details
                          </Typography>
                          {Object.entries(event.details).map(([key, value]) => (
                            <Typography key={key} variant="body2" sx={{ color: '#c8d0dc', fontSize: 12 }}>
                              {key}: {String(value)}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
                {index < timelineData.events.length - 1 && <Divider sx={{ my: 1, borderColor: '#2a3245' }} />}
              </Box>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
};

const IncidentTimeline: React.FC = () => (
  <ClusterGuard>
    <IncidentTimelineInner />
  </ClusterGuard>
);

export default IncidentTimeline;
