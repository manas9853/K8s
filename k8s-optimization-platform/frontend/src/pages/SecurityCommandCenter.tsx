import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Chip, CircularProgress as MuiCircularProgress,
  Alert, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, LinearProgress, Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
  Lock as LockIcon,
  NetworkCheck as NetworkIcon,
  BugReport as BugIcon,
  CheckCircle as CheckIcon,
  ArrowForward as ArrowIcon,
  FiberManualRecord as DotIcon,
  Bolt as BoltIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme ───────────────────────────────────────────────────────────────
const T = {
  bg:      '#0f1724',
  card:    '#1e2433',
  hover:   '#252e42',
  border:  '#2a3245',
  text:    '#e8eaf0',
  muted:   '#8b95a9',
  body:    '#c8cdd8',
  red:     '#f87171',
  redDim:  '#2d1515',
  yellow:  '#f59e0b',
  yellowDim:'#2d200a',
  blue:    '#60a5fa',
  blueDim: '#0d1f3c',
  green:   '#4ade80',
  greenDim:'#0d2d1a',
};

// ─── Severity palette (dark) ──────────────────────────────────────────────────
const SEV: Record<string, { fg: string; bg: string }> = {
  critical: { fg: T.red,    bg: T.redDim    },
  high:     { fg: T.yellow, bg: T.yellowDim },
  medium:   { fg: T.blue,   bg: T.blueDim   },
  low:      { fg: T.green,  bg: T.greenDim  },
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface SecurityScore {
  overall_score: number; grade: string;
  vulnerability_score: number; compliance_score: number;
  configuration_score: number; network_security_score: number; rbac_score: number;
  total_vulnerabilities: number;
  critical_vulnerabilities: number; high_vulnerabilities: number;
  medium_vulnerabilities: number;  low_vulnerabilities: number;
  no_resource_requests: number;    high_memory_pressure: number;
  high_risk_pods: number;          medium_risk_pods: number;
  under_provisioned_pods: number;  stale_secrets_high: number;
  total_pods: number;
}

interface SecurityAlert {
  id: string; severity: string; title: string; description: string;
  affected_resource: string; namespace: string; detected_at: string;
  status: string; remediation?: string;
}

interface CommandCenterData {
  security_score: SecurityScore; alerts: SecurityAlert[];
  total_alerts: number; critical_alerts: number; high_alerts: number;
  medium_alerts: number; low_alerts: number;
  clusters_monitored: number; namespaces_monitored: number;
  pods_scanned: number; last_scan: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const ScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 110 }) => {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 80 ? T.green : score >= 60 ? T.yellow : T.red;
  const track = '#2a3245';
  const dash  = (Math.min(score, 100) / 100) * circ;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={10}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <Box sx={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                 alignItems:'center', justifyContent:'center' }}>
        <Typography sx={{ fontSize: size * 0.22, fontWeight: 700, color, lineHeight: 1 }}>{score}</Typography>
        <Typography sx={{ fontSize: 10, color: T.muted }}>/100</Typography>
      </Box>
    </Box>
  );
};

const MiniBar: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const color = value >= 80 ? T.green : value >= 60 ? T.yellow : T.red;
  return (
    <Box>
      {label && <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography sx={{ fontSize: 11, color: T.muted }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, color }}>{Math.round(value)}%</Typography>
      </Box>}
      <LinearProgress variant="determinate" value={Math.min(value, 100)}
        sx={{ height: 5, borderRadius: 2, bgcolor: T.border,
              '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 } }}/>
    </Box>
  );
};

const SevChip: React.FC<{ sev: string }> = ({ sev }) => {
  const c = SEV[sev] ?? SEV.low;
  return (
    <Chip label={sev.toUpperCase()} size="small"
      sx={{ bgcolor: c.bg, color: c.fg, border: `1px solid ${c.fg}44`,
            fontWeight: 700, fontSize: 10, minWidth: 64 }}/>
  );
};

// ─── Nav tiles ────────────────────────────────────────────────────────────────
const NAV_TILES = [
  { label: 'CVE Dashboard',         path: '/cve-dashboard',                       icon: <BugIcon sx={{ fontSize: 16 }}/> },
  { label: 'Runtime Security',      path: '/runtime-security',                    icon: <ShieldIcon sx={{ fontSize: 16 }}/> },
  { label: 'Privileged Containers', path: '/privileged-containers',               icon: <SecurityIcon sx={{ fontSize: 16 }}/> },
  { label: 'Secret Exposure',       path: '/secret-exposure',                     icon: <LockIcon sx={{ fontSize: 16 }}/> },
  { label: 'RBAC Analysis',         path: '/excessive-permissions',               icon: <LockIcon sx={{ fontSize: 16 }}/> },
  { label: 'Network Policies',      path: '/network-policies',                    icon: <NetworkIcon sx={{ fontSize: 16 }}/> },
  { label: 'Drift Alerts',          path: '/drift-alerts',                        icon: <WarningIcon sx={{ fontSize: 16 }}/> },
  { label: 'Attack Investigation',  path: '/attack-investigation/incident-center',icon: <BoltIcon sx={{ fontSize: 16 }}/> },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const SecurityCommandCenter: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data,       setData]      = useState<CommandCenterData | null>(null);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing]= useState(false);
  const [sevFilter,  setSevFilter] = useState<string>('all');

  const fetchData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/command-center${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json()); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 90_000);
    return () => clearInterval(id);
  }, [clusterParam]); // eslint-disable-line

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alerts.filter(a => sevFilter === 'all' || a.severity === sevFilter);
  }, [data, sevFilter]);

  // ── loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <MuiCircularProgress sx={{ color: T.green }} />
    </Box>
  );
  if (error || !data) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: T.redDim, color: T.red, border: `1px solid ${T.red}` }}>
        {error || 'No data available'}
      </Alert>
    </Box>
  );

  const ss = data.security_score;

  const POSTURE_ROWS = [
    { label: 'Vulnerabilities', score: ss.vulnerability_score,    icon: <BugIcon sx={{ fontSize: 16 }}/>,      path: '/cve-dashboard' },
    { label: 'Compliance',      score: ss.compliance_score,        icon: <ShieldIcon sx={{ fontSize: 16 }}/>,   path: '/compliance-score' },
    { label: 'Configuration',   score: ss.configuration_score,     icon: <SecurityIcon sx={{ fontSize: 16 }}/>, path: '/runtime-security' },
    { label: 'Network',         score: ss.network_security_score,  icon: <NetworkIcon sx={{ fontSize: 16 }}/>,  path: '/network-policies' },
    { label: 'RBAC',            score: ss.rbac_score,              icon: <LockIcon sx={{ fontSize: 16 }}/>,     path: '/excessive-permissions' },
  ];

  const cellSx  = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.5 };
  const headSx  = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5, bgcolor: '#161f30' };

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ShieldIcon sx={{ fontSize: 32, color: T.green }} />
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Security Command Center</Typography>
            <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.25 }}>
              {data.clusters_monitored} cluster · {data.namespaces_monitored} namespaces · {data.pods_scanned} pods scanned ·
              {' '}last scan {new Date(data.last_scan).toLocaleTimeString()}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={() => fetchData(true)} disabled={refreshing}
          sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </IconButton>
      </Box>

      {/* ── Row 1: Score + Open Issues + Posture areas ──────────────────── */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>

        {/* Score gauge */}
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                Security Posture
              </Typography>
              <ScoreGauge score={ss.overall_score} size={110} />
              <Chip label={`Grade ${ss.grade}`} size="small"
                sx={{ mt: 1.5, fontWeight: 700, fontSize: 13,
                  bgcolor: ss.overall_score >= 80 ? T.greenDim : ss.overall_score >= 60 ? T.yellowDim : T.redDim,
                  color:   ss.overall_score >= 80 ? T.green    : ss.overall_score >= 60 ? T.yellow    : T.red,
                  border: `1px solid ${ss.overall_score >= 80 ? T.green : ss.overall_score >= 60 ? T.yellow : T.red}44`,
                }} />
              <Typography sx={{ fontSize: 11, color: T.muted, mt: 1 }}>
                xforce-devops cluster
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Open issues */}
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                Open Issues
              </Typography>
              {([
                { label: 'Critical', count: data.critical_alerts, sev: 'critical' },
                { label: 'High',     count: data.high_alerts,     sev: 'high'     },
                { label: 'Medium',   count: data.medium_alerts,   sev: 'medium'   },
                { label: 'Low',      count: data.low_alerts,      sev: 'low'      },
              ] as { label: string; count: number; sev: string }[]).map(({ label, count, sev }) => (
                <Box key={label} sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 1.5, py: 0.75, borderRadius: 1, mb: 0.75,
                  bgcolor: SEV[sev].bg, border: `1px solid ${SEV[sev].fg}22`,
                  cursor: 'pointer', '&:hover': { opacity: 0.85 },
                }} onClick={() => setSevFilter(sevFilter === sev ? 'all' : sev)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <DotIcon sx={{ fontSize: 10, color: SEV[sev].fg }} />
                    <Typography sx={{ fontSize: 12, color: SEV[sev].fg, fontWeight: 600 }}>{label}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 20, fontWeight: 700, color: SEV[sev].fg, lineHeight: 1 }}>
                    {count}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Posture breakdown */}
        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 2 }}>
                Posture by Area
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {POSTURE_ROWS.map(row => (
                  <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ color: T.muted, minWidth: 18 }}>{row.icon}</Box>
                    <Typography sx={{ fontSize: 12, color: T.body, minWidth: 110 }}>{row.label}</Typography>
                    <Box sx={{ flex: 1 }}>
                      <MiniBar value={row.score} />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: row.score >= 80 ? T.green : row.score >= 60 ? T.yellow : T.red, minWidth: 34, textAlign: 'right' }}>
                      {row.score.toFixed(0)}%
                    </Typography>
                    <IconButton size="small" onClick={() => navigate(row.path)}
                      sx={{ color: T.muted, p: 0.25, '&:hover': { color: T.text } }}>
                      <ArrowIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 2: Signal cards ──────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {([
          { label: 'High-Risk Pods',      value: ss.high_risk_pods,         bad: ss.high_risk_pods > 0,          icon: <BugIcon sx={{ fontSize: 18 }}/>,      path: '/pods' },
          { label: 'No Resource Limits',  value: ss.no_resource_requests,   bad: ss.no_resource_requests > 5,    icon: <WarningIcon sx={{ fontSize: 18 }}/>,   path: '/recommendations' },
          { label: 'Memory Pressure',     value: ss.high_memory_pressure,   bad: ss.high_memory_pressure > 0,    icon: <WarningIcon sx={{ fontSize: 18 }}/>,   path: '/memory-analysis' },
          { label: 'Under-Provisioned',   value: ss.under_provisioned_pods, bad: ss.under_provisioned_pods > 10, icon: <WarningIcon sx={{ fontSize: 18 }}/>,   path: '/cpu-rightsizing' },
          { label: 'Stale Secrets (High)',value: ss.stale_secrets_high,     bad: ss.stale_secrets_high > 0,      icon: <LockIcon sx={{ fontSize: 18 }}/>,      path: '/stale-secrets' },
          { label: 'Total Pods Scanned',  value: ss.total_pods,             bad: false,                          icon: <CheckIcon sx={{ fontSize: 18 }}/>,     path: '/pods' },
        ] as { label: string; value: number; bad: boolean; icon: React.ReactNode; path: string }[]).map(item => (
          <Grid item xs={6} sm={4} md={2} key={item.label}>
            <Card sx={{
              bgcolor: T.card, borderRadius: 2, cursor: 'pointer',
              border: `1px solid ${item.bad ? T.yellow + '55' : T.border}`,
              '&:hover': { bgcolor: T.hover },
            }} onClick={() => navigate(item.path)}>
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Box sx={{ color: item.bad ? T.yellow : T.muted }}>{item.icon}</Box>
                  <Typography sx={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 1.3 }}>
                    {item.label}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 26, fontWeight: 700, color: item.bad ? T.yellow : T.text, lineHeight: 1 }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Live Alert Feed ──────────────────────────────────────────────── */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, mb: 2.5 }}>
        {/* table header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BoltIcon sx={{ fontSize: 18, color: T.red }} />
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.text }}>Live Security Alerts</Typography>
            <Chip label={`${data.total_alerts} total`} size="small"
              sx={{ bgcolor: T.border, color: T.muted, fontSize: 10 }}/>
          </Box>
          {/* severity filter chips */}
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => (
              <Chip key={s} label={s === 'all' ? 'All' : s} size="small"
                onClick={() => setSevFilter(s)}
                sx={{
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  bgcolor: sevFilter === s ? (s === 'all' ? T.border : SEV[s]?.bg ?? T.border) : 'transparent',
                  color:   sevFilter === s ? (s === 'all' ? T.text   : SEV[s]?.fg ?? T.text)   : T.muted,
                  border: `1px solid ${sevFilter === s ? (s === 'all' ? T.muted : SEV[s]?.fg ?? T.muted) : T.border}`,
                  '&:hover': { opacity: 0.85 },
                }}/>
            ))}
          </Box>
        </Box>

        {filteredAlerts.length === 0 ? (
          <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckIcon sx={{ color: T.green }} />
            <Typography sx={{ fontSize: 13, color: T.muted }}>
              {sevFilter === 'all' ? 'No active security alerts.' : `No ${sevFilter} alerts.`}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Severity</TableCell>
                  <TableCell sx={headSx}>Alert</TableCell>
                  <TableCell sx={headSx}>Resource</TableCell>
                  <TableCell sx={headSx}>Namespace</TableCell>
                  <TableCell sx={headSx}>Time</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx}>Remediation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAlerts.slice(0, 50).map(alert => (
                  <TableRow key={alert.id} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}><SevChip sev={alert.severity}/></TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }} noWrap>
                        {alert.title}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: T.muted }} noWrap>
                        {alert.description}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: 'monospace', fontSize: 11, color: T.body, maxWidth: 140 }}>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: T.body }} noWrap>
                        {alert.affected_resource}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: 'monospace', fontSize: 11 }}>
                      {alert.namespace}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontSize: 11, color: T.muted }}>
                      {new Date(alert.detected_at).toLocaleTimeString()}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={alert.status} size="small"
                        sx={{ bgcolor: T.border, color: T.muted, border: `1px solid ${T.border}`, fontSize: 10 }}/>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, maxWidth: 180 }}>
                      {alert.remediation && (
                        <Tooltip title={alert.remediation} arrow>
                          <Typography sx={{ fontSize: 10, color: T.muted, cursor: 'help',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {alert.remediation}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── Quick Nav ────────────────────────────────────────────────────── */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2 }}>
        <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
          Quick Access
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {NAV_TILES.map(({ label, path, icon }) => (
            <Box key={path} onClick={() => navigate(path)} sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.75, borderRadius: 1.5, cursor: 'pointer',
              bgcolor: T.bg, border: `1px solid ${T.border}`,
              color: T.body, fontSize: 12,
              '&:hover': { bgcolor: T.hover, color: T.text, borderColor: T.muted },
            }}>
              <Box sx={{ color: T.muted }}>{icon}</Box>
              <Typography sx={{ fontSize: 12, color: 'inherit' }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

    </Box>
  );
};

export default SecurityCommandCenter;
// Made with Bob
