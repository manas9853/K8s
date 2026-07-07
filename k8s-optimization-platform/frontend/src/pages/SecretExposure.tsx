import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  VpnKey as KeyIcon,
  Refresh as RotateIcon, ArrowForward as ArrowIcon, Error as ErrorIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SecretExposureItem {
  id: string;
  pod_name: string;
  container_name: string;
  namespace: string;
  severity: string;
  secret_type: string;
  exposure_type: string;
  env_var_count: number;
  detected_at: string;
  recommendation: string;
}

interface SecretExposureResponse {
  exposure_score: number;
  total_exposures: number;
  critical_exposures: number;
  high_exposures: number;
  medium_exposures: number;
  exposed_secrets: SecretExposureItem[];
  containers_scanned: number;
  recommendation?: string;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = { critical: '#ef5350', high: '#ef5350', medium: '#ffa726', low: '#90caf9' };
const SEV_BG: Record<string, string> = { critical: '#131d2e', high: '#131d2e', medium: '#131d2e', low: '#131d2e' };

const SecretExposure: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<SecretExposureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/security/secrets-security/exposure${clusterParam}`);
        if (!response.ok) throw new Error('Failed to load secret exposure data');
        const result: SecretExposureResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load secret exposure data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 120000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="error">Failed to load secret exposure data</Alert></Box>;

  const secrets = Array.isArray(data.exposed_secrets) ? data.exposed_secrets : [];

  const STAT_ROWS = [
    { label: 'Exposure Score', count: data.exposure_score ?? 'N/A', color: '#90caf9', bg: '#1e2433' },
    { label: 'Total Exposed', count: data.total_exposures ?? secrets.length, color: '#ef5350', bg: '#1e2433' },
    { label: 'High Severity', count: data.high_exposures ?? 0, color: '#ffa726', bg: '#1e2433' },
    { label: 'Containers Scanned', count: data.containers_scanned ?? 0, color: '#90caf9', bg: '#1e2433' },
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
      {secrets.filter((s) => (s.severity ?? '').toLowerCase() === 'high').length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #2a3245', bgcolor: '#1e2433' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>High-Severity Exposures</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>Immediate rotation required</Typography>
          </Box>
          <Stack spacing={1.5}>
            {secrets.filter((s) => (s.severity ?? '').toLowerCase() === 'high').slice(0, 4).map((s) => (
              <Box key={s.id} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#131d2e', border: '1px solid #2a3245',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                    {s.pod_name} / {s.container_name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    {s.namespace} · {s.secret_type} · {s.exposure_type}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#90caf9', display: 'block', mt: 0.5 }}>
                    {s.env_var_count} env vars detected
                  </Typography>
                </Box>
                <Button size="small" variant="contained" startIcon={<RotateIcon />}
                  onClick={() => navigate('/secret-rotation')}
                  sx={{ fontSize: 11, bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
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
          <Box p={3}>
            <Paper
              elevation={0}
              sx={{
                maxWidth: 480,
                mx: 'auto',
                textAlign: 'center',
                p: 6,
                border: '1px solid #2a3245',
                borderRadius: 2,
                bgcolor: '#131d2e',
              }}
            >
              <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ color: '#e8eaf0' }}>
                No secret exposure issues found
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.7 }}>
                {data.recommendation ?? 'The latest cluster scan did not find any workloads with likely secret exposure patterns.'}
              </Typography>
            </Paper>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#131d2e' }}>
                  {['Pod', 'Container', 'Namespace', 'Severity', 'Type', 'Env Vars', 'Recommendation'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245', bgcolor: '#131d2e' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.slice(0, 50).map((s) => {
                  const sev = (s.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={s.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{s.pod_name ?? 'N/A'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.container_name ?? 'N/A'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.namespace ?? 'N/A'}</TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: SEV_BG[sev], color: SEV_COLOR[sev], fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{s.secret_type ?? 'N/A'}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{s.env_var_count ?? 'N/A'}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#60a5fa', borderColor: '#2a3245', maxWidth: 200 }}>
                        {(s.recommendation ?? 'N/A').substring(0, 40)}
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
