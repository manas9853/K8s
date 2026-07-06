import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress as MuiCircularProgress, Alert, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Paper, LinearProgress, TextField, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const scoreColor = (s: number) => s >= 80 ? T.green : s >= 55 ? T.yellow : T.red;
const gradeColors: Record<string, string> = { A: T.green, 'A-': T.green, 'A+': T.green, B: T.green, 'B+': T.green, 'B-': T.green, C: T.yellow, 'C+': T.yellow, D: T.red, F: T.red };
const gradeBg:     Record<string, string>  = { A: '#052e16', 'A-': '#052e16', 'A+': '#052e16', B: '#052e16', 'B+': '#052e16', 'B-': '#052e16', C: '#451a03', 'C+': '#451a03', D: '#450a0a', F: '#450a0a' };
const gradeSimple = (g: string) => g[0] ?? 'F'; // for chip display

const ScoreGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 48 }) => {
  const col = scoreColor(value);
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <MuiCircularProgress variant="determinate" value={100} size={size}
        sx={{ color: T.border, position: 'absolute' }} />
      <MuiCircularProgress variant="determinate" value={Math.min(value, 100)} size={size}
        sx={{ color: col }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: size * 0.22, fontWeight: 700, color: col, lineHeight: 1 }}>
          {Math.round(value)}
        </Typography>
      </Box>
    </Box>
  );
};

const MiniBar: React.FC<{ value: number }> = ({ value }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
    <Box sx={{ flex: 1, height: 4, bgcolor: T.border, borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, bgcolor: scoreColor(value), borderRadius: 2 }} />
    </Box>
    <Typography sx={{ fontSize: 10, color: scoreColor(value), minWidth: 28, textAlign: 'right' }}>
      {Math.round(value)}%
    </Typography>
  </Box>
);

const selectSx = {
  color: T.body, bgcolor: T.bg,
  '& .MuiOutlinedInput-notchedOutline':            { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline':      { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor: T.border },
  '& .MuiSvgIcon-root':                            { color: T.muted },
};
const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } };

interface NsRow {
  namespace:           string;
  cluster:             string;
  overall_score:       number;
  cpu_efficiency:      number;
  memory_efficiency:   number;
  storage_efficiency:  number;
  resource_utilization:number;
  pod_health:          number;
  grade:               string;
  status:              string;
  pod_count:           number;
  issues_count:        number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const NamespaceScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [rows,        setRows]        = useState<NsRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/scoring/namespace-score${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: NsRow[] = (data.namespaces ?? []);
      // sort worst-first so actionable items appear at top
      setRows([...items].sort((a, b) => a.overall_score - b.overall_score));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const filtered = useMemo(() => rows.filter(r => {
    const matchSearch = r.namespace.toLowerCase().includes(search.toLowerCase());
    const matchGrade  = gradeFilter === 'all' || gradeSimple(r.grade) === gradeFilter;
    return matchSearch && matchGrade;
  }), [rows, search, gradeFilter]);

  const avgScore       = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.overall_score, 0) / rows.length) : 0;
  const excellentCount = rows.filter(r => r.overall_score >= 80).length;
  const needsWork      = rows.filter(r => r.overall_score < 60).length;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.5 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5, bgcolor: '#161f30' };

  if (loading) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <MuiCircularProgress sx={{ color: T.green }} />
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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Namespace Optimization Score</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            {filtered.length} of {rows.length} namespaces — CPU/memory efficiency from live agent pod metrics
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 2 }}>
              <ScoreGauge value={avgScore} size={56} />
              <Box>
                <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Avg Score</Typography>
                <Typography sx={{ fontSize: 12, color: T.muted }}>Across {rows.length} NS</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>Good (≥80)</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: T.green, lineHeight: 1 }}>{excellentCount}</Typography>
              <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>Well optimised</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>Needs Work (&lt;60)</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: needsWork > 0 ? T.red : T.green, lineHeight: 1 }}>{needsWork}</Typography>
              <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>Require attention</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>Namespaces</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1 }}>{rows.length}</Typography>
              <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>Monitored</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={7}>
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
          <Grid item xs={12} md={5}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted }}>Grade</InputLabel>
              <Select value={gradeFilter} label="Grade"
                onChange={(e: SelectChangeEvent) => setGradeFilter(e.target.value)}
                sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">All Grades</MenuItem>
                <MenuItem value="A">A — Excellent</MenuItem>
                <MenuItem value="B">B — Good</MenuItem>
                <MenuItem value="C">C — Fair</MenuItem>
                <MenuItem value="D">D — Poor</MenuItem>
                <MenuItem value="F">F — Critical</MenuItem>
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
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Pods</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Score</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Grade</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>CPU Eff.</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>Mem Eff.</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>Pod Health</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Issues</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No namespaces match your filters
                </TableCell>
              </TableRow>
            ) : filtered.map(row => (
              <TableRow key={row.namespace} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                <TableCell sx={cellSx}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {row.overall_score < 60 && <WarningIcon sx={{ fontSize: 13, color: T.red, flexShrink: 0 }} />}
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                      {row.namespace}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>{row.pod_count}</TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                  <ScoreGauge value={row.overall_score} size={40} />
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                  <Chip label={row.grade} size="small"
                    sx={{ bgcolor: gradeBg[row.grade] ?? '#450a0a', color: gradeColors[row.grade] ?? T.red,
                      border: `1px solid ${(gradeColors[row.grade] ?? T.red)}44`, fontWeight: 700, fontSize: 11 }} />
                </TableCell>
                <TableCell sx={cellSx}><MiniBar value={row.cpu_efficiency} /></TableCell>
                <TableCell sx={cellSx}><MiniBar value={row.memory_efficiency} /></TableCell>
                <TableCell sx={cellSx}><MiniBar value={row.pod_health} /></TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: row.issues_count > 0 ? T.yellow : T.muted }}>
                    {row.issues_count}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 11, color: T.muted, mt: 2 }}>
        Score = CPU eff. ×35% + Mem eff. ×30% + Pod health ×20% + Storage ×15% · worst first · data from xforce-devops agent
      </Typography>
    </Box>
  );
};

export default NamespaceScore;
