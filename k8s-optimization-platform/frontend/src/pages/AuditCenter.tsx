import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, MenuItem, Select,
  FormControl, InputLabel, SelectChangeEvent
} from '@mui/material';
import PolicyIcon from '@mui/icons-material/Policy';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';

interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  severity: string;
  user: string;
  resource: string;
  action: string;
  result: string;
  details: string;
}

interface AuditCenterData {
  total_events: number;
  events: AuditEvent[];
  cluster_name?: string;
  retention_days: number;
  last_scan: string;
}

const DK = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

const RESULT_COLOR: Record<string, string> = {
  blocked: '#f85149',
  flagged: '#d29922',
  success: '#3fb950',
  failure: '#f85149',
};

const SevChip: React.FC<{ value: string }> = ({ value }) => (
  <Chip
    label={value}
    size="small"
    sx={{
      bgcolor: `${SEV_COLOR[value] ?? '#8b949e'}22`,
      color: SEV_COLOR[value] ?? '#8b949e',
      border: `1px solid ${SEV_COLOR[value] ?? '#8b949e'}44`,
      fontWeight: 600,
      fontSize: '0.7rem',
    }}
  />
);

const ResultChip: React.FC<{ value: string }> = ({ value }) => (
  <Chip
    label={value}
    size="small"
    sx={{
      bgcolor: `${RESULT_COLOR[value] ?? '#8b949e'}22`,
      color: RESULT_COLOR[value] ?? '#8b949e',
      border: `1px solid ${RESULT_COLOR[value] ?? '#8b949e'}44`,
      fontWeight: 600,
      fontSize: '0.7rem',
    }}
  />
);

const KpiCard: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent }) => (
  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: '16px !important' }}>
      <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{value}</Typography>
    </CardContent>
  </Card>
);

const AuditCenterInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AuditCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/audit-center${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        e.event_type.toLowerCase().includes(q) ||
        e.user.toLowerCase().includes(q) ||
        e.resource.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q);
      const matchSev = severityFilter === 'all' || e.severity === severityFilter;
      const matchResult = resultFilter === 'all' || e.result === resultFilter;
      return matchSearch && matchSev && matchResult;
    });
  }, [data, search, severityFilter, resultFilter]);

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#3b82f6' }} />
    </Box>
  );

  if (error) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: '#2d1317', color: '#f85149', border: '1px solid #f8514944' }}>{error}</Alert>
    </Box>
  );

  if (!data) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="info">No data available</Alert>
    </Box>
  );

  const selectSx = {
    color: DK.text,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.border },
    '& .MuiSvgIcon-root': { color: DK.muted },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3b82f6' },
    bgcolor: DK.surface,
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <PolicyIcon sx={{ color: '#3b82f6', fontSize: 28 }} />
        <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>
          Audit Center
        </Typography>
        {data.cluster_name && (
          <Chip label={data.cluster_name} size="small"
            sx={{ bgcolor: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontWeight: 600 }} />
        )}
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mb: 3 }}>
        Real-time audit events derived from live cluster security violations
      </Typography>

      {/* KPI Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Total Events" value={data.total_events} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Displayed" value={filteredEvents.length} accent="#3b82f6" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Retention" value={`${data.retention_days}d`} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Last Scan" value={new Date(data.last_scan).toLocaleTimeString()} />
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: '12px 16px !important' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                size="small" fullWidth
                placeholder="Search by type, user, resource, action, details…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{ style: { color: DK.text, background: DK.bg } }}
                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.border },
                      '& input::placeholder': { color: DK.muted } }}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: DK.muted }}>Severity</InputLabel>
                <Select value={severityFilter} label="Severity"
                  onChange={(e: SelectChangeEvent) => setSeverityFilter(e.target.value)}
                  sx={selectSx} MenuProps={{ PaperProps: { sx: { bgcolor: DK.surface, color: DK.text } } }}>
                  {['all','critical','high','medium','low'].map(v => (
                    <MenuItem key={v} value={v}>{v === 'all' ? 'All Severities' : v.charAt(0).toUpperCase()+v.slice(1)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: DK.muted }}>Result</InputLabel>
                <Select value={resultFilter} label="Result"
                  onChange={(e: SelectChangeEvent) => setResultFilter(e.target.value)}
                  sx={selectSx} MenuProps={{ PaperProps: { sx: { bgcolor: DK.surface, color: DK.text } } }}>
                  {['all','blocked','flagged','success','failure'].map(v => (
                    <MenuItem key={v} value={v}>{v === 'all' ? 'All Results' : v.charAt(0).toUpperCase()+v.slice(1)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
        <CardContent sx={{ p: '16px !important' }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
            Audit Events — {filteredEvents.length} of {data.total_events}
          </Typography>
          <TableContainer sx={{ maxHeight: 520, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 3 } }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Timestamp','Event Type','Severity','User','Resource','Action','Result','Details'].map(h => (
                    <TableCell key={h} sx={{ bgcolor: '#1c2128', color: DK.muted, fontWeight: 700, fontSize: '0.72rem', borderBottom: `1px solid ${DK.border}`, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEvents.map((e) => (
                  <TableRow key={e.id} hover sx={{ '&:hover': { bgcolor: '#1c2128' }, '& td': { borderBottom: `1px solid ${DK.border}22` } }}>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleString()}</TableCell>
                    <TableCell sx={{ color: DK.text, fontSize: '0.8rem', fontWeight: 500 }}>{e.event_type}</TableCell>
                    <TableCell><SevChip value={e.severity} /></TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.8rem', fontFamily: 'monospace' }}>{e.user}</TableCell>
                    <TableCell sx={{ color: '#3b82f6', fontSize: '0.78rem', fontFamily: 'monospace' }}>{e.resource}</TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.78rem' }}>{e.action}</TableCell>
                    <TableCell><ResultChip value={e.result} /></TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.75rem', maxWidth: 300 }}>{e.details}</TableCell>
                  </TableRow>
                ))}
                {filteredEvents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ color: DK.muted, py: 4, borderBottom: 'none' }}>
                      No events match the current filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const AuditCenter: React.FC = () => (
  <ClusterGuard><AuditCenterInner /></ClusterGuard>
);

export default AuditCenter;
