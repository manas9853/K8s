import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, Paper, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Tabs, Tab, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Event as EventIcon,
  AccessTime as ClockIcon,
  Close as CloseIcon,
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
interface KubernetesEvent {
  name:                 string;
  namespace:            string;
  type:                 string;
  reason:               string;
  message:              string;
  source_component:     string;
  source_host:          string;
  first_timestamp:      string;
  last_timestamp:       string;
  count:                number;
  involved_object_kind: string;
  involved_object_name: string;
  age:                  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTs = (s: string) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
};

const reasonColor = (reason: string): string => {
  const r = reason.toLowerCase();
  if (['failed', 'failedscheduling', 'failedmount', 'backoff', 'unhealthy', 'oom', 'imagepullbackoff', 'errimagepull'].some(k => r.includes(k)))
    return T.red;
  if (['killing', 'preempting', 'evictionthresholdmet'].some(k => r.includes(k)))
    return T.yellow;
  if (['started', 'created', 'scheduled', 'pulled', 'successfulcreate', 'successfuldelete'].some(k => r.includes(k)))
    return T.green;
  return T.muted;
};

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: number | string; accent?: string }> = ({ label, value, accent }) => (
  <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent ?? T.text, lineHeight: 1 }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

// ─── Detail dialog ────────────────────────────────────────────────────────────
const DetailDialog: React.FC<{ event: KubernetesEvent | null; onClose: () => void }> = ({ event, onClose }) => {
  const [tab, setTab] = useState(0);
  if (!event) return null;

  const investigations: Array<{ level: 'error' | 'warning' | 'info'; title: string; body: string; action?: string }> = [];
  if (event.count > 100000)
    investigations.push({ level: 'error', title: 'Extremely High Repeat Count', body: `Fired ${event.count.toLocaleString()} times — persistent loop.`, action: 'Investigate root cause immediately.' });
  else if (event.count > 10000)
    investigations.push({ level: 'error', title: 'Very High Repeat Count', body: `Fired ${event.count.toLocaleString()} times.`, action: 'Investigate root cause.' });
  else if (event.count > 100)
    investigations.push({ level: 'warning', title: 'Elevated Repeat Count', body: `Fired ${event.count.toLocaleString()} times.`, action: 'Monitor trend.' });
  if (event.type === 'Warning')
    investigations.push({ level: 'warning', title: 'Warning Event', body: event.message, action: 'Review and take corrective action.' });
  if (event.reason.toLowerCase().includes('backoff') || event.reason.toLowerCase().includes('imagepull'))
    investigations.push({ level: 'error', title: 'Image / BackOff Issue', body: 'Container cannot start due to image pull failure or crash loop.', action: 'Check image registry credentials and pod logs.' });
  if (event.reason.toLowerCase().includes('unhealthy'))
    investigations.push({ level: 'warning', title: 'Health Probe Failure', body: 'Liveness or readiness probe is failing.', action: 'Review probe config and application health endpoint.' });
  if (event.reason.toLowerCase().includes('oom'))
    investigations.push({ level: 'error', title: 'Out of Memory', body: 'Container killed by OOM killer.', action: 'Increase memory limit or optimise application.' });
  if (event.reason.toLowerCase().includes('failed'))
    investigations.push({ level: 'error', title: 'Operation Failed', body: event.message, action: 'Immediate investigation required.' });
  if (investigations.length === 0)
    investigations.push({ level: 'info', title: 'No Issues Detected', body: 'This event appears healthy.' });

  const dlgSx = {
    '& .MuiDialog-paper': { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 2, maxWidth: 720 },
  };
  const tabSx = { color: T.muted, '&.Mui-selected': { color: T.text }, textTransform: 'none', minHeight: 40 };
  const rowSx = { borderBottom: `1px solid ${T.border}`, py: 1.5, display: 'flex', gap: 2 };
  const labelSx = { fontSize: 12, color: T.muted, minWidth: 140, flexShrink: 0 };
  const valueSx = { fontSize: 13, color: T.body, wordBreak: 'break-all' as const };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth sx={dlgSx}>
      <DialogTitle sx={{ borderBottom: `1px solid ${T.border}`, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <EventIcon sx={{ color: event.type === 'Warning' ? T.yellow : T.green, fontSize: 20 }} />
        <Typography sx={{ fontWeight: 600, color: T.text, flexGrow: 1 }}>{event.reason}</Typography>
        <Chip
          label={event.type}
          size="small"
          sx={{ bgcolor: event.type === 'Warning' ? '#451a03' : '#052e16', color: event.type === 'Warning' ? T.yellow : T.green, fontWeight: 600, fontSize: 11 }}
        />
        <IconButton onClick={onClose} size="small" sx={{ color: T.muted }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Tabs
          value={tab} onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: `1px solid ${T.border}`, px: 2, '& .MuiTabs-indicator': { bgcolor: T.green } }}
        >
          <Tab label="Overview" sx={tabSx} />
          <Tab label={`Investigations (${investigations.filter(i => i.level !== 'info').length})`} sx={tabSx} />
          <Tab label="Timeline" sx={tabSx} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Box>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 2 }}>Event Details</Typography>
              {[
                ['Namespace',   event.namespace],
                ['Kind/Object', `${event.involved_object_kind ? event.involved_object_kind + '/' : ''}${event.involved_object_name}`],
                ['Reason',      event.reason],
                ['Count',       event.count.toLocaleString()],
                ['Age',         event.age],
                ['Source',      [event.source_component, event.source_host].filter(Boolean).join(' @ ')],
                ['Message',     event.message],
              ].map(([lbl, val]) => (
                <Box key={lbl as string} sx={rowSx}>
                  <Typography sx={labelSx}>{lbl}</Typography>
                  <Typography sx={valueSx}>{val || '—'}</Typography>
                </Box>
              ))}
            </Box>
          )}

          {tab === 1 && (
            <Box>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 2 }}>Investigations</Typography>
              {investigations.map((inv, i) => (
                <Box key={i} sx={{ mb: 2, p: 2, borderRadius: 1, border: `1px solid ${T.border}`,
                  bgcolor: inv.level === 'error' ? '#1a0a0a' : inv.level === 'warning' ? '#1a1200' : '#0a1a0a' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    {inv.level === 'error'   && <ErrorIcon sx={{ fontSize: 16, color: T.red }} />}
                    {inv.level === 'warning' && <WarningIcon sx={{ fontSize: 16, color: T.yellow }} />}
                    {inv.level === 'info'    && <CheckIcon sx={{ fontSize: 16, color: T.green }} />}
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{inv.title}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12, color: T.body }}>{inv.body}</Typography>
                  {inv.action && <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>→ {inv.action}</Typography>}
                </Box>
              ))}
            </Box>
          )}

          {tab === 2 && (
            <Box>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 2 }}>Timeline</Typography>
              {[
                ['First Occurrence', fmtTs(event.first_timestamp)],
                ['Last Occurrence',  fmtTs(event.last_timestamp)],
                ['Total Count',      event.count.toLocaleString() + ' times'],
                ['Age (last seen)',  event.age],
              ].map(([lbl, val]) => (
                <Box key={lbl as string} sx={rowSx}>
                  <ClockIcon sx={{ fontSize: 16, color: T.muted, mt: 0.2, flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontSize: 12, color: T.muted }}>{lbl}</Typography>
                    <Typography sx={{ fontSize: 14, color: T.text }}>{val}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ color: T.muted, textTransform: 'none' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const Events: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [events,          setEvents]          = useState<KubernetesEvent[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [search,          setSearch]          = useState('');
  const [typeFilter,      setTypeFilter]      = useState('all');
  const [nsFilter,        setNsFilter]        = useState('all');
  const [reasonFilter,    setReasonFilter]    = useState('all');
  const [selectedEvent,   setSelectedEvent]   = useState<KubernetesEvent | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      // trailing slash required — FastAPI redirects without it (307 → HTTP → blocked)
      const sep = clusterParam ? clusterParam + '&' : '?';
      const url = `${API_BASE_URL}/v1/observability/events/${clusterParam}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = await response.json();
      const normalised: KubernetesEvent[] = raw.map(e => ({
        name:                 e.name                 ?? '',
        namespace:            e.namespace            ?? '',
        type:                 e.type                 ?? 'Normal',
        reason:               e.reason               ?? '',
        message:              e.message              ?? '',
        involved_object_kind: e.involved_object_kind ?? e.involved_object?.kind  ?? '',
        involved_object_name: e.involved_object_name ?? e.involved_object?.name  ?? '',
        source_component:     e.source_component     ?? '',
        source_host:          e.source_host          ?? '',
        first_timestamp:      e.first_timestamp      ?? '',
        last_timestamp:       e.last_timestamp       ?? '',
        count:                e.count                ?? 1,
        age:                  e.age                  ?? '',
      }));
      setEvents(normalised);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueNamespaces = useMemo(() => Array.from(new Set(events.map(e => e.namespace))).sort(), [events]);
  const uniqueReasons    = useMemo(() => Array.from(new Set(events.map(e => e.reason))).sort(), [events]);

  const filtered = useMemo(() => events.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (nsFilter   !== 'all' && e.namespace !== nsFilter) return false;
    if (reasonFilter !== 'all' && e.reason !== reasonFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.namespace.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.involved_object_name.toLowerCase().includes(q) ||
        e.source_component.toLowerCase().includes(q)
      );
    }
    return true;
  }), [events, typeFilter, nsFilter, reasonFilter, search]);

  const warnings  = events.filter(e => e.type === 'Warning').length;
  const normals   = events.filter(e => e.type === 'Normal').length;
  const highFreq  = events.filter(e => e.count > 1000).length;
  const namespaceCount = uniqueNamespaces.length;

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5 };
  const selectSx = {
    color: T.text, fontSize: 13, height: 38,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
    '& .MuiSvgIcon-root': { color: T.muted },
    bgcolor: T.card,
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
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Kubernetes Events</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            {filtered.length} of {events.length} events across {namespaceCount} namespaces
          </Typography>
        </Box>
        <IconButton onClick={fetchEvents} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard label="Total Events"   value={events.length} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="Normal"         value={normals}  accent={T.green} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="Warnings"       value={warnings} accent={T.red} /></Grid>
        <Grid item xs={6} sm={3}><StatCard label="High Frequency" value={highFreq} accent={T.yellow} /></Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth size="small"
              placeholder="Search namespace, reason, message, object…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
                sx: { color: T.text, fontSize: 13, bgcolor: T.bg, borderRadius: 1,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
                },
              }}
              InputLabelProps={{ sx: { color: T.muted } }}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Type</InputLabel>
              <Select value={typeFilter} label="Type" onChange={e => setTypeFilter(e.target.value)} sx={selectSx}
                MenuProps={{ PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } }}>
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="Normal">Normal</MenuItem>
                <MenuItem value="Warning">Warning</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Namespace</InputLabel>
              <Select value={nsFilter} label="Namespace" onChange={e => setNsFilter(e.target.value)} sx={selectSx}
                MenuProps={{ PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } }}>
                <MenuItem value="all">All Namespaces</MenuItem>
                {uniqueNamespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Reason</InputLabel>
              <Select value={reasonFilter} label="Reason" onChange={e => setReasonFilter(e.target.value)} sx={selectSx}
                MenuProps={{ PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}`, maxHeight: 300 } } }}>
                <MenuItem value="all">All Reasons</MenuItem>
                {uniqueReasons.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#161f30' }}>
              <TableCell sx={headSx}>Type</TableCell>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={headSx}>Reason</TableCell>
              <TableCell sx={headSx}>Object</TableCell>
              <TableCell sx={headSx}>Source</TableCell>
              <TableCell sx={{ ...headSx, maxWidth: 340 }}>Message</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'right' }}>Count</TableCell>
              <TableCell sx={headSx}>Age</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  No events match your filters
                </TableCell>
              </TableRow>
            ) : filtered.map((ev, idx) => (
              <TableRow
                key={`${ev.namespace}-${ev.name}-${idx}`}
                hover
                onClick={() => setSelectedEvent(ev)}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover } }}
              >
                <TableCell sx={cellSx}>
                  {ev.type === 'Normal'
                    ? <CheckIcon  sx={{ fontSize: 16, color: T.green }} />
                    : <WarningIcon sx={{ fontSize: 16, color: T.yellow }} />
                  }
                </TableCell>
                <TableCell sx={cellSx}>
                  <Chip label={ev.namespace} size="small"
                    sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                </TableCell>
                <TableCell sx={cellSx}>
                  <Chip label={ev.reason} size="small"
                    sx={{ bgcolor: T.bg, color: reasonColor(ev.reason), border: `1px solid ${reasonColor(ev.reason)}33`, fontSize: 11, height: 20 }} />
                </TableCell>
                <TableCell sx={{ ...cellSx, maxWidth: 220 }}>
                  <Typography noWrap sx={{ fontSize: 12, color: T.body }}>
                    {ev.involved_object_kind && <span style={{ color: T.muted }}>{ev.involved_object_kind}/</span>}
                    {ev.involved_object_name}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, maxWidth: 160 }}>
                  <Typography noWrap sx={{ fontSize: 12, color: T.muted }}>
                    {ev.source_component}{ev.source_host ? ` @ ${ev.source_host}` : ''}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, maxWidth: 340 }}>
                  <Typography noWrap sx={{ fontSize: 12, color: T.body }} title={ev.message}>
                    {ev.message}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography sx={{
                    fontSize: 12, fontWeight: 600,
                    color: ev.count > 100000 ? T.red : ev.count > 1000 ? T.yellow : T.body,
                  }}>
                    {ev.count.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, color: T.muted }}>{ev.age}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Detail dialog */}
      <DetailDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </Box>
  );
};

export default Events;
