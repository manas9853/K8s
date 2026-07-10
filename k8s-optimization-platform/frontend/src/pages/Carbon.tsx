import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, IconButton,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert,
} from '@mui/material';
import EnergySavingsLeafIcon from '@mui/icons-material/EnergySavingsLeaf';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import ClusterGuard from '../components/ClusterGuard';

// ── Design tokens ──────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN   = '#3fb950';
const AMBER   = '#d29922';
const RED     = '#f85149';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CarbonSummary {
  total_carbon_saved_kg: number; total_energy_saved_kwh: number; total_cost_saved: number;
  reduction_percentage: number; trees_equivalent: number; miles_not_driven: number;
  homes_powered: number; current_monthly_emissions_kg: number; optimized_monthly_emissions_kg: number;
}
interface CarbonTrend {
  month: string; carbon_kg: number; energy_kwh: number; cost_saved: number; optimizations_applied: number;
}
interface NamespaceCarbon {
  namespace: string; cluster: string; carbon_saved_kg: number; energy_saved_kwh: number;
  cost_saved: number; workload_count: number;
}

const tooltipStyle = { backgroundColor: DK.surface, border: `1px solid ${DK.border}`, color: DK.text, fontSize: 12 };

// ── Inner page (rendered inside ClusterGuard) ──────────────────────────────────
const CarbonInner: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [summary, setSummary]       = useState<CarbonSummary | null>(null);
  const [trends,  setTrends]        = useState<CarbonTrend[]>([]);
  const [nsRows,  setNsRows]        = useState<NamespaceCarbon[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error,   setError]         = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true); setError(null);
    try {
      const [sumRes, trendRes, nsRes, _impactRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/carbon/summary${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/carbon/trends${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/carbon/namespaces${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/carbon/impact${clusterParam}`),
      ]);
      if (!sumRes.ok || !trendRes.ok || !nsRes.ok) throw new Error('Failed to fetch carbon data');
      const [sumData, trendData, nsData] = await Promise.all([
        sumRes.json(), trendRes.json(), nsRes.json(),
      ]);
      setSummary(sumData);
      setTrends(Array.isArray(trendData) ? trendData : trendData.trends ?? []);
      setNsRows(
        (Array.isArray(nsData) ? nsData : nsData.namespaces ?? [])
          .slice()
          .sort((a: NamespaceCarbon, b: NamespaceCarbon) => b.carbon_saved_kg - a.carbon_saved_kg),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress sx={{ color: ACCENT }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;

  const totalNsCo2 = nsRows.reduce((s, r) => s + r.carbon_saved_kg, 0) || 1;

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <EnergySavingsLeafIcon sx={{ fontSize: 34, color: GREEN }} />
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ color: DK.text, lineHeight: 1.2 }}>
              Carbon Footprint
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted }}>{activeClusterName}</Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchAll} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Physics note ── */}
      <Chip
        label="📐 Physics-based calculation from CPU power consumption"
        size="small"
        sx={{ mb: 3, bgcolor: DK.surface2, color: DK.muted, border: `1px solid ${DK.border}`, fontSize: 11 }}
      />

      {/* ── KPI row ── */}
      {summary && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Current Monthly Emissions', value: `${summary.current_monthly_emissions_kg.toLocaleString()} kg`, sub: 'CO₂e', color: RED },
            { label: 'Potential w/ Optimization',  value: `${summary.optimized_monthly_emissions_kg.toLocaleString()} kg`, sub: 'CO₂e optimized', color: GREEN },
            { label: 'Reduction Possible',         value: `${summary.reduction_percentage}%`, sub: 'Savings potential', color: AMBER },
            { label: 'Trees Equivalent',           value: `${summary.trees_equivalent.toLocaleString()}`, sub: 'Trees saved/yr', color: GREEN },
          ].map(({ label, value, sub, color }) => (
            <Grid item xs={12} sm={6} md={3} key={label}>
              <Card sx={{ bgcolor: DK.surface, border: `1px solid ${color}33` }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="caption" sx={{ color: DK.muted, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.8 }}>
                    {label}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>{value}</Typography>
                  <Typography variant="caption" sx={{ color: DK.muted }}>{sub}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Environmental equivalents ── */}
      {summary && (
        <Box display="flex" gap={2} flexWrap="wrap" mb={3}>
          {[
            { emoji: '🌳', label: 'Trees Planted', value: summary.trees_equivalent.toLocaleString() },
            { emoji: '🚗', label: 'Miles Not Driven', value: summary.miles_not_driven.toLocaleString() },
            { emoji: '🏠', label: 'Homes Powered',   value: summary.homes_powered.toLocaleString() },
          ].map(({ emoji, label, value }) => (
            <Box key={label} sx={{
              bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 2,
              px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
            }}>
              <Typography sx={{ fontSize: 24 }}>{emoji}</Typography>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: DK.text, lineHeight: 1.1 }}>{value}</Typography>
                <Typography variant="caption" sx={{ color: DK.muted }}>{label}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Trends AreaChart ── */}
      {trends.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Carbon Trend (kg CO₂e / month)
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trends} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
              <XAxis dataKey="month" stroke={DK.muted} tick={{ fill: DK.muted, fontSize: 11 }} />
              <YAxis stroke={DK.muted} tick={{ fill: DK.muted, fontSize: 11 }} tickFormatter={(v: number) => `${v} kg`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} kg`, 'Carbon']} />
              <Area type="monotone" dataKey="carbon_kg" stroke={RED} strokeWidth={2}
                fill={`${RED}33`} fillOpacity={1} name="Carbon kg" />
            </AreaChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* ── Namespace carbon table ── */}
      {nsRows.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Carbon by Namespace
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Namespace', 'CO₂ Saved (kg)', 'Energy (kWh)', 'Workloads', 'Share'].map(h => (
                    <TableCell key={h} sx={{ color: DK.muted, borderColor: DK.border, fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {nsRows.map(row => {
                  const share = Math.min((row.carbon_saved_kg / totalNsCo2) * 100, 100);
                  return (
                    <TableRow key={`${row.cluster}-${row.namespace}`}
                      sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                      <TableCell sx={{ color: DK.text, borderColor: DK.border }}>
                        <Typography variant="body2" fontWeight={600}>{row.namespace}</Typography>
                        <Typography variant="caption" sx={{ color: DK.muted }}>{row.cluster}</Typography>
                      </TableCell>
                      <TableCell sx={{ color: RED, borderColor: DK.border, fontWeight: 600 }}>
                        {row.carbon_saved_kg.toFixed(1)}
                      </TableCell>
                      <TableCell sx={{ color: DK.text, borderColor: DK.border }}>
                        {row.energy_saved_kwh.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ borderColor: DK.border }}>
                        <Chip label={row.workload_count} size="small"
                          sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: 11 }} />
                      </TableCell>
                      <TableCell sx={{ borderColor: DK.border, minWidth: 140 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={share}
                            sx={{
                              flex: 1, height: 6, borderRadius: 1,
                              bgcolor: DK.border,
                              '& .MuiLinearProgress-bar': { bgcolor: RED },
                            }} />
                          <Typography variant="caption" sx={{ color: DK.muted, width: 34 }}>
                            {share.toFixed(0)}%
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Reduction opportunity box ── */}
      {summary && (
        <Paper sx={{ p: 3, bgcolor: DK.surface2, border: `1px solid ${GREEN}44`, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Reduction Opportunity
          </Typography>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={4} textAlign="center">
              <Typography variant="caption" sx={{ color: DK.muted, textTransform: 'uppercase', fontSize: 10 }}>
                Current Emissions
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: RED }}>
                {summary.current_monthly_emissions_kg.toLocaleString()} kg
              </Typography>
              <Typography variant="caption" sx={{ color: DK.muted }}>per month</Typography>
            </Grid>
            <Grid item xs={12} sm={4} textAlign="center">
              <Box sx={{ fontSize: 36, lineHeight: 1 }}>→</Box>
              <Chip
                label={`−${summary.reduction_percentage}% possible`}
                sx={{ bgcolor: `${GREEN}22`, color: GREEN, border: `1px solid ${GREEN}55`, mt: 0.5 }}
              />
            </Grid>
            <Grid item xs={12} sm={4} textAlign="center">
              <Typography variant="caption" sx={{ color: DK.muted, textTransform: 'uppercase', fontSize: 10 }}>
                Optimized Emissions
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: GREEN }}>
                {summary.optimized_monthly_emissions_kg.toLocaleString()} kg
              </Typography>
              <Typography variant="caption" sx={{ color: DK.muted }}>per month</Typography>
            </Grid>
          </Grid>
          <Box mt={2}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" sx={{ color: DK.muted }}>Savings potential</Typography>
              <Typography variant="caption" sx={{ color: GREEN }}>
                {(summary.current_monthly_emissions_kg - summary.optimized_monthly_emissions_kg).toFixed(1)} kg CO₂e/mo
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={summary.reduction_percentage}
              sx={{
                height: 8, borderRadius: 1, bgcolor: DK.border,
                '& .MuiLinearProgress-bar': { bgcolor: GREEN },
              }} />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

// ── Default export wrapped in ClusterGuard ─────────────────────────────────────
const Carbon: React.FC = () => (
  <ClusterGuard>
    <CarbonInner />
  </ClusterGuard>
);

export default Carbon;

// Made with Bob
