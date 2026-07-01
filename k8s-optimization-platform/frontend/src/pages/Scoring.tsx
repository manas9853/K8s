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

const Scoring: React.FC = () => {
  const navigate = useNavigate();
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();
  const [clusterScores, setClusterScores] = useState<ClusterScore[]>([]);
  const [trends, setTrends] = useState<ScoreTrend[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchClusterScores(),
        fetchTrends(),
        fetchSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClusterScores = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/scoring/clusters${clusterParam}`);
    const data = await response.json();
    setClusterScores(data);
    if (data.length > 0 && !selectedCluster) {
      setSelectedCluster(data[0].cluster_name);
    }
  };

  const fetchTrends = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/scoring/trends${clusterParam}`);
    const data = await response.json();
    setTrends(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/scoring/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'success';
    if (grade.startsWith('B')) return 'info';
    if (grade.startsWith('C')) return 'warning';
    return 'error';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'success';
      case 'good':
        return 'info';
      case 'fair':
        return 'warning';
      case 'poor':
        return 'error';
      default:
        return 'default';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUpIcon color="success" />;
      case 'declining':
        return <TrendingDownIcon color="error" />;
      default:
        return <TrendingFlatIcon color="action" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#4caf50';
    if (score >= 75) return '#2196f3';
    if (score >= 60) return '#ff9800';
    return '#f44336';
  };

  const selectedClusterData = clusterScores.find((c) => c.cluster_name === selectedCluster);
  const selectedTrendData = trends.find((t) => t.cluster_name === selectedCluster);

  // Prepare radar chart data
  const radarData = selectedClusterData?.factors.map((f) => ({
    factor: f.name.replace(' ', '\n'),
    score: f.score,
    fullMark: 100,
  }));

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Scoring data is calculated from registered clusters. Connect a cluster via the
          Cluster Onboarding page and optimization scores will appear automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Cluster Optimization Scores
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Comprehensive scoring based on efficiency metrics
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Average Score
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.average_score}
                </Typography>
                <Typography variant="body2" color="white">
                  Across {summary.total_clusters} clusters
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Excellent
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.performance_breakdown.excellent}
                </Typography>
                <Typography variant="body2" color="white">
                  Score ≥ 90
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Needs Attention
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.performance_breakdown.poor}
                </Typography>
                <Typography variant="body2" color="white">
                  Score {'<'} 60
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Top Performer
                </Typography>
                <Typography variant="h5" color="white" fontWeight="bold">
                  {summary.top_performers[0]?.cluster}
                </Typography>
                <Typography variant="body2" color="white">
                  Score: {summary.top_performers[0]?.score}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Cluster Scores Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Cluster Scores
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Score</TableCell>
                    <TableCell>Grade</TableCell>
                    <TableCell>Trend</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusterScores.map((cluster) => {
                    const trend = trends.find((t) => t.cluster_name === cluster.cluster_name);
                    return (
                      <TableRow
                        key={cluster.cluster_name}
                        hover
                        selected={selectedCluster === cluster.cluster_name}
                        onClick={() => setSelectedCluster(cluster.cluster_name)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {cluster.cluster_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 100 }}>
                              <LinearProgress
                                variant="determinate"
                                value={cluster.overall_score}
                                sx={{
                                  height: 8,
                                  borderRadius: 1,
                                  backgroundColor: 'grey.200',
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: getScoreColor(cluster.overall_score),
                                  },
                                }}
                              />
                            </Box>
                            <Typography variant="body2" fontWeight="bold">
                              {cluster.overall_score}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={cluster.grade}
                            size="small"
                            color={getGradeColor(cluster.grade)}
                          />
                        </TableCell>
                        <TableCell>
                          {trend && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {getTrendIcon(trend.trend)}
                              <Typography
                                variant="caption"
                                color={
                                  trend.change > 0
                                    ? 'success.main'
                                    : trend.change < 0
                                    ? 'error.main'
                                    : 'text.secondary'
                                }
                              >
                                {trend.change > 0 ? '+' : ''}
                                {trend.change}
                              </Typography>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View Details">
                            <IconButton size="small" color="primary">
                              <InfoIcon />
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <StarIcon color="warning" />
              <Typography variant="h6">Top Performers</Typography>
            </Box>
            {summary?.top_performers.map((performer, idx) => (
              <Box
                key={performer.cluster}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  mb: 1,
                  bgcolor: 'success.light',
                  borderRadius: 1,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    #{idx + 1} {performer.cluster}
                  </Typography>
                  <Chip label={performer.grade} size="small" color="success" sx={{ mt: 0.5 }} />
                </Box>
                <Typography variant="h6" fontWeight="bold" color="success.dark">
                  {performer.score}
                </Typography>
              </Box>
            ))}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <WarningIcon color="error" />
              <Typography variant="h6">Needs Attention</Typography>
            </Box>
            {summary?.needs_attention.map((cluster) => (
              <Box
                key={cluster.cluster}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  mb: 1,
                  bgcolor: 'error.light',
                  borderRadius: 1,
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {cluster.cluster}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {cluster.recommendations} recommendations
                  </Typography>
                </Box>
                <Typography variant="h6" fontWeight="bold" color="error.dark">
                  {cluster.score}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Selected Cluster Details */}
        {selectedClusterData && (
          <>
            {/* Score Factors */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Score Factors - {selectedClusterData.cluster_name}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {selectedClusterData.factors.map((factor) => (
                  <Box key={factor.name} sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {factor.name}
                        </Typography>
                        <Chip
                          label={factor.status}
                          size="small"
                          color={getStatusColor(factor.status)}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      </Box>
                      <Typography variant="body2" fontWeight="bold">
                        {factor.score}/100
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={factor.score}
                      sx={{
                        height: 8,
                        borderRadius: 1,
                        backgroundColor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: getScoreColor(factor.score),
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Weight: {factor.weight * 100}% • {factor.description}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>

            {/* Radar Chart */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Performance Radar
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="factor" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Score Trend */}
            {selectedTrendData && (
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Score Trend - {selectedClusterData.cluster_name}
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={selectedTrendData.history}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <RechartsTooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#8884d8"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            )}

            {/* Recommendations */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="primary" />
                  Recommendations
                </Typography>
                {selectedClusterData.recommendations.length > 0 ? (
                  selectedClusterData.recommendations.map((rec, idx) => (
                    <Alert key={idx} severity="info" sx={{ mb: 1 }}>
                      {rec}
                    </Alert>
                  ))
                ) : (
                  <Alert severity="success">
                    No recommendations - cluster is well optimized!
                  </Alert>
                )}
              </Paper>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default Scoring;

// Made with Bob
