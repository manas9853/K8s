import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Divider
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Insight {
  id: string;
  category: string;
  title: string;
  description: string;
  impact: string;
  confidence: number;
  generated_at: string;
  recommendations: string[];
  estimated_savings: number | null;
  priority: string;
}

interface ModelMetrics {
  prediction_accuracy: number;
  false_positive_rate: number;
  insights_generated_today: number;
  insights_acted_upon: number;
  average_confidence: number;
}

interface Pattern {
  pattern: string;
  trend: string;
  confidence: number;
  detected_at: string;
}

interface AIInsightsData {
  total_insights: number;
  critical_insights: number;
  high_impact_insights: number;
  insights: Insight[];
  model_metrics: ModelMetrics;
  trending_patterns: Pattern[];
  last_updated: string;
}

const impactColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};
const priorityColor: Record<string, 'error' | 'warning' | 'primary' | 'default'> = {
  urgent: 'error', high: 'warning', medium: 'primary', low: 'default',
};
const trendColor: Record<string, 'error' | 'success' | 'default'> = {
  increasing: 'error', decreasing: 'success', stable: 'default',
};

const AIInsightsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AIInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/ai-insights${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  const mm = data.model_metrics ?? {};

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>AI Insights</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>AI-powered insights and intelligent recommendations</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Insights', value: data.total_insights },
          { label: 'Critical', value: data.critical_insights },
          { label: 'High Impact', value: data.high_impact_insights },
          { label: 'Avg Confidence', value: `${mm.average_confidence ?? 'N/A'}%` },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" variant="caption">{k.label}</Typography>
                <Typography variant="h5" fontWeight={700}>{k.value ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Model metrics */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Model Performance</Typography>
          <Grid container spacing={2}>
            {[
              { label: 'Prediction Accuracy', value: `${mm.prediction_accuracy}%` },
              { label: 'False Positive Rate', value: `${mm.false_positive_rate}%` },
              { label: 'Generated Today', value: mm.insights_generated_today },
              { label: 'Acted Upon', value: mm.insights_acted_upon },
            ].map((m) => (
              <Grid item xs={6} sm={3} key={m.label}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                  <Typography variant="h6" fontWeight={700}>{m.value}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Insight cards */}
      <Typography variant="h6" gutterBottom>Insights</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(data.insights || []).map((ins) => (
          <Grid item xs={12} md={6} key={ins.id}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                  <Typography variant="caption" color="text.secondary">{ins.category}</Typography>
                  <Box display="flex" gap={0.5}>
                    <Chip label={ins.impact} size="small" color={impactColor[ins.impact] ?? 'default'} />
                    <Chip label={ins.priority} size="small" color={priorityColor[ins.priority] ?? 'default'} />
                  </Box>
                </Box>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{ins.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{ins.description}</Typography>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="caption" color="text.secondary">Confidence: <strong>{ins.confidence}%</strong></Typography>
                  {ins.estimated_savings != null && (
                    <Chip label={`Save $${ins.estimated_savings.toLocaleString()}`} size="small" color="success" />
                  )}
                </Box>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Recommendations:</Typography>
                {ins.recommendations.map((rec, i) => (
                  <Typography key={i} variant="caption" display="block" sx={{ pl: 1, color: 'text.secondary' }}>• {rec}</Typography>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Trending patterns */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Trending Patterns</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Pattern</TableCell>
                  <TableCell>Trend</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                  <TableCell>Detected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.trending_patterns || []).map((p, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{p.pattern}</TableCell>
                    <TableCell><Chip label={p.trend} size="small" color={trendColor[p.trend] ?? 'default'} /></TableCell>
                    <TableCell align="right">{p.confidence}%</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(p.detected_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const AIInsights: React.FC = () => (
  <ClusterGuard><AIInsightsInner /></ClusterGuard>
);

export default AIInsights;
