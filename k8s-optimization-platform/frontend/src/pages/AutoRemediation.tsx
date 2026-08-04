import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  Build as BuildIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface RemediationAction {
  id: string;
  action_type: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  triggered_at: string;
  completed_at: string | null;
  status: string;
  drift_severity: string;
  execution_time_seconds: number | null;
  error_message: string | null;
}

interface AutoRemediationData {
  auto_remediation_enabled: boolean;
  success_rate: number;
  total_actions: number;
  successful: number;
  failed: number;
  pending: number;
  remediation_actions: RemediationAction[];
  policies: string[];
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};

const STATUS_COLOR: Record<string, string> = {
  successful: colors.success, pending: colors.warning, failed: colors.danger,
};

const AutoRemediation: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AutoRemediationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/security/drift-detection/auto-remediation${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: AutoRemediationData = await r.json();
        if (!mounted) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load auto-remediation data');
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
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load auto-remediation data</Alert></Box>;

  const actions = Array.isArray(data.remediation_actions) ? data.remediation_actions : [];
  const policies = Array.isArray(data.policies) ? data.policies : [];
  const pending = actions.filter(a => a.status === 'pending');
  const successRate = data.success_rate ?? 0;
  const successColor = successRate >= 80 ? colors.success : successRate >= 50 ? colors.warning : colors.danger;
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(successRate, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <BuildIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Auto Remediation</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Security drift auto-remediation engine ·{' '}
            {data.auto_remediation_enabled ? 'Enabled' : 'Disabled'} ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>Success Rate</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke={colors.border} strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={successColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: successColor }}>{successRate}%</Typography>
                </Box>
              </Box>
              <Chip
                label={data.auto_remediation_enabled ? 'Engine Active' : 'Engine Inactive'}
                size="small"
                sx={{ bgcolor: colors.border, color: data.auto_remediation_enabled ? colors.success : colors.textSecondary, fontWeight: 'bold', mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Actions',  count: data.total_actions ?? 0, color: colors.info, icon: <BuildIcon sx={{ fontSize: 16 }} /> },
              { label: 'Successful',     count: data.successful ?? 0,    color: colors.success, icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
              { label: 'Pending',        count: data.pending ?? 0,       color: colors.warning, icon: <PendingIcon sx={{ fontSize: 16 }} /> },
              { label: 'Failed',         count: data.failed ?? 0,        color: colors.danger, icon: <WarningIcon sx={{ fontSize: 16 }} /> },
            ].map(({ label, count, color, icon }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Box display="flex" alignItems="center" gap={0.5} mb={0.25}>
                      <Box sx={{ color }}>{icon}</Box>
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{label}</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* ACTIVE POLICIES */}
          {policies.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 1 }}>
                Active Remediation Policies
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.75}>
                {policies.map((policy, i) => (
                  <Chip key={i} label={policy} size="small"
                    sx={{ bgcolor: colors.border, color: colors.success, fontSize: 10 }} />
                ))}
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* PENDING SPOTLIGHT */}
      {pending.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <PendingIcon sx={{ color: colors.warning }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>Pending Actions</Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {pending.length} action{pending.length !== 1 ? 's' : ''} awaiting execution
            </Typography>
          </Box>
          <Stack spacing={1}>
            {pending.slice(0, 5).map((action, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>{action.action_type}</Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {action.resource_name} · {action.namespace}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={action.drift_severity?.toUpperCase()} size="small"
                      sx={{ bgcolor: colors.border, color: SEV_COLOR[action.drift_severity] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label="PENDING" size="small"
                      sx={{ bgcolor: colors.border, color: colors.warning, fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: 11 }}>
                  Triggered {new Date(action.triggered_at).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL ACTIONS TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Remediation Actions ({actions.length})
          </Typography>
        </Box>
        {actions.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No remediation actions found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Status', 'Action', 'Resource', 'Namespace', 'Severity', 'Triggered At', 'Completed At', 'Duration'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {actions.slice(0, 100).map((item, i) => {
                  const status = (item.status ?? 'pending').toLowerCase();
                  const sev = (item.drift_severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={status.toUpperCase()} size="small"
                          sx={{ bgcolor: colors.border, color: STATUS_COLOR[status] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textPrimary, fontWeight: 600, borderColor: colors.border }}>
                        {item.action_type}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.resource_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                        {item.namespace}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
                        {item.triggered_at ? new Date(item.triggered_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
                        {item.completed_at ? new Date(item.completed_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: item.execution_time_seconds ? colors.success : colors.textSecondary, borderColor: colors.border }}>
                        {item.execution_time_seconds != null ? `${item.execution_time_seconds}s` : '—'}
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

export default AutoRemediation;
