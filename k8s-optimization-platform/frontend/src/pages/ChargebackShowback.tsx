import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
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

const BREAKDOWN_COLORS = {
  Compute: ACCENT,
  Storage: AMBER,
  Network: GREEN,
  Other:   DK.muted,
};

// ── Types ────────────────────────────────────────────────────────────────────
interface TeamCharge {
  team: string;
  total_charge: number;
  breakdown: { compute: number; storage: number; network: number; other: number };
  budget?: number;
  variance?: number;
  status: string;
}

interface ChargebackData {
  report_type: string;
  billing_period: string;
  total_charges: number;
  cluster_count: number;
  team_charges: TeamCharge[];
  showback_insights: { team: string; insight: string; recommendation: string }[];
  cost_allocation_rules: { rule: string; coverage: number }[];
  billing_frequency: string;
  cost_source: string;
  accuracy: string;
  last_updated: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const statusChip = (status: string) => {
  if (status === 'over_budget')  return { label: 'Over Budget',  color: RED,   bg: '#f8514922' };
  if (status === 'under_budget') return { label: 'Under Budget', color: GREEN, bg: '#3fb95022' };
  return { label: status, color: DK.muted, bg: DK.surface2 };
};

const sx = {
  card: {
    bgcolor: DK.surface,
    border: `1px solid ${DK.border}`,
    borderRadius: 2,
    p: 2.5,
  },
  label: { color: DK.muted, fontSize: '0.75rem', fontWeight: 600, mb: 0.5, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  value: { color: DK.text, fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.2 },
};

// ── Inner page ───────────────────────────────────────────────────────────────
const ChargebackShowbackInner: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const [data, setData]       = useState<ChargebackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/finops/chargeback-showback${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
      <CircularProgress sx={{ color: ACCENT }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)  return null;

  const charges = data.team_charges ?? [];
  const chartData = charges.map((t) => ({
    team:    t.team.split(/[\s-]/)[0],
    Compute: t.breakdown.compute,
    Storage: t.breakdown.storage,
    Network: t.breakdown.network,
    Other:   t.breakdown.other,
  }));

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <ReceiptLongIcon sx={{ fontSize: 32, color: ACCENT }} />
        <Box flex={1}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1.45rem' }}>
            Chargeback &amp; Showback
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            Cost allocation by team · {data.cost_source}
          </Typography>
        </Box>
        <Chip
          label={data.billing_period}
          size="small"
          sx={{ bgcolor: `${ACCENT}22`, color: ACCENT, fontWeight: 600, border: `1px solid ${ACCENT}44` }}
        />
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} size="small" sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Cost accuracy banner ────────────────────────────────────────────── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Charges',    value: fmt(data.total_charges), color: ACCENT },
          { label: 'Teams',            value: String(charges.length),  color: DK.text },
          { label: 'Billing Period',   value: data.billing_period,     color: DK.text },
          { label: 'Accuracy',         value: data.accuracy,           color: GREEN  },
        ].map((k) => (
          <Grid item xs={12} sm={6} md={3} key={k.label}>
            <Box sx={sx.card}>
              <Typography sx={sx.label}>{k.label}</Typography>
              <Typography sx={{ ...sx.value, color: k.color }}>{k.value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── Team charge cards ──────────────────────────────────────────────── */}
      <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
        Team Charges
      </Typography>
      <Grid container spacing={2} mb={3}>
        {charges.map((t) => {
          const total = t.total_charge || 1;
          const chip  = statusChip(t.status);
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={t.team}>
              <Box sx={{ ...sx.card, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* team name + status */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.875rem', flex: 1, pr: 1 }}>
                    {t.team}
                  </Typography>
                  <Box sx={{ bgcolor: chip.bg, color: chip.color, border: `1px solid ${chip.color}44`,
                             borderRadius: 1, px: 1, py: 0.25, fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {chip.label}
                  </Box>
                </Box>
                {/* big number */}
                <Typography sx={{ color: ACCENT, fontWeight: 700, fontSize: '1.8rem', lineHeight: 1 }}>
                  {fmt(t.total_charge)}
                </Typography>
                {/* breakdown mini-bars */}
                {(['compute', 'storage', 'network', 'other'] as const).map((k) => {
                  const color = BREAKDOWN_COLORS[k.charAt(0).toUpperCase() + k.slice(1) as keyof typeof BREAKDOWN_COLORS];
                  const pct   = Math.round((t.breakdown[k] / total) * 100);
                  return (
                    <Box key={k}>
                      <Box display="flex" justifyContent="space-between" mb={0.25}>
                        <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'capitalize' }}>{k}</Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>{fmt(t.breakdown[k])}</Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 4, borderRadius: 2,
                          bgcolor: `${color}22`,
                          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 },
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* ── Stacked bar chart ──────────────────────────────────────────────── */}
      <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, mb: 3 }}>
        <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
          Cost Breakdown by Team
        </Typography>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
            <XAxis dataKey="team" tick={{ fill: DK.muted, fontSize: 11 }} axisLine={{ stroke: DK.border }} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: DK.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <RechartTooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              contentStyle={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 8, color: DK.text }}
              labelStyle={{ color: DK.text, fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
            <Bar dataKey="Compute" stackId="a" fill={BREAKDOWN_COLORS.Compute} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Storage" stackId="a" fill={BREAKDOWN_COLORS.Storage} />
            <Bar dataKey="Network" stackId="a" fill={BREAKDOWN_COLORS.Network} />
            <Bar dataKey="Other"   stackId="a" fill={BREAKDOWN_COLORS.Other}   radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      {/* ── Showback insights ──────────────────────────────────────────────── */}
      {data.showback_insights?.length > 0 && (
        <Box mb={3}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
            Showback Insights
          </Typography>
          <Grid container spacing={2}>
            {data.showback_insights.map((ins, i) => (
              <Grid item xs={12} md={6} key={i}>
                <Box sx={{
                  bgcolor: DK.surface, border: `1px solid ${DK.border}`,
                  borderLeft: `3px solid ${AMBER}`, borderRadius: 2, p: 2,
                }}>
                  <Typography sx={{ color: AMBER, fontWeight: 700, fontSize: '0.8rem', mb: 0.5 }}>
                    {ins.team}
                  </Typography>
                  <Typography sx={{ color: DK.text, fontSize: '0.875rem', mb: 0.75 }}>
                    {ins.insight}
                  </Typography>
                  <Typography sx={{ color: DK.muted, fontSize: '0.78rem', fontStyle: 'italic' }}>
                    → {ins.recommendation}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* ── Cost allocation rules ──────────────────────────────────────────── */}
      {data.cost_allocation_rules?.length > 0 && (
        <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3 }}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
            Cost Allocation Rules
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            {data.cost_allocation_rules.map((r, i) => (
              <Box key={i}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography sx={{ color: DK.text, fontSize: '0.875rem' }}>{r.rule}</Typography>
                  <Typography sx={{ color: ACCENT, fontWeight: 700, fontSize: '0.875rem' }}>{r.coverage}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={r.coverage}
                  sx={{
                    height: 6, borderRadius: 3,
                    bgcolor: `${ACCENT}18`,
                    '& .MuiLinearProgress-bar': { bgcolor: ACCENT, borderRadius: 3 },
                  }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
      )}

    </Box>
  );
};

// ── Export (wrapped with ClusterGuard) ───────────────────────────────────────
const ChargebackShowback: React.FC = () => (
  <ClusterGuard><ChargebackShowbackInner /></ClusterGuard>
);

export default ChargebackShowback;

// Made with Bob
