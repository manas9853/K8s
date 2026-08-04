import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface DriftItem {
  resource_type: string;
  resource_name: string;
  namespace: string;
  drift_type: string;
  severity: string;
  detected_at: string;
  baseline_value: string;
  current_value: string;
  auto_remediation_available: boolean;
  recommendation: string;
}

interface BaselineData {
  drift_score: number;
  total_resources: number;
  drift_detected: number;
  critical_drift: number;
  high_drift: number;
  medium_drift: number;
  low_drift: number;
  drift_items: DriftItem[];
  baseline_last_updated?: string;
  recommendation?: string;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};

const BaselineComparisonInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<BaselineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/security/drift-detection/baseline${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: BaselineData = await r.json();
        if (!mounted) return;
        setData(d);
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
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load baseline data</Alert></Box>;

  const driftItems = Array.isArray(data.drift_items) ? data.drift_items : [];
  const critical = driftItems.filter(d => d.severity === 'critical');
  const score = data.drift_score ?? 0;
  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.danger;
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Baseline Comparison</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Security baseline vs current configuration · {data.total_resources ?? 0} resources ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>Drift Score</Typography>
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
                {critical.length} critical drift item{critical.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Detected',  count: data.drift_detected ?? 0, color: colors.info },
              { label: 'Critical',        count: data.critical_drift ?? 0, color: colors.danger },
              { label: 'High',            count: data.high_drift ?? 0,     color: colors.warning },
              { label: 'Medium',          count: data.medium_drift ?? 0,   color: colors.info },
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
      {critical.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>Critical Drift Items</Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {critical.length} item{critical.length !== 1 ? 's' : ''} need immediate attention
            </Typography>
          </Box>
          <Stack spacing={1.5}>
            {critical.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>{item.drift_type}</Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {item.resource_name} · {item.namespace}
                    </Typography>
                  </Box>
                  <Chip label="CRITICAL" size="small"
                    sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block' }}>Baseline</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: colors.success }}>
                      {item.baseline_value}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: colors.textSecondary, alignSelf: 'center' }}>→</Typography>
                  <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block' }}>Current</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: colors.danger }}>
                      {item.current_value}
                    </Typography>
                  </Box>
                </Box>
                {item.recommendation && (
                  <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: 11, mt: 1 }}>
                    ↳ {item.recommendation}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* FULL DRIFT TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Drift Items ({driftItems.length})
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: colors.info, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate('/drift-alerts')}
          >
            View Drift Alerts →
          </Typography>
        </Box>
        {driftItems.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No drift detected. Configuration matches baseline.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'Drift Type', 'Resource', 'Namespace', 'Baseline', 'Current', 'Auto-Fix', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {driftItems.slice(0, 100).map((d, i) => {
                  const sev = (d.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textPrimary, fontWeight: 600, borderColor: colors.border }}>{d.drift_type}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.resource_name}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>{d.namespace}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.success, fontFamily: 'monospace', borderColor: colors.border, whiteSpace: 'nowrap' }}>{d.baseline_value}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: SEV_COLOR[sev] ?? colors.textPrimary, fontFamily: 'monospace', borderColor: colors.border, whiteSpace: 'nowrap' }}>{d.current_value}</TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip label={d.auto_remediation_available ? 'Yes' : 'No'} size="small"
                          sx={{ bgcolor: colors.border, color: d.auto_remediation_available ? colors.success : colors.textSecondary, fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 200 }}>{d.recommendation}</TableCell>
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

const BaselineComparison: React.FC = () => (
  <ClusterGuard><BaselineComparisonInner /></ClusterGuard>
);

export default BaselineComparison;
