import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Card, CardContent, IconButton, Tooltip,
} from '@mui/material';
import SavingsIcon from '@mui/icons-material/Savings';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
interface SavingsCategory {
  category: string;
  realized: number;
  potential: number;
  total_opportunity: number;
  completion_rate: number;
}

interface Initiative {
  initiative: string;
  realized_savings: number;
  implementation_date: string;
  roi: number;
  status: string;
}

interface SavingsData {
  total_savings: {
    monthly_realized: number;
    monthly_potential: number;
    ytd_realized: number;
    annual_potential_projection: number;
  };
  savings_by_category: SavingsCategory[];
  savings_timeline?: { month: string; realized: number; potential: number }[];
  top_savings_initiatives?: Initiative[];
  savings_by_team?: { team: string; realized: number; potential: number }[];
  optimization_rate?: number;
  cost_source: string;
  last_updated: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `$${n.toLocaleString()}`;
const clamp = (v: number, max: number) => max > 0 ? Math.min(100, Math.round((v / max) * 100)) : 0;

const statusColor = (s: string) =>
  s === 'completed' ? GREEN : s === 'in_progress' ? ACCENT : AMBER;

// ── KPI card ─────────────────────────────────────────────────────────────────
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

// ── Page ─────────────────────────────────────────────────────────────────────
const SavingsTrackerInner: React.FC = () => {
  const { activeClusterId, clusterParam } = useActiveCluster();
  const [data, setData]       = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load savings data');
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

  const ts   = data.total_savings;
  const cats = data.savings_by_category ?? [];
  const noData = ts.monthly_potential === 0;

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>
      {/* ── Header ── */}
      <Box display="flex" alignItems="center" mb={2} gap={1.5}>
        <SavingsIcon sx={{ fontSize: 34, color: GREEN }} />
        <Box flex={1}>
          <Typography sx={{ color: DK.text, fontSize: '1.55rem', fontWeight: 700, lineHeight: 1.2 }}>
            Savings Tracker
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            Realized vs potential savings from optimization efforts
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
        {data.optimization_rate !== undefined && (
          <Chip label={`${data.optimization_rate}% optimized`} size="small"
            sx={{ bgcolor: `${GREEN}1a`, color: GREEN, border: `1px solid ${GREEN}44`,
                  fontWeight: 700, fontSize: '0.72rem' }} />
        )}
      </Box>

      {/* ── Accuracy Banner ── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── No-data info box ── */}
      {noData && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: `${ACCENT}11`,
          border: `1px solid ${ACCENT}33`, borderRadius: 2, p: 2, mb: 3 }}>
          <InfoOutlinedIcon sx={{ color: ACCENT, fontSize: 20, mt: '1px', flexShrink: 0 }} />
          <Typography sx={{ color: DK.muted, fontSize: '0.82rem', lineHeight: 1.6 }}>
            Savings analysis requires right-sizing data.{' '}
            <span style={{ color: DK.text }}>The agent is collecting metrics</span> — check back shortly once
            enough utilization history has been gathered.
          </Typography>
        </Box>
      )}

      {/* ── KPI row ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Monthly Realized" value={fmt(ts.monthly_realized)} color={GREEN}
            sub="Savings already captured" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Monthly Potential" value={fmt(ts.monthly_potential)} color={AMBER}
            sub="Remaining opportunity" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Annual Projection" value={fmt(ts.annual_potential_projection)} color={ACCENT}
            sub="Full-year forecast" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            label="Optimization Rate"
            value={data.optimization_rate !== undefined ? `${data.optimization_rate}%` : '—'}
            color={data.optimization_rate !== undefined && data.optimization_rate >= 60 ? GREEN :
                   data.optimization_rate !== undefined && data.optimization_rate >= 30 ? AMBER : RED}
            sub="Realized ÷ total opportunity"
          />
        </Grid>
      </Grid>

      {/* ── Savings Opportunity cards ── */}
      {cats.length > 0 && (
        <Box mb={3}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
            Savings Opportunity
          </Typography>
          <Grid container spacing={2}>
            {cats.map((c) => {
              const realizedPct  = clamp(c.realized, c.total_opportunity);
              const potentialPct = clamp(c.realized + c.potential, c.total_opportunity);
              return (
                <Grid item xs={12} sm={6} lg={4} key={c.category}>
                  <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                      <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>
                        {c.category}
                      </Typography>
                      <Chip label={`${c.completion_rate}% done`} size="small"
                        sx={{ bgcolor: c.completion_rate >= 70 ? `${GREEN}1a` : `${AMBER}1a`,
                              color: c.completion_rate >= 70 ? GREEN : AMBER,
                              border: `1px solid ${c.completion_rate >= 70 ? GREEN : AMBER}44`,
                              fontSize: '0.68rem', fontWeight: 700, height: 20 }} />
                    </Box>
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography sx={{ color: GREEN, fontSize: '0.8rem', fontWeight: 600 }}>
                        {fmt(c.realized)} realized
                      </Typography>
                      <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
                        {fmt(c.potential)} remaining
                      </Typography>
                    </Box>
                    {/* Dual progress: amber total band, green realized on top */}
                    <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: DK.surface2, overflow: 'hidden' }}>
                      {/* amber: total (realized + potential) */}
                      <Box sx={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${potentialPct}%`, bgcolor: `${AMBER}55`, borderRadius: 4,
                        transition: 'width 0.5s ease',
                      }} />
                      {/* green: realized */}
                      <Box sx={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${realizedPct}%`, bgcolor: GREEN, borderRadius: 4,
                        transition: 'width 0.5s ease',
                      }} />
                    </Box>
                    <Box display="flex" justifyContent="space-between" mt={0.75}>
                      <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>
                        Total opportunity: {fmt(c.total_opportunity)}
                      </Typography>
                      <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>
                        {realizedPct}%
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ── Grouped BarChart: realized vs potential by category ── */}
      {cats.length > 0 && (
        <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, mb: 3 }}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
            Savings by Category
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cats} margin={{ top: 4, right: 16, bottom: 40, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
              <XAxis dataKey="category" tick={{ fill: DK.muted, fontSize: 11 }}
                angle={-30} textAnchor="end" interval={0} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fill: DK.muted, fontSize: 11 }} />
              <RTooltip
                contentStyle={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 8 }}
                labelStyle={{ color: DK.text, fontWeight: 600 }}
                formatter={(v: number) => fmt(v)}
              />
              <Legend wrapperStyle={{ color: DK.muted, fontSize: 12, paddingTop: 12 }} />
              <Bar dataKey="realized"  name="Realized"  fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="potential" name="Potential" fill={AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* ── Top Savings Initiatives table ── */}
      {(data.top_savings_initiatives?.length ?? 0) > 0 && (
        <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, mb: 3 }}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
            Top Savings Initiatives
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { color: DK.muted, fontWeight: 600, fontSize: '0.75rem',
                  borderBottom: `1px solid ${DK.border}`, bgcolor: DK.surface2 } }}>
                  <TableCell>Initiative</TableCell>
                  <TableCell align="right">Realized Savings</TableCell>
                  <TableCell align="right">ROI</TableCell>
                  <TableCell>Impl. Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.top_savings_initiatives!.map((ini, i) => (
                  <TableRow key={i} hover sx={{
                    '& td': { color: DK.text, borderBottom: `1px solid ${DK.border}`, fontSize: '0.82rem' },
                    '&:hover': { bgcolor: DK.surface2 },
                  }}>
                    <TableCell sx={{ fontWeight: 600 }}>{ini.initiative}</TableCell>
                    <TableCell align="right" sx={{ color: `${GREEN} !important`, fontWeight: 700 }}>
                      {fmt(ini.realized_savings)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700,
                      color: `${ini.roi >= 200 ? GREEN : ini.roi >= 100 ? ACCENT : AMBER} !important` }}>
                      {ini.roi}%
                    </TableCell>
                    <TableCell sx={{ color: `${DK.muted} !important` }}>{ini.implementation_date}</TableCell>
                    <TableCell>
                      <Chip label={ini.status.replace('_', ' ')} size="small" sx={{
                        bgcolor: `${statusColor(ini.status)}1a`,
                        color: statusColor(ini.status),
                        border: `1px solid ${statusColor(ini.status)}44`,
                        fontSize: '0.68rem', fontWeight: 700, height: 20,
                        textTransform: 'capitalize',
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Footer meta ── */}
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 1 }}>
        Source: {data.cost_source} · Last updated: {new Date(data.last_updated).toLocaleString()}
      </Typography>
    </Box>
  );
};

const SavingsTracker: React.FC = () => (
  <ClusterGuard>
    <SavingsTrackerInner />
  </ClusterGuard>
);

export default SavingsTracker;

// Made with Bob
