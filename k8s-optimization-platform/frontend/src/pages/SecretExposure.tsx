import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Lock as LockIcon, Warning as WarningIcon, VpnKey as KeyIcon,
  Refresh as RotateIcon, ArrowForward as ArrowIcon, Error as ErrorIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

const SecretExposure: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/secrets-security/exposure${clusterParam}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const i = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/secrets-security/exposure${clusterParam}`)
        .then(r => r.json()).then(d => setData(d)).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load secret exposure data</Alert>;

  const secrets: any[] = Array.isArray(data.exposed_secrets ?? data.secrets) ? (data.exposed_secrets ?? data.secrets) : [];
  const criticals = secrets.filter((s: any) => (s.risk_level ?? s.severity ?? '').toLowerCase() === 'critical');

  const STAT_ROWS = [
    { label: 'Total Exposed',    count: data.total_exposures ?? secrets.length,          color: '#f87171', bg: '#2d1515' },
    { label: 'High Severity',    count: data.high_exposures ?? 0,                         color: '#f59e0b', bg: '#2d200a' },
    { label: 'Medium Severity',  count: data.medium_exposures ?? 0,                       color: '#60a5fa', bg: '#0d1f3c' },
    { label: 'Containers Scanned', count: data.containers_scanned ?? 0,                   color: '#4ade80', bg: '#0d2d1a' },
  ];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <KeyIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Secret Exposure</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Secrets risk analysis · {secrets.length} exposures detected · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {STAT_ROWS.map(({ label, count, color, bg }) => (
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

      {/* CRITICAL SECRETS SPOTLIGHT */}
      {secrets.filter(s => (s.severity ?? '').toLowerCase() === 'high').length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>High-Severity Exposures</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>Immediate rotation required</Typography>
          </Box>
          <Stack spacing={1.5}>
            {secrets.filter(s => (s.severity ?? '').toLowerCase() === 'high').slice(0, 4).map((s: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                    {s.pod_name} / {s.container_name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    {s.namespace} · {s.secret_type} · {s.exposure_type}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#f87171', display: 'block', mt: 0.5 }}>
                    {s.env_var_count} env vars detected
                  </Typography>
                </Box>
                <Button size="small" variant="contained" startIcon={<RotateIcon />}
                  onClick={() => navigate('/secret-rotation')}
                  sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                  Rotate Secrets
                </Button>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL SECRETS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>All Exposed Secrets ({secrets.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/secret-rotation')}
            sx={{ color: '#60a5fa' }}>
            Rotation Schedule
          </Button>
        </Box>
        {secrets.length === 0 ? (
          <Box p={3}><Alert severity="success">No secret exposure issues found.</Alert></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#131d2e' }}>
                  {['Pod', 'Container', 'Namespace', 'Severity', 'Type', 'Env Vars', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.slice(0, 50).map((s: any, i: number) => {
                  const sev = (s.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{s.pod_name ?? '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.container_name ?? '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.namespace ?? '—'}</TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: SEV_BG[sev], color: SEV_COLOR[sev], fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.secret_type ?? '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{s.env_var_count ?? '—'}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#60a5fa', borderColor: '#2a3245', maxWidth: 200 }}>
                        {(s.recommendation ?? '—').substring(0, 40)}
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

export default SecretExposure;
// Made with Bob
