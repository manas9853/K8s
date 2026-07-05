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
  Storage as StorageIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Strict dark theme — no blues, purples, teals, or gradients ───────────────
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
interface PVC {
  resource_name:  string;
  namespace:      string;
  cluster:        string;
  last_used:      string;
  days_unused:    number;
  monthly_cost:   number;
  reason:         string;
  risk_level:     string;
  can_delete:     boolean;
  estimated_savings: number;
  capacity:       string;
  storage_class:  string;
  pvc_phase:      string;
}

interface Summary {
  total_resources:        number;
  safe_to_delete:         number;
  requires_review:        number;
  high_risk:              number;
  total_monthly_savings:  number;
  total_yearly_savings:   number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (s: string) => {
  if (!s || s === 'Unknown') return '—';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
};
const fmtCost = (n: number) => n > 0 ? `$${n.toFixed(2)}/mo` : '—';

// MUI input/select override — kills all focus/hover colour bleed
const inputSx = {
  color: T.text, fontSize: 13, bgcolor: T.bg, borderRadius: 1,
  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
  '& .MuiSvgIcon-root':                            { color: T.muted },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: string | number; sub?: string; accent?: string }> =
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
const UnattachedPVCs: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [items,        setItems]       = useState<PVC[]>([]);
  const [summary,      setSummary]     = useState<Summary | null>(null);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [search,       setSearch]      = useState('');
  const [nsFilter,     setNsFilter]    = useState('all');
  const [scFilter,     setScFilter]    = useState('all');
  const [ageFilter,    setAgeFilter]   = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cleanup/unattached-pvcs${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems((data.resources ?? []).map((r: any) => ({
        resource_name:     r.resource_name     ?? '',
        namespace:         r.namespace         ?? '',
        cluster:           r.cluster           ?? '',
        last_used:         r.last_used         ?? '',
        days_unused:       r.days_unused        ?? 0,
        monthly_cost:      r.monthly_cost       ?? 0,
        reason:            r.reason             ?? '',
        risk_level:        r.risk_level         ?? 'High',
        can_delete:        r.can_delete         ?? false,
        estimated_savings: r.estimated_savings  ?? 0,
        capacity:          r.capacity           ?? '—',
        storage_class:     r.storage_class      ?? '—',
        pvc_phase:         r.pvc_phase          ?? 'Bound',
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueNS = useMemo(() => Array.from(new Set(items.map(i => i.namespace))).sort(), [items]);
  const uniqueSC = useMemo(() => Array.from(new Set(items.map(i => i.storage_class))).sort(), [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (nsFilter  !== 'all' && i.namespace     !== nsFilter)  return false;
    if (scFilter  !== 'all' && i.storage_class !== scFilter)  return false;
    if (ageFilter !== 'all') {
      const days = i.days_unused;
      if (ageFilter === '90'  && days < 90)   return false;
      if (ageFilter === '365' && days < 365)  return false;
      if (ageFilter === '730' && days < 730)  return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        i.resource_name.toLowerCase().includes(q) ||
        i.namespace.toLowerCase().includes(q) ||
        i.storage_class.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q)
      );
    }
    return true;
  }), [items, search, nsFilter, scFilter, ageFilter]);

  const totalMonthlyCost = items.reduce((s, i) => s + i.monthly_cost, 0);
  const filteredCost = filtered.reduce((s, i) => s + i.monthly_cost, 0);

  // Shared Select sx — zero focus bleed, strictly dark
  const selectSx = {
    color: T.text, fontSize: 13, height: 38, bgcolor: T.card,
    '& .MuiOutlinedInput-notchedOutline':             { borderColor: T.border },
    '&:hover .MuiOutlinedInput-notchedOutline':       { borderColor: T.muted },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
    '& .MuiSvgIcon-root':                             { color: T.muted },
  };
  const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}`, maxHeight: 280 } } };

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Unattached PVCs</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Persistent volume claims not mounted by any running pod
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
          <StatCard label="Unattached PVCs" value={summary?.total_resources ?? items.length} sub="Not mounted by any pod" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Monthly Cost" value={`$${totalMonthlyCost.toFixed(2)}`} accent={T.red} sub="Wasted storage cost" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Yearly Cost"
            value={`$${(totalMonthlyCost * 12).toFixed(2)}`}
            accent={T.yellow}
            sub="Annualised"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Namespaces" value={uniqueNS.length} sub="Affected" />
        </Grid>
      </Grid>

      {/* ── No data ── */}
      {items.length === 0 && (
        <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 6, textAlign: 'center' }}>
          <StorageIcon sx={{ fontSize: 48, color: T.muted, mb: 2 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.text, mb: 1 }}>No unattached PVCs found</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted }}>
            All persistent volume claims are mounted by running pods.
          </Typography>
        </Paper>
      )}

      {items.length > 0 && (
        <>
          {/* ── Filters ── */}
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              {/* Search */}
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth size="small"
                  placeholder="Search by name, namespace, storage class…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: T.muted, fontSize: 18 }} />
                      </InputAdornment>
                    ),
                    sx: inputSx,
                  }}
                />
              </Grid>

              {/* Namespace */}
              <Grid item xs={12} sm={4} md={2.5}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Namespace</InputLabel>
                  <Select
                    value={nsFilter} label="Namespace"
                    onChange={e => setNsFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}
                  >
                    <MenuItem value="all">All Namespaces</MenuItem>
                    {uniqueNS.map(ns => (
                      <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Storage Class */}
              <Grid item xs={12} sm={4} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Storage Class</InputLabel>
                  <Select
                    value={scFilter} label="Storage Class"
                    onChange={e => setScFilter(e.target.value)}
                    sx={selectSx} MenuProps={menuProps}
                  >
                    <MenuItem value="all">All Classes</MenuItem>
                    {uniqueSC.map(sc => (
                      <MenuItem key={sc} value={sc}>{sc}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Age */}
              <Grid item xs={12} sm={4} md={2.5}>
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

            {/* Active filter summary */}
            {(nsFilter !== 'all' || scFilter !== 'all' || ageFilter !== 'all' || search) && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 11, color: T.muted }}>Active:</Typography>
                {search && (
                  <Chip label={`"${search}"`} size="small" onDelete={() => setSearch('')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20,
                      '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                {nsFilter !== 'all' && (
                  <Chip label={nsFilter} size="small" onDelete={() => setNsFilter('all')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20,
                      '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                {scFilter !== 'all' && (
                  <Chip label={scFilter} size="small" onDelete={() => setScFilter('all')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20,
                      '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                {ageFilter !== 'all' && (
                  <Chip label={`${ageFilter}+ days`} size="small" onDelete={() => setAgeFilter('all')}
                    sx={{ bgcolor: T.hover, color: T.body, fontSize: 11, height: 20,
                      '& .MuiChip-deleteIcon': { color: T.muted, fontSize: 14 } }} />
                )}
                <Typography sx={{ fontSize: 11, color: T.muted, ml: 'auto' }}>
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} · ${filteredCost.toFixed(2)}/mo
                </Typography>
              </Box>
            )}
          </Paper>

          {/* ── Table ── */}
          <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#161f30' }}>
                  <TableCell sx={headSx}>PVC Name</TableCell>
                  <TableCell sx={headSx}>Namespace</TableCell>
                  <TableCell sx={headSx}>Capacity</TableCell>
                  <TableCell sx={headSx}>Storage Class</TableCell>
                  <TableCell sx={headSx}>Phase</TableCell>
                  <TableCell sx={headSx}>Reason</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'right' }}>Age</TableCell>
                  <TableCell sx={headSx}>Created</TableCell>
                  <TableCell sx={{ ...headSx, textAlign: 'right' }}>Cost/mo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                      No results match your search
                    </TableCell>
                  </TableRow>
                ) : filtered.map((pvc, idx) => (
                  <TableRow
                    key={`${pvc.namespace}/${pvc.resource_name}-${idx}`}
                    hover
                    sx={{ '&:hover': { bgcolor: T.hover } }}
                  >
                    {/* Name */}
                    <TableCell sx={cellSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StorageIcon sx={{ fontSize: 13, color: T.muted, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                          {pvc.resource_name}
                        </Typography>
                      </Box>
                    </TableCell>

                    {/* Namespace */}
                    <TableCell sx={cellSx}>
                      <Chip
                        label={pvc.namespace} size="small"
                        sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }}
                      />
                    </TableCell>

                    {/* Capacity */}
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                        {pvc.capacity}
                      </Typography>
                    </TableCell>

                    {/* Storage class */}
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
                        {pvc.storage_class}
                      </Typography>
                    </TableCell>

                    {/* Phase */}
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 11, color: T.muted }}>{pvc.pvc_phase}</Typography>
                    </TableCell>

                    {/* Reason */}
                    <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                      <Typography noWrap sx={{ fontSize: 12, color: T.muted }} title={pvc.reason}>
                        {pvc.reason}
                      </Typography>
                    </TableCell>

                    {/* Age */}
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                      <Typography sx={{
                        fontSize: 12, fontWeight: 600,
                        color: pvc.days_unused > 365 ? T.red : pvc.days_unused > 90 ? T.yellow : T.body,
                      }}>
                        {pvc.days_unused}d
                      </Typography>
                    </TableCell>

                    {/* Created */}
                    <TableCell sx={{ ...cellSx, color: T.muted }}>
                      {fmtDate(pvc.last_used)}
                    </TableCell>

                    {/* Cost */}
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: pvc.monthly_cost > 0 ? T.red : T.muted }}>
                        {fmtCost(pvc.monthly_cost)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Footer note */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 12, color: T.muted }}>
              All PVCs flagged High risk — manual review required before deletion to prevent data loss.
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.muted }}>
              {filtered.length} of {items.length} PVCs shown
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
};

export default UnattachedPVCs;
