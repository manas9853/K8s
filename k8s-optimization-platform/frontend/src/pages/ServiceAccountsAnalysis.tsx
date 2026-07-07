import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  ManageAccounts as SAIcon, Warning as WarningIcon, CheckCircle as CheckIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ServiceAccount {
  name: string;
  namespace: string;
  status: string;
  risk_level: string;
  pods_using: number;
  age_days: number;
  last_used: string;
  auto_mount_token: boolean;
  has_secrets: boolean;
  permissions: string[];
  recommendation: string;
}

interface ServiceAccountsData {
  service_account_score: number;
  total_service_accounts: number;
  active: number;
  unused: number;
  using_default: number;
  service_accounts: ServiceAccount[];
  recommendation?: string;
  last_scan?: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: '#ef5350', high: '#ffa726', medium: '#90caf9', low: '#a5d6a7',
};

const STATUS_COLOR: Record<string, string> = {
  active: '#a5d6a7', default: '#ffa726', unused: '#ef5350', inactive: '#8892a4',
};

const ServiceAccountsAnalysis: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ServiceAccountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/security/rbac-analysis/service-accounts${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ServiceAccountsData = await res.json();
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

  const accounts = Array.isArray(data.service_accounts) ? data.service_accounts : [];
  const highRisk = accounts.filter(a => ['high', 'critical'].includes(a.risk_level.toLowerCase()));
  const score = data.service_account_score ?? 0;
  const scoreColor = score >= 80 ? '#a5d6a7' : score >= 60 ? '#ffa726' : '#ef5350';

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SAIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Service Accounts Analysis
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            RBAC service account audit · {data.total_service_accounts} accounts ·{' '}
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
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>SA Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{score}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {highRisk.length > 0
                  ? `${highRisk.length} high-risk account${highRisk.length > 1 ? 's' : ''}`
                  : 'No high-risk accounts'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Stat cards */}
        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Accounts',   count: data.total_service_accounts ?? 0, color: '#90caf9' },
              { label: 'Active',           count: data.active ?? 0,                  color: '#a5d6a7' },
              { label: 'Using Default SA', count: data.using_default ?? 0,           color: '#ffa726' },
              { label: 'Unused',           count: data.unused ?? 0,                  color: '#ef5350' },
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

          {data.recommendation && (
            <Paper sx={{ p: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>{data.recommendation}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* HIGH-RISK SPOTLIGHT */}
      {highRisk.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ffa726' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              High-Risk Service Accounts
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              Review and remediate
            </Typography>
          </Box>
          <Stack spacing={1}>
            {highRisk.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {item.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {item.namespace} · {item.pods_using} pods · age {item.age_days}d
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#8892a4', display: 'block', mt: 0.5, fontSize: 12 }}>
                      {item.recommendation}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    <Chip label={item.status} size="small"
                      sx={{ bgcolor: '#2a3245', color: STATUS_COLOR[item.status] ?? '#e8eaf0', fontSize: 10 }} />
                    <Chip label={item.risk_level.toUpperCase()} size="small"
                      sx={{ bgcolor: '#2a3245', color: RISK_COLOR[item.risk_level] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                    {item.auto_mount_token && (
                      <Chip label="auto-mount" size="small"
                        sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10 }} />
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL ACCOUNTS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Service Accounts ({accounts.length})
          </Typography>
        </Box>
        {accounts.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No service accounts found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'Namespace', 'Status', 'Risk', 'Pods', 'Age (days)', 'Auto-Mount', 'Secrets', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{
                      fontWeight: 700, fontSize: 12, color: '#8892a4',
                      bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap'
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.slice(0, 50).map((item, i) => (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                      {item.name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                      {item.namespace}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={item.status} size="small"
                        sx={{ bgcolor: '#2a3245', color: STATUS_COLOR[item.status] ?? '#e8eaf0', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={item.risk_level.toUpperCase()} size="small"
                        sx={{ bgcolor: '#2a3245', color: RISK_COLOR[item.risk_level] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245', textAlign: 'center' }}>
                      {item.pods_using}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245', textAlign: 'center' }}>
                      {item.age_days}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245', textAlign: 'center' }}>
                      {item.auto_mount_token
                        ? <WarningIcon sx={{ fontSize: 16, color: '#ffa726' }} />
                        : <CheckIcon sx={{ fontSize: 16, color: '#a5d6a7' }} />}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245', textAlign: 'center' }}>
                      {item.has_secrets
                        ? <CheckIcon sx={{ fontSize: 16, color: '#a5d6a7' }} />
                        : <Typography variant="caption" sx={{ color: '#8892a4' }}>—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 200 }}>
                      {item.recommendation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

    </Box>
  );
};

export default ServiceAccountsAnalysis;
// Made with Bob
