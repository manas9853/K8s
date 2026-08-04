import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  NotificationsActive as AlertIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface DriftAlert {
  id: string;
  severity: string;
  alert_type: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  detected_at: string;
  status: string;
  auto_remediation_triggered: boolean;
  recommendation: string;
}

interface DriftAlertsData {
  total_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
  alerts: DriftAlert[];
  monitoring_enabled?: boolean;
  alert_retention_days?: number;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};

const DriftAlertsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<DriftAlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/security/drift-detection/alerts${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: DriftAlertsData = await r.json();
        if (!mounted) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData(true);
    const id = setInterval(() => fetchData(false), 120000);
    return () => { mounted = false; clearInterval(id); };
  }, [clusterParam]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load drift alerts</Alert></Box>;

  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const criticals = alerts.filter(a => a.severity?.toLowerCase() === 'critical');

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <AlertIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Drift Alerts</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Security configuration drift detection ·{' '}
            {data.monitoring_enabled ? 'Monitoring enabled' : 'Monitoring disabled'} ·{' '}
            {data.alert_retention_days ?? 30}-day retention ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Alerts',    count: data.total_alerts ?? alerts.length, color: colors.info },
          { label: 'Critical',        count: data.critical_alerts ?? 0,          color: colors.danger },
          { label: 'High',            count: data.high_alerts ?? 0,              color: colors.warning },
          { label: 'Auto-Triggered',  count: alerts.filter(a => a.auto_remediation_triggered).length, color: colors.success },
        ].map(({ label, count, color }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>Critical Drift Detected</Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {criticals.length} critical alert{criticals.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
          <Stack spacing={1}>
            {criticals.slice(0, 4).map((a, i) => (
              <Box key={i} sx={{
                p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1,
              }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>{a.alert_type}</Typography>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                    {a.resource_name} · {a.namespace} · {new Date(a.detected_at).toLocaleString()}
                  </Typography>
                </Box>
                <Box display="flex" gap={1} alignItems="center">
                  <Chip label="CRITICAL" size="small"
                    sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                  {a.auto_remediation_triggered && (
                    <Chip label="Auto-fix triggered" size="small"
                      sx={{ bgcolor: colors.border, color: colors.success, fontSize: 10 }} />
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
          <Box mt={2}>
            <Typography
              variant="caption"
              sx={{ color: colors.info, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => navigate('/baseline-comparison')}
            >
              Compare with Baseline →
            </Typography>
          </Box>
        </Paper>
      )}

      {/* ALL ALERTS TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Drift Alerts ({alerts.length})
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: colors.info, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate('/baseline-comparison')}
          >
            Baseline Comparison →
          </Typography>
        </Box>
        {alerts.length === 0 ? (
          <Box p={3}>
            <Alert severity="success" icon={<CheckIcon />}>
              No drift detected. Configuration matches baseline.
            </Alert>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'Alert Type', 'Resource', 'Namespace', 'Detected At', 'Status', 'Auto-Fix', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.slice(0, 50).map((item, i) => {
                  const sev = (item.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textPrimary, fontWeight: 600, borderColor: colors.border }}>
                        {item.alert_type ?? '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.resource_name ?? item.id}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                        {item.namespace ?? '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
                        {item.detected_at ? new Date(item.detected_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={item.status ?? 'new'} size="small"
                          sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip
                          label={item.auto_remediation_triggered ? 'Triggered' : 'Manual'}
                          size="small"
                          sx={{ bgcolor: colors.border, color: item.auto_remediation_triggered ? colors.success : colors.textSecondary, fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 200 }}>
                        {item.recommendation ?? '—'}
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

const DriftAlerts: React.FC = () => (
  <ClusterGuard><DriftAlertsInner /></ClusterGuard>
);

export default DriftAlerts;
