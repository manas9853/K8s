import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, Paper, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FolderOutlined as FolderIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme tokens — no blues, teals, purples, gradients ─────────────────
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
interface IdleNS {
  resource_name:    string;
  namespace:        string;
  cluster:          string;
  last_used:        string;
  days_unused:      number;
  reason:           string;
  risk_level:       string;
  dependencies:     number;
  pod_count:        number;
  deployment_count: number;
  service_count:    number;
  pvc_count:        number;
}

interface Summary {
  total_resources: number;
  requires_review: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (s: string) => {
  if (!s || s === 'Unknown') return '—';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
};

// Shared Select sx — no focus colour bleed
const selectSx = {
  color: '#c8cdd8', fontSize: 13, height: 38, bgcolor: '#1e2433',
  '& .MuiOutlinedInput-notchedOutline':             { borderColor: '#2a3245' },
  '&:hover .MuiOutlinedInput-notchedOutline':       { borderColor: '#8b95a9' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2a3245' },
  '& .MuiSvgIcon-root':                             { color: '#8b95a9' },
};
const menuProps = {
  PaperProps: {
    sx: { bgcolor: '#1e2433', color: '#e8eaf0', border: '1px solid #2a3245', maxHeight: 280 },
  },
};

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

// ─── Main ─────────────────────────────────────────────────────────────────────
const IdleNamespaces: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [items,       setItems]      = useState<IdleNS[]>([]);
  const [summary,     setSummary]    = useState<Summary | null>(null);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState<string | null>(null);
  const [search,      setSearch]     = useState('');
  const [riskFilter,  setRiskFilter] = useState('all');
  const [ageFilter,   setAgeFilter]  = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cleanup/idle-namespaces${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems((data.resources ?? []).map((r: any) => ({
        resource_name:    r.resource_name    ?? '',
        namespace:        r.namespace        ?? '',
        cluster:          r.cluster          ?? '',
        last_used:        r.last_used        ?? '',
        days_unused:      r.days_unused      ?? 0,
        reason:           r.reason           ?? '',
        risk_level:       r.risk_level       ?? 'Medium',
        dependencies:     r.dependencies     ?? 0,
        pod_count:        r.pod_count        ?? 0,
        deployment_count: r.deployment_count ?? 0,
        service_count:    r.service_count    ?? 0,
        pvc_count:        r.pvc_count        ?? 0,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtering (same logic as ZombieResources) ─────────────────────────────
  const filtered = useMemo(() => items.filter(i => {
    if (riskFilter !== 'all' && i.risk_level !== riskFilter) return false;
    if (ageFilter  !== 'all') {
      if (ageFilter === '90'  && i.days_unused <  90)  return false;
      if (ageFilter === '365' && i.days_unused < 365)  return false;
      if (ageFilter === '730' && i.days_unused < 730)  return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        i.resource_name.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q)
      );
    }
    return true;
  }), [items, search, riskFilter, ageFilter]);

  // Stats
  const avgAge = items.length
    ? Math.round(items.reduce((s, i) => s + i.days_unused, 0) / items.length)
    : 0;
  const withResources = items.filter(i => i.dependencies > 0).length;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.2 };
  const headSx = {
    color: T.muted, borderBottom: `1px solid ${T.border}`,
    fontSize: 11, textTransform: 'uppercase' as const,
    letterSpacing: 0.8, fontWeight: 600, py: 1.5,
  };

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

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Idle Namespaces</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Namespaces with no running pods — candidates for cleanup
          </Typography>
        </Box>
        <IconButton
          onClick={fetchData}
          sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}
        >
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Stats ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Idle Namespaces" value={summary?.total_resources ?? items.length} sub="No running pods" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Avg Age" value={`${avgAge}d`} accent={avgAge > 365 ? T.yellow : undefined} sub="Average idle duration" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Has Resources" value={withResources} accent={T.yellow} sub="Deployments / Services / PVCs" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Showing" value={filtered.length} sub={`of ${items.length} total`} />
        </Grid>
      </Grid>

      {/* ── No data ── */}
      {items.length === 0 && (
        <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 6, textAlign: 'center' }}>
          <FolderIcon sx={{ fontSize: 48, color: T.muted, mb: 2 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.text, mb: 1 }}>No idle namespaces found</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted }}>
            All namespaces have recent activity or running workloads.
          </Typography>
        </Paper>
      )}

      {items.length > 0 && (
        <>
          {/* ── Filter bar (ZombieResources pattern) ── */}
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">

              {/* Search */}
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth size="small"
                  placeholder="Search by name, reason…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: T.muted, fontSize: 18 }} />
                      </InputAdornment>
                    ),
                    sx: {
                      color: T.body, bgcolor: T.bg, borderRadius: 1,
                      '& .MuiOutlinedInput-notchedOutline':             { borderColor: T.border },
                      '&:hover .MuiOutlinedInput-notchedOutline':       { borderColor: T.muted },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                    },
                  }}
                  InputLabelProps={{ sx: { color: T.muted } }}
                />
              </Grid>

              {/* Risk */}
              <Grid item xs={6} md={3.5}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Risk</InputLabel>
                  <Select
                    value={riskFilter} label="Risk"
                    onChange={e => setRiskFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}
                  >
                    <MenuItem value="all">All Risks</MenuItem>
                    <MenuItem value="Low">Low</MenuItem>
                    <MenuItem value="Medium">Medium</MenuItem>
                    <MenuItem value="High">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Min Age */}
              <Grid item xs={6} md={3.5}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Min Age</InputLabel>
                  <Select
                    value={ageFilter} label="Min Age"
                    onChange={e => setAgeFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}
                  >
                    <MenuItem value="all">Any Age</MenuItem>
                    <MenuItem value="90">90+ days</MenuItem>
                    <MenuItem value="365">1+ year</MenuItem>
                    <MenuItem value="730">2+ years</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Active filter chips */}
            {(search || riskFilter !== 'all' || ageFilter !== 'all') && (
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 11, color: T.muted }}>Active:</Typography>
                {search && (
                  <Chip label={`"${search}"`} size="small" onDelete={() => setSearch('')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20, '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                {riskFilter !== 'all' && (
                  <Chip label={riskFilter} size="small" onDelete={() => setRiskFilter('all')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20, '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                {ageFilter !== 'all' && (
                  <Chip label={`${ageFilter}+ days`} size="small" onDelete={() => setAgeFilter('all')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20, '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                <Typography sx={{ fontSize: 11, color: T.muted, ml: 'auto' }}>
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
            )}
          </Paper>

          {/* ── Table ── */}
          <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#161f30' }}>
                  <TableCell sx={headSx}>Namespace</TableCell>
                  <TableCell sx={headSx}>Reason</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'right' }}>Age</TableCell>
                  <TableCell sx={headSx}>Created</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'center' }}>Deps</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'center' }}>Services</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'center' }}>PVCs</TableCell>
                  <TableCell sx={headSx}>Risk</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                      No namespaces match your filters
                    </TableCell>
                  </TableRow>
                ) : filtered.map((ns, idx) => (
                  <TableRow
                    key={`${ns.resource_name}-${idx}`}
                    hover sx={{ '&:hover': { bgcolor: T.hover } }}
                  >
                    {/* Name */}
                    <TableCell sx={cellSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FolderIcon sx={{ fontSize: 14, color: T.muted, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                          {ns.resource_name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Reason */}
                    <TableCell sx={{ ...cellSx, maxWidth: 300 }}>
                      <Typography noWrap sx={{ fontSize: 12, color: T.muted }} title={ns.reason}>
                        {ns.reason}
                      </Typography>
                    </TableCell>

                    {/* Age */}
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                      <Typography sx={{
                        fontSize: 12, fontWeight: 600,
                        color: ns.days_unused > 730 ? T.red : ns.days_unused > 365 ? T.yellow : T.body,
                      }}>
                        {ns.days_unused}d
                      </Typography>
                    </TableCell>

                    {/* Created */}
                    <TableCell sx={{ ...cellSx, color: T.muted }}>
                      {fmtDate(ns.last_used)}
                    </TableCell>

                    {/* Resource counts */}
                    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: ns.deployment_count > 0 ? T.yellow : T.muted }}>
                        {ns.deployment_count}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: ns.service_count > 0 ? T.yellow : T.muted }}>
                        {ns.service_count}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: ns.pvc_count > 0 ? T.yellow : T.muted }}>
                        {ns.pvc_count}
                      </Typography>
                    </TableCell>

                    {/* Risk */}
                    <TableCell sx={cellSx}>
                      <Chip label={ns.risk_level} size="small" sx={{
                        bgcolor: ns.risk_level === 'High'   ? '#450a0a'
                               : ns.risk_level === 'Medium' ? '#451a03'
                               :                              '#052e16',
                        color:   ns.risk_level === 'High'   ? T.red
                               : ns.risk_level === 'Medium' ? T.yellow
                               :                              T.green,
                        border: `1px solid ${
                          ns.risk_level === 'High'   ? `${T.red}44`
                        : ns.risk_level === 'Medium' ? `${T.yellow}44`
                        :                              `${T.green}44`}`,
                        fontSize: 11, height: 20,
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
            {filtered.length} of {items.length} namespaces shown
          </Typography>
        </>
      )}
    </Box>
  );
};

export default IdleNamespaces;
