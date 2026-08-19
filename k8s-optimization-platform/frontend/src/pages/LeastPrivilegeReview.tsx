import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { GppBad as PrivIcon, Warning as WarningIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface PrivilegeViolation {
  pod_name: string;
  container_name: string;
  namespace: string;
  severity: string;
  violations: string[];
  violation_count: number;
  recommendations: string[];
}

interface LeastPrivilegeData {
  least_privilege_score: number;
  total_violations: number;
  containers_analyzed: number;
  privilege_violations: PrivilegeViolation[];
  recommendation?: string;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};

const LeastPrivilegeReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<LeastPrivilegeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/security/rbac-analysis/least-privilege${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LeastPrivilegeData = await res.json();
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

  const violations = Array.isArray(data.privilege_violations) ? data.privilege_violations : [];
  const criticals = violations.filter(v => v.severity.toLowerCase() === 'critical');
  const score = data.least_privilege_score ?? 0;
  const scoreColor = score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.danger;

  // severity breakdown
  const sevCounts = violations.reduce<Record<string, number>>((acc, v) => {
    const s = v.severity.toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;

  if (clusters.length === 0) return <NoClusterState />;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <PrivIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Least Privilege Review
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Container security context audit · {data.containers_analyzed} containers analysed ·{' '}
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
                Privilege Score
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
                {criticals.length} critical violation{criticals.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Stat cards */}
        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Violations',    count: data.total_violations ?? 0,           color: colors.danger },
              { label: 'Containers Analysed', count: data.containers_analyzed ?? 0,        color: colors.info },
              { label: 'Critical',            count: sevCounts['critical'] ?? 0,           color: colors.danger },
              { label: 'High',                count: sevCounts['high'] ?? 0,               color: colors.warning },
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

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Critical Violations
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {criticals.length} containers — immediate remediation required
            </Typography>
          </Box>
          <Stack spacing={1}>
            {criticals.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {item.pod_name} / {item.container_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {item.namespace} · {item.violation_count} violation{item.violation_count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  <Chip label={`${item.violation_count} violations`} size="small"
                    sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                {/* Violation pills */}
                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                  {item.violations.map((v, vi) => (
                    <Chip key={vi} label={v} size="small"
                      sx={{ bgcolor: colors.border, color: colors.danger, fontSize: 10, height: 20 }} />
                  ))}
                </Box>
                {/* Top recommendation */}
                {item.recommendations[0] && (
                  <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 1, fontSize: 11 }}>
                    ↳ {item.recommendations[0]}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL VIOLATIONS TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Violations ({violations.length})
          </Typography>
        </Box>
        {violations.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No privilege violations found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Pod', 'Container', 'Namespace', 'Severity', 'Violations', 'Count', 'Top Recommendation'].map(h => (
                    <TableCell key={h} sx={{
                      fontWeight: 700, fontSize: 12, color: colors.textSecondary,
                      bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap'
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {violations.slice(0, 100).map((item, i) => {
                  const sev = item.severity.toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
                        {item.pod_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                        {item.container_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                        {item.namespace}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {item.violations.slice(0, 2).map((v, vi) => (
                            <Chip key={vi} label={v} size="small"
                              sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.info, fontSize: 10, height: 20 }} />
                          ))}
                          {item.violations.length > 2 && (
                            <Chip label={`+${item.violations.length - 2}`} size="small"
                              sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border, textAlign: 'center' }}>
                        {item.violation_count}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 220 }}>
                        {item.recommendations[0] ?? '—'}
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

export default LeastPrivilegeReview;
// Made with Bob
