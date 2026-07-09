import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Accordion, AccordionSummary, AccordionDetails, Tabs, Tab,
  Button, LinearProgress, List, ListItem, Divider, IconButton,
  Snackbar, Alert, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SpeedIcon from '@mui/icons-material/Speed';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PatternIcon from '@mui/icons-material/Pattern';
import TimelineIcon from '@mui/icons-material/Timeline';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Incident {
  incident_id: string;
  type: string;
  severity: string;
  pod_name: string;
  namespace: string;
  cluster: string;
  timestamp: string;
  count: number;
  message: string;
  resource_correlation: Record<string, any>;
}

interface Correlation {
  incident_id: string;
  incident_type: string;
  pod_name: string;
  namespace: string;
  cluster: string;
  root_cause: string;
  confidence: number;
  correlated_metrics: Record<string, any>;
  recommendation: string;
  estimated_fix_time: string;
  priority: string;
}

interface Pattern {
  pattern_id: string;
  pattern_type: string;
  description: string;
  frequency: number;
  affected_pods: string[];
  common_cause: string;
  prevention_steps: string[];
}

interface Summary {
  total_incidents: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  top_affected_pods: { pod: string; count: number }[];
  total_oomkills: number;
  total_restarts: number;
  total_throttling_events: number;
}

// ─── Design tokens ─────────────────────────────────────────────────────────

const DK = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#1c2128',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

const SEV: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

const TYPE_COLOR: Record<string, string> = {
  oomkill:   '#f85149',
  restart:   '#d29922',
  throttling:'#3b82f6',
  eviction:  '#a371f7',
};

const PIE_COLORS = ['#f85149', '#d29922', '#3b82f6', '#a371f7', '#3fb950', '#58a6ff'];

// ─── Reusable mini-components ──────────────────────────────────────────────

const SevChip: React.FC<{ value: string }> = ({ value }) => {
  const c = SEV[value] ?? DK.muted;
  return (
    <Chip label={value} size="small" sx={{
      bgcolor: `${c}22`, color: c, border: `1px solid ${c}44`,
      fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase',
    }} />
  );
};

const SevIcon: React.FC<{ value: string; size?: number }> = ({ value, size = 18 }) => {
  const sx = { fontSize: size, color: SEV[value] ?? DK.muted };
  if (value === 'critical') return <ErrorOutlineIcon sx={sx} />;
  if (value === 'high')     return <WarningAmberIcon sx={sx} />;
  if (value === 'medium')   return <InfoOutlinedIcon sx={sx} />;
  return <CheckCircleOutlineIcon sx={sx} />;
};

const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const sx = { fontSize: 18, color: TYPE_COLOR[type] ?? DK.muted };
  if (type === 'oomkill')   return <MemoryIcon sx={sx} />;
  if (type === 'restart')   return <RestartAltIcon sx={sx} />;
  if (type === 'throttling')return <SpeedIcon sx={sx} />;
  return <DeleteSweepIcon sx={sx} />;
};

const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; sub?: string }> = ({ label, value, accent, sub }) => (
  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: '16px !important' }}>
      <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>{value}</Typography>
      {sub && <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ─── Main component ────────────────────────────────────────────────────────

const IncidentsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [patterns, setPatterns]       = useState<Pattern[]>([]);
  const [summary, setSummary]         = useState<Summary | null>(null);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState(0);
  const [fixLoading, setFixLoading]   = useState<string | null>(null);
  const [fixedIds, setFixedIds]       = useState<Set<string>>(new Set());
  const [toast, setToast]             = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'success' });

  useEffect(() => { fetchAll(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [incR, corR, patR, sumR] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/incidents/incidents${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/incidents/correlations${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/incidents/patterns${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/incidents/summary${clusterParam}`),
      ]);
      if (incR.ok) setIncidents(await incR.json());
      if (corR.ok) setCorrelations(await corR.json());
      if (patR.ok) setPatterns(await patR.json());
      if (sumR.ok) setSummary(await sumR.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Fix an incident via the root-cause fix endpoint (enqueues agent command)
  const handleFix = async (inc: Incident) => {
    setFixLoading(inc.incident_id);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name: inc.pod_name,
          namespace: inc.namespace,
          issue_type: inc.type,
          cpu_request: 0,
          memory_request_mb: 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ open: true, msg: body?.detail ?? `Fix failed (HTTP ${res.status})`, sev: 'error' });
        return;
      }

      const cmdId = body.command_id;
      setToast({ open: true, msg: `⏳ Fix queued — waiting for agent…`, sev: 'info' });

      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
        if (!poll) continue;
        const status = await poll.json().catch(() => ({}));
        if (status.status === 'done') {
          setFixedIds(prev => new Set(prev).add(inc.incident_id));
          setToast({ open: true, msg: `✅ Fixed: ${inc.type} on ${inc.pod_name} — patch applied to ${body.workload_kind}/${body.workload_name}`, sev: 'success' });
          return;
        }
        if (status.status === 'failed') {
          const err = status.result?.error ?? 'Command failed';
          const k8s = err.match(/"message":"([^"]+)"/);
          setToast({ open: true, msg: `❌ Fix failed: ${k8s ? k8s[1] : err.slice(0, 120)}`, sev: 'error' });
          return;
        }
      }
      setToast({ open: true, msg: `⏱ Timed out — check Command Center (cmd #${cmdId})`, sev: 'error' });
    } catch (e: any) {
      setToast({ open: true, msg: e?.message ?? 'Network error', sev: 'error' });
    } finally {
      setFixLoading(null);
    }
  };

  const visibleIncidents = incidents.filter(i => !fixedIds.has(i.incident_id));

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#f85149' }} />
    </Box>
  );

  const typeChartData = Object.entries(summary?.by_type ?? {}).map(([name, value]) => ({ name: name.toUpperCase(), value }));
  const sevChartData  = Object.entries(summary?.by_severity ?? {}).map(([name, value]) => ({ name: name.toUpperCase(), value, fill: SEV[name] ?? DK.muted }));

  const tabSx = {
    color: DK.muted, '&.Mui-selected': { color: DK.text },
    textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <FlashOnIcon sx={{ color: '#f85149', fontSize: 28 }} />
          <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>
            AI Incident Correlation
          </Typography>
          {summary && (
            <Chip label={`${summary.total_incidents} incidents`} size="small"
              sx={{ bgcolor: '#f8514922', color: '#f85149', border: '1px solid #f8514944', fontWeight: 600 }} />
          )}
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchAll} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mb: 3 }}>
        Real-time incidents from OOM events, crash loops, evictions and throttling on live cluster
      </Typography>

      {/* KPI Row */}
      {summary && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Total Incidents" value={summary.total_incidents} accent="#f85149" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="OOM Kills" value={summary.total_oomkills} accent="#f85149"
              sub={`${summary.by_severity?.critical ?? 0} critical`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Pod Restarts" value={summary.total_restarts} accent="#d29922" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard label="Throttling Events" value={summary.total_throttling_events} accent="#3b82f6" />
          </Grid>
        </Grid>
      )}

      {/* Charts */}
      {summary && (
        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} md={5}>
            <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: '16px !important' }}>
                <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1 }}>By Type</Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      {typeChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ background: DK.surface2, border: `1px solid ${DK.border}`, color: DK.text, fontSize: '0.78rem' }} />
                    <Legend wrapperStyle={{ color: DK.muted, fontSize: '0.72rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={7}>
            <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: '16px !important' }}>
                <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1 }}>By Severity</Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sevChartData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
                    <XAxis dataKey="name" tick={{ fill: DK.muted, fontSize: 11 }} axisLine={false} />
                    <YAxis tick={{ fill: DK.muted, fontSize: 11 }} axisLine={false} />
                    <RechartsTooltip contentStyle={{ background: DK.surface2, border: `1px solid ${DK.border}`, color: DK.text, fontSize: '0.78rem' }} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {sevChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
        <Box sx={{ borderBottom: `1px solid ${DK.border}` }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ '& .MuiTabs-indicator': { bgcolor: '#f85149' }, px: 1 }}>
            <Tab label={`Incidents (${visibleIncidents.length})`} sx={tabSx} />
            <Tab label={`Correlations (${correlations.length})`} sx={tabSx} />
            <Tab label={`Patterns (${patterns.length})`} sx={tabSx} />
            <Tab label="Timeline" sx={tabSx} />
          </Tabs>
        </Box>

        {/* Tab 0 — Incidents */}
        {tab === 0 && (
          <Box p={2}>
            {fixedIds.size > 0 && (
              <Box sx={{ bgcolor: '#3fb95011', border: '1px solid #3fb95033', borderRadius: 1.5, p: 1.5, mb: 2 }}>
                <Typography sx={{ color: '#3fb950', fontSize: '0.82rem', fontWeight: 600 }}>
                  ✅ {fixedIds.size} incident{fixedIds.size > 1 ? 's' : ''} fixed this session
                </Typography>
              </Box>
            )}
            <TableContainer sx={{ '&::-webkit-scrollbar': { height: 5 }, '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 3 } }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Type','Pod','Namespace','Cluster','Severity','Count','Time','Fix'].map(h => (
                      <TableCell key={h} sx={{ bgcolor: DK.surface2, color: DK.muted, fontWeight: 700, fontSize: '0.72rem', borderBottom: `1px solid ${DK.border}`, whiteSpace: 'nowrap' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleIncidents.map(inc => (
                    <TableRow key={inc.incident_id} hover sx={{ '&:hover': { bgcolor: DK.surface2 }, '& td': { borderBottom: `1px solid ${DK.border}22` } }}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          <TypeIcon type={inc.type} />
                          <Typography sx={{ color: TYPE_COLOR[inc.type] ?? DK.muted, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>{inc.type}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: DK.text, fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 200 }}>
                        <Tooltip title={inc.pod_name}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{inc.pod_name}</span></Tooltip>
                      </TableCell>
                      <TableCell sx={{ color: DK.muted, fontSize: '0.75rem', fontFamily: 'monospace' }}>{inc.namespace}</TableCell>
                      <TableCell sx={{ color: DK.muted, fontSize: '0.75rem' }}>{inc.cluster}</TableCell>
                      <TableCell><SevChip value={inc.severity} /></TableCell>
                      <TableCell>
                        <Chip label={inc.count} size="small"
                          sx={{ bgcolor: `${SEV[inc.severity] ?? DK.muted}22`, color: SEV[inc.severity] ?? DK.muted, border: `1px solid ${SEV[inc.severity] ?? DK.muted}44`, fontWeight: 700, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell sx={{ color: DK.muted, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(inc.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="small" variant="contained"
                          disabled={fixLoading === inc.incident_id || inc.namespace === 'multiple'}
                          onClick={() => handleFix(inc)}
                          sx={{ bgcolor: '#238636', color: '#fff', fontSize: '0.7rem', px: 1, py: 0.3, textTransform: 'none', fontWeight: 600, minWidth: 48,
                            '&:hover': { bgcolor: '#2ea043' }, '&.Mui-disabled': { bgcolor: '#21262d', color: DK.muted } }}>
                          {fixLoading === inc.incident_id ? '…' : 'Fix'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleIncidents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ color: DK.muted, py: 5, borderBottom: 'none' }}>
                        {incidents.length > 0 ? '✅ All incidents fixed this session!' : 'No incidents detected — cluster looks healthy'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Tab 1 — Correlations */}
        {tab === 1 && (
          <Box p={2}>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mb: 2 }}>
              AI-powered correlation analysis — root causes ranked by confidence
            </Typography>
            {correlations.map((c, i) => (
              <Accordion key={i} disableGutters
                sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, mb: 1, borderRadius: '6px !important', '&:before': { display: 'none' }, '& .MuiAccordionSummary-root': { minHeight: 48 } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: DK.muted }} />}>
                  <Box display="flex" alignItems="center" gap={1.5} width="100%">
                    <TypeIcon type={c.incident_type} />
                    <Box flexGrow={1}>
                      <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>{c.pod_name}</Typography>
                      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{c.root_cause}</Typography>
                    </Box>
                    <Chip label={`${c.confidence}% conf.`} size="small"
                      sx={{ bgcolor: c.confidence > 90 ? '#3fb95022' : '#d2992222', color: c.confidence > 90 ? '#3fb950' : '#d29922', border: `1px solid ${c.confidence > 90 ? '#3fb95044' : '#d2992244'}`, fontWeight: 700, fontSize: '0.68rem' }} />
                    <SevChip value={c.priority} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: DK.bg, borderTop: `1px solid ${DK.border}`, p: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography sx={{ color: DK.muted, fontSize: '0.72rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correlated Metrics</Typography>
                      <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, p: 1.5 }}>
                        {Object.entries(c.correlated_metrics).map(([k, v]) => (
                          <Box key={k} display="flex" justifyContent="space-between" mb={0.4}>
                            <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>{k}</Typography>
                            <Typography sx={{ color: DK.text, fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>{String(v)}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography sx={{ color: DK.muted, fontSize: '0.72rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommendation</Typography>
                      <Box sx={{ bgcolor: '#3fb95011', border: '1px solid #3fb95033', borderRadius: 1.5, p: 1.5 }}>
                        <Typography sx={{ color: '#3fb950', fontSize: '0.82rem' }}>{c.recommendation}</Typography>
                      </Box>
                      <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 1 }}>
                        Est. fix time: <strong style={{ color: DK.text }}>{c.estimated_fix_time}</strong>
                      </Typography>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
            {correlations.length === 0 && <Typography sx={{ color: DK.muted, py: 4, textAlign: 'center', fontSize: '0.85rem' }}>No correlation data</Typography>}
          </Box>
        )}

        {/* Tab 2 — Patterns */}
        {tab === 2 && (
          <Box p={2}>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mb: 2 }}>
              Recurring incident patterns detected on live cluster
            </Typography>
            {patterns.map((p, i) => (
              <Accordion key={i} disableGutters
                sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, mb: 1, borderRadius: '6px !important', '&:before': { display: 'none' }, '& .MuiAccordionSummary-root': { minHeight: 48 } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: DK.muted }} />}>
                  <Box display="flex" alignItems="center" gap={1.5} width="100%">
                    <PatternIcon sx={{ color: TYPE_COLOR[p.pattern_type] ?? DK.muted, fontSize: 18 }} />
                    <Box flexGrow={1}>
                      <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem' }}>{p.description}</Typography>
                      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{p.common_cause}</Typography>
                    </Box>
                    <Chip label={`${p.frequency}×`} size="small"
                      sx={{ bgcolor: '#f8514922', color: '#f85149', border: '1px solid #f8514944', fontWeight: 700, fontSize: '0.7rem' }} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: DK.bg, borderTop: `1px solid ${DK.border}`, p: 2 }}>
                  <Typography sx={{ color: DK.muted, fontSize: '0.72rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase' }}>Affected Pods</Typography>
                  <Box mb={1.5} display="flex" flexWrap="wrap" gap={0.75}>
                    {p.affected_pods.map((pod, idx) => (
                      <Chip key={idx} label={pod} size="small"
                        sx={{ bgcolor: DK.surface2, color: DK.muted, border: `1px solid ${DK.border}`, fontSize: '0.7rem', fontFamily: 'monospace' }} />
                    ))}
                  </Box>
                  <Typography sx={{ color: DK.muted, fontSize: '0.72rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase' }}>Prevention Steps</Typography>
                  <List disablePadding>
                    {p.prevention_steps.map((step, idx) => (
                      <React.Fragment key={idx}>
                        <ListItem disablePadding sx={{ py: 0.5 }}>
                          <Box display="flex" gap={1.5} alignItems="flex-start">
                            <Chip label={`${idx + 1}`} size="small"
                              sx={{ bgcolor: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontWeight: 700, fontSize: '0.65rem', minWidth: 24, height: 20 }} />
                            <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>{step}</Typography>
                          </Box>
                        </ListItem>
                        {idx < p.prevention_steps.length - 1 && <Divider sx={{ borderColor: `${DK.border}55`, my: 0.25 }} />}
                      </React.Fragment>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            ))}
            {patterns.length === 0 && <Typography sx={{ color: DK.muted, py: 4, textAlign: 'center', fontSize: '0.85rem' }}>No recurring patterns detected</Typography>}
          </Box>
        )}

        {/* Tab 3 — Timeline */}
        {tab === 3 && (
          <Box p={2}>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mb: 2 }}>
              Chronological incident timeline — most recent first
            </Typography>
            <List disablePadding>
              {[...incidents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((inc, i, arr) => (
                <React.Fragment key={inc.incident_id}>
                  <ListItem disablePadding sx={{ py: 1.5, alignItems: 'flex-start' }}>
                    <Box display="flex" gap={2} width="100%">
                      {/* Timeline dot */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
                        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: `${SEV[inc.severity] ?? DK.muted}22`, border: `2px solid ${SEV[inc.severity] ?? DK.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <TypeIcon type={inc.type} />
                        </Box>
                        {i < arr.length - 1 && <Box sx={{ width: 2, flexGrow: 1, bgcolor: DK.border, mt: 0.5 }} />}
                      </Box>
                      {/* Content */}
                      <Box flexGrow={1} pb={i < arr.length - 1 ? 1 : 0}>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>{inc.type}</Typography>
                          <Typography sx={{ color: DK.muted, fontFamily: 'monospace', fontSize: '0.78rem' }}>— {inc.pod_name}</Typography>
                          <SevChip value={inc.severity} />
                        </Box>
                        <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>
                          {inc.namespace} · {new Date(inc.timestamp).toLocaleString()}
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{inc.message}</Typography>
                      </Box>
                    </Box>
                  </ListItem>
                </React.Fragment>
              ))}
              {incidents.length === 0 && <Typography sx={{ color: DK.muted, py: 4, textAlign: 'center', fontSize: '0.85rem' }}>No incidents in timeline</Typography>}
            </List>
          </Box>
        )}
      </Card>

      {/* Toast */}
      <Snackbar open={toast.open}
        autoHideDuration={toast.sev === 'success' ? 8000 : toast.sev === 'info' ? 60000 : 6000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.sev === 'info' ? 'info' : toast.sev}
          onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: toast.sev === 'success' ? '#238636' : toast.sev === 'info' ? '#1f3a5f' : '#b62324', color: '#fff', '& .MuiAlert-icon': { color: '#fff' }, maxWidth: 480 }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

const Incidents: React.FC = () => (
  <ClusterGuard><IncidentsInner /></ClusterGuard>
);

export default Incidents;
