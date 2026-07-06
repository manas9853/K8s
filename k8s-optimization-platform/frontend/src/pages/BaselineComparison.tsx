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

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

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

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load baseline data</Alert>;

  const driftItems: any[] = Array.isArray(data.drift_items) ? data.drift_items : [];
  const critical = driftItems.filter((d: any) => d.severity === 'critical');
  const high     = driftItems.filter((d: any) => d.severity === 'high');

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Baseline Comparison</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Security baseline vs current configuration · {data.total_resources ?? 0} resources · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Drift Score',     count: data.drift_score ?? 0,           color: '#4ade80', bg: '#0d2d1a', suffix: '/100' },
          { label: 'Critical Drift',  count: data.critical_drift ?? 0,         color: '#f87171', bg: '#2d1515', suffix: '' },
          { label: 'High Drift',      count: data.high_drift ?? 0,             color: '#f59e0b', bg: '#2d200a', suffix: '' },
          { label: 'Total Detected',  count: data.drift_detected ?? 0,         color: '#60a5fa', bg: '#0d1f3c', suffix: '' },
        ].map(({ label, count, color, bg, suffix }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: bg, border: `1px solid ${color}40` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}{suffix}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL / HIGH DRIFT SPOTLIGHT */}
      {critical.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>Critical Drift Items</Typography>
          </Box>
          <Stack spacing={1.5}>
            {critical.slice(0, 5).map((item: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{item.drift_type}</Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {item.resource_name} · {item.namespace}
                    </Typography>
                  </Box>
                  <Button size="small" variant="contained" startIcon={<RestoreIcon />}
                    onClick={() => navigate('/auto-remediation-security')}
                    sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                    Restore
                  </Button>
                </Box>
                <Box display="flex" gap={2} mt={1} flexWrap="wrap">
                  <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: '#0d2d1a', border: '1px solid #4ade8040' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>Baseline</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: '#4ade80' }}>
                      {item.baseline_value}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#8892a4', alignSelf: 'center' }}>→</Typography>
                  <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: '#2d1515', border: '1px solid #f8717140' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>Current</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: '#f87171' }}>
                      {item.current_value}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
              sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
              Fix All Critical Drift
            </Button>
            <Button variant="outlined" onClick={() => navigate('/drift-alerts')}
              sx={{ borderColor: '#60a5fa', color: '#60a5fa' }}>
              View Drift Alerts
            </Button>
          </Box>
        </Paper>
      )}

      {/* FULL DRIFT TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>All Drift Items ({driftItems.length})</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#131d2e' }}>
                {['Severity', 'Drift Type', 'Resource', 'Namespace', 'Baseline', 'Current', 'Auto-Fix'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {driftItems.slice(0, 100).map((d: any, i: number) => {
                const sev = (d.severity ?? 'low').toLowerCase();
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={sev.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[sev], color: SEV_COLOR[sev], fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245' }}>{d.drift_type}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{d.resource_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{d.namespace}</TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#4ade80', fontFamily: 'monospace', borderColor: '#2a3245' }}>{d.baseline_value}</TableCell>
                    <TableCell sx={{ fontSize: 11, color: sev === 'low' ? '#4ade80' : SEV_COLOR[sev], fontFamily: 'monospace', borderColor: '#2a3245' }}>{d.current_value}</TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={d.auto_remediation_available ? 'Yes' : 'No'} size="small"
                        sx={{ bgcolor: d.auto_remediation_available ? '#0d2d1a' : '#2a2a2a',
                          color: d.auto_remediation_available ? '#4ade80' : '#8892a4', fontSize: 10 }} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

const BaselineComparison: React.FC = () => (
  <ClusterGuard><BaselineComparisonInner /></ClusterGuard>
);

export default BaselineComparison;
// Made with Bob
