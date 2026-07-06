import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Paper, LinearProgress,
  TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

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
interface NsRow {
  name:          string;
  current_cost:  number;
  optimized_cost:number;
  savings:       number;
  waste_pct:     number;  // savings_percent from API
  pod_count:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const wasteColor = (pct: number) =>
  pct >= 60 ? T.red : pct >= 35 ? T.yellow : T.green;

const wasteBarBg = (pct: number) =>
  pct >= 60 ? '#450a0a' : pct >= 35 ? '#451a03' : '#052e16';

const selectSx = {
  color: T.body, bgcolor: T.bg,
  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
  '& .MuiSvgIcon-root':                            { color: T.muted },
};
const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } };

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
const NamespaceWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [rows,       setRows]      = useState<NsRow[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState<string | null>(null);
  const [search,     setSearch]    = useState('');
  const [wasteFilter,setWasteFilter] = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const nsRows: NsRow[] = (data.savings_by_namespace ?? []).map((n: any) => ({
        name:           n.name,
        current_cost:   n.current_cost,
        optimized_cost: n.optimized_cost,
        savings:        n.savings,
        waste_pct:      n.savings_percent,
        pod_count:      0,
      }));
      setRows(nsRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = r.name.toLowerCase().includes(q);
    const matchWaste =
      wasteFilter === 'all'    ? true :
      wasteFilter === 'high'   ? r.waste_pct >= 60 :
      wasteFilter === 'medium' ? r.waste_pct >= 35 && r.waste_pct < 60 :
                                 r.waste_pct < 35;
    return matchSearch && matchWaste;
  }), [rows, search, wasteFilter]);

  const totalCurrent  = filtered.reduce((s, r) => s + r.current_cost, 0);
  const totalSavings  = filtered.reduce((s, r) => s + r.savings, 0);
  const avgWaste      = filtered.length > 0 ? filtered.reduce((s, r) => s + r.waste_pct, 0) / filtered.length : 0;
  const highWasteNs   = rows.filter(r => r.waste_pct >= 60).length;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.2 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5, bgcolor: '#161f30' };

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Namespace Waste</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            {filtered.length} of {rows.length} namespaces — over-provisioned resource spend vs. optimised sizing
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Total Current Spend" value={`$${totalCurrent.toFixed(0)}/mo`} sub="Across shown namespaces" accent={T.body} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Potential Savings" value={`$${totalSavings.toFixed(0)}/mo`} sub={`$${(totalSavings * 12).toFixed(0)}/yr`} accent={T.red} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Avg Waste" value={`${avgWaste.toFixed(1)}%`} sub="Across filtered rows" accent={wasteColor(avgWaste)} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="High Waste NS" value={highWasteNs} sub="≥60% over-provisioned" accent={T.red} />
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField fullWidth size="small"
              placeholder="Search namespace…"
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
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted }}>Waste Level</InputLabel>
              <Select value={wasteFilter} label="Waste Level"
                onChange={(e: SelectChangeEvent) => setWasteFilter(e.target.value)}
                sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">All Levels</MenuItem>
                <MenuItem value="high">High (≥60%)</MenuItem>
                <MenuItem value="medium">Medium (35–60%)</MenuItem>
                <MenuItem value="low">Low (&lt;35%)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Current/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Optimal/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Waste/mo</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 160 }}>Waste %</TableCell>
              <TableCell sx={headSx}>Recommendation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No namespaces match your filters
                </TableCell>
              </TableRow>
            ) : filtered.map(row => {
              const wPct = row.waste_pct;
              const rec = wPct >= 80 ? 'Critical: reduce requests by ~80%'
                : wPct >= 60 ? 'High waste — right-size pod requests'
                : wPct >= 35 ? 'Moderate over-provisioning detected'
                : 'Well sized — minor optimisations possible';
              return (
                <TableRow key={row.name} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                  <TableCell sx={cellSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {wPct >= 60 && <WarningIcon sx={{ fontSize: 14, color: T.red, flexShrink: 0 }} />}
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
                  <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                    <Typography noWrap sx={{ fontSize: 11, color: T.muted }} title={rec}>{rec}</Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
        {filtered.length} of {rows.length} namespaces shown · waste = (current − optimal) / current
      </Typography>
    </Box>
  );
};

export default NamespaceWaste;
