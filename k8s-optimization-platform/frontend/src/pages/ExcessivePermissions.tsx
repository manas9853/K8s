import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, LinearProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Lock as LockIcon, Warning as WarningIcon, ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

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

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const perms: any[] = Array.isArray(data.excessive_permissions) ? data.excessive_permissions : [];
  const criticals = perms.filter((p: any) => (p.risk_level ?? '').toLowerCase() === 'critical');
  const highs = perms.filter((p: any) => (p.risk_level ?? '').toLowerCase() === 'high');
  const rbacScore = data.rbac_score ?? 0;
  const scoreColor = rbacScore >= 80 ? '#4ade80' : rbacScore >= 60 ? '#f59e0b' : '#f87171';

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(rbacScore, 100) / 100) * circ;

  const RISK_PATTERNS = [
    { label: 'Critical Risk', count: data.critical_risk ?? 0, color: '#f87171', path: '/cluster-admin-review' },
    { label: 'High Risk',     count: data.high_risk ?? 0,     color: '#f59e0b', path: '/service-accounts-analysis' },
    { label: 'Medium Risk',   count: data.medium_risk ?? 0,   color: '#60a5fa', path: '/least-privilege-review' },
  ];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <LockIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Excessive Permissions</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            RBAC risk analysis · {data.total_service_accounts ?? 0} service accounts · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>RBAC Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{rbacScore}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Chip label={criticals.length > 0 ? `${criticals.length} Critical` : 'No Critical'}
                size="small" sx={{ mt: 1,
                  bgcolor: criticals.length > 0 ? '#2d1515' : '#0d2d1a',
                  color:   criticals.length > 0 ? '#f87171' : '#4ade80',
                  fontWeight: 'bold' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            {[
              { label: 'Total SAs',        count: data.total_service_accounts ?? 0,      color: '#60a5fa', bg: '#0d1f3c' },
              { label: 'Over-permissioned', count: data.excessive_permissions_count ?? 0,  color: '#f59e0b', bg: '#2d200a' },
              { label: 'Critical Risk',    count: data.critical_risk ?? 0,               color: '#f87171', bg: '#2d1515' },
              { label: 'High Risk',        count: data.high_risk ?? 0,                   color: '#f59e0b', bg: '#2d200a' },
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
          <Paper sx={{ p: 2, mt: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle2" sx={{ color: '#e8eaf0' }} gutterBottom>Risk Distribution</Typography>
            <Stack spacing={1}>
              {RISK_PATTERNS.map(rp => (
                <Box key={rp.label} display="flex" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ minWidth: 140, color: '#8892a4' }}>{rp.label}</Typography>
                  <LinearProgress variant="determinate" value={Math.min((rp.count / Math.max(perms.length + 1, 1)) * 100, 100)}
                    sx={{ flex: 1, height: 7, borderRadius: 3, bgcolor: '#2a3245',
                      '& .MuiLinearProgress-bar': { bgcolor: rp.color } }} />
                  <Chip label={rp.count} size="small"
                    sx={{ bgcolor: `${rp.color}20`, color: rp.color, fontWeight: 'bold', fontSize: 11, minWidth: 28 }} />
                  <Button size="small" onClick={() => navigate(rp.path)} sx={{ fontSize: 11, color: '#60a5fa' }}>View</Button>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>Critical Permission Issues</Typography>
          </Box>
          <Stack spacing={1}>
            {criticals.slice(0, 4).map((item: any, i: number) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                    {item.service_account}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    {item.namespaces?.join(', ') ?? item.namespace ?? 'cluster-wide'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#f87171', display: 'block' }}>{item.recommendation}</Typography>
                </Box>
                <Button size="small" variant="contained"
                  onClick={() => navigate('/least-privilege-review')}
                  sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                  Fix Permissions
                </Button>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL PERMISSIONS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>All Excessive Permissions ({perms.length})</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/cluster-admin-review')}
            sx={{ color: '#60a5fa' }}>Cluster Admin Review</Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#131d2e' }}>
                {['Service Account', 'Namespaces', 'Risk Level', 'Pods Using', 'Recommendation'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {perms.slice(0, 50).map((item: any, i: number) => {
                const risk = (item.risk_level ?? 'low').toLowerCase();
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                      {item.service_account}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                      {(item.namespaces ?? [item.namespace]).slice(0, 3).join(', ')}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={risk.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[risk], color: SEV_COLOR[risk], fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                      {item.used_by_pods ?? '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{item.recommendation}</TableCell>
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
