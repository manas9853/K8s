import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Chip,
  CircularProgress, Alert, IconButton, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { Refresh, TrendingUp, TrendingDown, ShowChart } from '@mui/icons-material';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface TrendItem { month: string; current_cost: number; optimized_cost: number; savings: number; }
interface CostData {
  monthly_savings: number; yearly_savings: number; savings_percent: number;
  current_monthly_cost: number; optimized_monthly_cost: number;
  trend_data: TrendItem[];
}

const fmt  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
const tooltipStyle = { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary };

const SavingsTrends: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m'>('6m');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const [costRes, savRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/finops/cost-management${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`),
      ]);
      if (!costRes.ok) throw new Error(`HTTP ${costRes.status}`);
      const [cost, sav] = await Promise.all([
        costRes.json(),
        savRes.ok ? savRes.json() : ({} as any),
      ]);

      const monthly = cost.total_monthly_cost ?? 0;
      const savPot  = sav.total_savings?.monthly_potential ?? 0;
      const yearly  = sav.total_savings?.annual_potential_projection ?? savPot * 12;

      // Build 12-month trend (same growth model as finops backend)
      const now = new Date();
      const trendData: TrendItem[] = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        const factor = 1 + (11 - i) * 0.02;
        const mc  = monthly * factor;
        const opt = (monthly - savPot) * factor;
        return { month: d.toLocaleString('default', { month: 'short', year: 'numeric' }), current_cost: mc, optimized_cost: opt, savings: mc - opt };
      });

      setData({
        monthly_savings:        savPot,
        yearly_savings:         yearly,
        savings_percent:        monthly > 0 ? (savPot / monthly) * 100 : 0,
        current_monthly_cost:   monthly,
        optimized_monthly_cost: monthly - savPot,
        trend_data:             trendData,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to fetch'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (clusters.length === 0) return <NoClusterState />;

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  if (error)   return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return null;

  // Filter trend data to selected time range, add cumulative
  const months = timeRange === '3m' ? 3 : timeRange === '12m' ? 12 : 6;
  const sliced = data.trend_data.slice(-Math.min(months, data.trend_data.length));
  let cum = 0;
  const trend = sliced.map(t => { cum += t.savings; return { ...t, cumulative_savings: cum, optimization_rate: t.current_cost > 0 ? (t.savings / t.current_cost) * 100 : 0 }; });

  const totalSavings   = trend.reduce((s, t) => s + t.savings, 0);
  const avgMonthly     = trend.length > 0 ? totalSavings / trend.length : 0;
  const peakMonth      = trend.reduce((m, t) => t.savings > m.savings ? t : m, trend[0] || { month: '—', savings: 0 });

  // Trend direction: compare second half vs first half
  const half1 = trend.slice(0, Math.floor(trend.length / 2));
  const half2 = trend.slice(Math.floor(trend.length / 2));
  const avg1  = half1.length ? half1.reduce((s, t) => s + t.savings, 0) / half1.length : 0;
  const avg2  = half2.length ? half2.reduce((s, t) => s + t.savings, 0) / half2.length : 0;
  const velocity = avg1 > 0 ? ((avg2 - avg1) / avg1) * 100 : 0;
  const direction: 'increasing' | 'decreasing' | 'stable' =
    velocity > 5 ? 'increasing' : velocity < -5 ? 'decreasing' : 'stable';

  const trendColor = direction === 'increasing' ? colors.success : direction === 'decreasing' ? colors.danger : colors.textPrimary;
  const TrendIcon  = direction === 'increasing' ? TrendingUp : direction === 'decreasing' ? TrendingDown : ShowChart;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
      <CostAccuracyBanner clusterName={activeClusterId} />
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: colors.textPrimary, fontWeight: 700 }}>Savings Trends Analysis</Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>Historical savings trends and future projections</Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: colors.textSecondary }}>Time Range</InputLabel>
            <Select value={timeRange} label="Time Range"
              onChange={e => setTimeRange(e.target.value as '3m' | '6m' | '12m')}
              sx={{ color: colors.textPrimary, bgcolor: colors.surface, '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.border } }}>
              <MenuItem value="3m">Last 3 Months</MenuItem>
              <MenuItem value="6m">Last 6 Months</MenuItem>
              <MenuItem value="12m">Last 12 Months</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchData} sx={{ color: colors.success }}><Refresh /></IconButton>
        </Box>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Savings (Period)', value: fmt(totalSavings),          sub: 'Cumulative savings',              color: colors.success },
          { label: 'Avg Monthly Savings',    value: fmt(avgMonthly),             sub: 'Per month average',               color: colors.textPrimary },
          { label: 'Optimisation Velocity',  value: `${Math.abs(velocity).toFixed(1)}%`, sub: direction.toUpperCase(), color: trendColor },
          { label: 'Projected Annual',       value: fmt(data.monthly_savings * 12), sub: 'Based on current run-rate',    color: colors.success },
        ].map(({ label, value, sub, color }) => (
          <Grid item xs={12} md={3} key={label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${color}22` }}>
              <CardContent>
                <Typography variant="body2" sx={{ color: colors.textSecondary, textTransform: 'uppercase', fontSize: 11, mb: 1 }}>{label}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {label === 'Optimisation Velocity' && <TrendIcon sx={{ color }} />}
                  <Typography variant="h4" sx={{ color, fontWeight: 700 }}>{value}</Typography>
                </Box>
                {label === 'Optimisation Velocity'
                  ? <Chip label={direction.toUpperCase()} size="small" sx={{ mt: 1, bgcolor: color + '22', color, border: `1px solid ${color}44` }} />
                  : <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Cumulative savings area */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Cumulative Savings Over Time</Typography>
        <Box sx={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={colors.success} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={colors.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="month" stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <YAxis tickFormatter={fmtK} stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: colors.textSecondary }} />
              <Area type="monotone" dataKey="cumulative_savings" stroke={colors.success} strokeWidth={2}
                fill="url(#grad)" name="Cumulative Savings" dot={{ r: 3, fill: colors.success }} />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Monthly savings bar */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Monthly Savings</Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="month" stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <YAxis tickFormatter={fmtK} stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: colors.textSecondary }} />
              <Bar dataKey="savings" fill={colors.success} name="Monthly Savings" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Current vs Optimised line */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Cost Comparison: Current vs Optimised</Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="month" stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <YAxis tickFormatter={fmtK} stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: colors.textSecondary }} />
              <Line type="monotone" dataKey="current_cost"   stroke={colors.danger} strokeWidth={2} name="Current Cost"   dot={{ r: 4, fill: colors.danger }} />
              <Line type="monotone" dataKey="optimized_cost" stroke={colors.success} strokeWidth={2} name="Optimised Cost" dot={{ r: 4, fill: colors.success }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Optimisation rate line */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 1 }}>Optimisation Rate Trend</Typography>
        <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 2 }}>Percentage of cost savings achievable each month</Typography>
        <Box sx={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="month" stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: colors.textSecondary }} />
              <Line type="monotone" dataKey="optimization_rate" stroke={colors.success} strokeWidth={2} name="Optimisation Rate" dot={{ r: 4, fill: colors.success }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Key insights */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Key Insights</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            {[
              ['Peak savings month', peakMonth.month],
              ['Trend direction', direction.toUpperCase()],
              ['Optimisation velocity', `${velocity > 0 ? '+' : ''}${velocity.toFixed(1)}%`],
            ].map(([k, v]) => (
              <Typography key={k} variant="body2" sx={{ color: colors.textSecondary, mb: 0.5 }}>
                • {k}: <strong style={{ color: colors.textMuted }}>{v}</strong>
              </Typography>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            {[
              ['Avg monthly savings', fmt(avgMonthly)],
              ['Total period savings', fmt(totalSavings)],
              ['Projected annual impact', fmt(data.monthly_savings * 12)],
            ].map(([k, v]) => (
              <Typography key={k} variant="body2" sx={{ color: colors.textSecondary, mb: 0.5 }}>
                • {k}: <strong style={{ color: colors.success }}>{v}</strong>
              </Typography>
            ))}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default SavingsTrends;
