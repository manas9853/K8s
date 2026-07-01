import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent, LinearProgress, Divider
} from '@mui/material';
import NatureIcon from '@mui/icons-material/Nature';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const gradeColor = (grade: string) =>
  grade.startsWith('A') ? '#10b981' : grade.startsWith('B+') ? '#3b82d4' : grade.startsWith('B') ? '#f59e0b' : '#ef4444';

const SustainabilityScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/finops/sustainability-score${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return null;

  const sb = data.score_breakdown;
  const ic = data.industry_comparison;

  // Radar chart data
  const radarData = sb ? [
    { dimension: 'Energy',     score: sb.energy_efficiency.score,       fullMark: 100 },
    { dimension: 'Carbon',     score: sb.carbon_footprint.score,        fullMark: 100 },
    { dimension: 'Resources',  score: sb.resource_optimization.score,   fullMark: 100 },
    { dimension: 'Lifecycle',  score: sb.lifecycle_management.score,    fullMark: 100 },
  ] : [];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <NatureIcon sx={{ fontSize: 38, mr: 2, color: 'success.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Sustainability Score</Typography>
          <Typography variant="body2" color="text.secondary">
            Comprehensive sustainability scoring across all connected clusters
          </Typography>
        </Box>
        <Box ml="auto" display="flex" gap={1} alignItems="center">
          <Box sx={{
            width: 70, height: 70, borderRadius: '50%',
            border: `4px solid ${gradeColor(data.grade)}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography variant="h5" fontWeight="bold" sx={{ color: gradeColor(data.grade), lineHeight: 1 }}>
              {data.grade}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Overall Score + Industry */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Overall Score',      value: `${data.overall_score} / 100`,   color: gradeColor(data.grade) },
          { label: 'Previous Score',     value: String(data.previous_score),     color: '#57606a' },
          { label: 'Improvement',        value: `+${data.improvement} pts`,      color: '#10b981' },
          { label: 'Target Score',       value: String(data.target_score),       color: '#3b82d4' },
        ].map(c => (
          <Grid item xs={12} sm={6} md={3} key={c.label}>
            <Card>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="body2" color="text.secondary">{c.label}</Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: c.color }}>{c.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Radar Chart */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Score Dimensions</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Score Breakdown */}
        {sb && (
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Score Breakdown</Typography>
              {Object.entries(sb).map(([key, dim]: [string, any]) => (
                <Box key={key} mb={2}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" fontWeight="medium" sx={{ textTransform: 'capitalize' }}>
                      {key.replace(/_/g, ' ')}
                    </Typography>
                    <Box display="flex" gap={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary">weight: {dim.weight}%</Typography>
                      <Chip label={`${dim.score}/100`} size="small"
                            color={dim.score >= 80 ? 'success' : dim.score >= 70 ? 'warning' : 'error'} />
                    </Box>
                  </Box>
                  <LinearProgress variant="determinate" value={dim.score}
                    color={dim.score >= 80 ? 'success' : dim.score >= 70 ? 'warning' : 'error'}
                    sx={{ height: 8, borderRadius: 1, mb: 0.5 }} />
                  <Typography variant="caption" color="text.secondary">
                    Weighted contribution: {dim.weighted_score?.toFixed(2)} pts
                  </Typography>
                </Box>
              ))}
            </Paper>
          </Grid>
        )}
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Per-Cluster Scores */}
        {data.cluster_scores?.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Per-Cluster Scores</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cluster</TableCell>
                      <TableCell>Environment</TableCell>
                      <TableCell align="right">Score</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.cluster_scores.map((c: any) => (
                      <TableRow key={c.cluster} hover>
                        <TableCell><Typography variant="body2" fontWeight="medium">{c.cluster}</Typography></TableCell>
                        <TableCell>
                          <Chip label={c.environment} size="small"
                                color={c.environment === 'production' ? 'error' : c.environment === 'staging' ? 'warning' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Chip label={`${c.score}/100`} size="small"
                                color={c.score >= 80 ? 'success' : c.score >= 70 ? 'warning' : 'error'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}

        {/* Industry Comparison */}
        {ic && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Industry Comparison</Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                ['Your Score',         ic.your_score],
                ['Industry Average',   ic.industry_average],
                ['Top Quartile',       ic.top_quartile],
                ['Your Percentile',    `${ic.percentile}th`],
              ].map(([k, v]) => (
                <Box key={k} display="flex" justifyContent="space-between" py={0.75} borderBottom="1px solid #e5e7eb">
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight="bold">{v}</Typography>
                </Box>
              ))}
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Achievements */}
      {data.achievements?.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmojiEventsIcon color="warning" /> Achievements
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={1}>
            {data.achievements.map((a: any, i: number) => (
              <Grid item xs={12} sm={4} key={i}>
                <Chip label={`${a.achievement} (${a.date})`} color="success" variant="outlined"
                      sx={{ width: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Recommendations */}
      {data.recommendations?.map((r: any, i: number) => (
        <Alert key={i} severity={r.priority === 'high' ? 'warning' : 'info'} sx={{ mb: 1 }}>
          <strong>[{r.priority.toUpperCase()}]</strong> {r.recommendation} —
          Impact: +{r.impact_on_score} pts · Effort: {r.effort}
        </Alert>
      ))}
    </Box>
  );
};

export default SustainabilityScore;
