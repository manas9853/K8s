import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, LinearProgress,
  CircularProgress, Alert, IconButton
} from '@mui/material';
import { Refresh, CalendarToday, TrendingUp, AccountBalance } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface TrendItem { month: string; current_cost: number; optimized_cost: number; savings: number; }
interface CostData {
  current_monthly_cost: number; current_yearly_cost: number;
  optimized_monthly_cost: number; optimized_yearly_cost: number;
  monthly_savings: number; yearly_savings: number; savings_percent: number;
  trend_data: TrendItem[];
  savings_by_namespace: { name: string; savings: number; savings_percent: number }[];
}

const fmt  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

const AnnualSavings: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const [costRes, savRes, allocRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/finops/cost-management${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/cost-allocation${clusterParam}`),
      ]);
      if (!costRes.ok) throw new Error(`HTTP ${costRes.status}`);
      const [cost, sav, alloc] = await Promise.all([
        costRes.json(),
        savRes.ok   ? savRes.json()  : ({} as any),
        allocRes.ok ? allocRes.json() : ({} as any),
      ]);

      const monthly = cost.total_monthly_cost ?? 0;
      const annual  = cost.total_annual_cost  ?? monthly * 12;
      const savPot  = sav.total_savings?.monthly_potential ?? 0;

      // Build 6-month trend (same approach as finops cost_savings backend)
      const now = new Date();
      const trendData: TrendItem[] = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const factor = 1 + (5 - i) * 0.02;
        const mc = monthly * factor;
        const opt = (monthly - savPot) * factor;
        return { month: d.toLocaleString('default', { month: 'short', year: 'numeric' }), current_cost: mc, optimized_cost: opt, savings: mc - opt };
      });

      const byNs = (alloc.allocation_by_namespace ?? []).map((n: any) => ({
        name: n.namespace, savings: (n.cost ?? 0) * 0.3, savings_percent: 30,
      }));

      setData({
        current_monthly_cost:   monthly,
        current_yearly_cost:    annual,
        optimized_monthly_cost: monthly - savPot,
        optimized_yearly_cost:  (monthly - savPot) * 12,
        monthly_savings:  savPot,
        yearly_savings:   savPot * 12,
        savings_percent:  monthly > 0 ? (savPot / monthly) * 100 : 0,
        trend_data:       trendData,
        savings_by_namespace: byNs,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to fetch'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  if (error)   return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return null;

  // Quarterly breakdown from annual
  const qSavings  = data.yearly_savings / 4;
  const qCurrent  = data.current_yearly_cost / 4;
  const qOptimised = data.optimized_yearly_cost / 4;
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({
    quarter: q, current_cost: qCurrent, optimized_cost: qOptimised, savings: qSavings,
  }));

  // Cumulative monthly from trend data
  let cumulative = 0;
  const cumulative12 = data.trend_data.map(t => {
    cumulative += t.savings;
    return { ...t, cumulative };
  });

  // ROI (assume 10% of annual savings as implementation effort)
  const implCost = data.yearly_savings * 0.1;
  const payback  = data.monthly_savings > 0 ? implCost / data.monthly_savings : 0;
  const roi      = implCost > 0 ? ((data.yearly_savings - implCost) / implCost) * 100 : 0;

  const tooltipStyle = { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary };

  if (clusters.length === 0) return <NoClusterState />;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
      <CostAccuracyBanner clusterName={activeClusterId} />
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: colors.textPrimary, fontWeight: 700 }}>Annual Savings Projection</Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>12-month cost savings forecast and ROI analysis</Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: colors.success }}><Refresh /></IconButton>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Annual Savings', value: fmt(data.yearly_savings), sub: `${data.savings_percent.toFixed(1)}% reduction`, icon: <CalendarToday />, accent: colors.success },
          { label: 'Current Annual Cost',  value: fmt(data.current_yearly_cost),   sub: 'Before optimisation', icon: <AccountBalance />, accent: colors.danger },
          { label: 'Optimised Annual Cost',value: fmt(data.optimized_yearly_cost), sub: 'After optimisation',  icon: <TrendingUp />,    accent: colors.success },
          { label: 'Annual ROI',           value: `${roi.toFixed(0)}%`,            sub: `Payback: ${payback.toFixed(1)} months`, icon: <TrendingUp />, accent: colors.textPrimary },
        ].map(({ label, value, sub, icon, accent }) => (
          <Grid item xs={12} md={3} key={label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${accent}22` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ color: accent }}>{icon}</Box>
                  <Typography variant="body2" sx={{ color: colors.textSecondary, textTransform: 'uppercase', fontSize: 11 }}>{label}</Typography>
                </Box>
                <Typography variant="h4" sx={{ color: accent, fontWeight: 700 }}>{value}</Typography>
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ROI summary */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Investment & ROI Analysis</Typography>
        <Grid container spacing={3} textAlign="center">
          <Grid item xs={12} md={4}>
            <AccountBalance sx={{ fontSize: 40, color: colors.textSecondary, mb: 1 }} />
            <Typography variant="h5" sx={{ color: colors.textPrimary, fontWeight: 700 }}>{fmt(implCost)}</Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>Estimated Implementation Cost</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <CalendarToday sx={{ fontSize: 40, color: colors.success, mb: 1 }} />
            <Typography variant="h5" sx={{ color: colors.success, fontWeight: 700 }}>{payback.toFixed(1)} months</Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>Payback Period</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <TrendingUp sx={{ fontSize: 40, color: colors.success, mb: 1 }} />
            <Typography variant="h5" sx={{ color: colors.success, fontWeight: 700 }}>{roi.toFixed(0)}%</Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>Annual ROI</Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Quarterly bar chart */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Quarterly Savings Projection</Typography>
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={quarters} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="quarter" stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <YAxis tickFormatter={fmtK} stroke={colors.textSecondary} tick={{ fill: colors.textSecondary }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: colors.textSecondary }} />
              <Bar dataKey="current_cost"   fill={colors.danger} name="Current Cost" radius={[4,4,0,0]} />
              <Bar dataKey="optimized_cost" fill={colors.success} name="Optimised Cost" radius={[4,4,0,0]} />
              <Bar dataKey="savings"        fill={colors.textPrimary} name="Savings" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>

        {/* Table */}
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Quarter','Current Cost','Optimised Cost','Savings','Savings %'].map(h => (
                  <TableCell key={h} sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, textTransform: 'uppercase' }}
                    align={h === 'Quarter' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {quarters.map(q => (
                <TableRow key={q.quarter} sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                  <TableCell sx={{ borderColor: colors.border }}><Chip label={q.quarter} size="small" sx={{ bgcolor: colors.border, color: colors.textPrimary }} /></TableCell>
                  <TableCell align="right" sx={{ color: colors.danger, borderColor: colors.border }}>{fmt(q.current_cost)}</TableCell>
                  <TableCell align="right" sx={{ color: colors.success, borderColor: colors.border }}>{fmt(q.optimized_cost)}</TableCell>
                  <TableCell align="right" sx={{ borderColor: colors.border }}>
                    <Chip label={fmt(q.savings)} size="small" sx={{ bgcolor: colors.successBg, color: colors.success }} />
                  </TableCell>
                  <TableCell align="right" sx={{ color: colors.textSecondary, borderColor: colors.border }}>{data.savings_percent.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ bgcolor: colors.surfaceHover }}>
                <TableCell sx={{ color: colors.textPrimary, fontWeight: 700, borderColor: colors.border }}>Annual Total</TableCell>
                <TableCell align="right" sx={{ color: colors.danger, fontWeight: 700, borderColor: colors.border }}>{fmt(data.current_yearly_cost)}</TableCell>
                <TableCell align="right" sx={{ color: colors.success, fontWeight: 700, borderColor: colors.border }}>{fmt(data.optimized_yearly_cost)}</TableCell>
                <TableCell align="right" sx={{ borderColor: colors.border }}>
                  <Chip label={fmt(data.yearly_savings)} sx={{ bgcolor: colors.successBg, color: colors.success, fontWeight: 700 }} />
                </TableCell>
                <TableCell align="right" sx={{ color: colors.textPrimary, fontWeight: 700, borderColor: colors.border }}>{data.savings_percent.toFixed(1)}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Cumulative table */}
      <Paper sx={{ p: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" sx={{ color: colors.textPrimary, mb: 2 }}>Cumulative Savings Over 6 Months</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Month','Monthly Savings','Cumulative Savings','Progress'].map(h => (
                  <TableCell key={h} sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, textTransform: 'uppercase' }}
                    align={h === 'Month' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {cumulative12.map((m, i) => (
                <TableRow key={i} sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                  <TableCell sx={{ color: colors.textMuted, borderColor: colors.border }}>{m.month}</TableCell>
                  <TableCell align="right" sx={{ color: colors.success, borderColor: colors.border }}>{fmt(m.savings)}</TableCell>
                  <TableCell align="right" sx={{ color: colors.success, fontWeight: 700, borderColor: colors.border }}>{fmt(m.cumulative)}</TableCell>
                  <TableCell align="right" sx={{ borderColor: colors.border }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                      <LinearProgress variant="determinate"
                        value={data.yearly_savings > 0 ? Math.min((m.cumulative / data.yearly_savings) * 100, 100) : 0}
                        sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: colors.success } }} />
                      <Chip label={`${data.yearly_savings > 0 ? Math.min(((m.cumulative / data.yearly_savings) * 100), 100).toFixed(0) : 0}%`}
                        size="small" sx={{ bgcolor: i === cumulative12.length - 1 ? colors.successBg : colors.border, color: colors.success, fontSize: 11 }} />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default AnnualSavings;
