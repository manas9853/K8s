import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Card, CardContent, IconButton, Tooltip,
} from '@mui/material';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';

// ── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';

// ── Types ────────────────────────────────────────────────────────────────────
interface BenchmarkMetric {
  your_value: number;
  industry_average: number;
  best_in_class: number;
  percentile: number;
  status: string;
}

interface BenchmarkData {
  your_metrics: {
    cost_per_pod_per_month: number;
    cost_per_cpu_core_per_month: number;
    cost_per_gb_memory_per_month: number;
    cost_per_gb_storage_per_month: number;
    total_monthly_cost: number;
    cluster_count: number;
    pod_count: number;
  };
  industry_benchmarks: {
    cost_per_pod_per_month: BenchmarkMetric;
    cost_per_cpu_core_per_month: BenchmarkMetric;
    cost_per_gb_memory_per_month: BenchmarkMetric;
    cost_per_gb_storage_per_month: BenchmarkMetric;
  };
  cluster_benchmarks?: any[];
  cost_source: string;
  accuracy: string;
  last_updated: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDollar = (n: number, decimals = 2) =>
  n >= 1000 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` :
  `$${n.toFixed(decimals)}`;

const pctColor = (p: number) => p >= 70 ? GREEN : p >= 50 ? AMBER : RED;
const statusAccentColor = (s: string) => s === 'above_average' ? GREEN : AMBER;

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string; color: string; sub?: string }> = ({ label, value, color, sub }) => (
  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, height: '100%' }}>
    <CardContent sx={{ pb: '12px !important' }}>
      <Typography sx={{ color: DK.muted, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
      <Typography sx={{ color, fontSize: '1.75rem', fontWeight: 700, mt: 0.5, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ── Benchmark comparison card ─────────────────────────────────────────────────
const BenchmarkCard: React.FC<{ label: string; metric: BenchmarkMetric }> = ({ label, metric }) => {
  const { your_value, industry_average, best_in_class, percentile, status } = metric;
  const valueColor = statusAccentColor(status);
  const barColor   = pctColor(percentile);

  return (
    <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, height: '100%' }}>
      {/* Metric name */}
      <Typography sx={{ color: DK.muted, fontSize: '0.73rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.06em', mb: 1 }}>
        {label}
      </Typography>

      {/* Your value */}
      <Typography sx={{ color: valueColor, fontSize: '1.9rem', fontWeight: 700, lineHeight: 1.15, mb: 0.5 }}>
        {fmtDollar(your_value)}
      </Typography>

      {/* Industry / Best-in-class */}
      <Box display="flex" gap={2.5} mb={1.75}>
        <Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>Industry avg</Typography>
          <Typography sx={{ color: DK.text, fontSize: '0.82rem', fontWeight: 600 }}>{fmtDollar(industry_average)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>Best-in-class</Typography>
          <Typography sx={{ color: GREEN, fontSize: '0.82rem', fontWeight: 600 }}>{fmtDollar(best_in_class)}</Typography>
        </Box>
      </Box>

      {/* Percentile bar */}
      <Box>
        <Box display="flex" justifyContent="space-between" mb={0.5}>
          <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>Percentile position</Typography>
          <Typography sx={{ color: barColor, fontSize: '0.68rem', fontWeight: 700 }}>{percentile}th</Typography>
        </Box>
        <Box sx={{ position: 'relative', height: 6, bgcolor: DK.surface2, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(percentile, 100)}%`, bgcolor: barColor,
            borderRadius: 3, transition: 'width 0.5s ease',
          }} />
        </Box>
        <Box display="flex" justifyContent="space-between" mt={0.4}>
          <Typography sx={{ color: DK.muted, fontSize: '0.62rem' }}>0</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.62rem' }}>100</Typography>
        </Box>
      </Box>

      {/* Status chip */}
      <Box mt={1.25}>
        <Chip
          label={status === 'above_average' ? 'Above Average' : 'Below Average'}
          size="small"
          sx={{
            bgcolor: `${valueColor}1a`, color: valueColor,
            border: `1px solid ${valueColor}44`,
            fontSize: '0.68rem', fontWeight: 700, height: 20,
          }}
        />
      </Box>
    </Paper>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const FinancialBenchmarkingInner: React.FC = () => {
  const { activeClusterId, clusterParam } = useActiveCluster();
  const [data, setData]       = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/finops/financial-benchmarking${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load benchmarking data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
      <CircularProgress sx={{ color: ACCENT }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)  return null;

  const ym = data.your_metrics;
  const ib = data.industry_benchmarks;

  // ── Radar normalization: 100 = best_in_class value ───────────────────────
  // For cost metrics, lower is better, so score = best_in_class / your_value * 100 (capped 100)
  const normalize = (your: number, best: number) =>
    best > 0 ? Math.min(100, Math.round((best / your) * 100)) : 0;
  const normAvg = (avg: number, best: number) =>
    best > 0 ? Math.min(100, Math.round((best / avg) * 100)) : 0;

  const radarData = [
    {
      subject: 'Cost/Pod',
      You:      normalize(ib.cost_per_pod_per_month.your_value,       ib.cost_per_pod_per_month.best_in_class),
      Industry: normAvg(ib.cost_per_pod_per_month.industry_average,   ib.cost_per_pod_per_month.best_in_class),
      Best:     100,
    },
    {
      subject: 'Cost/CPU',
      You:      normalize(ib.cost_per_cpu_core_per_month.your_value,   ib.cost_per_cpu_core_per_month.best_in_class),
      Industry: normAvg(ib.cost_per_cpu_core_per_month.industry_average, ib.cost_per_cpu_core_per_month.best_in_class),
      Best:     100,
    },
    {
      subject: 'Cost/GB Mem',
      You:      normalize(ib.cost_per_gb_memory_per_month.your_value,  ib.cost_per_gb_memory_per_month.best_in_class),
      Industry: normAvg(ib.cost_per_gb_memory_per_month.industry_average, ib.cost_per_gb_memory_per_month.best_in_class),
      Best:     100,
    },
    {
      subject: 'Cost/GB Storage',
      You:      normalize(ib.cost_per_gb_storage_per_month.your_value, ib.cost_per_gb_storage_per_month.best_in_class),
      Industry: normAvg(ib.cost_per_gb_storage_per_month.industry_average, ib.cost_per_gb_storage_per_month.best_in_class),
      Best:     100,
    },
  ];

  const METRIC_LABELS: Record<string, string> = {
    cost_per_pod_per_month:        'Cost / Pod / Month',
    cost_per_cpu_core_per_month:   'Cost / CPU Core / Month',
    cost_per_gb_memory_per_month:  'Cost / GB Memory / Month',
    cost_per_gb_storage_per_month: 'Cost / GB Storage / Month',
  };

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>
      {/* ── Header ── */}
      <Box display="flex" alignItems="center" mb={2} gap={1.5}>
        <LeaderboardIcon sx={{ fontSize: 34, color: ACCENT }} />
        <Box flex={1}>
          <Typography sx={{ color: DK.text, fontSize: '1.55rem', fontWeight: 700, lineHeight: 1.2 }}>
            Financial Benchmarking
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            Compare your Kubernetes unit economics against industry peers
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={() => fetchData(true)} size="small" disabled={refreshing}
              sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
              <RefreshIcon sx={{ fontSize: 20, animation: refreshing ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* ── Accuracy Banner ── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── Your Cluster Stats KPI row ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Total Monthly Cost" value={fmtDollar(ym.total_monthly_cost, 0)}
            color={ACCENT} sub={`${ym.cluster_count} cluster${ym.cluster_count !== 1 ? 's' : ''}`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Pod Count" value={ym.pod_count.toLocaleString()}
            color={DK.text} sub="Running pods" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Cost / Pod" value={fmtDollar(ym.cost_per_pod_per_month)}
            color={statusAccentColor(ib.cost_per_pod_per_month.status)} sub="Per month" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Cost / CPU Core" value={fmtDollar(ym.cost_per_cpu_core_per_month)}
            color={statusAccentColor(ib.cost_per_cpu_core_per_month.status)} sub="Per month" />
        </Grid>
      </Grid>

      {/* ── 2×2 Benchmark Cards ── */}
      <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
        Industry Comparison
      </Typography>
      <Grid container spacing={2} mb={3}>
        {(Object.keys(ib) as Array<keyof typeof ib>).map((key) => (
          <Grid item xs={12} sm={6} key={key}>
            <BenchmarkCard label={METRIC_LABELS[key] ?? key} metric={ib[key]} />
          </Grid>
        ))}
      </Grid>

      {/* ── RadarChart ── */}
      <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, mb: 3 }}>
        <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
          Benchmark Radar
        </Typography>
        <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 2 }}>
          Normalized to 0–100 (100 = best-in-class). Higher = more efficient spend.
        </Typography>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={radarData} margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
            <PolarGrid stroke={DK.border} />
            <PolarAngleAxis dataKey="subject" tick={{ fill: DK.muted, fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: DK.muted, fontSize: 10 }} />
            <Radar name="You" dataKey="You" stroke={ACCENT} fill={ACCENT} fillOpacity={0.2} strokeWidth={2} />
            <Radar name="Industry Avg" dataKey="Industry" stroke={AMBER} fill={AMBER} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
            <Radar name="Best-in-class" dataKey="Best" stroke={GREEN} fill="none" strokeWidth={1.5} strokeDasharray="6 3" />
            <RTooltip
              contentStyle={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 8 }}
              labelStyle={{ color: DK.text, fontWeight: 600 }}
              formatter={(v: number) => [`${v}`, undefined]}
            />
            <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </Paper>

      {/* ── Estimated accuracy note ── */}
      {data.accuracy === 'estimated' && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: `${AMBER}0d`,
          border: `1px solid ${AMBER}33`, borderRadius: 2, p: 2, mb: 2 }}>
          <InfoOutlinedIcon sx={{ color: AMBER, fontSize: 18, mt: '2px', flexShrink: 0 }} />
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem', lineHeight: 1.6 }}>
            Benchmarks compared against{' '}
            <span style={{ color: DK.text }}>on-demand public rates</span>. Connect your cloud account for
            accurate comparison against your actual spend — including Enterprise Agreement &amp; partner discounts.
          </Typography>
        </Box>
      )}

      {/* ── Footer meta ── */}
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 1 }}>
        Source: {data.cost_source} · Accuracy: {data.accuracy} · Last updated: {new Date(data.last_updated).toLocaleString()}
      </Typography>
    </Box>
  );
};

const FinancialBenchmarking: React.FC = () => (
  <ClusterGuard>
    <FinancialBenchmarkingInner />
  </ClusterGuard>
);

export default FinancialBenchmarking;

// Made with Bob
