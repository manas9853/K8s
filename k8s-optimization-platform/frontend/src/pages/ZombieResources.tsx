import React, { useState, useEffect } from 'react';
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
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Storage as StorageIcon,
  Delete as DeleteIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:       '#0f1724',
  card:     '#1e2433',
  hover:    '#252e42',
  border:   '#2a3245',
  text:     '#e8eaf0',
  muted:    '#8b95a9',
  body:     '#c8cdd8',
  green:    '#4ade80',
  greenDim: '#14532d',
  red:      '#f87171',
  redDim:   '#450a0a',
};

interface ZombieResource {
  resource_type:     string;
  resource_name:     string;
  namespace:         string;
  cluster:           string;
  last_used:         string;
  days_unused:       number;
  monthly_cost:      number;
  reason:            string;
  risk_level:        string;
  can_delete:        boolean;
  estimated_savings: number;
}

interface CleanupSummary {
  total_resources:       number;
  safe_to_delete:        number;
  requires_review:       number;
  high_risk:             number;
  total_monthly_savings: number;
  total_yearly_savings:  number;
  resources_by_type:     Record<string, number>;
}

const RISK_COLORS: Record<string, string> = {
  Low:    '#4ade80',
  Medium: '#f59e0b',
  High:   '#f87171',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Pod:                   <HubIcon sx={{ fontSize: 14 }} />,
  Job:                   <CheckIcon sx={{ fontSize: 14 }} />,
  ReplicaSet:            <StorageIcon sx={{ fontSize: 14 }} />,
  Deployment:            <StorageIcon sx={{ fontSize: 14 }} />,
  PersistentVolumeClaim: <StorageIcon sx={{ fontSize: 14 }} />,
  Service:               <HubIcon sx={{ fontSize: 14 }} />,
  Namespace:             <DeleteIcon sx={{ fontSize: 14 }} />,
};

const ZombieResources: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [resources, setResources] = useState<ZombieResource[]>([]);
  const [summary, setSummary]     = useState<CleanupSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [riskFilter, setRiskFilter]   = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch ALL candidates, not just zombie-resources sub-type,
      // so the page can show full breakdown.
      const res = await fetch(`${API_BASE_URL}/v1/cleanup/${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary ?? null);
      setResources(data.resources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const fmtDate = (s: string) => {
    if (!s || s === 'Unknown') return '—';
    try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return s; }
  };

  const filtered = resources.filter(r => {
    const q = search.toLowerCase();
    const matchSearch =
      r.resource_name.toLowerCase().includes(q) ||
      r.namespace.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q);
    const matchType = typeFilter === 'all' || r.resource_type === typeFilter;
    const matchRisk = riskFilter === 'all' || r.risk_level === riskFilter;
    return matchSearch && matchType && matchRisk;
  });

  const types = Array.from(new Set(resources.map(r => r.resource_type))).sort();

  // ── Summary card data ─────────────────────────────────────────────────────
  const statCards = summary ? [
    { label: 'Total Candidates',  value: summary.total_resources,   color: T.text },
    { label: 'Safe to Delete',    value: summary.safe_to_delete,    color: T.green },
    { label: 'Requires Review',   value: summary.requires_review,   color: '#f59e0b' },
    { label: 'High Risk',         value: summary.high_risk,         color: T.red },
  ] : [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, bgcolor: T.bg }}>
        <CircularProgress sx={{ color: T.green }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, bgcolor: T.bg, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: T.bg, minHeight: '100vh' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: T.text, fontWeight: 700 }}>
            Zombie Resources
          </Typography>
          <Typography variant="body2" sx={{ color: T.muted, mt: 0.5 }}>
            Abandoned, stale, and cleanup-ready cluster resources — derived from live agent data
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, '&:hover': { color: T.green } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Summary stat cards */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {statCards.map(sc => (
            <Grid item xs={6} sm={3} key={sc.label}>
              <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Typography sx={{ color: T.muted, fontSize: '0.75rem', mb: 0.5 }}>{sc.label}</Typography>
                  <Typography variant="h4" sx={{ color: sc.color, fontWeight: 700 }}>{sc.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {/* Savings card */}
          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ color: T.muted, fontSize: '0.75rem', mb: 1 }}>Potential Monthly Savings</Typography>
                <Typography variant="h4" sx={{ color: T.green, fontWeight: 700 }}>
                  ${summary.total_monthly_savings.toFixed(2)}
                </Typography>
                <Typography sx={{ color: T.muted, fontSize: '0.75rem', mt: 0.5 }}>
                  ${summary.total_yearly_savings.toFixed(0)}/yr · {summary.total_resources} resources identified
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Type breakdown */}
          <Grid item xs={12} sm={6}>
            <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ color: T.muted, fontSize: '0.75rem', mb: 1 }}>By Resource Type</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {Object.entries(summary.resources_by_type).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${type}: ${count}`}
                      size="small"
                      sx={{ bgcolor: T.border, color: T.body, fontSize: '0.72rem' }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth size="small"
              placeholder="Search by name, namespace, reason…"
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
              <InputLabel sx={{ color: T.muted }}>Type</InputLabel>
              <Select
                value={typeFilter} label="Type"
                onChange={(e: SelectChangeEvent) => setTypeFilter(e.target.value)}
                sx={{ color: T.body, bgcolor: T.bg,
                  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
                  '& .MuiSvgIcon-root':                            { color: T.muted },
                }}
              >
                <MenuItem value="all">All Types</MenuItem>
                {types.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={3.5}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted }}>Risk</InputLabel>
              <Select
                value={riskFilter} label="Risk"
                onChange={(e: SelectChangeEvent) => setRiskFilter(e.target.value)}
                sx={{ color: T.body, bgcolor: T.bg,
                  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
                  '& .MuiSvgIcon-root':                            { color: T.muted },
                }}
              >
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
      {filtered.length === 0 ? (
        <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <CheckIcon sx={{ fontSize: 48, color: T.green, mb: 1 }} />
          <Typography sx={{ color: T.text, fontWeight: 600 }}>No resources match your filters</Typography>
          <Typography sx={{ color: T.muted, fontSize: '0.85rem', mt: 0.5 }}>Try clearing the search or filter criteria.</Typography>
        </Card>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: T.hover, color: T.muted, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderColor: T.border } }}>
                <TableCell>Type</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell align="center">Age (days)</TableCell>
                <TableCell>Last Seen</TableCell>
                <TableCell align="center">Risk</TableCell>
                <TableCell align="right">Cost/mo</TableCell>
                <TableCell align="center">Can Delete</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r, idx) => (
                <TableRow
                  key={`${r.namespace}/${r.resource_name}-${idx}`}
                  sx={{
                    '&:hover': { bgcolor: T.hover },
                    '& td': { borderColor: T.border, color: T.body, fontSize: '0.8rem' },
                  }}
                >
                  {/* Type */}
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{ color: T.muted }}>{TYPE_ICONS[r.resource_type] ?? <WarningIcon sx={{ fontSize: 14 }} />}</Box>
                      <Typography sx={{ fontSize: '0.78rem', color: T.body }}>{r.resource_type}</Typography>
                    </Box>
                  </TableCell>

                  {/* Name */}
                  <TableCell>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: T.text, fontFamily: 'monospace', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.resource_name}
                    </Typography>
                  </TableCell>

                  {/* Namespace */}
                  <TableCell>
                    <Chip label={r.namespace} size="small" sx={{ bgcolor: T.border, color: T.body, fontSize: '0.72rem' }} />
                  </TableCell>

                  {/* Reason */}
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography sx={{ fontSize: '0.78rem', color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                      {r.reason}
                    </Typography>
                  </TableCell>

                  {/* Age */}
                  <TableCell align="center">
                    <Chip
                      label={`${r.days_unused}d`}
                      size="small"
                      sx={{
                        bgcolor: r.days_unused > 180 ? T.redDim : r.days_unused > 60 ? '#451a03' : T.border,
                        color:   r.days_unused > 180 ? T.red     : r.days_unused > 60 ? '#f59e0b'  : T.muted,
                        fontSize: '0.72rem', fontWeight: 700,
                      }}
                    />
                  </TableCell>

                  {/* Last seen */}
                  <TableCell sx={{ color: T.muted, fontSize: '0.78rem' }}>{fmtDate(r.last_used)}</TableCell>

                  {/* Risk */}
                  <TableCell align="center">
                    <Chip
                      label={r.risk_level}
                      size="small"
                      sx={{ bgcolor: (RISK_COLORS[r.risk_level] || T.muted) + '22', color: RISK_COLORS[r.risk_level] || T.muted, fontSize: '0.72rem', fontWeight: 700 }}
                    />
                  </TableCell>

                  {/* Cost */}
                  <TableCell align="right">
                    <Typography sx={{ fontSize: '0.8rem', color: r.monthly_cost > 0 ? T.red : T.muted, fontWeight: r.monthly_cost > 0 ? 700 : 400 }}>
                      {r.monthly_cost > 0 ? `$${r.monthly_cost.toFixed(2)}` : '—'}
                    </Typography>
                  </TableCell>

                  {/* Can delete */}
                  <TableCell align="center">
                    {r.can_delete
                      ? <CheckIcon sx={{ color: T.green, fontSize: 18 }} />
                      : <ErrorIcon sx={{ color: T.red, fontSize: 18 }} />
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box sx={{ p: 1.5, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ color: T.muted, fontSize: '0.75rem' }}>
              Showing {filtered.length} of {resources.length} cleanup candidates
            </Typography>
            <Typography sx={{ color: T.muted, fontSize: '0.75rem' }}>
              {filtered.filter(r => r.can_delete).length} safe to delete · {filtered.filter(r => !r.can_delete).length} require review
            </Typography>
          </Box>
        </TableContainer>
      )}
    </Box>
  );
};

export default ZombieResources;

// Made with Bob
