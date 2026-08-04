import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Paper,
  TextField, InputAdornment,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Group as GroupIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import CostAccuracyBanner from '../components/CostAccuracyBanner';

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:     '#0f1724',
  card:   '#1e2433',
  hover:  '#252e42',
  border: '#2a3245',
  text:   '#e8eaf0',
  muted:  '#8b95a9',
  body:   '#c8cdd8',
  green:  '#4ade80',
  red:    '#f87171',
  yellow: '#f59e0b',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamRow {
  name:           string;
  current_cost:   number;
  optimized_cost: number;
  savings:        number;
  waste_pct:      number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const wasteColor = (pct: number) =>
  pct >= 60 ? T.red : pct >= 35 ? T.yellow : T.green;

const wasteBarBg = (pct: number) =>
  pct >= 60 ? '#450a0a' : pct >= 35 ? '#451a03' : '#052e16';

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; accent?: string }> = ({ label, value, sub, accent }) => (
  <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent ?? T.text, lineHeight: 1 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const TeamWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [rows,    setRows]    = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const teams: TeamRow[] = (data.savings_by_team ?? []).map((t: any) => ({
        name:           t.name,
        current_cost:   t.current_cost,
        optimized_cost: t.optimized_cost,
        savings:        t.savings,
        waste_pct:      t.savings_percent,
      }));
      setRows(teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const filtered = useMemo(() => rows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const totalCurrent = filtered.reduce((s, r) => s + r.current_cost, 0);
  const totalSavings = filtered.reduce((s, r) => s + r.savings, 0);
  const avgWaste     = filtered.length > 0 ? filtered.reduce((s, r) => s + r.waste_pct, 0) / filtered.length : 0;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.2 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5, bgcolor: '#161f30' };

  // Note: pods have no "team" label in this cluster — all pods roll up to "unknown"
  // We show this transparently and explain the label situation
  const allUnknown = rows.length === 1 && rows[0]?.name === 'unknown';

  if (loading) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress sx={{ color: T.green }} />
    </Box>
  );
  if (error) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: '#1a0a0a', color: T.red, border: `1px solid ${T.red}` }}>{error}</Alert>
    </Box>
  );

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Team Waste</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Resource waste grouped by pod <code style={{ fontFamily: 'monospace', color: T.body }}>team</code> label
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* Info banner if no team labels set */}
      {allUnknown && (
        <Paper sx={{ bgcolor: '#1a1a0a', border: `1px solid ${T.yellow}44`, borderRadius: 2, p: 2, mb: 3, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <InfoIcon sx={{ color: T.yellow, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.yellow }}>No team labels detected</Typography>
            <Typography sx={{ fontSize: 12, color: T.body, mt: 0.25 }}>
              None of the pods in this cluster have a <code style={{ fontFamily: 'monospace' }}>team</code> label, so all
              cost is attributed to <strong>"unknown"</strong>. To enable per-team breakdown, add{' '}
              <code style={{ fontFamily: 'monospace' }}>team: &lt;name&gt;</code> labels to your pod specs or deployment templates.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Teams Tracked" value={rows.length} sub={allUnknown ? 'No team labels set' : 'Distinct team labels'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Total Spend" value={`$${totalCurrent.toFixed(0)}/mo`} sub="All tracked teams" accent={T.body} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Potential Savings" value={`$${totalSavings.toFixed(0)}/mo`} sub={`$${(totalSavings * 12).toFixed(0)}/yr`} accent={T.red} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Avg Waste" value={`${avgWaste.toFixed(1)}%`} sub="Across teams" accent={wasteColor(avgWaste)} />
        </Grid>
      </Grid>

      {/* Search */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <TextField fullWidth size="small"
          placeholder="Search team…"
          value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
            sx: { color: T.body, bgcolor: T.bg,
              '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
              '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
            },
          }}
        />
      </Paper>

      {/* Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Team</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Current/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Optimal/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Waste/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Annual Waste</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 160 }}>Waste %</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No teams match your search
                </TableCell>
              </TableRow>
            ) : filtered.map(row => {
              const wPct = row.waste_pct;
              return (
                <TableRow key={row.name} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                  <TableCell sx={cellSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GroupIcon sx={{ fontSize: 16, color: T.muted }} />
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                        {row.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>${row.current_cost.toFixed(2)}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.green }}>${row.optimized_cost.toFixed(2)}</TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: wasteColor(wPct) }}>
                      ${row.savings.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>
                    ${(row.savings * 12).toFixed(0)}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, minWidth: 160 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ flex: 1, height: 6, bgcolor: T.border, borderRadius: 3, overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${Math.min(100, wPct)}%`, bgcolor: wasteColor(wPct), borderRadius: 3 }} />
                      </Box>
                      <Chip label={`${wPct.toFixed(0)}%`} size="small"
                        sx={{ bgcolor: wasteBarBg(wPct), color: wasteColor(wPct),
                          border: `1px solid ${wasteColor(wPct)}44`, fontSize: 10, height: 18, minWidth: 44 }} />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
        {filtered.length} of {rows.length} teams shown · grouped by pod <code style={{ fontFamily: 'monospace' }}>team</code> label
      </Typography>
    </Box>
  );
};

export default TeamWaste;
