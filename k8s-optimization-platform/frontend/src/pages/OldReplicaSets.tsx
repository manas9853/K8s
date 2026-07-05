import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, Paper, Select, MenuItem, FormControl, InputLabel,
  SelectChangeEvent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Layers as LayersIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:      '#0f1724',
  card:    '#1e2433',
  hover:   '#252e42',
  border:  '#2a3245',
  text:    '#e8eaf0',
  muted:   '#8b95a9',
  body:    '#c8cdd8',
  green:   '#4ade80',
  red:     '#f87171',
  yellow:  '#f59e0b',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface OldRS {
  resource_name: string;
  namespace:     string;
  cluster:       string;
  last_used:     string;
  days_unused:   number;
  reason:        string;
  risk_level:    string;
  can_delete:    boolean;
}

interface Summary {
  total_resources: number;
  safe_to_delete:  number;
  requires_review: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (s: string) => {
  if (!s || s === 'Unknown') return '—';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
};

const ownerFromName = (name: string) => name.replace(/-[a-f0-9]+$/, '');

// ─── Shared select sx (matches ZombieResources) ───────────────────────────────
const selectSx = {
  color: T.body, bgcolor: T.bg,
  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
  '& .MuiSvgIcon-root':                            { color: T.muted },
};

const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } };

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: number | string; sub?: string; accent?: string }> =
  ({ label, value, sub, accent }) => (
  <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent ?? T.text, lineHeight: 1 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ─── Main component ───────────────────────────────────────────────────────────
const OldReplicaSets: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [items,     setItems]     = useState<OldRS[]>([]);
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [nsFilter,  setNsFilter]  = useState('all');
  const [riskFilter,setRiskFilter]= useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cleanup/old-replicasets${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems((data.resources ?? []).map((r: any) => ({
        resource_name: r.resource_name ?? '',
        namespace:     r.namespace     ?? '',
        cluster:       r.cluster       ?? '',
        last_used:     r.last_used     ?? '',
        days_unused:   r.days_unused   ?? 0,
        reason:        r.reason        ?? '',
        risk_level:    r.risk_level    ?? 'Low',
        can_delete:    r.can_delete    ?? true,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueNamespaces = useMemo(() => Array.from(new Set(items.map(i => i.namespace))).sort(), [items]);

  const filtered = useMemo(() =>
    items.filter(i => {
      const q = search.toLowerCase();
      const matchSearch =
        i.resource_name.toLowerCase().includes(q) ||
        i.namespace.toLowerCase().includes(q) ||
        ownerFromName(i.resource_name).toLowerCase().includes(q);
      const matchNs   = nsFilter   === 'all' || i.namespace  === nsFilter;
      const matchRisk = riskFilter === 'all' || i.risk_level === riskFilter;
      return matchSearch && matchNs && matchRisk;
    }), [items, search, nsFilter, riskFilter]);

  const avgAge = items.length > 0
    ? Math.round(items.reduce((s, i) => s + i.days_unused, 0) / items.length)
    : 0;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5 };

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Old ReplicaSets</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            {filtered.length} of {items.length} superseded ReplicaSets with 0 replicas
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Old ReplicaSets" value={summary?.total_resources ?? items.length} sub="Zero replicas" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Safe to Delete" value={summary?.safe_to_delete ?? items.filter(i => i.can_delete).length} accent={T.green} sub="All Low risk" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Avg Age" value={`${avgAge}d`} sub="Days superseded" accent={avgAge > 180 ? T.yellow : undefined} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Namespaces" value={uniqueNamespaces.length} sub="Affected" />
        </Grid>
      </Grid>

      {/* No data */}
      {items.length === 0 && (
        <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 6, textAlign: 'center' }}>
          <LayersIcon sx={{ fontSize: 48, color: T.muted, mb: 2 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.text, mb: 1 }}>No old ReplicaSets found</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted }}>
            No superseded ReplicaSets with zero replicas detected.
          </Typography>
        </Paper>
      )}

      {items.length > 0 && (
        <>
          {/* Filters */}
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth size="small"
                  placeholder="Search by name, namespace or parent deployment…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
                    sx: { color: T.body, bgcolor: T.bg,
                      '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
                      '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
                    },
                  }}
                  InputLabelProps={{ sx: { color: T.muted } }}
                />
              </Grid>
              <Grid item xs={6} md={3.5}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted }}>Namespace</InputLabel>
                  <Select value={nsFilter} label="Namespace"
                    onChange={(e: SelectChangeEvent) => setNsFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}>
                    <MenuItem value="all">All Namespaces</MenuItem>
                    {uniqueNamespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} md={3.5}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted }}>Risk</InputLabel>
                  <Select value={riskFilter} label="Risk"
                    onChange={(e: SelectChangeEvent) => setRiskFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}>
                    <MenuItem value="all">All Risks</MenuItem>
                    <MenuItem value="Low">Low</MenuItem>
                    <MenuItem value="Medium">Medium</MenuItem>
                    <MenuItem value="High">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>

          {/* Table */}
          <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#161f30' }}>
                  <TableCell sx={headSx}>ReplicaSet</TableCell>
                  <TableCell sx={headSx}>Parent Deployment</TableCell>
                  <TableCell sx={headSx}>Namespace</TableCell>
                  <TableCell sx={headSx}>Reason</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'right' }}>Age</TableCell>
                  <TableCell sx={headSx}>Created</TableCell>
                  <TableCell sx={headSx}>Risk</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                      No results match your filters
                    </TableCell>
                  </TableRow>
                ) : filtered.map((rs, idx) => (
                  <TableRow key={`${rs.namespace}/${rs.resource_name}-${idx}`} hover
                    sx={{ '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                        {rs.resource_name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, color: T.muted, fontFamily: 'monospace' }}>
                        {ownerFromName(rs.resource_name)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={rs.namespace} size="small"
                        sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 280 }}>
                      <Typography noWrap sx={{ fontSize: 12, color: T.muted }} title={rs.reason}>
                        {rs.reason}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                      <Typography sx={{
                        fontSize: 12, fontWeight: 600,
                        color: rs.days_unused > 365 ? T.yellow : T.body,
                      }}>
                        {rs.days_unused > 0 ? `${rs.days_unused}d` : '<1d'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: T.muted }}>
                      {fmtDate(rs.last_used)}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={rs.risk_level} size="small"
                        sx={{ bgcolor: '#052e1618', color: T.green, border: `1px solid ${T.green}44`, fontSize: 11, height: 20 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
            {filtered.length} of {items.length} ReplicaSets shown
          </Typography>
        </>
      )}
    </Box>
  );
};

export default OldReplicaSets;
