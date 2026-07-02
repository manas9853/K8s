import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
  Divider,
  Button,
  CircularProgress,
  Stack,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Info as InfoIcon,
  Star as StarIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { API_BASE_URL } from '../config/api';

interface ScoreFactor {
  name: string;
  score: number;
  weight: number;
  max_score: number;
  description: string;
  status: string;
}

interface ClusterScore {
  cluster_name: string;
  overall_score: number;
  grade: string;
  factors: ScoreFactor[];
  recommendations: string[];
  last_updated: string;
}

interface ScoreHistory {
  date: string;
  score: number;
}

interface ScoreTrend {
  cluster_name: string;
  current_score: number;
  previous_score: number;
  change: number;
  trend: string;
  history: ScoreHistory[];
}

interface Summary {
  total_clusters: number;
  average_score: number;
  grade_distribution: Record<string, number>;
  performance_breakdown: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  top_performers: Array<{
    cluster: string;
    score: number;
    grade: string;
  }>;
  needs_attention: Array<{
    cluster: string;
    score: number;
    grade: string;
    recommendations: number;
  }>;
}

const scoreColor = (score: number) =>
  score >= 90 ? '#2e7d32' : score >= 75 ? '#1565c0' : score >= 60 ? '#e65100' : '#c62828';

const gradeChipColor = (grade: string): 'success' | 'primary' | 'warning' | 'error' => {
  if (grade.startsWith('A')) return 'success';
  if (grade.startsWith('B')) return 'primary';
  if (grade.startsWith('C')) return 'warning';
  return 'error';
};

const Scoring: React.FC = () => {
  const navigate = useNavigate();
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();
  const [clusterScores, setClusterScores] = useState<ClusterScore[]>([]);
  const [trends, setTrends] = useState<ScoreTrend[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [scoresRes, trendsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/scoring/clusters${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/scoring/trends${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/scoring/summary${clusterParam}`),
      ]);
      const scores: ClusterScore[] = await scoresRes.json();
      const trendData: ScoreTrend[] = await trendsRes.json();
      const summaryData: Summary = await summaryRes.json();
      setClusterScores(scores);
      setTrends(trendData);
      setSummary(summaryData);
      if (scores.length > 0 && !selectedCluster) {
        setSelectedCluster(scores[0].cluster_name);
      }
    } catch (err) {
      setError('Failed to load scoring data');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'improving') return <TrendingUpIcon color="success" fontSize="small" />;
    if (trend === 'declining') return <TrendingDownIcon color="error" fontSize="small" />;
    return <TrendingFlatIcon color="action" fontSize="small" />;
  };

  const selectedClusterData = clusterScores.find((c) => c.cluster_name === selectedCluster);
  const selectedTrendData = trends.find((t) => t.cluster_name === selectedCluster);

  const radarData = selectedClusterData?.factors.map((f) => ({
    factor: f.name,
    score: f.score,
    fullMark: 100,
  }));

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="text.secondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center" maxWidth={480}>
          Scoring data is calculated from registered clusters. Connect a cluster via the
          Cluster Onboarding page and optimization scores will appear automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" action={
          <Button size="small" onClick={fetchData}>Retry</Button>
        }>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <AssessmentIcon sx={{ fontSize: 36, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">Cluster Optimization Scores</Typography>
            <Typography variant="caption" color="text.secondary">
              Comprehensive scoring based on efficiency metrics
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Average Score', value: `${summary.average_score}`, sub: `Across ${summary.total_clusters} cluster${summary.total_clusters !== 1 ? 's' : ''}` },
            { label: 'Excellent', value: `${summary.performance_breakdown.excellent}`, sub: 'Score ≥ 90' },
            { label: 'Good', value: `${summary.performance_breakdown.good}`, sub: 'Score 75–89' },
            { label: 'Needs Attention', value: `${summary.performance_breakdown.poor}`, sub: 'Score < 60' },
          ].map((k) => (
            <Grid item xs={6} sm={3} key={k.label}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                  <Typography variant="h4" fontWeight={700}>{k.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{k.sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Cluster Scores Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Cluster Scores</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Score</TableCell>
                    <TableCell>Grade</TableCell>
                    <TableCell>Trend</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusterScores.map((cluster) => {
                    const trend = trends.find((t) => t.cluster_name === cluster.cluster_name);
                    const color = scoreColor(cluster.overall_score);
                    return (
                      <TableRow
                        key={cluster.cluster_name}
                        hover
                        selected={selectedCluster === cluster.cluster_name}
                        onClick={() => setSelectedCluster(cluster.cluster_name)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{cluster.cluster_name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 90 }}>
                              <LinearProgress
                                variant="determinate"
                                value={cluster.overall_score}
                                sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: color } }}
                              />
                            </Box>
                            <Typography variant="body2" fontWeight={700} sx={{ color }}>
                              {cluster.overall_score}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={cluster.grade} size="small" color={gradeChipColor(cluster.grade)} />
                        </TableCell>
                        <TableCell>
                          {trend && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              {getTrendIcon(trend.trend)}
                              <Typography
                                variant="caption"
                                color={trend.change > 0 ? 'success.main' : trend.change < 0 ? 'error.main' : 'text.secondary'}
                              >
                                {trend.change > 0 ? '+' : ''}{trend.change}
                              </Typography>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View Details">
                            <IconButton size="small">
                              <InfoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Top Performers & Needs Attention */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <StarIcon sx={{ color: '#e65100', fontSize: 20 }} />
              <Typography variant="h6" fontWeight="bold">Top Performers</Typography>
            </Box>
            <Stack spacing={1}>
              {summary?.top_performers.map((performer, idx) => (
                <Box
                  key={performer.cluster}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>#{idx + 1} {performer.cluster}</Typography>
                    <Chip label={performer.grade} size="small" color={gradeChipColor(performer.grade)} sx={{ mt: 0.5, height: 18, fontSize: 11 }} />
                  </Box>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: scoreColor(performer.score) }}>
                    {performer.score}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <WarningIcon sx={{ color: '#c62828', fontSize: 20 }} />
              <Typography variant="h6" fontWeight="bold">Needs Attention</Typography>
            </Box>
            {summary?.needs_attention.length === 0 ? (
              <Alert severity="success" sx={{ fontSize: 13 }}>All clusters are performing well</Alert>
            ) : (
              <Stack spacing={1}>
                {summary?.needs_attention.map((cluster) => (
                  <Box
                    key={cluster.cluster}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{cluster.cluster}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cluster.recommendations} recommendation{cluster.recommendations !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Typography variant="h6" fontWeight="bold" sx={{ color: scoreColor(cluster.score) }}>
                      {cluster.score}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        {/* Selected Cluster Details */}
        {selectedClusterData && (
          <>
            {/* Score Factors */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>
                  Score Factors — {selectedClusterData.cluster_name}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2.5}>
                  {selectedClusterData.factors.map((factor) => {
                    const color = scoreColor(factor.score);
                    return (
                      <Box key={factor.name}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" fontWeight={600}>{factor.name}</Typography>
                            <Chip
                              label={factor.status}
                              size="small"
                              sx={{
                                height: 18, fontSize: 10,
                                bgcolor: factor.status === 'excellent' ? '#e8f5e9' : factor.status === 'good' ? '#e3f2fd' : factor.status === 'fair' ? '#fff3e0' : '#fdecea',
                                color,
                              }}
                            />
                          </Box>
                          <Typography variant="body2" fontWeight={700} sx={{ color }}>{factor.score}/100</Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={factor.score}
                          sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: color } }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Weight: {Math.round(factor.weight * 100)}% · {factor.description}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>

            {/* Radar Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom>Performance Radar</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="factor" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="#1565c0" fill="#1565c0" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Score Trend */}
            {selectedTrendData && selectedTrendData.history.length > 0 && (
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Score Trend — {selectedClusterData.cluster_name}
                  </Typography>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={selectedTrendData.history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="score" stroke="#1565c0" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            )}

            {/* Recommendations */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <CheckCircleIcon color="primary" fontSize="small" />
                  <Typography variant="h6" fontWeight="bold">Recommendations</Typography>
                </Box>
                <Stack spacing={1}>
                  {selectedClusterData.recommendations.length > 0 ? (
                    selectedClusterData.recommendations.map((rec, idx) => (
                      <Alert key={idx} severity="info" sx={{ fontSize: 13 }}>{rec}</Alert>
                    ))
                  ) : (
                    <Alert severity="success">No recommendations — cluster is well optimized!</Alert>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default Scoring;