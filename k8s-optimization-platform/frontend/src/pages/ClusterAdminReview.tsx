import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { Security as SecurityIcon, Warning as WarningIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface ClusterAdmin {
  subject_type: string;
  subject_name: string;
  namespace: string;
  binding_name: string;
  pods_using: number;
  justification: string;
  risk_level: string;
  recommendation: string;
}

interface ClusterAdminData {
  cluster_admin_score: number;
  total_cluster_admins: number;
  justified: number;
  needs_review: number;
  unjustified: number;
  cluster_admins: ClusterAdmin[];
  recommendation?: string;
  last_scan?: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.success,
};

const JUST_COLOR: Record<string, string> = {
  justified: colors.success,
  unjustified: colors.danger,
  needs_review: colors.warning,
};

const ClusterAdminReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<ClusterAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/security/rbac-analysis/cluster-admin${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ClusterAdminData = await res.json();
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

  if (clusters.length === 0) return <NoClusterState />;

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load data</Alert></Box>;

  const admins = Array.isArray(data.cluster_admins) ? data.cluster_admins : [];
  const unjustified = admins.filter(a => a.justification === 'unjustified');
  const score = data.cluster_admin_score ?? 0;
  const scoreColor = score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.danger;

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Cluster Admin Review
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            RBAC cluster-admin binding audit · {data.total_cluster_admins} bindings ·{' '}
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
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>
                Admin Score
              </Typography>
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
                {unjustified.length > 0
                  ? `${unjustified.length} unjustified binding${unjustified.length > 1 ? 's' : ''}`
                  : 'All bindings justified'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Stat cards */}
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            {[
              { label: 'Total Admins',  count: data.total_cluster_admins ?? 0, color: colors.info },
              { label: 'Unjustified',   count: data.unjustified ?? 0,           color: colors.danger },
              { label: 'Justified',     count: data.justified ?? 0,             color: colors.success },
              { label: 'Needs Review',  count: data.needs_review ?? 0,          color: colors.warning },
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

          {/* Recommendation banner */}
          {data.recommendation && (
            <Paper sx={{ p: 2, mt: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>{data.recommendation}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* UNJUSTIFIED SPOTLIGHT */}
      {unjustified.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Unjustified Cluster-Admin Bindings
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              Immediate action required
            </Typography>
          </Box>
          <Stack spacing={1}>
            {unjustified.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {item.subject_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {item.subject_type} · {item.namespace} · binding: {item.binding_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.textSecondary, display: 'block', mt: 0.5, fontSize: 12 }}>
                      {item.recommendation}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    <Chip label={`${item.pods_using} pods`} size="small"
                      sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
                    <Chip label={item.risk_level.toUpperCase()} size="small"
                      sx={{ bgcolor: colors.border, color: RISK_COLOR[item.risk_level] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL BINDINGS TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Cluster-Admin Bindings ({admins.length})
          </Typography>
        </Box>
        {admins.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No cluster-admin bindings found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Subject', 'Type', 'Namespace', 'Binding', 'Pods Using', 'Risk', 'Justification', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{
                      fontWeight: 700, fontSize: 12, color: colors.textSecondary,
                      bgcolor: colors.surfaceAlt, borderColor: colors.border
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {admins.slice(0, 50).map((item, i) => (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
                      {item.subject_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                      {item.subject_type}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                      {item.namespace}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 160 }}>
                      {item.binding_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border, textAlign: 'center' }}>
                      {item.pods_using}
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Chip label={item.risk_level.toUpperCase()} size="small"
                        sx={{ bgcolor: colors.border, color: RISK_COLOR[item.risk_level] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Chip label={item.justification} size="small"
                        sx={{ bgcolor: colors.border, color: JUST_COLOR[item.justification] ?? colors.textPrimary, fontSize: 10 }} />
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

export default ClusterAdminReview;
// Made with Bob
