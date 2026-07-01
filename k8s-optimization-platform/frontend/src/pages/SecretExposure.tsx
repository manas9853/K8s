import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Lock as LockIcon, Warning as WarningIcon, VpnKey as KeyIcon,
  Refresh as RotateIcon, ArrowForward as ArrowIcon, Error as ErrorIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

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

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load secret exposure data</Alert>;

  const secrets: any[] = Array.isArray(data.exposed_secrets ?? data.secrets) ? (data.exposed_secrets ?? data.secrets) : [];
  const criticals = secrets.filter((s: any) => (s.risk_level ?? s.severity ?? '').toLowerCase() === 'critical');
  const notRotated = secrets.filter((s: any) => (s.days_since_rotation ?? 0) > 90);
  const publiclyExposed = secrets.filter((s: any) => s.publicly_exposed || s.external_exposure);

  // Secret risk categories (Wiz-style context)
  const RISK_CATEGORIES = [
    { label: 'Not Rotated >90 days', count: notRotated.length, color: '#d32f2f', bg: '#fdecea' },
    { label: 'Publicly Exposed', count: publiclyExposed.length, color: '#d32f2f', bg: '#fdecea' },
    { label: 'Hardcoded Credentials', count: secrets.filter((s: any) => s.hardcoded || s.type === 'hardcoded').length, color: '#f57c00', bg: '#fff3e0' },
    { label: 'Weak / Default Values', count: secrets.filter((s: any) => s.weak || s.default_value).length, color: '#f57c00', bg: '#fff3e0' },
  ];

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <KeyIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Secret Exposure</Typography>
          <Typography variant="caption" color="text.secondary">
            Secrets risk analysis · {secrets.length} secrets analyzed · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fdecea' }}>
            <CardContent sx={{ pb: '8px !important' }}>
              <Typography variant="caption" color="error.dark">Total Exposed</Typography>
              <Typography variant="h4" fontWeight="bold" color="error.dark">{data.total_exposures ?? data.total_exposed ?? secrets.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fdecea' }}>
            <CardContent sx={{ pb: '8px !important' }}>
              <Typography variant="caption" color="error.dark">Critical Risk</Typography>
              <Typography variant="h4" fontWeight="bold" color="error.dark">{criticals.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent sx={{ pb: '8px !important' }}>
              <Typography variant="caption" color="warning.dark">Not Rotated</Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.dark">{notRotated.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent sx={{ pb: '8px !important' }}>
              <Typography variant="caption" color="warning.dark">Public Exposure</Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.dark">{publiclyExposed.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* RISK CATEGORIES */}
      <Grid container spacing={2} mb={3}>
        {RISK_CATEGORIES.map(rc => (
          <Grid item xs={6} md={3} key={rc.label}>
            <Card sx={{ bgcolor: rc.bg, border: `1px solid ${rc.color}30` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: rc.color, fontWeight: 600 }}>{rc.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: rc.color }}>{rc.count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL SECRETS SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#d32f2f' }} />
            <Typography variant="h6" fontWeight="bold" color="error.dark">Critical Secrets</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Immediate rotation required</Typography>
          </Box>
          <Stack spacing={1.5}>
            {criticals.slice(0, 4).map((s: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold">{s.name ?? s.secret_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.namespace ?? 'cluster-wide'}</Typography>
                  {s.days_since_rotation && (
                    <Typography variant="body2" color="error.main" display="block">
                      Not rotated for {s.days_since_rotation} days
                    </Typography>
                  )}
                  {s.issue && <Typography variant="body2" color="error.main">{s.issue}</Typography>}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" color="error" startIcon={<RotateIcon />}
                    onClick={() => navigate('/secret-rotation')} sx={{ fontSize: 11 }}>
                    Rotate Now
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Stale Secrets Spotlight */}
      {notRotated.length > 0 && criticals.length === 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ffcc80', bgcolor: '#fffdf5' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#f57c00' }} />
            <Typography variant="h6" fontWeight="bold" color="warning.dark">Stale Secrets (&gt;90 days)</Typography>
          </Box>
          <Stack spacing={1}>
            {notRotated.slice(0, 3).map((s: any, i: number) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: 1, bgcolor: '#fff', border: '1px solid #ffcc80', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold">{s.name ?? s.secret_name}</Typography>
                  <Typography variant="caption" color="warning.dark">
                    {s.days_since_rotation} days since last rotation
                  </Typography>
                </Box>
                <Button size="small" variant="outlined" color="warning" startIcon={<RotateIcon />}
                  onClick={() => navigate('/secret-rotation')} sx={{ fontSize: 11 }}>
                  Schedule Rotation
                </Button>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL SECRETS TABLE */}
      <Paper>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold">All Exposed Secrets ({secrets.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/secret-rotation')}>
            Rotation Schedule
          </Button>
        </Box>
        {secrets.length === 0 ? (
          <Box p={3}><Alert severity="success">No secret exposure issues found.</Alert></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  {['Secret Name', 'Namespace', 'Risk', 'Days Stale', 'Issue', 'Action'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.slice(0, 50).map((s: any, i: number) => {
                  const risk = (s.risk_level ?? s.severity ?? 'low').toLowerCase();
                  const riskColor = risk === 'critical' ? '#d32f2f' : risk === 'high' ? '#f57c00' : risk === 'medium' ? '#1976d2' : '#388e3c';
                  const riskBg   = risk === 'critical' ? '#fdecea' : risk === 'high' ? '#fff3e0' : risk === 'medium' ? '#e3f2fd' : '#e8f5e9';
                  return (
                    <TableRow key={i} hover>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{s.name ?? s.secret_name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{s.namespace ?? '—'}</TableCell>
                      <TableCell>
                        <Chip label={risk.toUpperCase()} size="small"
                          sx={{ bgcolor: riskBg, color: riskColor, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: (s.days_since_rotation ?? 0) > 90 ? '#d32f2f' : 'inherit' }}>
                        {s.days_since_rotation ? `${s.days_since_rotation}d` : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#555', maxWidth: 200 }}>{s.issue ?? s.reason ?? '—'}</TableCell>
                      <TableCell>
                        <Button size="small" startIcon={<RotateIcon />} onClick={() => navigate('/secret-rotation')} sx={{ fontSize: 11 }}>
                          Rotate
                        </Button>
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
