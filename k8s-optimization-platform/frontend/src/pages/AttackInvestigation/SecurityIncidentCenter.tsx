import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  affected_resources: string[];
  detection_time: string;
  assigned_to: string;
  mitre_tactics: string[];
}

interface IncidentSummary {
  active_incidents: number;
  investigating: number;
  contained: number;
  resolved_today: number;
  total_threats_detected: number;
  high_priority: number;
  total_suspicious_pods: number;
  affected_namespaces: number;
  mean_time_to_detect: string;
  mean_time_to_respond: string;
}

interface ThreatTrends {
  total_violations: number;
  critical: number;
  high: number;
  medium: number;
  trend: string;
}

interface IncidentCenterData {
  summary: IncidentSummary;
  recent_incidents: Incident[];
  threat_trends: ThreatTrends;
  cluster_name?: string;
  last_updated?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
};

const STATUS_COLOR: Record<string, string> = {
  active: '#ef5350',
  investigating: '#ffa726',
  contained: '#90caf9',
  resolved: '#a5d6a7',
};

const SecurityIncidentCenterInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<IncidentCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchIncidentData = async (initial = false) => {
      if (initial) setLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/incident-center${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: IncidentCenterData = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch incident data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchIncidentData(true);
    const interval = setInterval(() => fetchIncidentData(false), 120000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

  if (loading) {
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

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load incident data</Alert>
      </Box>
    );
  }

  const incidents = Array.isArray(data.recent_incidents) ? data.recent_incidents : [];
  const summary = data.summary;
  const trends = data.threat_trends;
  const criticalIncidents = incidents.filter((incident) => incident.severity?.toLowerCase() === 'critical');
  const activeScore = summary.total_threats_detected > 0
    ? Math.max(0, Math.round(100 - (summary.high_priority / Math.max(summary.total_threats_detected, 1)) * 100))
    : 100;
  const scoreColor = activeScore >= 80 ? '#a5d6a7' : activeScore >= 50 ? '#ffa726' : '#ef5350';
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(activeScore, 100) / 100) * circumference;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Security Incident Center
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real incident stream for {data.cluster_name ?? 'cluster'} · Last updated{' '}
            {data.last_updated ? new Date(data.last_updated).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>
                Incident Posture
              </Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={radius} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle
                    cx={65}
                    cy={65}
                    r={radius}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth={11}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>
                    {activeScore}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    / 100
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {criticalIncidents.length} critical incident{criticalIncidents.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Threats', count: summary.total_threats_detected ?? 0, color: '#90caf9' },
              { label: 'High Priority', count: summary.high_priority ?? 0, color: '#ef5350' },
              { label: 'Suspicious Pods', count: summary.total_suspicious_pods ?? 0, color: '#ffa726' },
              { label: 'Namespaces Affected', count: summary.affected_namespaces ?? 0, color: '#a5d6a7' },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            {[
              { label: 'Active', value: summary.active_incidents, color: '#ef5350' },
              { label: 'Investigating', value: summary.investigating, color: '#ffa726' },
              { label: 'Contained', value: summary.contained, color: '#90caf9' },
              { label: 'Resolved Today', value: summary.resolved_today, color: '#a5d6a7' },
            ].map(({ label, value, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Paper sx={{ p: 1.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>{label}</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color }}>{value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
              Response Metrics
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Mean time to detect: <Box component="span" sx={{ color: '#e8eaf0' }}>{summary.mean_time_to_detect}</Box>
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Mean time to respond: <Box component="span" sx={{ color: '#e8eaf0' }}>{summary.mean_time_to_respond}</Box>
              </Typography>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
              Threat Trends
            </Typography>
            <Grid container spacing={2}>
              {[
                { label: 'Critical', value: trends.critical, color: '#ef5350' },
                { label: 'High', value: trends.high, color: '#ffa726' },
                { label: 'Medium', value: trends.medium, color: '#90caf9' },
                { label: 'Violations', value: trends.total_violations, color: '#a5d6a7' },
              ].map(({ label, value, color }) => (
                <Grid item xs={6} key={label}>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>{label}</Typography>
                    <Typography variant="h5" fontWeight="bold" sx={{ color }}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {criticalIncidents.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Critical Incidents
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              {criticalIncidents.length} incident{criticalIncidents.length !== 1 ? 's' : ''} require immediate review
            </Typography>
          </Box>
          <Stack spacing={1}>
            {criticalIncidents.slice(0, 5).map((incident) => (
              <Box key={incident.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {incident.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {incident.id} · {incident.assigned_to} · {new Date(incident.detection_time).toLocaleString()}
                    </Typography>
                  </Box>
                  <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                  {incident.affected_resources.slice(0, 3).map((resource) => (
                    <Chip key={resource} label={resource} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Recent Incidents ({incidents.length})
          </Typography>
        </Box>
        {incidents.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>
              No recent incidents found.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'Incident ID', 'Title', 'Status', 'Assigned To', 'Detected At', 'Affected Resources', 'MITRE Tactics'].map((heading) => (
                    <TableCell
                      key={heading}
                      sx={{
                        fontWeight: 700,
                        fontSize: 12,
                        color: '#8892a4',
                        bgcolor: '#131d2e',
                        borderColor: '#2a3245',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {incidents.map((incident) => {
                  const severity = incident.severity?.toLowerCase() ?? 'low';
                  const status = incident.status?.toLowerCase() ?? 'active';
                  return (
                    <TableRow key={incident.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip
                          label={severity.toUpperCase()}
                          size="small"
                          sx={{ bgcolor: '#2a3245', color: SEV_COLOR[severity] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                        {incident.id}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245', minWidth: 220 }}>
                        {incident.title}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip
                          label={status.toUpperCase()}
                          size="small"
                          sx={{ bgcolor: '#2a3245', color: STATUS_COLOR[status] ?? '#90caf9', fontWeight: 'bold', fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                        {incident.assigned_to}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                        {incident.detection_time ? new Date(incident.detection_time).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {incident.affected_resources.slice(0, 2).map((resource) => (
                            <Chip key={resource} label={resource} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
                          ))}
                          {incident.affected_resources.length > 2 && (
                            <Chip label={`+${incident.affected_resources.length - 2}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {incident.mitre_tactics.slice(0, 2).map((tactic) => (
                            <Chip key={tactic} label={tactic} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20 }} />
                          ))}
                          {incident.mitre_tactics.length > 2 && (
                            <Chip label={`+${incident.mitre_tactics.length - 2}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const SecurityIncidentCenter: React.FC = () => (
  <ClusterGuard><SecurityIncidentCenterInner /></ClusterGuard>
);

export default SecurityIncidentCenter;
