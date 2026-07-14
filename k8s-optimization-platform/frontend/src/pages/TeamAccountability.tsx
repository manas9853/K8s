import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, CircularProgress, Alert, LinearProgress,
  IconButton, Tooltip, Tabs, Tab, Paper, Chip,
} from '@mui/material';
import GroupsIcon       from '@mui/icons-material/Groups';
import RefreshIcon      from '@mui/icons-material/Refresh';
import TrendingUpIcon   from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import EmojiEventsIcon  from '@mui/icons-material/EmojiEvents';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartTooltip, Legend, LineChart, Line,
} from 'recharts';
import { API_BASE_URL } from '../config/api';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import ClusterGuard from '../components/ClusterGuard';

// ── Design tokens (same as every other page) ─────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';

const sx = {
  card: {
    bgcolor: DK.surface,
    border: `1px solid ${DK.border}`,
    borderRadius: 2,
    p: 2.5,
  },
  label: {
    color: DK.muted, fontSize: '0.72rem', fontWeight: 600,
    textTransform: 'uppercase' as const, letterSpacing: 0.5, mb: 0.5,
  },
  value: { color: DK.text, fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.2 },
};

const fmt = (n: number | undefined | null) => {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamCost {
  team_name: string;
  total_cost: number;
  waste: number;
  potential_savings: number;
  efficiency_score: number;
  resource_count: number;
  namespace_count: number;
  top_namespace: string;
  top_namespace_cost: number;
  trend: string;
  monthly_change: number;
}

interface TeamDetails {
  team_name: string;
  total_cost: number;
  waste: number;
  potential_savings: number;
  efficiency_score: number;
  namespaces: Array<{ namespace: string; cost: number; waste: number; pod_count: number; efficiency_score: number }>;
  cost_trend: Array<{ month: string; cost: number }>;
  recommendations: string[];
}

interface Leaderboard {
  by_efficiency: Array<{ team: string; score: number; cost: number }>;
  by_savings:    Array<{ team: string; savings: number; cost: number }>;
  by_waste:      Array<{ team: string; waste: number; waste_percentage: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const effColor = (s: number) => s >= 85 ? GREEN : s >= 70 ? ACCENT : s >= 55 ? AMBER : RED;

const TrendIcon: React.FC<{ trend: string }> = ({ trend }) => {
  if (trend === 'increasing') return <TrendingUpIcon sx={{ fontSize: 16, color: RED }} />;
  if (trend === 'decreasing') return <TrendingDownIcon sx={{ fontSize: 16, color: GREEN }} />;
  return <TrendingFlatIcon sx={{ fontSize: 16, color: DK.muted }} />;
};

const chartStyle = {
  grid:    { strokeDasharray: '3 3', stroke: DK.border },
  axis:    { tick: { fill: DK.muted, fontSize: 11 }, axisLine: false, tickLine: false },
  tooltip: { contentStyle: { background: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 8, color: DK.text }, labelStyle: { color: DK.text } },
};

// ── Inner page ────────────────────────────────────────────────────────────────
const TeamAccountabilityInner: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const [teams,       setTeams]       = useState<TeamCost[]>([]);
  const [selected,    setSelected]    = useState<string | null>(null);
  const [details,     setDetails]     = useState<TeamDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [tab,         setTab]         = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, lbRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/team-accountability/teams${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/team-accountability/leaderboard${clusterParam}`),
      ]);
      if (!teamsRes.ok) throw new Error(`Teams API: HTTP ${teamsRes.status}`);
      if (!lbRes.ok)    throw new Error(`Leaderboard API: HTTP ${lbRes.status}`);

      const t: TeamCost[] = await teamsRes.json();
      setTeams(t);
      setLeaderboard(await lbRes.json());
      if (t.length > 0 && !selected) setSelected(t[0].team_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  const fetchDetails = useCallback(async (teamName: string) => {
    try {
      const r = await fetch(
        `${API_BASE_URL}/v1/team-accountability/teams/${encodeURIComponent(teamName)}${clusterParam}`
      );
      if (r.ok) setDetails(await r.json());
    } catch { /* non-critical */ }
  }, [clusterParam]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (selected) fetchDetails(selected); }, [selected, fetchDetails]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
      <CircularProgress sx={{ color: ACCENT }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;

  const totalCost    = teams.reduce((s, t) => s + t.total_cost,         0);
  const totalWaste   = teams.reduce((s, t) => s + t.waste,              0);
  const totalSavings = teams.reduce((s, t) => s + t.potential_savings,  0);
  const avgEff       = teams.length > 0
    ? Math.round(teams.reduce((s, t) => s + t.efficiency_score, 0) / teams.length)
    : 0;

  const wasteBarData = teams.map(t => ({
    team:    t.team_name,
    Cost:    t.total_cost,
    Waste:   t.waste,
    Savings: t.potential_savings,
  }));

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <GroupsIcon sx={{ fontSize: 32, color: ACCENT }} />
        <Box flex={1}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1.45rem' }}>
            Team Cost Accountability
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            Real spend, waste &amp; savings per team — derived from namespace labels
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchAll} size="small" sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Cost',        value: fmt(totalCost),                        color: ACCENT },
          { label: 'Total Waste',       value: fmt(totalWaste),                       color: RED   },
          { label: 'Potential Savings', value: fmt(totalSavings),                     color: GREEN },
          { label: 'Avg Efficiency',    value: `${avgEff}/100`,                       color: DK.text },
        ].map(k => (
          <Grid item xs={12} sm={6} md={3} key={k.label}>
            <Box sx={sx.card}>
              <Typography sx={sx.label}>{k.label}</Typography>
              <Typography sx={{ ...sx.value, color: k.color }}>{k.value}</Typography>
              {k.label === 'Total Waste' && totalCost > 0 && (
                <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.5 }}>
                  {((totalWaste / totalCost) * 100).toFixed(1)}% of spend
                </Typography>
              )}
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── Team table + Cost/Waste bar chart ──────────────────────────────── */}
      <Grid container spacing={2} mb={3}>

        {/* Team table */}
        <Grid item xs={12} lg={7}>
          <Box sx={sx.card}>
            <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
              Team Breakdown
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Team', 'Cost', 'Waste', 'Savings', 'Efficiency', 'Trend'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Team' ? 'left' : 'right', padding: '6px 10px',
                        color: DK.muted, fontSize: '0.72rem', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        borderBottom: `1px solid ${DK.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map(t => (
                    <tr
                      key={t.team_name}
                      onClick={() => setSelected(t.team_name)}
                      style={{
                        cursor: 'pointer',
                        background: selected === t.team_name ? `${ACCENT}12` : 'transparent',
                        borderBottom: `1px solid ${DK.border}`,
                      }}
                    >
                      <td style={{ padding: '8px 10px' }}>
                        <Typography sx={{ color: DK.text, fontSize: '0.875rem', fontWeight: 600 }}>
                          {t.team_name}
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                          {t.namespace_count} ns · {t.resource_count} pods
                        </Typography>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>
                        <Typography sx={{ color: DK.text, fontSize: '0.875rem', fontWeight: 600 }}>{fmt(t.total_cost)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>
                        <Typography sx={{ color: RED, fontSize: '0.875rem' }}>{fmt(t.waste)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>
                        <Typography sx={{ color: GREEN, fontSize: '0.875rem' }}>{fmt(t.potential_savings)}</Typography>
                      </td>
                      <td style={{ padding: '8px 10px', minWidth: 100 }}>
                        <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                          <LinearProgress
                            variant="determinate"
                            value={t.efficiency_score}
                            sx={{
                              width: 52, height: 5, borderRadius: 2,
                              bgcolor: `${effColor(t.efficiency_score)}22`,
                              '& .MuiLinearProgress-bar': { bgcolor: effColor(t.efficiency_score), borderRadius: 2 },
                            }}
                          />
                          <Typography sx={{ color: effColor(t.efficiency_score), fontSize: '0.75rem', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
                            {t.efficiency_score}
                          </Typography>
                        </Box>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>
                        <TrendIcon trend={t.trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Box>
        </Grid>

        {/* Cost vs Waste bar chart */}
        <Grid item xs={12} lg={5}>
          <Box sx={{ ...sx.card, height: '100%' }}>
            <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
              Cost vs Waste by Team
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={wasteBarData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...chartStyle.grid} />
                <XAxis dataKey="team" tick={{ fill: DK.muted, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v.length > 8 ? v.slice(0, 8) + '…' : v} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: DK.muted, fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <RechartTooltip formatter={(v: number, n) => [fmt(v), n]} {...chartStyle.tooltip} />
                <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
                <Bar dataKey="Cost"    fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Waste"   fill={RED}    radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Savings" fill={GREEN}  radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Grid>
      </Grid>

      {/* ── Leaderboards ───────────────────────────────────────────────────── */}
      {leaderboard && (
        <Box sx={{ ...sx.card, mb: 3 }}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
            Leaderboards
          </Typography>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              mb: 2,
              '& .MuiTab-root': { color: DK.muted, fontSize: '0.8rem', textTransform: 'none', minWidth: 140 },
              '& .Mui-selected': { color: ACCENT },
              '& .MuiTabs-indicator': { bgcolor: ACCENT },
            }}
          >
            <Tab label="By Efficiency" />
            <Tab label="By Savings" />
            <Tab label="By Waste" />
          </Tabs>

          {tab === 0 && leaderboard.by_efficiency.map((item, i) => (
            <Box key={item.team} display="flex" alignItems="center" justifyContent="space-between"
              sx={{ p: 1.5, mb: 1, bgcolor: DK.surface2, borderRadius: 1.5,
                    borderLeft: i === 0 ? `3px solid ${AMBER}` : `3px solid ${DK.border}` }}>
              <Box display="flex" alignItems="center" gap={1.5}>
                {i < 3 && <EmojiEventsIcon sx={{ fontSize: 18, color: i === 0 ? AMBER : DK.muted }} />}
                <Box>
                  <Typography sx={{ color: DK.text, fontSize: '0.875rem', fontWeight: 600 }}>
                    #{i + 1} {item.team}
                  </Typography>
                  <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                    Cost: {fmt(item.cost)}
                  </Typography>
                </Box>
              </Box>
              <Chip
                label={`${item.score}/100`}
                size="small"
                sx={{ bgcolor: `${effColor(item.score)}22`, color: effColor(item.score),
                      border: `1px solid ${effColor(item.score)}44`, fontWeight: 700, fontSize: '0.75rem' }}
              />
            </Box>
          ))}

          {tab === 1 && leaderboard.by_savings.map((item, i) => (
            <Box key={item.team} display="flex" alignItems="center" justifyContent="space-between"
              sx={{ p: 1.5, mb: 1, bgcolor: DK.surface2, borderRadius: 1.5,
                    borderLeft: `3px solid ${DK.border}` }}>
              <Box>
                <Typography sx={{ color: DK.text, fontSize: '0.875rem', fontWeight: 600 }}>
                  #{i + 1} {item.team}
                </Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                  Cost: {fmt(item.cost)}
                </Typography>
              </Box>
              <Typography sx={{ color: GREEN, fontWeight: 700, fontSize: '1rem' }}>
                {fmt(item.savings)}
              </Typography>
            </Box>
          ))}

          {tab === 2 && leaderboard.by_waste.map((item, i) => (
            <Box key={item.team} display="flex" alignItems="center" justifyContent="space-between"
              sx={{ p: 1.5, mb: 1, bgcolor: DK.surface2, borderRadius: 1.5,
                    borderLeft: i < 3 ? `3px solid ${RED}` : `3px solid ${DK.border}` }}>
              <Box>
                <Typography sx={{ color: DK.text, fontSize: '0.875rem', fontWeight: 600 }}>
                  #{i + 1} {item.team}
                </Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                  {item.waste_percentage}% of total waste
                </Typography>
              </Box>
              <Typography sx={{ color: RED, fontWeight: 700, fontSize: '1rem' }}>
                {fmt(item.waste)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Team detail panel ──────────────────────────────────────────────── */}
      {details && (
        <Grid container spacing={2}>

          {/* Cost trend */}
          <Grid item xs={12} md={6}>
            <Box sx={sx.card}>
              <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
                Cost Trend — {details.team_name}
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={details.cost_trend}>
                  <CartesianGrid {...chartStyle.grid} />
                  <XAxis dataKey="month" tick={{ fill: DK.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: DK.muted, fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <RechartTooltip formatter={(v: number) => [fmt(v), 'Cost']} {...chartStyle.tooltip} />
                  <Line type="monotone" dataKey="cost" stroke={ACCENT} strokeWidth={2} dot={{ fill: ACCENT, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Grid>

          {/* Namespaces */}
          <Grid item xs={12} md={6}>
            <Box sx={sx.card}>
              <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
                Namespaces — {details.team_name}
              </Typography>
              {details.namespaces.length === 0 ? (
                <Typography sx={{ color: DK.muted, fontSize: '0.875rem' }}>No namespace breakdown available.</Typography>
              ) : details.namespaces.map(ns => (
                <Box key={ns.namespace} sx={{ mb: 2 }}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography sx={{ color: DK.text, fontSize: '0.8rem' }}>{ns.namespace}</Typography>
                    <Typography sx={{ color: ACCENT, fontSize: '0.8rem', fontWeight: 600 }}>{fmt(ns.cost)}</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={ns.efficiency_score}
                    sx={{
                      height: 5, borderRadius: 2,
                      bgcolor: `${effColor(ns.efficiency_score)}22`,
                      '& .MuiLinearProgress-bar': { bgcolor: effColor(ns.efficiency_score), borderRadius: 2 },
                    }}
                  />
                  <Typography sx={{ color: DK.muted, fontSize: '0.68rem', mt: 0.25 }}>
                    {ns.pod_count} pods · efficiency {ns.efficiency_score}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>

          {/* Recommendations */}
          {details.recommendations.length > 0 && (
            <Grid item xs={12}>
              <Box sx={sx.card}>
                <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
                  Recommendations — {details.team_name}
                </Typography>
                {details.recommendations.map((r, i) => (
                  <Box key={i} sx={{
                    display: 'flex', gap: 1.5, p: 1.5, mb: 1,
                    bgcolor: DK.surface2, borderLeft: `3px solid ${AMBER}`, borderRadius: 1.5,
                  }}>
                    <Typography sx={{ color: DK.text, fontSize: '0.875rem' }}>{r}</Typography>
                  </Box>
                ))}
              </Box>
            </Grid>
          )}
        </Grid>
      )}

    </Box>
  );
};

// ── Export ────────────────────────────────────────────────────────────────────
const TeamAccountability: React.FC = () => (
  <ClusterGuard><TeamAccountabilityInner /></ClusterGuard>
);

export default TeamAccountability;

// Made with Bob
