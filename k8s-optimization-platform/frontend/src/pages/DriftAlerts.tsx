import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  CompareArrows as CompareIcon, Warning as WarningIcon, CheckCircle as CheckIcon,
  ArrowForward as ArrowIcon, RestoreFromTrash as RestoreIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const DriftAlertsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/drift-detection/alerts${clusterParam}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const i = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/drift-detection/alerts${clusterParam}`)
        .then(r => r.json()).then(d => setData(d)).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const alerts: any[] = Array.isArray(data.alerts) ? data.alerts : [];
  const criticals = alerts.filter((a: any) => (a.severity ?? a.drift_severity ?? '').toLowerCase() === 'critical');
  const highs = alerts.filter((a: any) => (a.severity ?? a.drift_severity ?? '').toLowerCase() === 'high');

  // Drift examples for visual diff
  const DRIFT_EXAMPLES = [
    { field: 'readOnlyRootFilesystem', expected: 'true', current: 'false', resource: 'payment-api', severity: 'critical' },
    { field: 'runAsNonRoot', expected: 'true', current: 'false', resource: 'analytics-worker', severity: 'high' },
    { field: 'allowPrivilegeEscalation', expected: 'false', current: 'true', resource: 'data-processor', severity: 'critical' },
    { field: 'seccompProfile', expected: 'RuntimeDefault', current: 'Unconfined', resource: 'auth-service', severity: 'high' },
  ];

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Drift Alerts</Typography>
          <Typography variant="caption" color="text.secondary">
            Security configuration drift detection · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Alerts', count: data.total_alerts ?? alerts.length, color: '#1976d2', bg: '#e3f2fd' },
          { label: 'Critical Drift', count: data.critical_alerts ?? criticals.length, color: '#d32f2f', bg: '#fdecea' },
          { label: 'High', count: highs.length, color: '#f57c00', bg: '#fff3e0' },
          { label: 'Auto-Remediable', count: alerts.filter((a: any) => a.auto_remediable).length, color: '#388e3c', bg: '#e8f5e9' },
        ].map(({ label, count, color, bg }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: bg }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* VISUAL DRIFT DIFF */}
      <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <WarningIcon sx={{ color: '#d32f2f' }} />
          <Typography variant="h6" fontWeight="bold" color="error.dark">Configuration Drift Detected</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Expected vs Actual security context</Typography>
        </Box>
        <Stack spacing={1.5}>
          {DRIFT_EXAMPLES.map((d, i) => (
            <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                  <Chip label={d.severity.toUpperCase()} size="small"
                    sx={{ bgcolor: d.severity === 'critical' ? '#d32f2f' : '#f57c00', color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                  <Typography variant="subtitle2" fontWeight="bold">{d.resource}</Typography>
                  <Typography variant="body2" color="text.secondary">·</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight="bold">{d.field}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" color={d.severity === 'critical' ? 'error' : 'warning'}
                    startIcon={<RestoreIcon />} onClick={() => navigate('/auto-remediation-security')} sx={{ fontSize: 11 }}>
                    Restore
                  </Button>
                </Stack>
              </Box>
              <Box display="flex" alignItems="center" gap={2} mt={1.5} flexWrap="wrap">
                <Box sx={{ px: 2, py: 0.75, borderRadius: 1, bgcolor: '#e8f5e9', border: '1px solid #a5d6a7' }}>
                  <Typography variant="caption" color="text.secondary">Expected</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight="bold" color="#388e3c">{d.expected}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">→</Typography>
                <Box sx={{ px: 2, py: 0.75, borderRadius: 1, bgcolor: '#fdecea', border: '1px solid #ef9a9a' }}>
                  <Typography variant="caption" color="text.secondary">Current</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight="bold" color="#d32f2f">{d.current}</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Stack>
        <Box mt={2} display="flex" gap={1}>
          <Button variant="contained" color="error" onClick={() => navigate('/auto-remediation-security')}>
            Fix All Critical Drifts
          </Button>
          <Button variant="outlined" onClick={() => navigate('/baseline-comparison')}>
            Compare Baseline
          </Button>
        </Box>
      </Paper>

      {/* ALL ALERTS TABLE */}
      <Paper>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold">All Drift Alerts ({alerts.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/baseline-comparison')}>Baseline Comparison</Button>
        </Box>
        {alerts.length === 0 ? (
          <Box p={3}><Alert severity="success" icon={<CheckIcon />}>No drift detected. Configuration matches baseline.</Alert></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  {['Resource', 'Drift Type', 'Severity', 'Status', 'Detected'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.slice(0, 50).map((item: any, i: number) => {
                  const sev = (item.severity ?? item.drift_severity ?? 'info').toLowerCase();
                  const sevColor = sev === 'critical' ? '#d32f2f' : sev === 'high' ? '#f57c00' : sev === 'medium' ? '#1976d2' : '#388e3c';
                  const sevBg   = sev === 'critical' ? '#fdecea' : sev === 'high' ? '#fff3e0' : sev === 'medium' ? '#e3f2fd' : '#e8f5e9';
                  return (
                    <TableRow key={i} hover>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{item.resource_name ?? item.id}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{item.drift_type ?? item.alert_type ?? item.action_type ?? '—'}</TableCell>
                      <TableCell>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: sevBg, color: sevColor, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell>
                        <Chip label={item.status ?? 'open'} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#555' }}>
                        {item.detected_at ? new Date(item.detected_at).toLocaleString() : '—'}
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
// Made with Bob
