import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, Select,
  FormControl, InputLabel, SelectChangeEvent
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
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
  retention_days: number;
  last_scan: string;
}

const sevColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

const resultColor: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  success: 'success', failure: 'error', blocked: 'warning',
};

const AuditCenterInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AuditCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/audit-center${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((e) => {
      const matchSearch = !search ||
        e.event_type.toLowerCase().includes(search.toLowerCase()) ||
        e.user.toLowerCase().includes(search.toLowerCase()) ||
        e.resource.toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase());
      const matchSev = severityFilter === 'all' || e.severity === severityFilter;
      const matchResult = resultFilter === 'all' || e.result === resultFilter;
      return matchSearch && matchSev && matchResult;
    });
  }, [data, search, severityFilter, resultFilter]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Audit Center</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Comprehensive audit logs and events</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Events', value: data.total_events },
          { label: 'Retention Days', value: `${data.retention_days} days` },
          { label: 'Displayed Events', value: filteredEvents.length },
          { label: 'Last Scan', value: new Date(data.last_scan).toLocaleTimeString() },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" variant="caption">{k.label}</Typography>
                <Typography variant="h5" fontWeight={700}>{k.value ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                size="small" fullWidth
                placeholder="Search by type, user, resource, action..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Severity</InputLabel>
                <Select value={severityFilter} label="Severity" onChange={(e: SelectChangeEvent) => setSeverityFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Result</InputLabel>
                <Select value={resultFilter} label="Result" onChange={(e: SelectChangeEvent) => setResultFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="failure">Failure</MenuItem>
                  <MenuItem value="blocked">Blocked</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Audit Events ({filteredEvents.length} of {data.total_events})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Event Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEvents.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{new Date(e.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{e.event_type}</TableCell>
                    <TableCell><Chip label={e.severity} size="small" color={sevColor[e.severity] ?? 'default'} /></TableCell>
                    <TableCell>{e.user}</TableCell>
                    <TableCell>{e.resource}</TableCell>
                    <TableCell><Chip label={e.action} size="small" variant="outlined" /></TableCell>
                    <TableCell><Chip label={e.result} size="small" color={resultColor[e.result] ?? 'default'} /></TableCell>
                  </TableRow>
                ))}
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
