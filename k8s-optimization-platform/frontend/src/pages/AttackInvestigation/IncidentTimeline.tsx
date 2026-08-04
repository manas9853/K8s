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
import { colors } from '../../theme/colors';

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
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.success,
  info: colors.info,
};

const EVENT_ACCENT: Record<string, string> = {
  detection: colors.info,
  analysis: colors.warning,
  incident_created: colors.purple,
  action: colors.info,
  containment: colors.danger,
  resolution: colors.success,
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getSeverityColor(severity: string) {
  return SEVERITY_COLOR[(severity || '').toLowerCase()] || colors.textSecondary;
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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!timelineData || incidentOptions.length === 0) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Paper sx={{ p: 4, bgcolor: colors.surface, border: `1px solid ${colors.border}`, maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            No incident timeline data available
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.7 }}>
            This page uses real incident ids derived from the current active threats feed. No threat-backed incidents were returned for the selected cluster.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SecurityIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Incident Timeline
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
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
            SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: colors.surface, color: colors.textPrimary } } } }}
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{
              minWidth: 320,
              '& .MuiOutlinedInput-root': {
                color: colors.textPrimary,
                bgcolor: colors.surface,
                '& fieldset': { borderColor: colors.border },
                '&:hover fieldset': { borderColor: colors.info },
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
            sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Events', value: timelineData.summary.total_events, color: colors.info },
          { label: 'Critical Events', value: timelineData.summary.critical_events, color: colors.danger },
          { label: 'Actions Taken', value: timelineData.summary.actions_taken, color: colors.success },
          { label: 'Resources Affected', value: timelineData.summary.resources_affected, color: colors.warning },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
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

      <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
          Incident Summary
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
          <Chip label={timelineData.severity.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: getSeverityColor(timelineData.severity), fontWeight: 'bold' }} />
          <Chip label={timelineData.status.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontWeight: 'bold' }} />
          <Chip label={timelineData.incident_id} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary }} />
        </Box>
        <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7, mb: 1 }}>
          {timelineData.title} was detected from live threat signals in the cluster and converted into an incident timeline using the active threat feed.
        </Typography>
        {selectedIncident && (
          <Stack spacing={0.75}>
            {selectedIncident.indicators.slice(0, 3).map((indicator) => (
              <Typography key={indicator} variant="body2" sx={{ color: colors.textSecondary }}>
                • {indicator}
              </Typography>
            ))}
          </Stack>
        )}
        <Divider sx={{ my: 2, borderColor: colors.border }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>Start Time</Typography>
            <Typography variant="body2" sx={{ color: colors.textPrimary }}>{formatTimestamp(timelineData.start_time)}</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>End Time</Typography>
            <Typography variant="body2" sx={{ color: colors.textPrimary }}>{formatTimestamp(timelineData.end_time)}</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>Duration</Typography>
            <Typography variant="body2" sx={{ color: colors.textPrimary }}>{timelineData.duration}</Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Event Timeline
          </Typography>
        </Box>
        <Box px={2} pb={2}>
          {timelineData.events.map((event, index) => {
            const accent = EVENT_ACCENT[(event.event_type || '').toLowerCase()] || colors.info;
            return (
              <Box key={`${event.timestamp}-${index}`}>
                <Paper sx={{ p: 2, mb: 2, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                      <Box display="flex" alignItems="center" gap={1} mb={1} sx={{ color: accent }}>
                        {getEventIcon(event.event_type)}
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: accent }}>
                          {event.event_type.replace(/_/g, ' ').toUpperCase()}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                        {formatTimestamp(event.timestamp)}
                      </Typography>
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip label={event.severity.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: getSeverityColor(event.severity), fontWeight: 'bold', fontSize: 10 }} />
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={9}>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ color: colors.textPrimary }} gutterBottom>
                        {event.description}
                      </Typography>
                      <Typography variant="body2" sx={{ color: colors.textSecondary }} gutterBottom>
                        Actor: {event.actor}
                      </Typography>
                      <Typography variant="body2" sx={{ color: colors.textSecondary }} gutterBottom>
                        Resource: {event.resource}
                      </Typography>
                      {event.action_taken && (
                        <Chip label={`Action: ${event.action_taken}`} size="small" sx={{ mt: 1, bgcolor: colors.border, color: colors.success }} />
                      )}
                      {Object.keys(event.details || {}).length > 0 && (
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: colors.surface, borderRadius: 1, border: `1px solid ${colors.border}` }}>
                          <Typography variant="caption" fontWeight="bold" sx={{ color: colors.textSecondary }}>
                            Details
                          </Typography>
                          {Object.entries(event.details).map(([key, value]) => (
                            <Typography key={key} variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>
                              {key}: {String(value)}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
                {index < timelineData.events.length - 1 && <Divider sx={{ my: 1, borderColor: colors.border }} />}
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
