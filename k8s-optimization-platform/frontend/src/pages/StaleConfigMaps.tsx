import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, Paper,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Storage as StorageIcon,
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
interface StaleConfigMap {
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
  total_resources:       number;
  safe_to_delete:        number;
  requires_review:       number;
  high_risk:             number;
  total_monthly_savings: number;
  resources_by_type:     Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (s: string) => {
  if (!s || s === 'Unknown') return '—';
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return s; }
};

const riskColor = (r: string) =>
  r === 'High' ? T.red : r === 'Medium' ? T.yellow : T.green;

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
const StaleConfigMaps: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [items,   setItems]   = useState<StaleConfigMap[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_BASE_URL}/v1/cleanup/stale-configmaps${clusterParam}`;
      const res = await fetch(url);
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

  const filtered = useMemo(() =>
    items.filter(i =>
      i.resource_name.toLowerCase().includes(search.toLowerCase()) ||
      i.namespace.toLowerCase().includes(search.toLowerCase()) ||
      i.reason.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

  const uniqueNamespaces = useMemo(() => Array.from(new Set(items.map(i => i.namespace))).sort(), [items]);
  const medHigh = items.filter(i => i.risk_level === 'Medium' || i.risk_level === 'High').length;

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Stale ConfigMaps</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            ConfigMaps not referenced by any pod — safe to remove
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Stale ConfigMaps" value={summary?.total_resources ?? items.length} sub="Not referenced by any pod" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Safe to Delete" value={summary?.safe_to_delete ?? items.filter(i => i.can_delete).length} accent={T.green} sub="Low risk" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Needs Review" value={medHigh} accent={T.yellow} sub="Medium / High risk" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Namespaces" value={uniqueNamespaces.length} sub="Affected" />
        </Grid>
      </Grid>

      {/* No data state */}
      {items.length === 0 && (
        <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 6, textAlign: 'center' }}>
          <StorageIcon sx={{ fontSize: 48, color: T.muted, mb: 2 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.text, mb: 1 }}>No stale ConfigMaps found</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted }}>
            All ConfigMaps are actively referenced by running workloads, or the agent is still collecting data.
          </Typography>
        </Paper>
      )}

      {items.length > 0 && (
        <>
          {/* Search */}
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
            <TextField
              fullWidth size="small"
              placeholder="Search by name, namespace, reason…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
                sx: { color: T.text, fontSize: 13, bgcolor: T.bg, borderRadius: 1,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
                },
              }}
            />
          </Paper>

          {/* Table */}
          <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#161f30' }}>
                  <TableCell sx={headSx}>Name</TableCell>
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
                    <TableCell colSpan={6} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                      No results match your search
                    </TableCell>
                  </TableRow>
                ) : filtered.map((cm, idx) => (
                  <TableRow key={`${cm.namespace}/${cm.resource_name}-${idx}`} hover
                    sx={{ '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                        {cm.resource_name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={cm.namespace} size="small"
                        sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 340 }}>
                      <Typography noWrap sx={{ fontSize: 12, color: T.muted }} title={cm.reason}>
                        {cm.reason}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                      <Typography sx={{
                        fontSize: 12, fontWeight: 600,
                        color: cm.days_unused > 180 ? T.yellow : T.body,
                      }}>
                        {cm.days_unused}d
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: T.muted }}>
                      {fmtDate(cm.last_used)}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={cm.risk_level} size="small"
                        sx={{ bgcolor: `${riskColor(cm.risk_level)}18`, color: riskColor(cm.risk_level),
                          border: `1px solid ${riskColor(cm.risk_level)}44`, fontSize: 11, height: 20 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
            {filtered.length} of {items.length} ConfigMaps shown
          </Typography>
        </>
      )}
    </Box>
  );
};

export default StaleConfigMaps;
