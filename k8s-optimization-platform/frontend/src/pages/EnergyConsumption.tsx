import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, IconButton,
  LinearProgress, Chip, CircularProgress, Alert, Divider,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import ClusterGuard from '../components/ClusterGuard';

// ── Design tokens ──────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT  = '#58a6ff';
const GREEN   = '#3fb950';
const AMBER   = '#d29922';
const RED     = '#f85149';
const PURPLE  = '#a371f7';

const WORKLOAD_COLORS: Record<string, string> = {
  compute: RED, memory: AMBER, storage: ACCENT, network: GREEN,
};
const PIE_FALLBACK = [RED, AMBER, ACCENT, GREEN, PURPLE];

// ── Types ──────────────────────────────────────────────────────────────────────
interface EnergyData {
  total_energy: { monthly_kwh: number; daily_average_kwh: number; ytd_kwh?: number; annual_projection_kwh: number };
  energy_by_cluster: { cluster: string; environment: string; region: string; kwh: number; percentage: number; efficiency_score?: number }[];
  energy_by_workload_type: { type: string; namespace?: string; kwh: number; percentage: number }[];
  energy_trend: { month: string; kwh: number; efficiency?: number }[];
  peak_usage: { daily_peak_hour: string; peak_kwh: number; off_peak_kwh?: number; peak_to_average_ratio?: number };
  energy_efficiency?: { pue: number; target_pue: number; cpu_utilization: number; memory_utilization: number; overall_efficiency_score: number };
  optimization_opportunities?: { opportunity: string; potential_savings_kwh: number; impact: string }[];
  renewable_energy?: { percentage: number; kwh?: number; target_percentage?: number; note?: string };
  last_updated: string;
}

const fmtKwh = (n: number) => `${Number(n).toLocaleString()} kWh`;
const tooltipStyle = { backgroundColor: DK.surface, border: `1px solid ${DK.border}`, color: DK.text, fontSize: 12 };

// ── Inner page ─────────────────────────────────────────────────────────────────
const EnergyConsumptionInner: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data,    setData]    = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/finops/energy-consumption${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress sx={{ color: AMBER }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)  return null;

  const { total_energy: te, energy_efficiency: ee, renewable_energy: re } = data;

  // Workload pie: map colours by type key
  const pieData = data.energy_by_workload_type ?? [];

  // Circular renewable indicator geometry (SVG-based, no canvas dep)
  const renewableAngle = ((re?.percentage ?? 0) / 100) * 360;
  const targetAngle    = ((re?.target_percentage ?? 30) / 100) * 360;

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BoltIcon sx={{ fontSize: 34, color: AMBER }} />
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ color: DK.text, lineHeight: 1.2 }}>
              Energy Consumption
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted }}>{activeClusterName}</Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Physics note ── */}
      <Chip
        label="⚡ Calculated from node CPU cores × 10W × 730h/mo × PUE 1.42"
        size="small"
        sx={{ mb: 3, bgcolor: DK.surface2, color: DK.muted, border: `1px solid ${DK.border}`, fontSize: 11 }}
      />

      {/* ── KPI row ── */}
      {te && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Monthly kWh',       value: fmtKwh(te.monthly_kwh),           color: AMBER },
            { label: 'Daily Average kWh', value: fmtKwh(te.daily_average_kwh),     color: ACCENT },
            { label: 'Annual Projection', value: fmtKwh(te.annual_projection_kwh), color: PURPLE },
            { label: 'PUE',               value: ee?.pue?.toFixed(2) ?? '—',       color: (ee?.pue ?? 1.4) < 1.4 ? GREEN : AMBER,
              sub: `target ${ee?.target_pue ?? 1.3}` },
          ].map(({ label, value, color, sub }) => (
            <Grid item xs={12} sm={6} md={3} key={label}>
              <Card sx={{ bgcolor: DK.surface, border: `1px solid ${color}33` }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="caption" sx={{ color: DK.muted, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.8 }}>
                    {label}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>{value}</Typography>
                  {sub && <Typography variant="caption" sx={{ color: DK.muted }}>{sub}</Typography>}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── ComposedChart: Energy trend ── */}
      {data.energy_trend?.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Energy Trend
          </Typography>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.energy_trend} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
              <XAxis dataKey="month" stroke={DK.muted} tick={{ fill: DK.muted, fontSize: 11 }} />
              <YAxis yAxisId="left" stroke={DK.muted} tick={{ fill: DK.muted, fontSize: 11 }}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
                stroke={DK.muted} tick={{ fill: DK.muted, fontSize: 11 }}
                tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
              <Bar  yAxisId="left"  dataKey="kwh"        fill={`${ACCENT}99`} name="kWh"           radius={[3,3,0,0]} />
              <Line yAxisId="right" dataKey="efficiency" stroke={GREEN}  strokeWidth={2.5} name="Efficiency %" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Paper>
      )}

      <Grid container spacing={3} mb={3}>
        {/* ── PieChart: By workload type ── */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, height: '100%' }}>
            <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
              Energy by Workload Type
            </Typography>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="kwh" nameKey="type"
                    cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                    label={({ type, percentage }) => `${type.split('-')[0]}: ${percentage}%`}
                    labelLine={false}>
                    {pieData.map((entry, i) => (
                      <Cell key={entry.type}
                        fill={WORKLOAD_COLORS[entry.type.toLowerCase()] ?? PIE_FALLBACK[i % PIE_FALLBACK.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtKwh(v), 'kWh']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Typography variant="body2" sx={{ color: DK.muted }}>No workload type data</Typography>
            )}
          </Paper>
        </Grid>

        {/* ── Efficiency gauges + Renewable ── */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
              Efficiency Gauges
            </Typography>
            {ee && (
              <Box display="flex" flexDirection="column" gap={2}>
                {/* CPU utilisation */}
                <Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" sx={{ color: DK.muted }}>CPU Utilization</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ color: DK.text }}>
                      {ee.cpu_utilization}%
                      <Typography component="span" variant="caption" sx={{ color: DK.muted, ml: 0.5 }}>
                        target 70%
                      </Typography>
                    </Typography>
                  </Box>
                  <Box position="relative">
                    <LinearProgress variant="determinate" value={Math.min(ee.cpu_utilization, 100)}
                      sx={{
                        height: 10, borderRadius: 1, bgcolor: DK.border,
                        '& .MuiLinearProgress-bar': {
                          bgcolor: ee.cpu_utilization >= 70 ? GREEN : AMBER,
                        },
                      }} />
                    {/* target marker at 70% */}
                    <Box sx={{
                      position: 'absolute', top: -2, left: '70%',
                      width: 2, height: 14, bgcolor: DK.text, borderRadius: 1,
                    }} />
                  </Box>
                </Box>
                {/* Memory utilisation */}
                <Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" sx={{ color: DK.muted }}>Memory Utilization</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ color: DK.text }}>
                      {ee.memory_utilization}%
                      <Typography component="span" variant="caption" sx={{ color: DK.muted, ml: 0.5 }}>
                        target 75%
                      </Typography>
                    </Typography>
                  </Box>
                  <Box position="relative">
                    <LinearProgress variant="determinate" value={Math.min(ee.memory_utilization, 100)}
                      sx={{
                        height: 10, borderRadius: 1, bgcolor: DK.border,
                        '& .MuiLinearProgress-bar': {
                          bgcolor: ee.memory_utilization >= 75 ? GREEN : AMBER,
                        },
                      }} />
                    <Box sx={{
                      position: 'absolute', top: -2, left: '75%',
                      width: 2, height: 14, bgcolor: DK.text, borderRadius: 1,
                    }} />
                  </Box>
                </Box>
                <Divider sx={{ borderColor: DK.border }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: DK.muted }}>Overall Efficiency Score</Typography>
                  <Chip label={`${ee.overall_efficiency_score}/100`} size="small"
                    sx={{
                      bgcolor: ee.overall_efficiency_score >= 75 ? `${GREEN}22` : `${AMBER}22`,
                      color: ee.overall_efficiency_score >= 75 ? GREEN : AMBER,
                      border: `1px solid ${ee.overall_efficiency_score >= 75 ? GREEN : AMBER}55`,
                    }} />
                </Box>
              </Box>
            )}
          </Paper>

          {/* ── Renewable energy ── */}
          {re && (() => {
            const renPct = re.percentage ?? 0;
            const tgtPct = re.target_percentage ?? 30;
            const renKwh = re.kwh ?? 0;
            return (
              <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
                <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
                  Renewable Energy
                </Typography>
                <Box display="flex" alignItems="center" gap={3}>
                  {/* SVG circular indicator */}
                  <Box sx={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="35" fill="none" stroke={DK.border} strokeWidth="8" />
                      <circle cx="45" cy="45" r="35" fill="none"
                        stroke={renPct >= tgtPct ? GREEN : AMBER}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(renPct / 100) * 219.9} 219.9`}
                        transform="rotate(-90 45 45)" />
                      <circle cx="45" cy="45" r="35" fill="none"
                        stroke={`${DK.text}33`} strokeWidth="2" strokeLinecap="round"
                        strokeDasharray={`${(tgtPct / 100) * 219.9} 219.9`}
                        transform="rotate(-90 45 45)" />
                    </svg>
                    <Box sx={{
                      position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Typography variant="caption" fontWeight={700}
                        sx={{ color: renPct >= tgtPct ? GREEN : AMBER }}>
                        {renPct}%
                      </Typography>
                    </Box>
                  </Box>
                  <Box flex={1}>
                    <Typography variant="body2" sx={{ color: DK.text }}>
                      {Number(renKwh).toLocaleString()} kWh from renewables
                    </Typography>
                    <Typography variant="caption" sx={{ color: DK.muted, display: 'block', mt: 0.5 }}>
                      Target: {tgtPct}% renewable
                    </Typography>
                    <LinearProgress variant="determinate"
                      value={Math.min(tgtPct > 0 ? (renPct / tgtPct) * 100 : 0, 100)}
                      sx={{
                        mt: 1.5, height: 6, borderRadius: 1, bgcolor: DK.border,
                        '& .MuiLinearProgress-bar': {
                          bgcolor: renPct >= tgtPct ? GREEN : AMBER,
                        },
                      }} />
                    <Typography variant="caption" sx={{ color: DK.muted }}>
                      {renPct >= tgtPct ? '✅ Target met' : `${(tgtPct - renPct).toFixed(0)}% to target`}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            );
          })()}
        </Grid>
      </Grid>

      {/* ── Optimization opportunities ── */}
      {(data.optimization_opportunities?.length ?? 0) > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Optimization Opportunities
          </Typography>
          <Box display="flex" flexDirection="column" gap={1.5}>
            {(data.optimization_opportunities ?? []).map((o, i) => {
              const high = o.impact?.toLowerCase() === 'high';
              return (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  p: 2, borderRadius: 1,
                  bgcolor: high ? `${RED}0d` : `${AMBER}0d`,
                  border: `1px solid ${high ? RED : AMBER}33`,
                }}>
                  <Typography variant="body2" sx={{ color: DK.text, flex: 1, pr: 2 }}>
                    {o.opportunity}
                  </Typography>
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    <Chip label={`Save ${Number(o.potential_savings_kwh).toLocaleString()} kWh/mo`}
                      size="small"
                      sx={{ bgcolor: DK.surface2, color: GREEN, border: `1px solid ${GREEN}44`, fontSize: 11 }} />
                    <Chip label={o.impact} size="small"
                      sx={{
                        bgcolor: high ? `${RED}22` : `${AMBER}22`,
                        color: high ? RED : AMBER,
                        border: `1px solid ${high ? RED : AMBER}55`,
                        fontSize: 11,
                      }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

// ── Default export wrapped in ClusterGuard ─────────────────────────────────────
const EnergyConsumption: React.FC = () => (
  <ClusterGuard>
    <EnergyConsumptionInner />
  </ClusterGuard>
);

export default EnergyConsumption;

// Made with Bob
