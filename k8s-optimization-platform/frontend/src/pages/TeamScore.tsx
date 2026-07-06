import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress as MuiCircularProgress, Alert, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Paper, TextField, InputAdornment,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Group as GroupIcon,
  Info as InfoIcon,
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
const gradeBg:    Record<string, string>  = { A: '#052e16', 'A-': '#052e16', 'A+': '#052e16', B: '#052e16', 'B+': '#052e16', 'B-': '#052e16', C: '#451a03', 'C+': '#451a03', D: '#450a0a', F: '#450a0a' };

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

interface TeamRow {
  team_name:             string;
  overall_score:         number;
  cpu_efficiency:        number;
  memory_efficiency:     number;
  compliance_score:      number;
  best_practices_score:  number;
  grade:                 string;
  status:                string;
  namespace_count:       number;
  pod_count:             number;
  issues_count:          number;
  recommendations_count: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const TeamScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [rows,    setRows]    = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/scoring/team-score${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // sort worst-first by default
      setRows([...(data.teams ?? [])].sort((a: TeamRow, b: TeamRow) => a.overall_score - b.overall_score));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const filtered = useMemo(() => rows.filter(r =>
    r.team_name.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const avgScore  = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.overall_score, 0) / rows.length) : 0;
  const totalPods = rows.reduce((s, r) => s + r.pod_count, 0);

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
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Team Optimization Score</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Grouped by namespace prefix · {rows.length} team{rows.length !== 1 ? 's' : ''} · {totalPods} pods
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Info banner — explain grouping strategy */}
      <Paper sx={{ bgcolor: '#0d1a2e', border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <InfoIcon sx={{ color: T.muted, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 12, color: T.body }}>
          Teams are derived from the <strong style={{ color: T.text }}>namespace prefix</strong> (e.g.{' '}
          <code style={{ fontFamily: 'monospace', color: T.yellow }}>kube-system</code>,{' '}
          <code style={{ fontFamily: 'monospace', color: T.yellow }}>kube-public</code> → <strong>Kube Team</strong>).
          Add a <code style={{ fontFamily: 'monospace', color: T.yellow }}>team</code> label to pods for explicit team grouping.
        </Typography>
      </Paper>

      {/* Stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 2 }}>
              <ScoreGauge value={avgScore} size={56} />
              <Box>
                <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Avg Score</Typography>
                <Typography sx={{ fontSize: 12, color: T.muted }}>{rows.length} group{rows.length !== 1 ? 's' : ''}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        {/* top-3 teams by score (best first) */}
        {[...rows].sort((a, b) => b.overall_score - a.overall_score).slice(0, 3).map((r) => (
          <Grid item xs={6} sm={3} key={r.team_name}>
            <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                  <GroupIcon sx={{ fontSize: 15, color: T.muted }} />
                  <Typography sx={{ fontSize: 11, color: T.muted, fontFamily: 'monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                    {r.team_name}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 26, fontWeight: 700, color: scoreColor(r.overall_score), lineHeight: 1 }}>
                  {r.overall_score}
                </Typography>
                <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>
                  {r.grade} · {r.pod_count} pods · {r.namespace_count} NS
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
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
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Pods</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>NS</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Score</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Grade</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>CPU Eff.</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>Mem Eff.</TableCell>
              <TableCell sx={{ ...headSx, minWidth: 110 }}>Compliance</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Issues</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No teams match your search
                </TableCell>
              </TableRow>
            ) : filtered.map(row => (
              <TableRow key={row.team_name} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                <TableCell sx={cellSx}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GroupIcon sx={{ fontSize: 15, color: T.muted }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                      {row.team_name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>{row.pod_count}</TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>{row.namespace_count}</TableCell>
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
                <TableCell sx={cellSx}><MiniBar value={row.compliance_score} /></TableCell>
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
        Score = CPU eff. ×30% + Mem eff. ×30% + Compliance ×25% + Best-practices ×15% · worst first · data from xforce-devops agent
      </Typography>
    </Box>
  );
};

export default TeamScore;
