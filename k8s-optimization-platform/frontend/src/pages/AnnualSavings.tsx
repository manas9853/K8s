import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, LinearProgress,
  CircularProgress, Alert, IconButton
} from '@mui/material';
import { Refresh, CalendarToday, TrendingUp, AccountBalance } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';

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

  const tooltipStyle = { backgroundColor: '#1e2433', border: '1px solid #2a3245', color: '#e8eaf0' };

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
      <CostAccuracyBanner clusterName={activeClusterId} />
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700 }}>Annual Savings Projection</Typography>
          <Typography variant="body2" sx={{ color: '#8b95a9', mt: 0.5 }}>12-month cost savings forecast and ROI analysis</Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: '#4ade80' }}><Refresh /></IconButton>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Annual Savings', value: fmt(data.yearly_savings), sub: `${data.savings_percent.toFixed(1)}% reduction`, icon: <CalendarToday />, accent: '#4ade80' },
          { label: 'Current Annual Cost',  value: fmt(data.current_yearly_cost),   sub: 'Before optimisation', icon: <AccountBalance />, accent: '#f87171' },
          { label: 'Optimised Annual Cost',value: fmt(data.optimized_yearly_cost), sub: 'After optimisation',  icon: <TrendingUp />,    accent: '#4ade80' },
          { label: 'Annual ROI',           value: `${roi.toFixed(0)}%`,            sub: `Payback: ${payback.toFixed(1)} months`, icon: <TrendingUp />, accent: '#e8eaf0' },
        ].map(({ label, value, sub, icon, accent }) => (
          <Grid item xs={12} md={3} key={label}>
            <Card sx={{ bgcolor: '#1e2433', border: `1px solid ${accent}22` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ color: accent }}>{icon}</Box>
                  <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', fontSize: 11 }}>{label}</Typography>
                </Box>
                <Typography variant="h4" sx={{ color: accent, fontWeight: 700 }}>{value}</Typography>
                <Typography variant="body2" sx={{ color: '#8b95a9' }}>{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ROI summary */}
      <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Investment & ROI Analysis</Typography>
        <Grid container spacing={3} textAlign="center">
          <Grid item xs={12} md={4}>
            <AccountBalance sx={{ fontSize: 40, color: '#8b95a9', mb: 1 }} />
            <Typography variant="h5" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{fmt(implCost)}</Typography>
            <Typography variant="body2" sx={{ color: '#8b95a9' }}>Estimated Implementation Cost</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <CalendarToday sx={{ fontSize: 40, color: '#4ade80', mb: 1 }} />
            <Typography variant="h5" sx={{ color: '#4ade80', fontWeight: 700 }}>{payback.toFixed(1)} months</Typography>
            <Typography variant="body2" sx={{ color: '#8b95a9' }}>Payback Period</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <TrendingUp sx={{ fontSize: 40, color: '#4ade80', mb: 1 }} />
            <Typography variant="h5" sx={{ color: '#4ade80', fontWeight: 700 }}>{roi.toFixed(0)}%</Typography>
            <Typography variant="body2" sx={{ color: '#8b95a9' }}>Annual ROI</Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Quarterly bar chart */}
      <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Quarterly Savings Projection</Typography>
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={quarters} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3245" />
              <XAxis dataKey="quarter" stroke="#8b95a9" tick={{ fill: '#8b95a9' }} />
              <YAxis tickFormatter={fmtK} stroke="#8b95a9" tick={{ fill: '#8b95a9' }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: '#8b95a9' }} />
              <Bar dataKey="current_cost"   fill="#f87171" name="Current Cost" radius={[4,4,0,0]} />
              <Bar dataKey="optimized_cost" fill="#4ade80" name="Optimised Cost" radius={[4,4,0,0]} />
              <Bar dataKey="savings"        fill="#e8eaf0" name="Savings" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>

        {/* Table */}
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Quarter','Current Cost','Optimised Cost','Savings','Savings %'].map(h => (
                  <TableCell key={h} sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}
                    align={h === 'Quarter' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {quarters.map(q => (
                <TableRow key={q.quarter} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                  <TableCell sx={{ borderColor: '#2a3245' }}><Chip label={q.quarter} size="small" sx={{ bgcolor: '#2a3245', color: '#e8eaf0' }} /></TableCell>
                  <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(q.current_cost)}</TableCell>
                  <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(q.optimized_cost)}</TableCell>
                  <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                    <Chip label={fmt(q.savings)} size="small" sx={{ bgcolor: '#14532d', color: '#4ade80' }} />
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#8b95a9', borderColor: '#2a3245' }}>{data.savings_percent.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ bgcolor: '#252e42' }}>
                <TableCell sx={{ color: '#e8eaf0', fontWeight: 700, borderColor: '#2a3245' }}>Annual Total</TableCell>
                <TableCell align="right" sx={{ color: '#f87171', fontWeight: 700, borderColor: '#2a3245' }}>{fmt(data.current_yearly_cost)}</TableCell>
                <TableCell align="right" sx={{ color: '#4ade80', fontWeight: 700, borderColor: '#2a3245' }}>{fmt(data.optimized_yearly_cost)}</TableCell>
                <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                  <Chip label={fmt(data.yearly_savings)} sx={{ bgcolor: '#14532d', color: '#4ade80', fontWeight: 700 }} />
                </TableCell>
                <TableCell align="right" sx={{ color: '#e8eaf0', fontWeight: 700, borderColor: '#2a3245' }}>{data.savings_percent.toFixed(1)}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Cumulative table */}
      <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Cumulative Savings Over 6 Months</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Month','Monthly Savings','Cumulative Savings','Progress'].map(h => (
                  <TableCell key={h} sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}
                    align={h === 'Month' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {cumulative12.map((m, i) => (
                <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                  <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245' }}>{m.month}</TableCell>
                  <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(m.savings)}</TableCell>
                  <TableCell align="right" sx={{ color: '#4ade80', fontWeight: 700, borderColor: '#2a3245' }}>{fmt(m.cumulative)}</TableCell>
                  <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                      <LinearProgress variant="determinate"
                        value={data.yearly_savings > 0 ? Math.min((m.cumulative / data.yearly_savings) * 100, 100) : 0}
                        sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: '#2a3245', '& .MuiLinearProgress-bar': { bgcolor: '#4ade80' } }} />
                      <Chip label={`${data.yearly_savings > 0 ? Math.min(((m.cumulative / data.yearly_savings) * 100), 100).toFixed(0) : 0}%`}
                        size="small" sx={{ bgcolor: i === cumulative12.length - 1 ? '#14532d' : '#2a3245', color: '#4ade80', fontSize: 11 }} />
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
