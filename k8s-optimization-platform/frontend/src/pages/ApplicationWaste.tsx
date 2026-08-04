import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Paper,
  TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
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
interface AppRow {
  name:           string;   // owner_name / workload name
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

const severity = (pct: number) =>
  pct >= 75 ? 'Critical' : pct >= 55 ? 'High' : pct >= 35 ? 'Medium' : 'Low';

const severityColor = (pct: number) =>
  pct >= 75 ? T.red : pct >= 55 ? T.red : pct >= 35 ? T.yellow : T.green;

const severityBg = (pct: number) =>
  pct >= 55 ? '#450a0a' : pct >= 35 ? '#451a03' : '#052e16';

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
const ApplicationWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [rows,          setRows]         = useState<AppRow[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);
  const [search,        setSearch]       = useState('');
  const [severityFilter,setSeverityFilter] = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const apps: AppRow[] = (data.savings_by_application ?? []).map((a: any) => ({
        name:           a.name,
        current_cost:   a.current_cost,
        optimized_cost: a.optimized_cost,
        savings:        a.savings,
        waste_pct:      a.savings_percent,
      }));
      setRows(apps);
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
    const matchSev =
      severityFilter === 'all'      ? true :
      severityFilter === 'critical' ? r.waste_pct >= 75 :
      severityFilter === 'high'     ? r.waste_pct >= 55 && r.waste_pct < 75 :
      severityFilter === 'medium'   ? r.waste_pct >= 35 && r.waste_pct < 55 :
                                      r.waste_pct < 35;
    return matchSearch && matchSev;
  }), [rows, search, severityFilter]);

  const totalCurrent  = filtered.reduce((s, r) => s + r.current_cost, 0);
  const totalSavings  = filtered.reduce((s, r) => s + r.savings, 0);
  const avgWaste      = filtered.length > 0 ? filtered.reduce((s, r) => s + r.waste_pct, 0) / filtered.length : 0;
  const criticalApps  = rows.filter(r => r.waste_pct >= 75).length;

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Application Waste</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            {filtered.length} of {rows.length} workloads — over-provisioned resource spend vs. optimal sizing
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Applications" value={rows.length} sub="Distinct workloads" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Total Spend" value={`$${totalCurrent.toFixed(0)}/mo`} sub="Shown workloads" accent={T.body} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Potential Savings" value={`$${totalSavings.toFixed(0)}/mo`} sub={`$${(totalSavings * 12).toFixed(0)}/yr`} accent={T.red} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Critical Waste" value={criticalApps} sub="≥75% over-provisioned" accent={criticalApps > 0 ? T.red : T.green} />
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={7}>
            <TextField fullWidth size="small"
              placeholder="Search workload / owner name…"
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
          <Grid item xs={12} md={5}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted }}>Severity</InputLabel>
              <Select value={severityFilter} label="Severity"
                onChange={(e: SelectChangeEvent) => setSeverityFilter(e.target.value)}
                sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">All Severities</MenuItem>
                <MenuItem value="critical">Critical (≥75%)</MenuItem>
                <MenuItem value="high">High (55–75%)</MenuItem>
                <MenuItem value="medium">Medium (35–55%)</MenuItem>
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
              <TableCell sx={headSx}>Workload / Owner</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Current/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Optimal/mo</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Waste/mo</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 160 }}>Waste %</TableCell>
              <TableCell sx={headSx}>Severity</TableCell>
              <TableCell sx={headSx}>Recommendation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No workloads match your filters
                </TableCell>
              </TableRow>
            ) : filtered.map(row => {
              const wPct = row.waste_pct;
              const sev  = severity(wPct);
              const rec  = wPct >= 90 ? `Reduce requests by ~${Math.round(wPct)}%`
                : wPct >= 75 ? 'Critical over-provisioning — right-size immediately'
                : wPct >= 55 ? 'High waste — reduce CPU/Mem requests'
                : wPct >= 35 ? 'Moderate over-provisioning detected'
                : 'Near-optimal — minor tuning possible';
              return (
                <TableRow key={row.name} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                  <TableCell sx={cellSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {wPct >= 60 && <WarningIcon sx={{ fontSize: 13, color: wasteColor(wPct), flexShrink: 0 }} />}
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
                  <TableCell sx={cellSx}>
                    <Chip label={sev} size="small"
                      sx={{ bgcolor: severityBg(wPct), color: severityColor(wPct),
                        border: `1px solid ${severityColor(wPct)}44`, fontSize: 10, height: 18 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, maxWidth: 240 }}>
                    <Typography noWrap sx={{ fontSize: 11, color: T.muted }} title={rec}>{rec}</Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 12, color: T.muted, mt: 2, textAlign: 'right' }}>
        {filtered.length} of {rows.length} workloads shown · sorted by waste savings descending
      </Typography>
    </Box>
  );
};

export default ApplicationWaste;
