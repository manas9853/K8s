import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent, Divider, LinearProgress
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const fmt = (n: number) => `$${Number(n).toLocaleString()}`;
const pctBadge = (pct: number) => pct >= 70 ? 'success' : pct >= 50 ? 'warning' : 'error';

const FinancialBenchmarking: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/financial-benchmarking${clusterParam}`);
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

  const ym = data.your_metrics;
  const ib = data.industry_benchmarks;
  const em = data.efficiency_metrics;
  const cos = data.cost_optimization_score;
  const ta = data.trend_analysis;

  const benchmarkRows = ib ? Object.entries(ib).map(([key, val]: [string, any]) => ({
    metric:  key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    yours:   val.your_value,
    avg:     val.industry_average,
    best:    val.best_in_class,
    pct:     val.percentile,
    status:  val.status,
  })) : [];

  const efficiencyRows = em ? Object.entries(em).map(([key, val]: [string, any]) => ({
    metric: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    yours:  val.your_value,
    avg:    val.industry_average,
    best:   val.best_in_class,
    pct:    val.percentile,
  })) : [];

  const radarData = em ? [
    { name: 'Utilization',   you: em.resource_utilization.your_value,  avg: em.resource_utilization.industry_average },
    { name: 'Low Waste',     you: 100 - em.waste_percentage.your_value, avg: 100 - em.waste_percentage.industry_average },
    { name: 'Optimization',  you: em.optimization_coverage.your_value,  avg: em.optimization_coverage.industry_average },
  ] : [];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <CompareArrowsIcon sx={{ fontSize: 38, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Financial Benchmarking</Typography>
          <Typography variant="body2" color="text.secondary">
            Compare your Kubernetes costs against industry benchmarks
          </Typography>
        </Box>
        <Box ml="auto" display="flex" gap={1}>
          {cos && <Chip label={`Grade: ${cos.grade} (${cos.percentile}th pct)`} color={cos.percentile >= 70 ? 'success' : 'warning'} />}
          {ta && (
            <>
              <Chip icon={ta.cost_trend === 'decreasing' ? <TrendingDownIcon /> : <TrendingUpIcon />}
                    label={`Cost: ${ta.cost_trend}`} size="small"
                    color={ta.cost_trend === 'decreasing' ? 'success' : 'warning'} />
              <Chip icon={<TrendingUpIcon />} label={`Efficiency: ${ta.efficiency_trend}`} size="small" color="success" />
            </>
          )}
        </Box>
      </Box>

      {/* Your Metrics KPI row */}
      {ym && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Total Monthly Cost',    value: fmt(ym.total_monthly_cost),          color: '#3b82d4' },
            { label: 'Cost / Pod / Month',    value: `$${ym.cost_per_pod_per_month}`,     color: '#7c5cd8' },
            { label: 'Cost / CPU Core',       value: `$${ym.cost_per_cpu_core_per_month}`,color: '#f59e0b' },
            { label: 'Cost / GB Memory',      value: `$${ym.cost_per_gb_memory_per_month}`,color: '#10b981' },
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
      )}

      <Grid container spacing={3} mb={3}>
        {/* Benchmark comparison table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Industry Benchmark Comparison</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell align="right">Yours</TableCell>
                    <TableCell align="right">Industry Avg</TableCell>
                    <TableCell align="right">Best-in-Class</TableCell>
                    <TableCell>Percentile</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {benchmarkRows.map((row) => (
                    <TableRow key={row.metric} hover>
                      <TableCell><Typography variant="body2">{row.metric}</Typography></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {typeof row.yours === 'number' && row.yours < 10 ? row.yours : Number(row.yours).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {typeof row.avg === 'number' && row.avg < 10 ? row.avg : Number(row.avg).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'success.main' }}>
                        {typeof row.best === 'number' && row.best < 10 ? row.best : Number(row.best).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={row.pct}
                            color={pctBadge(row.pct)} sx={{ width: 60, height: 6, borderRadius: 1 }} />
                          <Typography variant="caption">{row.pct}th</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={row.status === 'above_average' ? 'Above Avg' : 'Below Avg'} size="small"
                              color={row.status === 'above_average' ? 'success' : 'warning'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Radar + Optimization Score */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Efficiency vs Industry</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="name" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar name="You" dataKey="you" stroke="#3b82d4" fill="#3b82d4" fillOpacity={0.4} />
                <Radar name="Industry" dataKey="avg" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>

          {cos && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Cost Optimization Score</Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                ['Your Score',      `${cos.your_score} / 100`],
                ['Industry Avg',    String(cos.industry_average)],
                ['Best-in-Class',   String(cos.best_in_class)],
                ['Your Grade',      cos.grade],
                ['Your Percentile', `${cos.percentile}th`],
              ].map(([k, v]) => (
                <Box key={k} display="flex" justifyContent="space-between" py={0.75} borderBottom="1px solid #e5e7eb">
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight="bold">{v}</Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Per-cluster benchmarks */}
      {data.cluster_benchmarks?.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Per-Cluster Benchmarks</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cluster</TableCell>
                  <TableCell>Environment</TableCell>
                  <TableCell align="right">Monthly Cost</TableCell>
                  <TableCell align="right">Cost / Pod</TableCell>
                  <TableCell>Efficiency</TableCell>
                  <TableCell>Waste</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.cluster_benchmarks.map((c: any) => (
                  <TableRow key={c.cluster} hover>
                    <TableCell><Typography variant="body2" fontWeight="medium">{c.cluster}</Typography></TableCell>
                    <TableCell>
                      <Chip label={c.environment} size="small"
                            color={c.environment === 'production' ? 'error' : c.environment === 'staging' ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(c.monthly_cost)}</TableCell>
                    <TableCell align="right">${c.cost_per_pod}</TableCell>
                    <TableCell>
                      <Chip label={`${c.efficiency_score}/100`} size="small"
                            color={c.efficiency_score >= 70 ? 'success' : c.efficiency_score >= 60 ? 'warning' : 'error'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={c.waste_percentage > 20 ? 'error.main' : 'text.secondary'}>
                        {c.waste_percentage}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Peer comparison */}
      {data.peer_comparison && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Peer Comparison</Typography>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.peer_comparison.map((p: any) => ({
              name: p.segment?.split(' ').slice(0,2).join(' ') ?? 'Peer',
              'Peer Avg': p.avg_monthly_cost,
              'Yours': p.your_cost,
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="Peer Avg" fill="#e5e7eb" />
              <Bar dataKey="Yours"    fill="#3b82d4" />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Improvement opportunities */}
      {data.improvement_opportunities?.map((o: any, i: number) => (
        <Alert key={i} severity="info" sx={{ mb: 1 }}>
          <strong>{o.metric}:</strong> Current {o.current} → Target {o.target} —{' '}
          Potential savings: {fmt(o.potential_savings)} · Actions: {o.actions?.join(', ')}
        </Alert>
      ))}
    </Box>
  );
};

export default FinancialBenchmarking;
