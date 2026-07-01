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

interface Capacity {
  cpu_total: number; cpu_used: number;
  memory_total: number; memory_used: number;
  storage_total: number; storage_used: number;
}

interface Exhaustion {
  resource: string;
  months_until_exhaustion: number;
  exhaustion_date: string;
  current_usage_percent: number;
  growth_rate_percent: number;
  recommendation: string;
}

interface ForecastMonth {
  month: number;
  date: string;
  cpu_forecast: number;
  memory_forecast: number;
  storage_forecast: number;
  confidence: number;
}

interface CapacityForecastingData {
  current_capacity: Capacity;
  forecast: ForecastMonth[];
  capacity_exhaustion: Exhaustion[];
  growth_trend: string;
  forecast_accuracy: number;
  last_updated: string;
}

const usagePct = (used: number, total: number) => Math.round((used / total) * 100);
const barColor = (pct: number) => pct >= 80 ? '#c62828' : pct >= 60 ? '#e65100' : '#2e7d32';
const urgencyColor = (months: number): 'error' | 'warning' | 'success' =>
  months <= 6 ? 'error' : months <= 12 ? 'warning' : 'success';

const CapacityForecastingInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CapacityForecastingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/capacity-forecasting${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  const cap = data.current_capacity;
  const cpuPct = usagePct(cap.cpu_used, cap.cpu_total);
  const memPct = usagePct(cap.memory_used, cap.memory_total);
  const storagePct = usagePct(cap.storage_used, cap.storage_total);

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Capacity Forecasting</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Forecast future capacity needs and resource exhaustion</Typography>

      {/* Current capacity bars */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Current Capacity</Typography>
          <Grid container spacing={3}>
            {[
              { label: 'CPU', used: cap.cpu_used, total: cap.cpu_total, unit: 'cores', pct: cpuPct },
              { label: 'Memory', used: cap.memory_used, total: cap.memory_total, unit: 'GB', pct: memPct },
              { label: 'Storage', used: cap.storage_used, total: cap.storage_total, unit: 'GB', pct: storagePct },
            ].map((r) => (
              <Grid item xs={12} sm={4} key={r.label}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" fontWeight={600}>{r.label}</Typography>
                  <Typography variant="body2" fontWeight={700} color={barColor(r.pct)}>{r.pct}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={r.pct}
                  sx={{ height: 10, borderRadius: 5, mb: 0.5, '& .MuiLinearProgress-bar': { bgcolor: barColor(r.pct) } }} />
                <Typography variant="caption" color="text.secondary">{r.used} / {r.total} {r.unit}</Typography>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Exhaustion predictions */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Capacity Exhaustion Predictions</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Resource</TableCell>
                  <TableCell align="right">Current Usage</TableCell>
                  <TableCell align="right">Growth Rate</TableCell>
                  <TableCell align="right">Months Until Exhaustion</TableCell>
                  <TableCell>Exhaustion Date</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.capacity_exhaustion || []).map((e) => (
                  <TableRow key={e.resource} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{e.resource}</TableCell>
                    <TableCell align="right">{e.current_usage_percent}%</TableCell>
                    <TableCell align="right">{e.growth_rate_percent}%/mo</TableCell>
                    <TableCell align="right">
                      <Chip label={`${e.months_until_exhaustion}mo`} size="small" color={urgencyColor(e.months_until_exhaustion)} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.exhaustion_date).toLocaleDateString()}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{e.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 12-month forecast table */}
      <Card variant="outlined">
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">12-Month Forecast</Typography>
            <Chip label={`Accuracy: ${data.forecast_accuracy}%`} size="small" color="primary" />
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">CPU (cores)</TableCell>
                  <TableCell align="right">Memory (GB)</TableCell>
                  <TableCell align="right">Storage (GB)</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.forecast || []).map((f) => (
                  <TableRow key={f.month} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(f.date).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</TableCell>
                    <TableCell align="right">{f.cpu_forecast}</TableCell>
                    <TableCell align="right">{f.memory_forecast}</TableCell>
                    <TableCell align="right">{f.storage_forecast}</TableCell>
                    <TableCell align="right">{f.confidence}%</TableCell>
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

const CapacityForecasting: React.FC = () => (
  <ClusterGuard><CapacityForecastingInner /></ClusterGuard>
);

export default CapacityForecasting;
