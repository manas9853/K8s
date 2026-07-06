import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, InputAdornment, Select,
  MenuItem, FormControl
} from '@mui/material';
import {
  Security as SecurityIcon, Error as ErrorIcon,
  Block as BlockIcon, ArrowForward as ArrowIcon, Search as SearchIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface RuntimeThreat {
  id: string; severity: string; threat_type: string; pod_name: string;
  container_name: string; namespace: string; detected_at: string;
  status: string; details: string; recommended_action: string;
}
interface RuntimeSecurityData {
  runtime_score: number; total_threats: number; critical_threats: number;
  high_threats: number; medium_threats: number; low_threats: number;
  runtime_threats: RuntimeThreat[]; suspicious_processes: any[];
  containers_monitored: number; risky_containers: number;
  clean_containers: number; last_scan: string;
}

const MITRE_MAP: Record<string, { tactic: string; technique: string; id: string }> = {
  'Privileged Execution':       { tactic: 'Privilege Escalation', technique: 'Exploitation for Privilege Escalation', id: 'T1068' },
  'Root User Execution':        { tactic: 'Privilege Escalation', technique: 'Abuse Elevation Control Mechanism',     id: 'T1548' },
  'Privilege Escalation Risk':  { tactic: 'Privilege Escalation', technique: 'Setuid / Setgid',                      id: 'T1548.001' },
  'Writable Root Filesystem':   { tactic: 'Persistence',          technique: 'Server Software Component',            id: 'T1505' },
  'Unbounded Resource Usage':   { tactic: 'Impact',               technique: 'Resource Hijacking',                   id: 'T1496' },
  'Memory Pressure':            { tactic: 'Impact',               technique: 'Endpoint Denial of Service',           id: 'T1499' },
};

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

const RuntimeSecurity: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<RuntimeSecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [nsFilter, setNsFilter] = useState('all');

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/container-security/runtime${clusterParam}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { /* keep previous */ }
    finally { setLoading(false); }
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress size={48} sx={{ color: '#60a5fa' }} />
    </Box>
  );
  if (!data) return <Alert severity="error">Failed to load runtime security data</Alert>;

  const scoreColor = data.runtime_score >= 80 ? '#4ade80' : data.runtime_score >= 60 ? '#f59e0b' : '#f87171';
  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(data.runtime_score, 100) / 100) * circ;

  // Filter threats
  const threats = data.runtime_threats ?? [];
  const namespaces = Array.from(new Set(threats.map(t => t.namespace))).sort();
  const filtered = threats.filter(t => {
    if (sevFilter !== 'all' && t.severity !== sevFilter) return false;
    if (nsFilter !== 'all' && t.namespace !== nsFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.pod_name.toLowerCase().includes(s) ||
             t.container_name.toLowerCase().includes(s) ||
             t.namespace.toLowerCase().includes(s) ||
             t.threat_type.toLowerCase().includes(s);
    }
    return true;
  });

  const criticalThreats = threats.filter(t => t.severity === 'critical');

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Runtime Security</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Signal-based threat detection · {data.containers_monitored} containers · {data.total_threats} signals · Last scan {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + BREAKDOWN */}
      <Grid container spacing={2} mb={3}>
        {/* Score ring */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Security Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{data.runtime_score}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 0.5 }}>
                {data.clean_containers ?? 0} / {data.containers_monitored} containers clean
              </Typography>
              <Chip
                label={data.risky_containers ? `${data.risky_containers} risky containers` : 'All clean'}
                size="small"
                sx={{ mt: 1,
                  bgcolor: (data.risky_containers ?? 0) > 0 ? '#2d1515' : '#0d2d1a',
                  color:   (data.risky_containers ?? 0) > 0 ? '#f87171' : '#4ade80',
                  fontWeight: 'bold' }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Severity breakdown */}
        <Grid item xs={12} md={9}>
          <Card sx={{ height: '100%', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Threat Signal Breakdown</Typography>
              <Grid container spacing={1} mt={0.5}>
                {[
                  { label: 'Critical', count: data.critical_threats, sub: 'Privileged containers' },
                  { label: 'High',     count: data.high_threats,     sub: 'Root + priv-esc' },
                  { label: 'Medium',   count: data.medium_threats,   sub: 'Writable FS + no limits' },
                  { label: 'Low',      count: data.low_threats,      sub: 'Info' },
                ].map(({ label, count, sub }) => {
                  const lbl = label.toLowerCase();
                  return (
                    <Grid item xs={6} md={3} key={label}>
                      <Box
                        onClick={() => setSevFilter(lbl === sevFilter ? 'all' : lbl)}
                        sx={{ p: 1.5, borderRadius: 1.5, bgcolor: SEV_BG[lbl],
                          border: `2px solid ${sevFilter === lbl ? SEV_COLOR[lbl] : SEV_COLOR[lbl] + '40'}`,
                          textAlign: 'center', cursor: 'pointer',
                          transition: 'border-color 0.15s',
                          '&:hover': { border: `2px solid ${SEV_COLOR[lbl]}` } }}>
                        <Typography variant="h4" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{count}</Typography>
                        <Typography variant="caption" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{label}</Typography>
                        <Typography variant="caption" display="block" sx={{ color: '#8892a4' }}>{sub}</Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* CRITICAL THREATS SPOTLIGHT */}
      {criticalThreats.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>
              Critical Threats — {criticalThreats.length} Privileged Containers
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>Can escape to host node</Typography>
          </Box>
          <Grid container spacing={1.5}>
            {criticalThreats.slice(0, 6).map((threat) => {
              const mitre = MITRE_MAP[threat.threat_type] ?? null;
              return (
                <Grid item xs={12} md={6} key={threat.id}>
                  <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140' }}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                      <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#f87171', color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{threat.threat_type}</Typography>
                      {mitre && (
                        <Tooltip title={`${mitre.tactic} → ${mitre.technique}`}>
                          <Chip label={mitre.id} size="small" variant="outlined"
                            sx={{ fontSize: 10, borderColor: '#a78bfa', color: '#a78bfa' }} />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: '#e8eaf0', fontWeight: 600 }}>
                      {threat.pod_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {threat.container_name} · {threat.namespace}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#f87171', display: 'block', mt: 0.5 }}>
                      {threat.details}
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
          {criticalThreats.length > 6 && (
            <Typography variant="caption" sx={{ color: '#f87171', mt: 1, display: 'block' }}>
              +{criticalThreats.length - 6} more critical threats — see table below
            </Typography>
          )}
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" startIcon={<BlockIcon />}
              onClick={() => navigate('/auto-remediation-security')}
              sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
              Remediate All ({criticalThreats.length})
            </Button>
            <Button variant="outlined" onClick={() => navigate('/privileged-containers')}
              sx={{ borderColor: '#f87171', color: '#f87171' }}>
              View Privileged Containers
            </Button>
          </Box>
        </Paper>
      )}

      {/* FULL THREAT TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Runtime Threats ({filtered.length})
          </Typography>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            {/* Search */}
            <TextField size="small" placeholder="Search pod / namespace…"
              value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#8892a4', fontSize: 18 }} /></InputAdornment>,
                sx: { bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1,
                  '& input': { color: '#e8eaf0' }, fontSize: 13 }
              }}
              sx={{ minWidth: 200 }} variant="outlined" />
            {/* Severity filter */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
                sx={{ bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1, fontSize: 13 }}>
                <MenuItem value="all">All Severities</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
              </Select>
            </FormControl>
            {/* Namespace filter */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                sx={{ bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1, fontSize: 13 }}>
                <MenuItem value="all">All Namespaces</MenuItem>
                {namespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/attack-investigation/active-threats')}
            sx={{ color: '#60a5fa' }}>
            Full Investigation
          </Button>
        </Box>

        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {['Severity', 'Threat Type', 'MITRE', 'Pod', 'Container', 'Namespace', 'Fix'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4',
                    bgcolor: '#131d2e', borderColor: '#2a3245' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(0, 100).map((t, i) => {
                const mitre = MITRE_MAP[t.threat_type];
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={t.severity.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[t.severity], color: SEV_COLOR[t.severity], fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245' }}>
                      {t.threat_type}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      {mitre ? (
                        <Tooltip title={`${mitre.tactic}: ${mitre.technique}`} arrow>
                          <Chip label={mitre.id} size="small" variant="outlined"
                            sx={{ fontSize: 10, borderColor: '#a78bfa', color: '#a78bfa', cursor: 'help' }} />
                        </Tooltip>
                      ) : <Typography sx={{ color: '#8892a4', fontSize: 12 }}>—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 500, borderColor: '#2a3245', maxWidth: 160,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.pod_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{t.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, borderColor: '#2a3245' }}>
                      <Chip label={t.namespace} size="small"
                        sx={{ bgcolor: '#1a2035', color: '#8892a4', fontSize: 10, border: '1px solid #2a3245' }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Tooltip title={t.recommended_action} arrow>
                        <Typography variant="caption" sx={{ color: '#60a5fa', fontSize: 10, cursor: 'help',
                          maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.recommended_action.split(';')[0]}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {filtered.length > 100 && (
          <Box p={1.5} sx={{ borderTop: '1px solid #2a3245' }}>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Showing 100 of {filtered.length} threats. Use filters to narrow results.
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default RuntimeSecurity;
// Made with Bob
