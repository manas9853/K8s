import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, LinearProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Security as SecurityIcon, Lock as LockIcon, Warning as WarningIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const ExcessivePermissions: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/rbac-analysis/excessive-permissions${clusterParam}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const i = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/rbac-analysis/excessive-permissions${clusterParam}`)
        .then(r => r.json()).then(d => setData(d)).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const perms: any[] = Array.isArray(data.excessive_permissions) ? data.excessive_permissions : [];
  const criticals = perms.filter((p: any) => (p.risk_level ?? '').toLowerCase() === 'critical');
  const highs = perms.filter((p: any) => (p.risk_level ?? '').toLowerCase() === 'high');
  const rbacScore = data.rbac_score ?? 0;
  const scoreColor = rbacScore >= 80 ? '#388e3c' : rbacScore >= 60 ? '#f57c00' : '#d32f2f';

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(rbacScore, 100) / 100) * circ;

  // Risk patterns for Wiz-style RBAC graph
  const RISK_PATTERNS = [
    { label: 'Cluster-Admin Bindings', count: criticals.filter((p: any) => (p.recommendation ?? '').includes('cluster-admin')).length, color: '#d32f2f', path: '/cluster-admin-review' },
    { label: 'Wildcard Permissions (*)', count: perms.filter((p: any) => (p.recommendation ?? '').includes('wildcard') || (p.name ?? '').includes('*')).length, color: '#f57c00', path: '/service-accounts-analysis' },
    { label: 'Cross-Namespace Access', count: perms.filter((p: any) => (p.namespace ?? '') === '').length, color: '#1976d2', path: '/least-privilege-review' },
  ];

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <LockIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Excessive Permissions</Typography>
          <Typography variant="caption" color="text.secondary">
            RBAC risk analysis · {data.total_service_accounts ?? 0} service accounts · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>RBAC Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#e0e0e0" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{rbacScore}</Typography>
                  <Typography variant="caption" color="text.secondary">/ 100</Typography>
                </Box>
              </Box>
              <Chip label={criticals.length > 0 ? `${criticals.length} Critical Issues` : 'No Critical Issues'}
                size="small" sx={{ mt: 1, bgcolor: criticals.length > 0 ? '#fdecea' : '#e8f5e9',
                  color: criticals.length > 0 ? '#d32f2f' : '#388e3c', fontWeight: 'bold' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <Card sx={{ bgcolor: '#fdecea' }}>
                <CardContent sx={{ pb: '8px !important' }}>
                  <Typography variant="caption" color="error.dark">Total SAs</Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.dark">{data.total_service_accounts ?? 0}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card sx={{ bgcolor: '#fff3e0' }}>
                <CardContent sx={{ pb: '8px !important' }}>
                  <Typography variant="caption" color="warning.dark">Over-permissioned</Typography>
                  <Typography variant="h4" fontWeight="bold" color="warning.dark">{data.excessive_permissions_count ?? perms.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card sx={{ bgcolor: '#fdecea' }}>
                <CardContent sx={{ pb: '8px !important' }}>
                  <Typography variant="caption" color="error.dark">Critical</Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.dark">{criticals.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card sx={{ bgcolor: '#fff3e0' }}>
                <CardContent sx={{ pb: '8px !important' }}>
                  <Typography variant="caption" color="warning.dark">High</Typography>
                  <Typography variant="h4" fontWeight="bold" color="warning.dark">{highs.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          {/* Risk Patterns */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>High-Risk RBAC Patterns</Typography>
            <Stack spacing={1}>
              {RISK_PATTERNS.map(rp => (
                <Box key={rp.label} display="flex" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ minWidth: 200 }}>{rp.label}</Typography>
                  <LinearProgress variant="determinate" value={Math.min((rp.count / Math.max(perms.length, 1)) * 100, 100)}
                    sx={{ flex: 1, height: 7, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: rp.color } }} />
                  <Chip label={rp.count} size="small" sx={{ bgcolor: `${rp.color}18`, color: rp.color, fontWeight: 'bold', fontSize: 11, minWidth: 28 }} />
                  <Button size="small" onClick={() => navigate(rp.path)} sx={{ fontSize: 11 }}>View</Button>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#d32f2f' }} />
            <Typography variant="h6" fontWeight="bold" color="error.dark">Critical Permission Issues</Typography>
          </Box>
          <Stack spacing={1}>
            {criticals.slice(0, 4).map((item: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold">{item.name ?? item.service_account ?? item.subject_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.namespace ?? 'cluster-wide'}</Typography>
                  <Typography variant="body2" color="error.main" display="block">{item.recommendation}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" color="error"
                    onClick={() => navigate('/least-privilege-review')} sx={{ fontSize: 11 }}>
                    Fix Permissions
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL PERMISSIONS TABLE */}
      <Paper>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold">All Excessive Permissions ({perms.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/cluster-admin-review')}>Cluster Admin Review</Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                {['Account / Subject', 'Namespace', 'Risk Level', 'Recommendation'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {perms.slice(0, 50).map((item: any, i: number) => {
                const risk = (item.risk_level ?? '').toLowerCase();
                const riskColor = risk === 'critical' ? '#d32f2f' : risk === 'high' ? '#f57c00' : risk === 'medium' ? '#1976d2' : '#388e3c';
                const riskBg = risk === 'critical' ? '#fdecea' : risk === 'high' ? '#fff3e0' : risk === 'medium' ? '#e3f2fd' : '#e8f5e9';
                return (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{item.name ?? item.service_account ?? item.subject_name}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{item.namespace ?? 'cluster-wide'}</TableCell>
                    <TableCell>
                      <Chip label={(item.risk_level ?? 'Unknown').toUpperCase()} size="small"
                        sx={{ bgcolor: riskBg, color: riskColor, fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#555' }}>{item.recommendation}</TableCell>
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

export default ExcessivePermissions;
// Made with Bob
