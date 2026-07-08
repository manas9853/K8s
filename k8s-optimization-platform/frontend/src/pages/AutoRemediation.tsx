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
  critical: '#ef5350', high: '#ffa726', medium: '#90caf9', low: '#a5d6a7',
};

const STATUS_COLOR: Record<string, string> = {
  successful: '#a5d6a7', pending: '#ffa726', failed: '#ef5350',
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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">Failed to load auto-remediation data</Alert></Box>;

  const actions = Array.isArray(data.remediation_actions) ? data.remediation_actions : [];
  const policies = Array.isArray(data.policies) ? data.policies : [];
  const pending = actions.filter(a => a.status === 'pending');
  const successRate = data.success_rate ?? 0;
  const successColor = successRate >= 80 ? '#a5d6a7' : successRate >= 50 ? '#ffa726' : '#ef5350';
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(successRate, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <BuildIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Auto Remediation</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Security drift auto-remediation engine ·{' '}
            {data.auto_remediation_enabled ? 'Enabled' : 'Disabled'} ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Success Rate</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
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
                sx={{ bgcolor: '#2a3245', color: data.auto_remediation_enabled ? '#a5d6a7' : '#8892a4', fontWeight: 'bold', mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Actions',  count: data.total_actions ?? 0, color: '#90caf9', icon: <BuildIcon sx={{ fontSize: 16 }} /> },
              { label: 'Successful',     count: data.successful ?? 0,    color: '#a5d6a7', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
              { label: 'Pending',        count: data.pending ?? 0,       color: '#ffa726', icon: <PendingIcon sx={{ fontSize: 16 }} /> },
              { label: 'Failed',         count: data.failed ?? 0,        color: '#ef5350', icon: <WarningIcon sx={{ fontSize: 16 }} /> },
            ].map(({ label, count, color, icon }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Box display="flex" alignItems="center" gap={0.5} mb={0.25}>
                      <Box sx={{ color }}>{icon}</Box>
                      <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{label}</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* ACTIVE POLICIES */}
          {policies.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 1 }}>
                Active Remediation Policies
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.75}>
                {policies.map((policy, i) => (
                  <Chip key={i} label={policy} size="small"
                    sx={{ bgcolor: '#2a3245', color: '#a5d6a7', fontSize: 10 }} />
                ))}
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* PENDING SPOTLIGHT */}
      {pending.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <PendingIcon sx={{ color: '#ffa726' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Pending Actions</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              {pending.length} action{pending.length !== 1 ? 's' : ''} awaiting execution
            </Typography>
          </Box>
          <Stack spacing={1}>
            {pending.slice(0, 5).map((action, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{action.action_type}</Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {action.resource_name} · {action.namespace}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={action.drift_severity?.toUpperCase()} size="small"
                      sx={{ bgcolor: '#2a3245', color: SEV_COLOR[action.drift_severity] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label="PENDING" size="small"
                      sx={{ bgcolor: '#2a3245', color: '#ffa726', fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: '#8892a4', fontSize: 11 }}>
                  Triggered {new Date(action.triggered_at).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL ACTIONS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Remediation Actions ({actions.length})
          </Typography>
        </Box>
        {actions.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No remediation actions found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Status', 'Action', 'Resource', 'Namespace', 'Severity', 'Triggered At', 'Completed At', 'Duration'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {actions.slice(0, 100).map((item, i) => {
                  const status = (item.status ?? 'pending').toLowerCase();
                  const sev = (item.drift_severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={status.toUpperCase()} size="small"
                          sx={{ bgcolor: '#2a3245', color: STATUS_COLOR[status] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245' }}>
                        {item.action_type}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.resource_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                        {item.namespace}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: '#2a3245', color: SEV_COLOR[sev] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                        {item.triggered_at ? new Date(item.triggered_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                        {item.completed_at ? new Date(item.completed_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: item.execution_time_seconds ? '#a5d6a7' : '#8892a4', borderColor: '#2a3245' }}>
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
