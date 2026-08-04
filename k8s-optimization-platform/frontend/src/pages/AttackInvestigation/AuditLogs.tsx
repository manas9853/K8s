import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors } from '../../theme/colors';

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
  if (score >= 80) return colors.danger;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.info;
  return colors.success;
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

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/audit-logs${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: AuditLogsResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const criticalEvents = useMemo(() => events.filter((event) => event.risk_score >= 80).length, [events]);
  const defaultIdentityEvents = useMemo(() => events.filter((event) => event.user === 'default').length, [events]);

  if (loading) {
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

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load audit logs</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <LogIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Audit Logs
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real audit-derived security events for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Events', value: data.total_events, color: colors.info },
          { label: 'Suspicious Events', value: data.suspicious_events, color: data.suspicious_events > 0 ? colors.danger : colors.success },
          { label: 'Critical Risk Events', value: criticalEvents, color: criticalEvents > 0 ? colors.danger : colors.success },
          { label: 'Default Identity Events', value: defaultIdentityEvents, color: defaultIdentityEvents > 0 ? colors.warning : colors.success },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {events.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Why these audit events matter
          </Typography>
          <Stack spacing={1.5}>
            {events.slice(0, 5).map((event, index) => (
              <Box key={`${event.timestamp}-${event.object_name}-${index}`} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {event.object_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {event.namespace} · {formatTimestamp(event.timestamp)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={event.user} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
                    <Chip label={`Risk ${event.risk_score}`} size="small" sx={{ bgcolor: colors.border, color: riskColor(event.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(event).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
          Suspicious Audit Events
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Timestamp', 'User', 'Verb', 'Resource', 'Namespace', 'Object', 'HTTP', 'Risk', 'Reason'].map((header) => (
                <TableCell key={header} sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event, index) => (
              <TableRow key={`${event.timestamp}-${event.object_name}-${index}`} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 145 }}>
                  {formatTimestamp(event.timestamp)}
                </TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                  {event.user}
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={event.verb.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: event.verb === 'create' || event.verb === 'delete' ? colors.danger : colors.warning, fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12 }}>
                  {event.resource}
                </TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12 }}>
                  {event.namespace}
                </TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12, minWidth: 180 }}>
                  {event.object_name}
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={String(event.response_code)} size="small" sx={{ bgcolor: colors.border, color: event.response_code < 300 ? colors.success : event.response_code < 400 ? colors.warning : colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={String(event.risk_score)} size="small" sx={{ bgcolor: colors.border, color: riskColor(event.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 260 }}>
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
