import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, Paper, Collapse, Tooltip, Select, MenuItem,
  FormControl, InputLabel, SelectChangeEvent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Warning as WarningIcon,
  Layers as LayersIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
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

interface Container {
  name: string;
  image: string;
  cpu_request: number;
  memory_request_mb: number;
  cpu_limit: number;
  memory_limit_mb: number;
}

interface Condition {
  type:   string;
  status: string;
}

interface UnusedDeployment {
  name:                 string;
  namespace:            string;
  cluster:              string;
  replicas_desired:     number;
  replicas_ready:       number;
  replicas_available:   number;
  replicas_unavailable: number;
  created_at:           string;
  idle_days:            number;
  strategy:             string;
  labels:               Record<string, string>;
  paused:               boolean;
  containers:           Container[];
  images:               string[];
  conditions:           Condition[];
  monthly_cost:         number;
  estimated_savings:    number;
  reason:               string;
  risk_level:           string;
  can_delete:           boolean;
}

interface Summary {
  total_deployments:     number;
  total_idle_replicas:   number;
  total_monthly_savings: number;
  total_yearly_savings:  number;
}

// ─── Shared select sx (matches ZombieResources) ───────────────────────────────
const selectSx = {
  color: '#c8cdd8', bgcolor: '#0f1724',
  '& .MuiOutlinedInput-notchedOutline':            { borderColor: '#2a3245' },
  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: '#8b95a9' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: '#2a3245' },
  '& .MuiSvgIcon-root':                            { color: '#8b95a9' },
};

const menuProps = { PaperProps: { sx: { bgcolor: '#1e2433', color: '#e8eaf0', border: '1px solid #2a3245' } } };

const fmtDate = (s: string) => {
  if (!s || s === 'Unknown') return '—';
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
};

const fmtCpu = (cores: number) =>
  cores >= 1 ? `${cores.toFixed(2)} cores` : `${Math.round(cores * 1000)}m`;

const fmtMem = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} Gi` : `${Math.round(mb)} Mi`;

// ── Row with expandable container detail ──────────────────────────────────────
const DeploymentRow: React.FC<{ d: UnusedDeployment }> = ({ d }) => {
  const [open, setOpen] = useState(false);

  const conditionStatus = (cond: Condition) =>
    cond.status === 'True'
      ? <CheckIcon sx={{ fontSize: 13, color: T.green }} />
      : <ErrorIcon sx={{ fontSize: 13, color: T.red }} />;

  return (
    <>
      <TableRow
        onClick={() => setOpen(o => !o)}
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover }, '& td': { borderColor: T.border } }}
      >
        {/* Expand */}
        <TableCell sx={{ width: 36, p: 1 }}>
          {open
            ? <ExpandLessIcon sx={{ fontSize: 18, color: T.muted }} />
            : <ExpandMoreIcon sx={{ fontSize: 18, color: T.muted }} />}
        </TableCell>

        {/* Name */}
        <TableCell>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>
            {d.name}
          </Typography>
          {d.paused && (
            <Chip label="paused" size="small" sx={{ mt: 0.25, bgcolor: '#451a03', color: T.yellow, fontSize: '0.68rem' }} />
          )}
        </TableCell>

        {/* Namespace */}
        <TableCell>
          <Chip label={d.namespace} size="small" sx={{ bgcolor: T.border, color: T.body, fontSize: '0.72rem' }} />
        </TableCell>

        {/* Replicas */}
        <TableCell align="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: T.red }}>
              {d.replicas_desired}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: T.muted }}>desired</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: T.muted }}>·</Typography>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: T.red }}>0</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: T.muted }}>ready</Typography>
          </Box>
        </TableCell>

        {/* Age */}
        <TableCell align="center">
          <Chip
            label={`${d.idle_days}d`}
            size="small"
            sx={{
              bgcolor: d.idle_days > 365 ? '#450a0a' : d.idle_days > 90 ? '#451a03' : T.border,
              color:   d.idle_days > 365 ? T.red      : d.idle_days > 90 ? T.yellow  : T.muted,
              fontWeight: 700, fontSize: '0.72rem',
            }}
          />
        </TableCell>

        {/* Created */}
        <TableCell sx={{ color: T.muted, fontSize: '0.78rem' }}>
          {fmtDate(d.created_at)}
        </TableCell>

        {/* Images (first one) */}
        <TableCell>
          <Tooltip title={d.images.join('\n')} arrow>
            <Typography sx={{ fontSize: '0.75rem', color: T.muted, fontFamily: 'monospace',
              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.images[0] ?? '—'}
              {d.images.length > 1 && ` +${d.images.length - 1}`}
            </Typography>
          </Tooltip>
        </TableCell>

        {/* Reason */}
        <TableCell sx={{ maxWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WarningIcon sx={{ fontSize: 14, color: T.yellow, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: T.muted,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {d.reason}
            </Typography>
          </Box>
        </TableCell>

        {/* Cost */}
        <TableCell align="right">
          <Typography sx={{ fontSize: '0.82rem', color: d.monthly_cost > 0 ? T.red : T.muted,
            fontWeight: d.monthly_cost > 0 ? 700 : 400 }}>
            {d.monthly_cost > 0 ? `$${d.monthly_cost.toFixed(2)}` : '—'}
          </Typography>
        </TableCell>
      </TableRow>

      {/* Expanded container detail */}
      <TableRow sx={{ '& td': { borderColor: T.border, p: 0 } }}>
        <TableCell colSpan={9}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ bgcolor: T.bg, p: 2, borderTop: `1px solid ${T.border}` }}>
              <Grid container spacing={2}>

                {/* Containers */}
                <Grid item xs={12} md={7}>
                  <Typography sx={{ color: T.muted, fontSize: '0.72rem', textTransform: 'uppercase',
                    letterSpacing: '0.06em', mb: 1 }}>Containers</Typography>
                  {d.containers.length === 0
                    ? <Typography sx={{ color: T.muted, fontSize: '0.78rem' }}>No container data</Typography>
                    : d.containers.map((c, i) => (
                      <Box key={i} sx={{ mb: 1, p: 1.25, bgcolor: T.card, borderRadius: 1.5,
                        border: `1px solid ${T.border}` }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: T.text, fontFamily: 'monospace' }}>
                          {c.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: T.muted, fontFamily: 'monospace',
                          mt: 0.25, mb: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.image}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1.5 }}>
                          <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: T.muted }}>CPU req/lim</Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: T.body }}>
                              {fmtCpu(c.cpu_request)} / {c.cpu_limit > 0 ? fmtCpu(c.cpu_limit) : '∞'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '0.68rem', color: T.muted }}>Mem req/lim</Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: T.body }}>
                              {fmtMem(c.memory_request_mb)} / {c.memory_limit_mb > 0 ? fmtMem(c.memory_limit_mb) : '∞'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    ))
                  }
                </Grid>

                {/* Right panel: conditions + labels */}
                <Grid item xs={12} md={5}>
                  {/* Conditions */}
                  {d.conditions.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography sx={{ color: T.muted, fontSize: '0.72rem', textTransform: 'uppercase',
                        letterSpacing: '0.06em', mb: 1 }}>Conditions</Typography>
                      {d.conditions.map((c, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {conditionStatus(c)}
                          <Typography sx={{ fontSize: '0.78rem', color: T.body }}>{c.type}</Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: T.muted }}>= {c.status}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Labels */}
                  {Object.keys(d.labels).length > 0 && (
                    <Box>
                      <Typography sx={{ color: T.muted, fontSize: '0.72rem', textTransform: 'uppercase',
                        letterSpacing: '0.06em', mb: 1 }}>Labels</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {Object.entries(d.labels).slice(0, 8).map(([k, v]) => (
                          <Chip key={k} label={`${k}=${v}`} size="small"
                            sx={{ bgcolor: T.border, color: T.muted, fontSize: '0.68rem' }} />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Meta */}
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ color: T.muted, fontSize: '0.72rem', textTransform: 'uppercase',
                      letterSpacing: '0.06em', mb: 1 }}>Details</Typography>
                    {[
                      ['Strategy',   d.strategy],
                      ['Cluster',    d.cluster],
                      ['Created',    fmtDate(d.created_at)],
                      ['Idle',       `${d.idle_days} days`],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ display: 'flex', gap: 1, mb: 0.25 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: T.muted, minWidth: 72 }}>{label}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: T.body }}>{value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const UnusedDeployments: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [deployments, setDeployments] = useState<UnusedDeployment[]>([]);
  const [summary, setSummary]         = useState<Summary | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [nsFilter,  setNsFilter]      = useState('all');
  const [riskFilter,setRiskFilter]    = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cleanup/unused-deployments${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      setDeployments(data.deployments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const uniqueNamespaces = useMemo(
    () => Array.from(new Set(deployments.map(d => d.namespace))).sort(),
    [deployments]
  );

  const filtered = useMemo(() =>
    deployments.filter(d => {
      const q = search.toLowerCase();
      const matchSearch =
        d.name.toLowerCase().includes(q) ||
        d.namespace.toLowerCase().includes(q) ||
        d.images.some(img => img.toLowerCase().includes(q));
      const matchNs   = nsFilter   === 'all' || d.namespace  === nsFilter;
      const matchRisk = riskFilter === 'all' || d.risk_level === riskFilter;
      return matchSearch && matchNs && matchRisk;
    }), [deployments, search, nsFilter, riskFilter]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: 400, bgcolor: T.bg }}>
        <CircularProgress sx={{ color: T.green }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: T.bg, minHeight: '100vh' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: T.text, fontWeight: 700 }}>
            Unused Deployments
          </Typography>
          <Typography variant="body2" sx={{ color: T.muted, mt: 0.5 }}>
            {filtered.length} of {deployments.length} deployments with zero ready replicas — identified from live agent data
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, '&:hover': { color: T.green } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Summary cards */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Unused Deployments',  value: summary.total_deployments,   color: T.text },
            { label: 'Total Idle Replicas',  value: summary.total_idle_replicas,  color: T.red },
            { label: 'Monthly Waste',        value: `$${summary.total_monthly_savings.toFixed(2)}`, color: T.red },
            { label: 'Annual Waste',         value: `$${summary.total_yearly_savings.toFixed(0)}`,  color: T.red },
          ].map(sc => (
            <Grid item xs={6} sm={3} key={sc.label}>
              <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography sx={{ color: T.muted, fontSize: '0.75rem', mb: 0.5 }}>{sc.label}</Typography>
                  <Typography variant="h4" sx={{ color: sc.color, fontWeight: 700 }}>{sc.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth size="small"
              placeholder="Search by name, namespace or image…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: T.muted, fontSize: 18 }} />
                  </InputAdornment>
                ),
                sx: { color: T.body, bgcolor: T.bg,
                  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
                },
              }}
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

      {/* Table / empty state */}
      {filtered.length === 0 ? (
        <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <LayersIcon sx={{ fontSize: 52, color: T.green, mb: 1 }} />
          <Typography sx={{ color: T.text, fontWeight: 600 }}>
            {deployments.length === 0
              ? 'No unused deployments detected'
              : 'No deployments match your search'}
          </Typography>
          <Typography sx={{ color: T.muted, fontSize: '0.85rem', mt: 0.5 }}>
            {deployments.length === 0
              ? 'All 44 deployments in your cluster have at least one ready replica — great health signal.'
              : 'Try clearing the search field.'}
          </Typography>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: T.hover, color: T.muted, fontSize: '0.72rem',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderColor: T.border } }}>
                <TableCell sx={{ width: 36 }} />
                <TableCell>Deployment</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell align="center">Replicas</TableCell>
                <TableCell align="center">Idle</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Image</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell align="right">Cost/mo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(d => (
                <DeploymentRow key={`${d.namespace}/${d.name}`} d={d} />
              ))}
            </TableBody>
          </Table>
          <Box sx={{ p: 1.5, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ color: T.muted, fontSize: '0.75rem' }}>
              {filtered.length} deployment{filtered.length !== 1 ? 's' : ''} · click any row to expand container details
            </Typography>
            <Typography sx={{ color: T.muted, fontSize: '0.75rem' }}>
              All have <span style={{ color: T.red }}>0 ready</span> replicas despite desired &gt; 0
            </Typography>
          </Box>
        </TableContainer>
      )}
    </Box>
  );
};

export default UnusedDeployments;

// Made with Bob
