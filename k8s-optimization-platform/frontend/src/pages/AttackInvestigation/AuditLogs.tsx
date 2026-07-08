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
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Article as LogIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface AuditEvent {
  timestamp: string;
  user: string;
  verb: string;
  resource: string;
  namespace: string;
  object_name: string;
  response_code: number;
  risk_score: number;
  reason: string;
}

interface AuditLogsResponse {
  total_events: number;
  suspicious_events: number;
  events: AuditEvent[];
  cluster_name?: string;
  last_updated?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function riskColor(score: number) {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
}

function buildReason(event: AuditEvent): string[] {
  const reasons: string[] = [];
  const fragments = event.reason
    ?.split(';')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  if (event.verb === 'create' && event.resource === 'pods') {
    reasons.push(`This audit record shows a pod creation event for ${event.object_name} in namespace ${event.namespace}. New pod creation is high-signal when the created workload carries risky security indicators.`);
  }

  if (event.user === 'default') {
    reasons.push('The request was associated with the default service account. Shared default identities make it harder to attribute actions and often indicate broader-than-needed permissions.');
  } else {
    reasons.push(`The creating identity was ${event.user}, which is the service account tied to this workload.`);
  }

  if (fragments.length > 0) {
    reasons.push(`The backend marked this event suspicious because the corresponding workload had these indicators: ${fragments.join(' · ')}.`);
  }

  if (event.response_code >= 200 && event.response_code < 300) {
    reasons.push(`The API server accepted the request with HTTP ${event.response_code}, so the risky pod was actually admitted into the cluster rather than blocked.`);
  }

  reasons.push(`The backend assigned a risk score of ${event.risk_score}, which places this event in the ${event.risk_score >= 80 ? 'critical' : event.risk_score >= 60 ? 'high' : 'moderate'} risk band.`);
  return reasons;
}

const AuditLogsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/audit-logs${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: AuditLogsResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const criticalEvents = useMemo(() => events.filter((event) => event.risk_score >= 80).length, [events]);
  const defaultIdentityEvents = useMemo(() => events.filter((event) => event.user === 'default').length, [events]);

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
        <Alert severity="error">Failed to load audit logs</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <LogIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Audit Logs
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real audit-derived security events for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Events', value: data.total_events, color: '#90caf9' },
          { label: 'Suspicious Events', value: data.suspicious_events, color: data.suspicious_events > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Critical Risk Events', value: criticalEvents, color: criticalEvents > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Default Identity Events', value: defaultIdentityEvents, color: defaultIdentityEvents > 0 ? '#ffa726' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {events.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these audit events matter
          </Typography>
          <Stack spacing={1.5}>
            {events.slice(0, 5).map((event, index) => (
              <Box key={`${event.timestamp}-${event.object_name}-${index}`} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {event.object_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {event.namespace} · {formatTimestamp(event.timestamp)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={event.user} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
                    <Chip label={`Risk ${event.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(event.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(event).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Suspicious Audit Events
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Timestamp', 'User', 'Verb', 'Resource', 'Namespace', 'Object', 'HTTP', 'Risk', 'Reason'].map((header) => (
                <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event, index) => (
              <TableRow key={`${event.timestamp}-${event.object_name}-${index}`} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 145 }}>
                  {formatTimestamp(event.timestamp)}
                </TableCell>
                <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                  {event.user}
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={event.verb.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: event.verb === 'create' || event.verb === 'delete' ? '#ef5350' : '#ffa726', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>
                  {event.resource}
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>
                  {event.namespace}
                </TableCell>
                <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12, minWidth: 180 }}>
                  {event.object_name}
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={String(event.response_code)} size="small" sx={{ bgcolor: '#2a3245', color: event.response_code < 300 ? '#a5d6a7' : event.response_code < 400 ? '#ffa726' : '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={String(event.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(event.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 260 }}>
                  {event.reason}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

const AuditLogs: React.FC = () => (
  <ClusterGuard>
    <AuditLogsInner />
  </ClusterGuard>
);

export default AuditLogs;
