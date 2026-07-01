import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, LinearProgress
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface HistoricalCost {
  month: string;
  cost: number;
  growth_rate: number;
}

interface ForecastMonth {
  month: string;
  predicted_cost: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  confidence: number;
}

interface BreakdownItem {
  category: string;
  current_cost: number;
  forecast_12_months: number;
  growth_rate: number;
}

interface BudgetAlert {
  type: string;
  severity: string;
  message: string;
  recommended_action: string;
}

interface CostForecastingData {
  current_monthly_cost: number;
  current_annual_cost: number;
  historical_costs: HistoricalCost[];
  forecast: ForecastMonth[];
  cost_breakdown: BreakdownItem[];
  alerts: BudgetAlert[];
  forecast_accuracy: number;
  last_updated: string;
}

const alertSevColor: Record<string, 'error' | 'warning' | 'info'> = {
  high: 'error', medium: 'warning', low: 'info',
};

const fmt = (n: number) => `$${n.toLocaleString()}`;

const CostForecastingInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CostForecastingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/cost-forecasting${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>Cost Forecasting</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Forecast future infrastructure costs and spending trends</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Current Monthly', value: fmt(data.current_monthly_cost) },
          { label: 'Annual Cost', value: fmt(data.current_annual_cost) },
          { label: 'Forecast Accuracy', value: `${data.forecast_accuracy}%` },
          { label: 'Budget Alerts', value: (data.alerts || []).length },
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

      {/* Budget alerts */}
      {(data.alerts || []).length > 0 && (
        <Box sx={{ mb: 3 }}>
          {data.alerts.map((a, i) => (
            <Alert key={i} severity={alertSevColor[a.severity] ?? 'info'} sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{a.message}</Typography>
              <Typography variant="caption">{a.recommended_action}</Typography>
            </Alert>
          ))}
        </Box>
      )}

      {/* Cost breakdown */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Cost Breakdown by Category</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Category</TableCell>
                  <TableCell>Share</TableCell>
                  <TableCell align="right">Current/Month</TableCell>
                  <TableCell align="right">Forecast (12mo)</TableCell>
                  <TableCell align="right">Growth Rate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.cost_breakdown || []).map((b) => {
                  const pct = data.current_monthly_cost > 0 ? Math.round((b.current_cost / data.current_monthly_cost) * 100) : 0;
                  return (
                    <TableRow key={b.category} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{b.category}</TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={pct}
                            sx={{ flex: 1, height: 7, borderRadius: 4 }} />
                          <Typography variant="caption">{pct}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{fmt(b.current_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: '#c62828', fontWeight: 600 }}>{fmt(b.forecast_12_months)}</TableCell>
                      <TableCell align="right" sx={{ color: b.growth_rate > 10 ? '#c62828' : '#e65100' }}>+{b.growth_rate}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 12-month forecast */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">12-Month Cost Forecast</Typography>
            <Chip label={`Accuracy: ${data.forecast_accuracy}%`} size="small" color="primary" />
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Predicted Cost</TableCell>
                  <TableCell align="right">Low Estimate</TableCell>
                  <TableCell align="right">High Estimate</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.forecast || []).map((f) => (
                  <TableRow key={f.month} hover>
                    <TableCell>{f.month}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(f.predicted_cost)}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{fmt(f.confidence_interval_low)}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{fmt(f.confidence_interval_high)}</TableCell>
                    <TableCell align="right">{f.confidence}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Historical */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Historical Costs (Last 12 Months)</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Growth Rate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.historical_costs || []).map((h) => (
                  <TableRow key={h.month} hover>
                    <TableCell>{h.month}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(h.cost)}</TableCell>
                    <TableCell align="right" sx={{ color: h.growth_rate > 0 ? '#e65100' : '#2e7d32' }}>
                      {h.growth_rate > 0 ? '+' : ''}{h.growth_rate}%
                    </TableCell>
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

const CostForecasting: React.FC = () => (
  <ClusterGuard><CostForecastingInner /></ClusterGuard>
);

export default CostForecasting;
