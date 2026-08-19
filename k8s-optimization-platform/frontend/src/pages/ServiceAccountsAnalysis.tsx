import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  ManageAccounts as SAIcon, Warning as WarningIcon, CheckCircle as CheckIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

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
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};

const STATUS_COLOR: Record<string, string> = {
  active: colors.success, default: colors.warning, unused: colors.danger, inactive: colors.textSecondary,
};

const ServiceAccountsAnalysis: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters } = useCluster();
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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load data</Alert></Box>;

  const accounts = Array.isArray(data.service_accounts) ? data.service_accounts : [];
  const highRisk = accounts.filter(a => ['high', 'critical'].includes(a.risk_level.toLowerCase()));
  const score = data.service_account_score ?? 0;
  const scoreColor = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.danger;

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;

  if (clusters.length === 0) return <NoClusterState />;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SAIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Service Accounts Analysis
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            RBAC service account audit · {data.total_service_accounts} accounts ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + STAT CARDS */}
      <Grid container spacing={2} mb={3}>

        {/* Score ring */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>SA Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke={colors.border} strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{score}</Typography>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mt: 1 }}>
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
              { label: 'Total Accounts',   count: data.total_service_accounts ?? 0, color: colors.info },
              { label: 'Active',           count: data.active ?? 0,                  color: colors.success },
              { label: 'Using Default SA', count: data.using_default ?? 0,           color: colors.warning },
              { label: 'Unused',           count: data.unused ?? 0,                  color: colors.danger },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {data.recommendation && (
            <Paper sx={{ p: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>{data.recommendation}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* HIGH-RISK SPOTLIGHT */}
      {highRisk.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.warning }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              High-Risk Service Accounts
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              Review and remediate
            </Typography>
          </Box>
          <Stack spacing={1}>
            {highRisk.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {item.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {item.namespace} · {item.pods_using} pods · age {item.age_days}d
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.textSecondary, display: 'block', mt: 0.5, fontSize: 12 }}>
                      {item.recommendation}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    <Chip label={item.status} size="small"
                      sx={{ bgcolor: colors.border, color: STATUS_COLOR[item.status] ?? colors.textPrimary, fontSize: 10 }} />
                    <Chip label={item.risk_level.toUpperCase()} size="small"
                      sx={{ bgcolor: colors.border, color: RISK_COLOR[item.risk_level] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                    {item.auto_mount_token && (
                      <Chip label="auto-mount" size="small"
                        sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10 }} />
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL ACCOUNTS TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Service Accounts ({accounts.length})
          </Typography>
        </Box>
        {accounts.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No service accounts found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'Namespace', 'Status', 'Risk', 'Pods', 'Age (days)', 'Auto-Mount', 'Secrets', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{
                      fontWeight: 700, fontSize: 12, color: colors.textSecondary,
                      bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap'
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.slice(0, 50).map((item, i) => (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
                      {item.name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                      {item.namespace}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Chip label={item.status} size="small"
                        sx={{ bgcolor: colors.border, color: STATUS_COLOR[item.status] ?? colors.textPrimary, fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Chip label={item.risk_level.toUpperCase()} size="small"
                        sx={{ bgcolor: colors.border, color: RISK_COLOR[item.risk_level] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border, textAlign: 'center' }}>
                      {item.pods_using}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border, textAlign: 'center' }}>
                      {item.age_days}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border, textAlign: 'center' }}>
                      {item.auto_mount_token
                        ? <WarningIcon sx={{ fontSize: 16, color: colors.warning }} />
                        : <CheckIcon sx={{ fontSize: 16, color: colors.success }} />}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border, textAlign: 'center' }}>
                      {item.has_secrets
                        ? <CheckIcon sx={{ fontSize: 16, color: colors.success }} />
                        : <Typography variant="caption" sx={{ color: colors.textSecondary }}>—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 200 }}>
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
