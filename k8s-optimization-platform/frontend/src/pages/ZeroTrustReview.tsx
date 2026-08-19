import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface ZeroTrustGap {
  area: string;
  current_score: number;
  target_score: number;
  gap: number;
  priority: 'high' | 'medium' | 'low';
  recommendations: string[];
}

interface NamespaceAssessment {
  namespace: string;
  zero_trust_score: number;
  grade: string;
  has_network_policies: boolean;
  has_pod_security_policies: boolean;
  uses_service_mesh: boolean;
  recommendation: string;
}

interface ZeroTrustData {
  zero_trust_score: number;
  grade: string;
  metrics: Record<string, number>;
  gaps: ZeroTrustGap[];
  namespace_assessment: NamespaceAssessment[];
  recommendations: string[];
  last_scan?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.danger,
  medium: colors.warning,
  low: colors.success,
};

const GRADE_COLOR: Record<string, string> = {
  A: colors.success,
  B: colors.info,
  C: colors.warning,
  D: colors.danger,
};

const METRIC_LABEL: Record<string, string> = {
  network_segmentation: 'Network Segmentation',
  mutual_tls: 'Mutual TLS',
  identity_verification: 'Identity Verification',
  least_privilege_access: 'Least Privilege Access',
  continuous_monitoring: 'Continuous Monitoring',
  encryption_in_transit: 'Encryption in Transit',
};

const ZeroTrustReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<ZeroTrustData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/v1/security/network-security/zero-trust${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: ZeroTrustData = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load zero-trust data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load zero trust data</Alert>
      </Box>
    );
  }

  const score = data.zero_trust_score ?? 0;
  const scoreColor = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.danger;
  const namespaces = Array.isArray(data.namespace_assessment) ? data.namespace_assessment : [];
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  const metrics = data.metrics ?? {};
  const highGaps = gaps.filter((g) => g.priority === 'high');

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(score, 100) / 100) * circumference;

  if (clusters.length === 0) return <NoClusterState />;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Zero Trust Review
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Real pod security posture analysis · {namespaces.length} namespaces assessed · Last scan{' '}
            {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>
                Zero Trust Score
              </Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={radius} fill="none" stroke={colors.border} strokeWidth={11} />
                  <circle
                    cx={65}
                    cy={65}
                    r={radius}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth={11}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>
                    {score}
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                    / 100
                  </Typography>
                </Box>
              </Box>
              <Chip
                label={`Grade ${data.grade}`}
                size="small"
                sx={{ bgcolor: colors.border, color: GRADE_COLOR[data.grade] ?? colors.info, fontWeight: 'bold', mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Namespaces Assessed', count: namespaces.length, color: colors.info },
              { label: 'Gaps Identified', count: gaps.length, color: colors.warning },
              { label: 'High Priority Gaps', count: highGaps.length, color: colors.danger },
              { label: 'Pillars Scored', count: Object.keys(metrics).length, color: colors.success },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>
                      {count}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                {data.recommendations[0]}
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* ZERO TRUST PILLAR METRICS */}
      {Object.keys(metrics).length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
            Zero Trust Pillar Scores
          </Typography>
          <Grid container spacing={2}>
            {Object.entries(metrics).map(([key, value]) => {
              const pillarScore = typeof value === 'number' ? value : 0;
              const pillarColor = pillarScore >= 80 ? colors.success : pillarScore >= 50 ? colors.warning : colors.danger;
              const pillarWidth = Math.min(pillarScore, 100);
              return (
                <Grid item xs={12} md={6} key={key}>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 500 }}>
                        {METRIC_LABEL[key] ?? key.replace(/_/g, ' ')}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold" sx={{ color: pillarColor }}>
                        {pillarScore}
                      </Typography>
                    </Box>
                    <Box sx={{ height: 6, bgcolor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                      <Box
                        sx={{
                          width: `${pillarWidth}%`,
                          height: '100%',
                          bgcolor: pillarColor,
                          borderRadius: 3,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      )}

      {/* GAPS SPOTLIGHT */}
      {highGaps.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              High Priority Gaps
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {highGaps.length} area{highGaps.length !== 1 ? 's' : ''} need immediate attention
            </Typography>
          </Box>
          <Stack spacing={1}>
            {highGaps.slice(0, 6).map((gap, index) => (
              <Box key={index} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {gap.area}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      Score {gap.current_score} → target {gap.target_score} · gap of {gap.gap}
                    </Typography>
                  </Box>
                  <Chip
                    label={gap.priority.toUpperCase()}
                    size="small"
                    sx={{ bgcolor: colors.border, color: PRIORITY_COLOR[gap.priority] ?? colors.info, fontWeight: 'bold', fontSize: 10 }}
                  />
                </Box>
                {gap.recommendations[0] && (
                  <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: 11, mt: 1 }}>
                    ↳ {gap.recommendations[0]}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* NAMESPACE ASSESSMENT TABLE */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Namespace Assessment ({namespaces.length})
          </Typography>
        </Box>
        {namespaces.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>
              No namespace assessment data available.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Namespace', 'Score', 'Grade', 'Network Policies', 'Pod Security', 'Service Mesh', 'Recommendation'].map((heading) => (
                    <TableCell
                      key={heading}
                      sx={{
                        fontWeight: 700,
                        fontSize: 12,
                        color: colors.textSecondary,
                        bgcolor: colors.surfaceAlt,
                        borderColor: colors.border,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {namespaces.slice(0, 60).map((item, index) => {
                  const nsGradeColor = GRADE_COLOR[item.grade] ?? colors.info;
                  const nsScoreColor =
                    item.zero_trust_score >= 80 ? colors.success : item.zero_trust_score >= 60 ? colors.warning : colors.danger;
                  return (
                    <TableRow key={`${item.namespace}-${index}`} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
                        {item.namespace}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 'bold', color: nsScoreColor, borderColor: colors.border }}>
                        {item.zero_trust_score}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip
                          label={item.grade}
                          size="small"
                          sx={{ bgcolor: colors.border, color: nsGradeColor, fontWeight: 'bold', fontSize: 11, minWidth: 28 }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        {item.has_network_policies ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: colors.success }} />
                            <Typography variant="caption" sx={{ color: colors.success }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: colors.danger }}>None</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        {item.has_pod_security_policies ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: colors.success }} />
                            <Typography variant="caption" sx={{ color: colors.success }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: colors.danger }}>None</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        {item.uses_service_mesh ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: colors.success }} />
                            <Typography variant="caption" sx={{ color: colors.success }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: colors.textSecondary }}>No</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 260 }}>
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

      {/* RECOMMENDATIONS */}
      {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
        <Paper sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Recommended Actions
          </Typography>
          <Stack spacing={1}>
            {data.recommendations.map((recommendation, index) => (
              <Typography key={index} variant="body2" sx={{ color: colors.textSecondary }}>
                • {recommendation}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
};

export default ZeroTrustReview;
