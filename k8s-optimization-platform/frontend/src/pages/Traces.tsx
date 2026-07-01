import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Alert, Chip, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, IconButton, FormControl, InputLabel, Select,
  MenuItem, SelectChangeEvent, Paper,
} from '@mui/material';
import {
  Timeline as TraceIcon, Refresh as RefreshIcon,
  Speed as SpeedIcon, Error as ErrorIcon,
  CheckCircle as CheckIcon, Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

interface TraceService {
  service: string;
  namespace: string;
  requestsPerSec: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  totalTraces: number;
  status: 'healthy' | 'degraded' | 'critical';
}

interface SpanRow {
  traceId: string;
  service: string;
  operation: string;
  duration: number;
  status: 'ok' | 'error';
  timestamp: string;
  spans: number;
}

// Flame bar — proportional width bars representing span duration
const FlameBar: React.FC<{ duration: number; maxDuration: number; color: string; label: string }> = ({
  duration, maxDuration, color, label,
}) => {
  const pct = Math.max(4, (duration / maxDuration) * 100);
  return (
    <Tooltip title={`${label}: ${duration}ms`}>
      <Box sx={{
        bgcolor: color, height: 18, borderRadius: 0.5,
        width: `${pct}%`, minWidth: 4,
        display: 'flex', alignItems: 'center', px: 0.5,
        overflow: 'hidden', cursor: 'default',
      }}>
        <Typography variant="caption" sx={{ color: '#fff', fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {duration}ms
        </Typography>
      </Box>
    </Tooltip>
  );
};

// Waterfall row for trace breakdown
const WaterfallRow: React.FC<{
  spans: { name: string; start: number; duration: number; color: string }[];
  total: number;
}> = ({ spans, total }) => (
  <Box sx={{ position: 'relative', height: 22, bgcolor: '#f8fafc', borderRadius: 1, overflow: 'hidden' }}>
    {spans.map((s, i) => (
      <Tooltip key={i} title={`${s.name}: ${s.duration}ms (start +${s.start}ms)`}>
        <Box sx={{
          position: 'absolute',
          left: `${(s.start / total) * 100}%`,
          width: `${Math.max(1, (s.duration / total) * 100)}%`,
          height: '100%',
          bgcolor: s.color,
          opacity: 0.85,
          cursor: 'default',
        }} />
      </Tooltip>
    ))}
  </Box>
);

// Generate synthetic trace services from namespace list
const mockServices: TraceService[] = [
  { service: 'frontend', namespace: 'default', requestsPerSec: 142, p50Latency: 45, p95Latency: 120, p99Latency: 280, errorRate: 0.4, totalTraces: 51240, status: 'healthy' },
  { service: 'api-gateway', namespace: 'default', requestsPerSec: 288, p50Latency: 28, p95Latency: 88, p99Latency: 195, errorRate: 0.2, totalTraces: 103680, status: 'healthy' },
  { service: 'user-service', namespace: 'backend', requestsPerSec: 95, p50Latency: 62, p95Latency: 215, p99Latency: 490, errorRate: 2.8, totalTraces: 34200, status: 'degraded' },
  { service: 'order-service', namespace: 'backend', requestsPerSec: 67, p50Latency: 110, p95Latency: 420, p99Latency: 910, errorRate: 5.1, totalTraces: 24120, status: 'critical' },
  { service: 'inventory-svc', namespace: 'backend', requestsPerSec: 41, p50Latency: 34, p95Latency: 95, p99Latency: 200, errorRate: 0.1, totalTraces: 14760, status: 'healthy' },
  { service: 'payment-svc', namespace: 'payments', requestsPerSec: 18, p50Latency: 280, p95Latency: 840, p99Latency: 1400, errorRate: 0.6, totalTraces: 6480, status: 'healthy' },
  { service: 'notification', namespace: 'infra', requestsPerSec: 52, p50Latency: 22, p95Latency: 65, p99Latency: 120, errorRate: 0.0, totalTraces: 18720, status: 'healthy' },
  { service: 'cache-proxy', namespace: 'infra', requestsPerSec: 310, p50Latency: 3, p95Latency: 12, p99Latency: 28, errorRate: 0.1, totalTraces: 111600, status: 'healthy' },
];

const mockTraces: SpanRow[] = [
  { traceId: 'a1b2c3d4', service: 'frontend', operation: 'GET /checkout', duration: 423, status: 'ok', timestamp: '14:32:01', spans: 7 },
  { traceId: 'e5f6a7b8', service: 'order-service', operation: 'POST /orders', duration: 1280, status: 'error', timestamp: '14:31:58', spans: 12 },
  { traceId: 'c9d0e1f2', service: 'api-gateway', operation: 'GET /users/me', duration: 88, status: 'ok', timestamp: '14:31:55', spans: 3 },
  { traceId: '33445566', service: 'user-service', operation: 'GET /profile', duration: 490, status: 'error', timestamp: '14:31:52', spans: 5 },
  { traceId: 'aa112233', service: 'payment-svc', operation: 'POST /charge', duration: 840, status: 'ok', timestamp: '14:31:49', spans: 4 },
  { traceId: 'bb445577', service: 'cache-proxy', operation: 'GET /cache/key', duration: 9, status: 'ok', timestamp: '14:31:46', spans: 1 },
  { traceId: 'cc778899', service: 'inventory-svc', operation: 'GET /stock', duration: 78, status: 'ok', timestamp: '14:31:43', spans: 2 },
];

// Waterfall breakdown for one trace
const exampleWaterfall = {
  total: 423,
  spans: [
    { name: 'frontend', start: 0, duration: 423, color: '#3b82f6' },
    { name: 'api-gateway', start: 8, duration: 280, color: '#8b5cf6' },
    { name: 'user-service', start: 40, duration: 155, color: '#10b981' },
    { name: 'cache-proxy', start: 42, duration: 12, color: '#f59e0b' },
    { name: 'db-query', start: 75, duration: 95, color: '#ef4444' },
  ],
};

// Latency histogram bars
const HistBar: React.FC<{ label: string; value: number; maxVal: number; color: string }> = ({ label, value, maxVal, color }) => (
  <Box display="flex" alignItems="center" gap={1} mb={0.75}>
    <Typography variant="caption" sx={{ width: 36, flexShrink: 0, textAlign: 'right' }}>{label}</Typography>
    <Box sx={{ flex: 1, bgcolor: '#f3f4f6', borderRadius: 1, height: 14, overflow: 'hidden' }}>
      <Box sx={{ width: `${(value / maxVal) * 100}%`, height: '100%', bgcolor: color, borderRadius: 1 }} />
    </Box>
    <Typography variant="caption" fontWeight={700} sx={{ width: 52, flexShrink: 0 }}>{value}ms</Typography>
  </Box>
);

const Traces: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [filter, setFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading] = useState(false);

  const filteredServices = mockServices.filter(s =>
    (filter === 'all' || s.namespace === filter) &&
    (statusFilter === 'all' || s.status === statusFilter)
  );
  const namespaces = Array.from(new Set(mockServices.map(s => s.namespace)));

  const totalTraces = mockServices.reduce((sum, s) => sum + s.totalTraces, 0);
  const totalRPS = mockServices.reduce((sum, s) => sum + s.requestsPerSec, 0);
  const avgP95 = mockServices.reduce((sum, s) => sum + s.p95Latency, 0) / mockServices.length;
  const avgErrorRate = mockServices.reduce((sum, s) => sum + s.errorRate, 0) / mockServices.length;
  const criticalSvcs = mockServices.filter(s => s.status === 'critical' || s.status === 'degraded').length;

  const statusColor = (s: TraceService['status']) =>
    s === 'healthy' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : '#ef4444';
  const statusMui = (s: TraceService['status']): 'success' | 'warning' | 'error' =>
    s === 'healthy' ? 'success' : s === 'degraded' ? 'warning' : 'error';

  return (
    <Box p={3}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Distributed Tracing</Typography>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            Service-level latency, error rates & trace waterfall · APM-style view
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Namespace</InputLabel>
            <Select value={filter} label="Namespace" onChange={(e: SelectChangeEvent) => setFilter(e.target.value)}>
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
        </Box>
      </Box>

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Traces (24h)', value: (totalTraces / 1000).toFixed(0) + 'K', color: '#6366f1' },
          { label: 'Requests / sec', value: String(totalRPS), color: '#3b82f6' },
          { label: 'Avg P95 Latency', value: avgP95.toFixed(0) + 'ms', color: avgP95 > 300 ? '#ef4444' : '#22c55e' },
          { label: 'Avg Error Rate', value: avgErrorRate.toFixed(2) + '%', color: avgErrorRate > 2 ? '#ef4444' : '#22c55e' },
          { label: 'Services w/ Issues', value: String(criticalSvcs), color: criticalSvcs > 0 ? '#f59e0b' : '#22c55e' },
        ].map(({ label, value, color }) => (
          <Grid item xs={12} sm={6} md={2.4} key={label}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
              <CardContent sx={{ py: '12px !important', px: 2 }}>
                <Typography variant="caption" color="textSecondary" fontWeight={600}>{label}</Typography>
                <Typography variant="h4" fontWeight={800} sx={{ color, mt: 0.5 }}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Service map table */}
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Service Performance Map</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                      <TableCell>Service</TableCell>
                      <TableCell>Namespace</TableCell>
                      <TableCell>RPS</TableCell>
                      <TableCell>P50</TableCell>
                      <TableCell>P95</TableCell>
                      <TableCell>P99</TableCell>
                      <TableCell>Error %</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredServices.map(svc => (
                      <TableRow key={svc.service} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor(svc.status), flexShrink: 0 }} />
                            <Typography variant="body2" fontWeight={600}>{svc.service}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={svc.namespace} size="small" variant="outlined" /></TableCell>
                        <TableCell><Typography variant="body2">{svc.requestsPerSec}/s</Typography></TableCell>
                        <TableCell sx={{ color: svc.p50Latency > 200 ? '#ef4444' : '#1f2328' }}>{svc.p50Latency}ms</TableCell>
                        <TableCell sx={{ color: svc.p95Latency > 400 ? '#ef4444' : svc.p95Latency > 200 ? '#f59e0b' : '#1f2328' }}>
                          {svc.p95Latency}ms
                        </TableCell>
                        <TableCell sx={{ color: svc.p99Latency > 800 ? '#ef4444' : '#1f2328' }}>{svc.p99Latency}ms</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}
                            sx={{ color: svc.errorRate > 3 ? '#ef4444' : svc.errorRate > 1 ? '#f59e0b' : '#22c55e' }}>
                            {svc.errorRate.toFixed(1)}%
                          </Typography>
                        </TableCell>
                        <TableCell><Chip label={svc.status} color={statusMui(svc.status)} size="small" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Latency histogram */}
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb', height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Latency Distribution</Typography>
              {filteredServices.slice(0, 5).map(svc => {
                const maxLatency = Math.max(...filteredServices.slice(0, 5).map(s => s.p99Latency));
                return (
                  <Box key={svc.service} mb={2}>
                    <Typography variant="caption" fontWeight={700} color="textSecondary">{svc.service}</Typography>
                    <HistBar label="P50" value={svc.p50Latency} maxVal={maxLatency} color="#22c55e" />
                    <HistBar label="P95" value={svc.p95Latency} maxVal={maxLatency} color="#f59e0b" />
                    <HistBar label="P99" value={svc.p99Latency} maxVal={maxLatency} color="#ef4444" />
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent traces list */}
        <Grid item xs={12} md={8}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Recent Traces</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                      <TableCell>Trace ID</TableCell>
                      <TableCell>Service</TableCell>
                      <TableCell>Operation</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Spans</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {mockTraces.map(t => (
                      <TableRow key={t.traceId} hover>
                        <TableCell><Typography variant="caption" fontFamily="monospace" color="primary.main">{t.traceId}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{t.service}</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontFamily="monospace">{t.operation}</Typography></TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 50, bgcolor: '#f3f4f6', borderRadius: 1, height: 5, overflow: 'hidden' }}>
                              <Box sx={{ width: `${Math.min(100, (t.duration / 1400) * 100)}%`, height: '100%',
                                bgcolor: t.duration > 800 ? '#ef4444' : t.duration > 300 ? '#f59e0b' : '#22c55e' }} />
                            </Box>
                            <Typography variant="caption">{t.duration}ms</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={t.spans} size="small" /></TableCell>
                        <TableCell><Typography variant="caption" color="textSecondary">{t.timestamp}</Typography></TableCell>
                        <TableCell>
                          <Chip label={t.status === 'ok' ? 'OK' : 'ERROR'} color={t.status === 'ok' ? 'success' : 'error'} size="small" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Waterfall view */}
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={0.5}>Trace Waterfall</Typography>
              <Typography variant="caption" color="textSecondary" display="block" mb={2}>
                Trace a1b2c3d4 · GET /checkout · {exampleWaterfall.total}ms
              </Typography>
              <Box display="flex" flexDirection="column" gap={0.75}>
                {exampleWaterfall.spans.map((s, i) => (
                  <Box key={i}>
                    <Box display="flex" justifyContent="space-between" mb={0.25}>
                      <Typography variant="caption" fontWeight={600}>{s.name}</Typography>
                      <Typography variant="caption" color="textSecondary">+{s.start}ms</Typography>
                    </Box>
                    <WaterfallRow spans={[s]} total={exampleWaterfall.total} />
                  </Box>
                ))}
              </Box>
              <Box mt={2}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Typography variant="caption">
                    Connect Jaeger / Zipkin / OpenTelemetry for live traces
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
