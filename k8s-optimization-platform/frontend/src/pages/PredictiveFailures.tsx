import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Prediction {
  id: string;
  pod_name: string;
  namespace: string;
  failure_type: string;
  probability: number;
  confidence: string;
  time_to_failure_hours: number;
  root_cause: string;
  recommendation: string;
  historical_occurrences: number;
}

interface PredictiveFailuresData {
  total_predictions: number;
  high_risk_failures: number;
  medium_risk_failures: number;
  predictions: Prediction[];
  model_accuracy: number;
  last_updated: string;
}

const probColor = (p: number) => p >= 80 ? '#c62828' : p >= 70 ? '#e65100' : '#1565c0';
const confColor: Record<string, 'error' | 'warning' | 'info'> = { high: 'error', medium: 'warning', low: 'info' };

const PredictiveFailuresInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PredictiveFailuresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/predictive-failures${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Predictive Failures</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Predict potential failures before they occur</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Predictions', value: data.total_predictions },
          { label: 'High Risk', value: data.high_risk_failures },
          { label: 'Medium Risk', value: data.medium_risk_failures },
          { label: 'Model Accuracy', value: `${data.model_accuracy}%` },
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

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Failure Predictions ({data.total_predictions})</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Pod</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Failure Type</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Probability</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell align="right">Time to Failure</TableCell>
                  <TableCell>Root Cause</TableCell>
                  <TableCell>Recommendation</TableCell>
                  <TableCell align="right">Prior Occurrences</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.predictions || []).map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{p.pod_name}</TableCell>
                    <TableCell>{p.namespace}</TableCell>
                    <TableCell>{p.failure_type}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress variant="determinate" value={p.probability}
                          sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: probColor(p.probability) } }} />
                        <Typography variant="caption" fontWeight={700} color={probColor(p.probability)}>{p.probability}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Chip label={p.confidence} size="small" color={confColor[p.confidence] ?? 'default'} /></TableCell>
                    <TableCell align="right">{p.time_to_failure_hours}h</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{p.root_cause}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{p.recommendation}</TableCell>
                    <TableCell align="right">{p.historical_occurrences}</TableCell>
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

const PredictiveFailures: React.FC = () => (
  <ClusterGuard><PredictiveFailuresInner /></ClusterGuard>
);

export default PredictiveFailures;
