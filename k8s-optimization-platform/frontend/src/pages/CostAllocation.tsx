import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Alert, IconButton, Tabs, Tab, LinearProgress,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
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

const PIE_PALETTE = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#a371f7', '#79c0ff', '#56d364', '#ffa657',
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface NamespaceRow {
  namespace:     string;
  cluster:       string;
  cost:          number;
  cpu_share_pct: number;
  pod_count:     number;
  teams:         string[];
}
interface TeamRow {
  team:       string;
  total_cost: number;
  percentage: number;
  projects?:  any[];
}
interface CostAllocationData {
  allocation_by_namespace: NamespaceRow[];
  allocation_by_team:      TeamRow[];
  allocation_accuracy:     number;
  cost_source:             string;
  accuracy:                string;
  last_updated:            string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

const tooltipStyle = {
  backgroundColor: DK.surface2,
  border: `1px solid ${DK.border}`,
  color: DK.text,
  borderRadius: 6,
  fontSize: 12,
};

// ─── Main component ───────────────────────────────────────────────────────────
const CostAllocationInner: React.FC = () => {
  const { clusterParam, activeClusterId, activeClusterName } = useActiveCluster();
  const [data, setData]       = useState<CostAllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`${API_BASE_URL}/v1/finops/cost-allocation${clusterParam}`);
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

  const namespaces = [...(data.allocation_by_namespace ?? [])].sort((a, b) => b.cost - a.cost);
  const teams      = data.allocation_by_team ?? [];
  const totalCost  = namespaces.reduce((s, n) => s + n.cost, 0);
  const topNs      = namespaces[0];

  // Top-8 namespaces for pie
  const pieData = namespaces.slice(0, 8).map(n => ({
    name: n.namespace,
    value: n.cost,
  }));

  // Bar chart data for teams
  const teamBarData = [...teams]
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 10)
    .map(t => ({ team: t.team.length > 14 ? t.team.slice(0, 13) + '…' : t.team, cost: t.total_cost }));

  const hasTeamData = teams.length > 0 && teams.some(t => t.total_cost > 0);

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <AccountTreeIcon sx={{ color: ACCENT, fontSize: 32 }} />
          <Box>
            <Typography variant="h4" sx={{ color: DK.text, fontWeight: 700, lineHeight: 1.2 }}>
              Cost Allocation
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted, mt: 0.25 }}>
              Namespace &amp; team cost attribution · {activeClusterName}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Accuracy banner ─────────────────────────────────────────────────── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          {
            label: 'Total Allocated Cost',
            value: fmt(totalCost),
            sub:   data.cost_source || 'Across all namespaces',
            color: GREEN,
          },
          {
            label: 'Allocation Accuracy',
            value: `${(data.allocation_accuracy ?? 0).toFixed(1)}%`,
            sub:   data.accuracy || 'Label coverage',
            color: (data.allocation_accuracy ?? 0) >= 80 ? GREEN : AMBER,
          },
          {
            label: 'Namespaces',
            value: String(namespaces.length),
            sub:   'Active namespaces with cost',
            color: ACCENT,
          },
          {
            label: 'Top Namespace',
            value: topNs ? topNs.namespace : '—',
            sub:   topNs ? fmt(topNs.cost) : 'No data',
            color: DK.text,
          },
        ].map(({ label, value, sub, color }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
              <CardContent sx={{ pb: '14px !important' }}>
                <Typography sx={{ color: DK.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                  {label}
                </Typography>
                <Typography sx={{ color, fontSize: label === 'Top Namespace' ? '1.1rem' : '1.6rem', fontWeight: 700, lineHeight: 1.15, wordBreak: 'break-all' }}>
                  {value}
                </Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.5 }}>{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Main content: tabs + pie side by side ───────────────────────────── */}
      <Grid container spacing={2}>
        {/* Left: tabs */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                borderBottom: `1px solid ${DK.border}`,
                '& .MuiTab-root': { color: DK.muted, textTransform: 'none', fontWeight: 500, fontSize: '0.85rem' },
                '& .Mui-selected': { color: ACCENT },
                '& .MuiTabs-indicator': { backgroundColor: ACCENT },
              }}
            >
              <Tab label="By Namespace" />
              <Tab label="By Team" />
            </Tabs>

            {/* ── Namespace tab ─────────────────────────────────────────────── */}
            {tab === 0 && (
              <Box sx={{ p: 0 }}>
                <TableContainer sx={{ maxHeight: 480 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {['Namespace', 'Cost', 'CPU Share %', 'Pods', 'Cluster'].map(h => (
                          <TableCell key={h} sx={{
                            color: DK.muted, bgcolor: DK.surface, borderColor: DK.border,
                            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}
                            align={h === 'Namespace' ? 'left' : 'right'}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {namespaces.map((ns, i) => {
                        const share = totalCost > 0 ? (ns.cost / totalCost) * 100 : 0;
                        return (
                          <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                            <TableCell sx={{ borderColor: DK.border }}>
                              <Box display="flex" alignItems="center" gap={1.5}>
                                <Chip
                                  label={ns.namespace}
                                  size="small"
                                  sx={{
                                    bgcolor: `${ACCENT}18`, color: ACCENT,
                                    fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                    fontSize: '0.72rem', border: `1px solid ${ACCENT}33`, height: 22,
                                  }}
                                />
                                {ns.teams?.length > 0 && (
                                  <Typography sx={{ color: DK.muted, fontSize: '0.7rem' }}>
                                    {ns.teams.slice(0, 2).join(', ')}{ns.teams.length > 2 ? ` +${ns.teams.length - 2}` : ''}
                                  </Typography>
                                )}
                              </Box>
                              <Box sx={{ mt: 0.75 }}>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(share, 100)}
                                  sx={{
                                    height: 3, borderRadius: 2, bgcolor: DK.border,
                                    '& .MuiLinearProgress-bar': { bgcolor: PIE_PALETTE[i % PIE_PALETTE.length] },
                                  }}
                                />
                              </Box>
                            </TableCell>
                            <TableCell align="right" sx={{ color: DK.text, borderColor: DK.border, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(ns.cost)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: DK.muted, borderColor: DK.border }}>
                              {ns.cpu_share_pct.toFixed(1)}%
                            </TableCell>
                            <TableCell align="right" sx={{ color: DK.muted, borderColor: DK.border }}>
                              {ns.pod_count}
                            </TableCell>
                            <TableCell align="right" sx={{ borderColor: DK.border }}>
                              <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{ns.cluster || '—'}</Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* ── Team tab ──────────────────────────────────────────────────── */}
            {tab === 1 && (
              <Box sx={{ p: 2.5 }}>
                {!hasTeamData ? (
                  /* No-team-data info box */
                  <Box sx={{
                    display: 'flex', alignItems: 'flex-start', gap: 1.25,
                    bgcolor: `${ACCENT}11`, border: `1px solid ${ACCENT}33`,
                    borderRadius: 1.5, p: 2,
                  }}>
                    <InfoOutlinedIcon sx={{ color: ACCENT, fontSize: 18, mt: '1px', flexShrink: 0 }} />
                    <Box>
                      <Typography sx={{ color: ACCENT, fontWeight: 600, fontSize: '0.83rem', mb: 0.25 }}>
                        Team allocation requires namespace labels
                      </Typography>
                      <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>
                        Add one of the following labels to your namespaces to enable team-level cost attribution:
                      </Typography>
                      <Box component="ul" sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.5, pl: 2, mb: 0 }}>
                        <li><code style={{ color: ACCENT }}>team: &lt;name&gt;</code></li>
                        <li><code style={{ color: ACCENT }}>app.kubernetes.io/part-of: &lt;team&gt;</code></li>
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <>
                    {/* Horizontal bar chart */}
                    <Box sx={{ height: 280, mb: 3 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={teamBarData}
                          layout="vertical"
                          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={DK.border} horizontal={false} />
                          <XAxis type="number" tickFormatter={fmtK} stroke={DK.border} tick={{ fill: DK.muted, fontSize: 11 }} />
                          <YAxis type="category" dataKey="team" width={110} stroke={DK.border} tick={{ fill: DK.muted, fontSize: 11 }} />
                          <RTooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
                          <Bar dataKey="cost" name="Team Cost" fill={ACCENT} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>

                    {/* Team table */}
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {['Team', 'Cost', 'Share %'].map(h => (
                              <TableCell key={h} sx={{ color: DK.muted, borderColor: DK.border, fontSize: 11, textTransform: 'uppercase' }}
                                align={h === 'Team' ? 'left' : 'right'}>
                                {h}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {[...teams].sort((a, b) => b.total_cost - a.total_cost).map((t, i) => (
                            <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                              <TableCell sx={{ borderColor: DK.border }}>
                                <Chip
                                  label={t.team}
                                  size="small"
                                  sx={{ bgcolor: `${PIE_PALETTE[i % PIE_PALETTE.length]}22`, color: PIE_PALETTE[i % PIE_PALETTE.length], height: 22, fontSize: '0.75rem' }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ color: DK.text, borderColor: DK.border, fontWeight: 600 }}>
                                {fmt(t.total_cost)}
                              </TableCell>
                              <TableCell align="right" sx={{ borderColor: DK.border }}>
                                <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={Math.min(t.percentage, 100)}
                                    sx={{
                                      width: 60, height: 5, borderRadius: 2, bgcolor: DK.border,
                                      '& .MuiLinearProgress-bar': { bgcolor: PIE_PALETTE[i % PIE_PALETTE.length] },
                                    }}
                                  />
                                  <Typography sx={{ color: DK.muted, fontSize: '0.78rem', minWidth: 36 }}>
                                    {t.percentage.toFixed(1)}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Right: pie chart */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.5, bgcolor: DK.surface, border: `1px solid ${DK.border}`, height: '100%' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5, fontSize: '0.9rem' }}>
              Top 8 Namespaces by Cost
            </Typography>
            {pieData.length === 0 ? (
              <Box display="flex" alignItems="center" justifyContent="center" minHeight={200}>
                <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>No namespace data</Typography>
              </Box>
            ) : (
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="45%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                      ))}
                    </Pie>
                    <RTooltip
                      formatter={(v: number, name: string) => [fmt(v), name]}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}
            {/* Legend */}
            <Box sx={{ mt: 1 }}>
              {pieData.map((d, i) => (
                <Box key={i} display="flex" alignItems="center" justifyContent="space-between" py={0.35}>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PIE_PALETTE[i % PIE_PALETTE.length], flexShrink: 0 }} />
                    <Typography sx={{ color: DK.muted, fontSize: '0.72rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                      {d.name}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: DK.text, fontSize: '0.72rem', fontWeight: 600 }}>
                    {fmtK(d.value)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

// ─── Default export with ClusterGuard ────────────────────────────────────────
const CostAllocation: React.FC = () => (
  <ClusterGuard>
    <CostAllocationInner />
  </ClusterGuard>
);

export default CostAllocation;

// Made with Bob
