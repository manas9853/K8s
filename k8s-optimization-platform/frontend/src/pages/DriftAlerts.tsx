import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  CompareArrows as CompareIcon, Warning as WarningIcon, CheckCircle as CheckIcon,
  ArrowForward as ArrowIcon, RestoreFromTrash as RestoreIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

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

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const alerts: any[] = Array.isArray(data.alerts) ? data.alerts : [];
  const criticals = alerts.filter((a: any) => (a.severity ?? '').toLowerCase() === 'critical');

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Drift Alerts</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Security configuration drift detection · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Alerts',    count: data.total_alerts ?? alerts.length,             color: '#60a5fa', bg: '#0d1f3c' },
          { label: 'Critical Drift',  count: data.critical_alerts ?? criticals.length,        color: '#f87171', bg: '#2d1515' },
          { label: 'High',            count: data.high_alerts ?? 0,                           color: '#f59e0b', bg: '#2d200a' },
          { label: 'Auto-Remediable', count: alerts.filter((a: any) => a.auto_remediation_triggered).length, color: '#4ade80', bg: '#0d2d1a' },
        ].map(({ label, count, color, bg }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: bg, border: `1px solid ${color}40` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL ALERTS SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>Critical Drift Detected</Typography>
          </Box>
          <Stack spacing={1.5}>
            {criticals.slice(0, 4).map((a: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{a.alert_type}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    {a.resource_name} · {a.namespace}
                  </Typography>
                </Box>
                <Button size="small" variant="contained" startIcon={<RestoreIcon />}
                  onClick={() => navigate('/auto-remediation-security')}
                  sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                  Restore
                </Button>
              </Box>
            ))}
          </Stack>
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
              sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
              Fix All Critical Drifts
            </Button>
            <Button variant="outlined" onClick={() => navigate('/baseline-comparison')}
              sx={{ borderColor: '#60a5fa', color: '#60a5fa' }}>
              Compare Baseline
            </Button>
          </Box>
        </Paper>
      )}

      {/* ALL ALERTS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>All Drift Alerts ({alerts.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/baseline-comparison')}
            sx={{ color: '#60a5fa' }}>Baseline Comparison</Button>
        </Box>
        {alerts.length === 0 ? (
          <Box p={3}><Alert severity="success" icon={<CheckIcon />}>No drift detected. Configuration matches baseline.</Alert></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#131d2e' }}>
                  {['Resource', 'Alert Type', 'Severity', 'Namespace', 'Status'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.slice(0, 50).map((item: any, i: number) => {
                  const sev = (item.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{item.resource_name ?? item.id}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{item.alert_type ?? '—'}</TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: SEV_BG[sev], color: SEV_COLOR[sev], fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{item.namespace ?? '—'}</TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={item.status ?? 'new'} size="small" variant="outlined"
                          sx={{ fontSize: 10, borderColor: '#60a5fa', color: '#60a5fa' }} />
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
