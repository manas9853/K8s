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
  CompareArrows as CompareIcon, CheckCircle as CheckIcon, Warning as WarningIcon,
  ArrowForward as ArrowIcon, RestoreFromTrash as RestoreIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const BaselineComparisonInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/drift-detection/baseline${clusterParam}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const i = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/drift-detection/baseline${clusterParam}`)
        .then(r => r.json()).then(d => setData(d)).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load baseline data</Alert>;

  const diffs: any[] = Array.isArray(data.differences ?? data.diffs) ? (data.differences ?? data.diffs) : [];
  const deviations = diffs.filter((d: any) => d.status !== 'compliant');
  const compliant = diffs.filter((d: any) => d.status === 'compliant').length;

  // Hardcoded baseline checks for illustration (Wiz-style)
  const BASELINE_CHECKS = [
    { category: 'Pod Security', check: 'runAsNonRoot', expected: 'true', current: deviations.some((d: any) => d.field === 'runAsNonRoot') ? 'false' : 'true', drift: deviations.some((d: any) => d.field === 'runAsNonRoot') },
    { category: 'Pod Security', check: 'readOnlyRootFilesystem', expected: 'true', current: deviations.some((d: any) => d.field === 'readOnlyRootFilesystem') ? 'false' : 'true', drift: deviations.some((d: any) => d.field === 'readOnlyRootFilesystem') },
    { category: 'Network', check: 'NetworkPolicy present', expected: 'all namespaces', current: data.namespaces_without_netpol > 0 ? `${data.namespaces_without_netpol} missing` : 'all namespaces', drift: (data.namespaces_without_netpol ?? 0) > 0 },
    { category: 'RBAC', check: 'No cluster-admin SAs', expected: 'none', current: data.cluster_admin_count > 0 ? `${data.cluster_admin_count} found` : 'none', drift: (data.cluster_admin_count ?? 0) > 0 },
    { category: 'Image', check: 'No latest tags', expected: 'pinned versions', current: data.latest_tag_count > 0 ? `${data.latest_tag_count} images` : 'all pinned', drift: (data.latest_tag_count ?? 0) > 0 },
    { category: 'Secrets', check: 'Secrets rotated <90d', expected: 'all secrets', current: data.stale_secrets > 0 ? `${data.stale_secrets} stale` : 'all current', drift: (data.stale_secrets ?? 0) > 0 },
  ];
  const driftCount = BASELINE_CHECKS.filter(c => c.drift).length;

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Baseline Comparison</Typography>
          <Typography variant="caption" color="text.secondary">
            Security baseline vs current configuration · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Checks', count: BASELINE_CHECKS.length, color: '#1976d2', bg: '#e3f2fd' },
          { label: 'Compliant', count: BASELINE_CHECKS.length - driftCount, color: '#388e3c', bg: '#e8f5e9' },
          { label: 'Drifted', count: driftCount, color: '#d32f2f', bg: '#fdecea' },
          { label: 'API Diffs', count: diffs.length, color: '#f57c00', bg: '#fff3e0' },
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

      {/* BASELINE CHECKS — Wiz-style visual diff */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>Baseline Security Checks</Typography>
        <Stack spacing={1}>
          {BASELINE_CHECKS.map((check, i) => (
            <Box key={i} sx={{
              p: 2, borderRadius: 1.5,
              bgcolor: check.drift ? '#fff8f8' : '#f0fff4',
              border: '1px solid', borderColor: check.drift ? '#ef9a9a' : '#a5d6a7'
            }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                  {check.drift ? (
                    <WarningIcon sx={{ color: '#d32f2f', fontSize: 18 }} />
                  ) : (
                    <CheckIcon sx={{ color: '#388e3c', fontSize: 18 }} />
                  )}
                  <Chip label={check.category} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                  <Typography variant="subtitle2" fontWeight="bold">{check.check}</Typography>
                </Box>
                {check.drift && (
                  <Button size="small" variant="contained" color="error" startIcon={<RestoreIcon />}
                    onClick={() => navigate('/auto-remediation-security')} sx={{ fontSize: 11 }}>
                    Restore
                  </Button>
                )}
              </Box>
              <Box display="flex" gap={2} mt={1} flexWrap="wrap">
                <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: '#e8f5e9', border: '1px solid #a5d6a7' }}>
                  <Typography variant="caption" color="text.secondary">Baseline</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight="bold" color="#388e3c">{check.expected}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" alignSelf="center">→</Typography>
                <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: check.drift ? '#fdecea' : '#e8f5e9', border: `1px solid ${check.drift ? '#ef9a9a' : '#a5d6a7'}` }}>
                  <Typography variant="caption" color="text.secondary">Current</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: check.drift ? '#d32f2f' : '#388e3c' }}>{check.current}</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Stack>
        {driftCount > 0 && (
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" color="error" onClick={() => navigate('/auto-remediation-security')}>
              Fix All Drifts ({driftCount})
            </Button>
            <Button variant="outlined" onClick={() => navigate('/drift-alerts')}>
              View Drift Alerts
            </Button>
          </Box>
        )}
      </Paper>

      {/* API DIFF TABLE */}
      {diffs.length > 0 && (
        <Paper>
          <Box p={2}>
            <Typography variant="h6" fontWeight="bold">Detailed Differences ({diffs.length})</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  {['Resource', 'Field', 'Expected', 'Current', 'Status'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {diffs.slice(0, 50).map((d: any, i: number) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{d.resource_name ?? d.resource}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>{d.field ?? d.setting}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#388e3c', fontFamily: 'monospace' }}>{String(d.expected ?? d.baseline_value)}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: d.status !== 'compliant' ? '#d32f2f' : '#388e3c', fontFamily: 'monospace' }}>{String(d.current ?? d.current_value)}</TableCell>
                    <TableCell>
                      <Chip label={d.status ?? 'drifted'} size="small"
                        sx={{ bgcolor: d.status === 'compliant' ? '#e8f5e9' : '#fdecea',
                          color: d.status === 'compliant' ? '#388e3c' : '#d32f2f', fontSize: 10 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

const BaselineComparison: React.FC = () => (
  <ClusterGuard><BaselineComparisonInner /></ClusterGuard>
);

export default BaselineComparison;
// Made with Bob
