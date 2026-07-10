import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Alert, IconButton,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import ClusterGuard from '../components/ClusterGuard';

// ─── Design tokens ───────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';

// ─── Types ───────────────────────────────────────────────────────────────────
interface HistoricalCost   { month: string; cost: number; growth_rate: number; }
interface ForecastPoint    { month: string; predicted_cost: number; confidence_interval_low: number; confidence_interval_high: number; confidence: number; }
interface BreakdownItem    { category: string; current_cost: number; forecast_12_months: number; growth_rate: number; }
interface ForecastAlert    { type: string; severity: string; message: string; recommended_action: string; }
interface CostForecastingData {
  current_monthly_cost: number;
  current_annual_cost:  number;
  historical_costs:     HistoricalCost[];
  forecast:             ForecastPoint[];
  cost_breakdown:       BreakdownItem[];
  alerts:               ForecastAlert[];
  forecast_accuracy:    number;
  cost_source:          string;
  accuracy:             string;
  data_from:            string;
  onboarding_date:      string;
  last_updated:         string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

const growthColor = (g: number) =>
  g <= 5 ? GREEN : g <= 15 ? AMBER : RED;

const severityColor = (s: string): string => {
  switch (s.toLowerCase()) {
    case 'critical': return RED;
    case 'high':     return RED;
    case 'warning':  return AMBER;
    default:         return ACCENT;
  }
};

const tooltipStyle = {
  backgroundColor: DK.surface2,
  border: `1px solid ${DK.border}`,
  color: DK.text,
  borderRadius: 6,
  fontSize: 12,
};

// ─── Main component ───────────────────────────────────────────────────────────
const CostForecastingInner: React.FC = () => {
  const { clusterParam, activeClusterId, activeClusterName } = useActiveCluster();
  const [data, setData]       = useState<CostForecastingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`${API_BASE_URL}/v1/finops/cost-forecasting${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"
        sx={{ bgcolor: DK.bg }}>
        <CircularProgress sx={{ color: ACCENT }} />
      </Box>
    );
  }
  if (error) return <Box p={3} sx={{ bgcolor: DK.bg }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return null;

  // Merge historical + forecast into a single chart dataset
  // historical rows carry `history`; forecast rows carry `forecast` + CI bands
  const lastHistoricalMonth = data.historical_costs.at(-1)?.month ?? '';
  const chartData = [
    ...data.historical_costs.map(h => ({
      month: h.month, history: h.cost,
      forecast: undefined as number | undefined,
      ci_low: undefined as number | undefined,
      ci_high: undefined as number | undefined,
    })),
    ...data.forecast.map(f => ({
      month: f.month, history: undefined as number | undefined,
      forecast: f.predicted_cost,
      ci_low:   f.confidence_interval_low,
      ci_high:  f.confidence_interval_high,
    })),
  ];

  const totalAllocated = data.cost_breakdown.reduce((s, r) => s + r.current_cost, 0);

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <TrendingUpIcon sx={{ color: ACCENT, fontSize: 32 }} />
          <Box>
            <Typography variant="h4" sx={{ color: DK.text, fontWeight: 700, lineHeight: 1.2 }}>
              Cost Forecasting
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted, mt: 0.25 }}>
              Predictive cost analysis · {activeClusterName}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Accuracy banner ─────────────────────────────────────────────────── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── Data-from info chip ─────────────────────────────────────────────── */}
      {data.data_from && (
        <Box display="flex" alignItems="center" gap={0.75} mb={2.5}>
          <InfoOutlinedIcon sx={{ color: ACCENT, fontSize: 15 }} />
          <Typography sx={{ color: ACCENT, fontSize: '0.75rem', fontWeight: 500 }}>
            Cost data available from {data.data_from} — no fabricated history before this date
          </Typography>
        </Box>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          {
            label: 'Current Monthly Cost',
            value: fmt(data.current_monthly_cost),
            sub:   'Live cluster spend',
            color: GREEN,
          },
          {
            label: 'Annual Projection',
            value: fmt(data.current_annual_cost),
            sub:   'At current run-rate',
            color: ACCENT,
          },
          {
            label: 'Forecast Accuracy',
            value: `${data.forecast_accuracy.toFixed(1)}%`,
            sub:   data.accuracy || 'Model confidence',
            color: data.forecast_accuracy >= 85 ? GREEN : data.forecast_accuracy >= 70 ? AMBER : RED,
          },
          {
            label: 'Data From',
            value: data.data_from || data.onboarding_date || '—',
            sub:   'First billing data point',
            color: DK.muted,
          },
        ].map(({ label, value, sub, color }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
              <CardContent sx={{ pb: '14px !important' }}>
                <Typography sx={{ color: DK.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                  {label}
                </Typography>
                <Typography sx={{ color, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.1 }}>
                  {value}
                </Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.5 }}>{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Combined history + forecast area chart ──────────────────────────── */}
      <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
        <Typography sx={{ color: DK.text, fontWeight: 600, mb: 2 }}>
          Historical Cost &amp; 12-Month Forecast
        </Typography>
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradHistory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={AMBER} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={AMBER} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
              <XAxis dataKey="month" stroke={DK.border} tick={{ fill: DK.muted, fontSize: 11 }} />
              <YAxis tickFormatter={fmtK} stroke={DK.border} tick={{ fill: DK.muted, fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
              {lastHistoricalMonth && (
                <ReferenceLine
                  x={lastHistoricalMonth}
                  stroke={DK.border}
                  strokeDasharray="4 4"
                  label={{ value: 'Today', fill: DK.muted, fontSize: 11 }}
                />
              )}
              <Area
                type="monotone" dataKey="history" name="Historical"
                stroke={ACCENT} strokeWidth={2}
                fill="url(#gradHistory)"
                connectNulls dot={false}
              />
              <Area
                type="monotone" dataKey="forecast" name="Forecast"
                stroke={AMBER} strokeWidth={2} strokeDasharray="5 4"
                fill="url(#gradForecast)"
                connectNulls dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* ── Cost breakdown table ─────────────────────────────────────────────── */}
      <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
        <Typography sx={{ color: DK.text, fontWeight: 600, mb: 2 }}>Cost Breakdown by Category</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Category', 'Current Cost', '12-Month Forecast', 'Growth Rate'].map(h => (
                  <TableCell key={h} sx={{ color: DK.muted, borderColor: DK.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    align={h === 'Category' ? 'left' : 'right'}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cost_breakdown.map((row, i) => {
                const share = totalAllocated > 0 ? (row.current_cost / totalAllocated) * 100 : 0;
                const gc    = growthColor(row.growth_rate);
                return (
                  <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                    <TableCell sx={{ borderColor: DK.border }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography sx={{ color: DK.text, fontSize: '0.85rem' }}>{row.category}</Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>({share.toFixed(0)}%)</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ color: DK.text, borderColor: DK.border, fontWeight: 500 }}>
                      {fmt(row.current_cost)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: ACCENT, borderColor: DK.border }}>
                      {fmt(row.forecast_12_months)}
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: DK.border }}>
                      <Chip
                        label={`${row.growth_rate >= 0 ? '+' : ''}${row.growth_rate.toFixed(1)}%`}
                        size="small"
                        sx={{ bgcolor: `${gc}22`, color: gc, border: `1px solid ${gc}55`, fontSize: '0.72rem', fontWeight: 700, height: 22 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {data.alerts?.length > 0 && (
        <Box>
          <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
            Forecast Alerts ({data.alerts.length})
          </Typography>
          <Grid container spacing={1.5}>
            {data.alerts.map((alert, i) => {
              const sc = severityColor(alert.severity);
              return (
                <Grid item xs={12} md={6} key={i}>
                  <Paper sx={{
                    p: 2, bgcolor: DK.surface, border: `1px solid ${sc}44`,
                    borderLeft: `3px solid ${sc}`,
                  }}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Chip
                        label={alert.severity.toUpperCase()}
                        size="small"
                        sx={{ bgcolor: `${sc}22`, color: sc, border: `1px solid ${sc}55`, fontSize: '0.65rem', fontWeight: 700, height: 18 }}
                      />
                      <Chip
                        label={alert.type}
                        size="small"
                        sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.65rem', height: 18 }}
                      />
                    </Box>
                    <Typography sx={{ color: DK.text, fontSize: '0.82rem', mb: 0.5 }}>{alert.message}</Typography>
                    <Typography sx={{ color: DK.muted, fontSize: '0.75rem', fontStyle: 'italic' }}>
                      → {alert.recommended_action}
                    </Typography>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

// ─── Default export with ClusterGuard ────────────────────────────────────────
const CostForecasting: React.FC = () => (
  <ClusterGuard>
    <CostForecastingInner />
  </ClusterGuard>
);

export default CostForecasting;

// Made with Bob
