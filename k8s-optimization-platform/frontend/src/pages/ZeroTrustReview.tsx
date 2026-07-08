import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
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
  high: '#ef5350',
  medium: '#ffa726',
  low: '#a5d6a7',
};

const GRADE_COLOR: Record<string, string> = {
  A: '#a5d6a7',
  B: '#90caf9',
  C: '#ffa726',
  D: '#ef5350',
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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load zero trust data</Alert>
      </Box>
    );
  }

  const score = data.zero_trust_score ?? 0;
  const scoreColor = score >= 80 ? '#a5d6a7' : score >= 60 ? '#ffa726' : '#ef5350';
  const namespaces = Array.isArray(data.namespace_assessment) ? data.namespace_assessment : [];
  const gaps = Array.isArray(data.gaps) ? data.gaps : [];
  const metrics = data.metrics ?? {};
  const highGaps = gaps.filter((g) => g.priority === 'high');

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(score, 100) / 100) * circumference;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Zero Trust Review
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real pod security posture analysis · {namespaces.length} namespaces assessed · Last scan{' '}
            {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>
                Zero Trust Score
              </Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={radius} fill="none" stroke="#2a3245" strokeWidth={11} />
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
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    / 100
                  </Typography>
                </Box>
              </Box>
              <Chip
                label={`Grade ${data.grade}`}
                size="small"
                sx={{ bgcolor: '#2a3245', color: GRADE_COLOR[data.grade] ?? '#90caf9', fontWeight: 'bold', mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Namespaces Assessed', count: namespaces.length, color: '#90caf9' },
              { label: 'Gaps Identified', count: gaps.length, color: '#ffa726' },
              { label: 'High Priority Gaps', count: highGaps.length, color: '#ef5350' },
              { label: 'Pillars Scored', count: Object.keys(metrics).length, color: '#a5d6a7' },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>
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
            <Paper sx={{ p: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                {data.recommendations[0]}
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* ZERO TRUST PILLAR METRICS */}
      {Object.keys(metrics).length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
            Zero Trust Pillar Scores
          </Typography>
          <Grid container spacing={2}>
            {Object.entries(metrics).map(([key, value]) => {
              const pillarScore = typeof value === 'number' ? value : 0;
              const pillarColor = pillarScore >= 80 ? '#a5d6a7' : pillarScore >= 50 ? '#ffa726' : '#ef5350';
              const pillarWidth = Math.min(pillarScore, 100);
              return (
                <Grid item xs={12} md={6} key={key}>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Typography variant="body2" sx={{ color: '#e8eaf0', fontWeight: 500 }}>
                        {METRIC_LABEL[key] ?? key.replace(/_/g, ' ')}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold" sx={{ color: pillarColor }}>
                        {pillarScore}
                      </Typography>
                    </Box>
                    <Box sx={{ height: 6, bgcolor: '#2a3245', borderRadius: 3, overflow: 'hidden' }}>
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
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              High Priority Gaps
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              {highGaps.length} area{highGaps.length !== 1 ? 's' : ''} need immediate attention
            </Typography>
          </Box>
          <Stack spacing={1}>
            {highGaps.slice(0, 6).map((gap, index) => (
              <Box key={index} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {gap.area}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      Score {gap.current_score} → target {gap.target_score} · gap of {gap.gap}
                    </Typography>
                  </Box>
                  <Chip
                    label={gap.priority.toUpperCase()}
                    size="small"
                    sx={{ bgcolor: '#2a3245', color: PRIORITY_COLOR[gap.priority] ?? '#90caf9', fontWeight: 'bold', fontSize: 10 }}
                  />
                </Box>
                {gap.recommendations[0] && (
                  <Typography variant="body2" sx={{ color: '#8892a4', fontSize: 11, mt: 1 }}>
                    ↳ {gap.recommendations[0]}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* NAMESPACE ASSESSMENT TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Namespace Assessment ({namespaces.length})
          </Typography>
        </Box>
        {namespaces.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>
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
                        color: '#8892a4',
                        bgcolor: '#131d2e',
                        borderColor: '#2a3245',
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
                  const nsGradeColor = GRADE_COLOR[item.grade] ?? '#90caf9';
                  const nsScoreColor =
                    item.zero_trust_score >= 80 ? '#a5d6a7' : item.zero_trust_score >= 60 ? '#ffa726' : '#ef5350';
                  return (
                    <TableRow key={`${item.namespace}-${index}`} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                        {item.namespace}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 'bold', color: nsScoreColor, borderColor: '#2a3245' }}>
                        {item.zero_trust_score}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip
                          label={item.grade}
                          size="small"
                          sx={{ bgcolor: '#2a3245', color: nsGradeColor, fontWeight: 'bold', fontSize: 11, minWidth: 28 }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        {item.has_network_policies ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: '#a5d6a7' }} />
                            <Typography variant="caption" sx={{ color: '#a5d6a7' }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#ef5350' }}>None</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        {item.has_pod_security_policies ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: '#a5d6a7' }} />
                            <Typography variant="caption" sx={{ color: '#a5d6a7' }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#ef5350' }}>None</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        {item.uses_service_mesh ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: '#a5d6a7' }} />
                            <Typography variant="caption" sx={{ color: '#a5d6a7' }}>Yes</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#8892a4' }}>No</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 260 }}>
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
        <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Recommended Actions
          </Typography>
          <Stack spacing={1}>
            {data.recommendations.map((recommendation, index) => (
              <Typography key={index} variant="body2" sx={{ color: '#8892a4' }}>
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
