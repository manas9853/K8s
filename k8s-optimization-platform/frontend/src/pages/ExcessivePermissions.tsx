import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, LinearProgress, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import { Lock as LockIcon, Warning as WarningIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PermissionItem {
  service_account: string;
  namespace: string;
  namespaces?: string[];
  risk_level: string;
  excessive_permissions: string[];
  used_by_pods: number;
  recommendation: string;
}

interface ExcessivePermissionsData {
  rbac_score: number;
  total_service_accounts: number;
  excessive_permissions_count: number;
  critical_risk: number;
  high_risk: number;
  medium_risk: number;
  excessive_permissions: PermissionItem[];
  recommendation?: string;
  last_scan?: string;
}

// Neutral dark bg, only text colour changes per severity
const SEV_TEXT: Record<string, string> = { critical: '#ef5350', high: '#ffa726', medium: '#90caf9', low: '#a5d6a7' };

const ExcessivePermissions: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ExcessivePermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/security/rbac-analysis/excessive-permissions${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ExcessivePermissionsData = await res.json();
        if (!mounted) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load data');
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
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">Failed to load data</Alert></Box>;

  const perms = Array.isArray(data.excessive_permissions) ? data.excessive_permissions : [];
  const criticals = perms.filter(p => p.risk_level.toLowerCase() === 'critical');
  const rbacScore = data.rbac_score ?? 0;
  const scoreColor = rbacScore >= 80 ? '#a5d6a7' : rbacScore >= 60 ? '#ffa726' : '#ef5350';
  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(rbacScore, 100) / 100) * circ;

  const RISK_ROWS = [
    { label: 'Critical Risk', count: data.critical_risk ?? 0, color: '#ef5350' },
    { label: 'High Risk',     count: data.high_risk    ?? 0, color: '#ffa726' },
    { label: 'Medium Risk',   count: data.medium_risk  ?? 0, color: '#90caf9' },
  ];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <LockIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Excessive Permissions
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            RBAC risk analysis · {data.total_service_accounts ?? 0} service accounts ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        {/* Score ring */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>RBAC Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{rbacScore}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {criticals.length > 0 ? `${criticals.length} critical issue${criticals.length > 1 ? 's' : ''}` : 'No critical issues'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Stat cards */}
        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Service Accounts',  count: data.total_service_accounts ?? 0,       color: '#90caf9' },
              { label: 'Over-permissioned',        count: data.excessive_permissions_count ?? 0,  color: '#ffa726' },
              { label: 'Critical Risk',            count: data.critical_risk ?? 0,                color: '#ef5350' },
              { label: 'High Risk',                count: data.high_risk ?? 0,                    color: '#ffa726' },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Risk distribution bar */}
          <Paper sx={{ p: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle2" sx={{ color: '#e8eaf0', mb: 1.5 }}>Risk Distribution</Typography>
            <Stack spacing={1.5}>
              {RISK_ROWS.map(rp => (
                <Box key={rp.label} display="flex" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ minWidth: 130, color: '#8892a4', fontSize: 12 }}>{rp.label}</Typography>
                  <LinearProgress variant="determinate"
                    value={Math.min((rp.count / Math.max(perms.length + 1, 1)) * 100, 100)}
                    sx={{ flex: 1, height: 7, borderRadius: 3, bgcolor: '#2a3245',
                      '& .MuiLinearProgress-bar': { bgcolor: rp.color } }} />
                  <Chip label={rp.count} size="small"
                    sx={{ bgcolor: '#2a3245', color: rp.color, fontWeight: 'bold', fontSize: 11, minWidth: 28 }} />
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Critical Permission Issues</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>Immediate remediation required</Typography>
          </Box>
          <Stack spacing={1}>
            {criticals.slice(0, 4).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                  {item.service_account}
                </Typography>
                <Typography variant="caption" sx={{ color: '#8892a4' }}>
                  {(item.namespaces ?? [item.namespace]).join(', ')}
                </Typography>
                <Typography variant="body2" sx={{ color: '#8892a4', display: 'block', mt: 0.5, fontSize: 12 }}>
                  {item.recommendation}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                  {item.excessive_permissions.slice(0, 6).map((p, pi) => (
                    <Chip key={pi} label={p} size="small"
                      sx={{ bgcolor: '#2a3245', color: '#ef5350', fontSize: 10, height: 20 }} />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL PERMISSIONS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Excessive Permissions ({perms.length})
          </Typography>
        </Box>
        {perms.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No excessive permissions detected.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Service Account', 'Namespaces', 'Risk Level', 'Pods Using', 'Permissions', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4',
                      bgcolor: '#131d2e', borderColor: '#2a3245' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {perms.slice(0, 50).map((item, i) => {
                  const risk = item.risk_level.toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                        {item.service_account}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                        {(item.namespaces ?? [item.namespace]).slice(0, 2).join(', ')}
                        {(item.namespaces ?? []).length > 2 && <Typography component="span" variant="caption" sx={{ color: '#4a5568' }}> +{(item.namespaces ?? []).length - 2}</Typography>}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={risk.toUpperCase()} size="small"
                          sx={{ bgcolor: '#2a3245', color: SEV_TEXT[risk] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                        {item.used_by_pods ?? 'N/A'}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {item.excessive_permissions.slice(0, 3).map((p, pi) => (
                            <Chip key={pi} label={p} size="small"
                              sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
                          ))}
                          {item.excessive_permissions.length > 3 && (
                            <Chip label={`+${item.excessive_permissions.length - 3}`} size="small"
                              sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 220 }}>
                        {item.recommendation}
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

export default ExcessivePermissions;
// Made with Bob
