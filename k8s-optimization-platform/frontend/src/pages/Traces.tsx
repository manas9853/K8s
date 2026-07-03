import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Alert, Chip, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, FormControl, InputLabel, Select, MenuItem,
  SelectChangeEvent, Paper, CircularProgress,
} from '@mui/material';
import {
  Timeline as TraceIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface TraceService {
  service: string;
  namespace: string;
  endpoints_ok: number;
  endpoints_total: number;
  pod_count: number;
  total_restarts: number;
  cpu_request_m: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  rps_estimate: number;
  error_rate: number;
  status: 'healthy' | 'degraded' | 'critical';
}

interface SpanRow {
  trace_id: string;
  service: string;
  operation: string;
  duration_ms: number;
  status: 'ok' | 'error';
  timestamp: string;
  spans: number;
}

interface TracesData {
  services: TraceService[];
  recent_spans: SpanRow[];
  source: string;
  total_services: number;
  cluster: string;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const statusColor = (s: TraceService['status']) =>
  s === 'healthy' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : '#ef4444';

const statusMui = (s: TraceService['status']): 'success' | 'warning' | 'error' =>
  s === 'healthy' ? 'success' : s === 'degraded' ? 'warning' : 'error';

const latencyColor = (ms: number) =>
  ms > 500 ? '#ef4444' : ms > 200 ? '#f59e0b' : '#22c55e';

const HistBar: React.FC<{ label: string; value: number; maxVal: number; color: string }> = ({
  label, value, maxVal, color,
}) => (
  <Box display="flex" alignItems="center" gap={1} mb={0.75}>
    <Typography variant="caption" sx={{ width: 36, flexShrink: 0, textAlign: 'right' }}>{label}</Typography>
    <Box sx={{ flex: 1, bgcolor: '#f3f4f6', borderRadius: 1, height: 14, overflow: 'hidden' }}>
      <Box sx={{ width: `${Math.min(100, (value / Math.max(maxVal, 1)) * 100)}%`, height: '100%', bgcolor: color, borderRadius: 1 }} />
    </Box>
    <Typography variant="caption" fontWeight={700} sx={{ width: 56, flexShrink: 0 }}>{value}ms</Typography>
  </Box>
);

// ── Component ─────────────────────────────────────────────────────────────────

const Traces: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<TracesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nsFilter, setNsFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/observability/traces${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Backend returns either the real object or the old stub object
      if (json.services) {
        setData(json as TracesData);
      } else {
        setError('Tracing backend returned no service data yet. Waiting for agent collection.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch traces');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
      <CircularProgress />
    </Box>
  );

  if (error || !data) return (
    <Box p={3}>
      <Alert severity="warning">{error ?? 'No data available'}</Alert>
    </Box>
  );

  const services = data.services.filter(s =>
    (nsFilter === 'all' || s.namespace === nsFilter) &&
    (statusFilter === 'all' || s.status === statusFilter)
  );

  const namespaces = Array.from(new Set(data.services.map(s => s.namespace))).sort();

  const totalRPS      = data.services.reduce((a, s) => a + s.rps_estimate, 0);
  const avgP95        = data.services.length
    ? Math.round(data.services.reduce((a, s) => a + s.p95_latency_ms, 0) / data.services.length)
    : 0;
  const avgErrRate    = data.services.length
    ? (data.services.reduce((a, s) => a + s.error_rate, 0) / data.services.length).toFixed(2)
    : '0.00';
  const issueCount    = data.services.filter(s => s.status !== 'healthy').length;
  const totalRestarts = data.services.reduce((a, s) => a + s.total_restarts, 0);

  const topLatency = Math.max(...services.slice(0, 8).map(s => s.p99_latency_ms), 1);

  return (
    <Box p={3}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Box display="flex" alignItems="center" gap={1}>
            <TraceIcon color="primary" />
            <Typography variant="h4" fontWeight={700}>Distributed Tracing</Typography>
          </Box>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            Service-level performance derived from live cluster data · {data.cluster}
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Namespace</InputLabel>
            <Select value={nsFilter} label="Namespace" onChange={(e: SelectChangeEvent) => setNsFilter(e.target.value)}>
              <MenuItem value="all">All</MenuItem>
              {namespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="healthy">Healthy</MenuItem>
              <MenuItem value="degraded">Degraded</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchData} color="primary" size="small">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Services',      value: String(data.total_services),  color: '#6366f1' },
          { label: 'Est. Req / sec',       value: String(totalRPS),             color: '#3b82f6' },
          { label: 'Avg P95 Latency',      value: `${avgP95}ms`,               color: avgP95 > 300 ? '#ef4444' : '#22c55e' },
          { label: 'Avg Error Rate',       value: `${avgErrRate}%`,             color: parseFloat(avgErrRate) > 2 ? '#ef4444' : '#22c55e' },
          { label: 'Services w/ Issues',   value: String(issueCount),           color: issueCount > 0 ? '#f59e0b' : '#22c55e' },
          { label: 'Total Restarts',       value: String(totalRestarts),        color: totalRestarts > 50 ? '#ef4444' : totalRestarts > 10 ? '#f59e0b' : '#22c55e' },
        ].map(({ label, value, color }) => (
          <Grid item xs={12} sm={6} md={2} key={label}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
              <CardContent sx={{ py: '12px !important', px: 2 }}>
                <Typography variant="caption" color="textSecondary" fontWeight={600}>{label}</Typography>
                <Typography variant="h5" fontWeight={800} sx={{ color, mt: 0.5 }}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* ── Service performance table ─────────────────────────────────── */}
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>
                Service Performance Map
                <Typography component="span" variant="caption" color="textSecondary" ml={1}>
                  ({services.length} services)
                </Typography>
              </Typography>
              <TableContainer sx={{ maxHeight: 460, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                      <TableCell>Service</TableCell>
                      <TableCell>Namespace</TableCell>
                      <TableCell>Endpoints</TableCell>
                      <TableCell>Pods</TableCell>
                      <TableCell>Restarts</TableCell>
                      <TableCell>Est. RPS</TableCell>
                      <TableCell>P50</TableCell>
                      <TableCell>P95</TableCell>
                      <TableCell>P99</TableCell>
                      <TableCell>Error %</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {services.map(svc => (
                      <TableRow key={`${svc.namespace}/${svc.service}`} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor(svc.status), flexShrink: 0 }} />
                            <Typography variant="body2" fontWeight={600}>{svc.service}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={svc.namespace} size="small" variant="outlined" /></TableCell>
                        <TableCell>
                          <Typography variant="body2" color={svc.endpoints_ok < svc.endpoints_total ? 'error' : 'inherit'}>
                            {svc.endpoints_ok}/{svc.endpoints_total}
                          </Typography>
                        </TableCell>
                        <TableCell>{svc.pod_count}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={svc.total_restarts > 10 ? 700 : 400}
                            color={svc.total_restarts > 50 ? 'error' : svc.total_restarts > 10 ? 'warning.main' : 'inherit'}>
                            {svc.total_restarts}
                          </Typography>
                        </TableCell>
                        <TableCell>{svc.rps_estimate}/s</TableCell>
                        <TableCell sx={{ color: latencyColor(svc.p50_latency_ms) }}>{svc.p50_latency_ms}ms</TableCell>
                        <TableCell sx={{ color: latencyColor(svc.p95_latency_ms) }}>{svc.p95_latency_ms}ms</TableCell>
                        <TableCell sx={{ color: latencyColor(svc.p99_latency_ms) }}>{svc.p99_latency_ms}ms</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}
                            sx={{ color: svc.error_rate > 10 ? '#ef4444' : svc.error_rate > 3 ? '#f59e0b' : '#22c55e' }}>
                            {svc.error_rate.toFixed(1)}%
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={svc.status} color={statusMui(svc.status)} size="small" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Latency histogram ─────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb', height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Latency Distribution (top 6)</Typography>
              {services.slice(0, 6).map(svc => (
                <Box key={`${svc.namespace}/${svc.service}`} mb={2}>
                  <Typography variant="caption" fontWeight={700} color="textSecondary">
                    {svc.service}
                    <Typography component="span" variant="caption" color="textSecondary" ml={0.5}>· {svc.namespace}</Typography>
                  </Typography>
                  <HistBar label="P50" value={svc.p50_latency_ms} maxVal={topLatency} color="#22c55e" />
                  <HistBar label="P95" value={svc.p95_latency_ms} maxVal={topLatency} color="#f59e0b" />
                  <HistBar label="P99" value={svc.p99_latency_ms} maxVal={topLatency} color="#ef4444" />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Recent spans (from events) ────────────────────────────────── */}
        <Grid item xs={12}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Recent Activity Spans
                  <Typography component="span" variant="caption" color="textSecondary" ml={1}>
                    derived from cluster events
                  </Typography>
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                      <TableCell>Event ID</TableCell>
                      <TableCell>Namespace</TableCell>
                      <TableCell>Operation</TableCell>
                      <TableCell>Duration (proxy)</TableCell>
                      <TableCell>Repeat Count</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.recent_spans.map((span, idx) => (
                      <TableRow key={`${span.trace_id}-${idx}`} hover>
                        <TableCell>
                          <Typography variant="caption" fontFamily="monospace" color="primary.main">
                            {span.trace_id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={span.service} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" fontFamily="monospace">{span.operation}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 60, bgcolor: '#f3f4f6', borderRadius: 1, height: 5, overflow: 'hidden' }}>
                              <Box sx={{
                                width: `${Math.min(100, (span.duration_ms / 5000) * 100)}%`,
                                height: '100%',
                                bgcolor: span.duration_ms > 2000 ? '#ef4444' : span.duration_ms > 500 ? '#f59e0b' : '#22c55e',
                              }} />
                            </Box>
                            <Typography variant="caption">{span.duration_ms}ms</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={`×${span.spans * 1000}`} size="small"
                            color={span.spans > 50 ? 'error' : span.spans > 10 ? 'warning' : 'default'} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="textSecondary">{span.timestamp}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={span.status === 'ok' ? 'OK' : 'ERROR'}
                            color={span.status === 'ok' ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box mt={2}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Typography variant="caption">
                    Latency estimates are derived from pod restart counts and error event frequencies.
                    Connect Jaeger / Zipkin / OpenTelemetry for true distributed traces.
                  </Typography>
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Traces;

// Made with Bob
