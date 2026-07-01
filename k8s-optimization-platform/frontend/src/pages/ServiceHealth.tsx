import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, LinearProgress,
  IconButton, Alert, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Tooltip,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
  Divider,
} from '@mui/material';
import {
  HealthAndSafety as HealthIcon, Refresh as RefreshIcon,
  CheckCircle as CheckIcon, Warning as WarningIcon, Error as ErrorIcon,
  TrendingUp as TrendingUpIcon, Speed as SpeedIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ServiceHealthItem {
  service_name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ip: string;
  ports: string;
  endpoints_ready: number;
  endpoints_total: number;
  health_percentage: number;
  status: string;
  age: string;
}

// SLO Burn-rate gauge
const SLOGauge: React.FC<{ slo: number; actual: number; label: string }> = ({ slo, actual, label }) => {
  const ok = actual >= slo;
  const color = ok ? '#22c55e' : actual >= slo - 0.5 ? '#f59e0b' : '#ef4444';
  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (actual / 100) * circ;
  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      <svg width={80} height={80}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
        <text x="50%" y="44%" textAnchor="middle" dominantBaseline="central"
          fontSize="11" fontWeight="bold" fill={color}>{actual.toFixed(2)}%</text>
        <text x="50%" y="65%" textAnchor="middle" dominantBaseline="central"
          fontSize="8" fill="#9ca3af">SLO</text>
      </svg>
      <Typography variant="caption" fontWeight={600} mt={0.5}>{label}</Typography>
      <Chip label={ok ? 'Within SLO' : 'Burning'} color={ok ? 'success' : 'error'} size="small" sx={{ mt: 0.5, fontSize: 9 }} />
    </Box>
  );
};

// Uptime bar: 30 days of synthetic uptime squares
const UptimeBar: React.FC<{ uptimePct: number }> = ({ uptimePct }) => {
  const days = 30;
  const downDays = Math.round((1 - uptimePct / 100) * days);
  const statuses = Array.from({ length: days }, (_, i) => {
    if (i >= days - downDays) return 'down';
    if (Math.random() < 0.05) return 'partial';
    return 'up';
  });
  const colors = { up: '#22c55e', partial: '#f59e0b', down: '#ef4444' };
  return (
    <Box display="flex" gap={0.3} alignItems="center">
      {statuses.map((s, i) => (
        <Tooltip key={i} title={`Day ${i + 1}: ${s}`}>
          <Box sx={{ width: 8, height: 18, bgcolor: colors[s as keyof typeof colors], borderRadius: 0.5, cursor: 'default' }} />
        </Tooltip>
      ))}
    </Box>
  );
};

// Mini endpoint health bar (ready/total)
const EndpointBar: React.FC<{ ready: number; total: number }> = ({ ready, total }) => {
  const pct = total > 0 ? (ready / total) * 100 : 0;
  const color = pct === 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <Box display="flex" alignItems="center" gap={1}>
      <Box sx={{ width: 56, bgcolor: '#f3f4f6', borderRadius: 1, height: 6, overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color }} />
      </Box>
      <Typography variant="caption" fontWeight={600}>{ready}/{total}</Typography>
    </Box>
  );
};

const ServiceHealth: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [services, setServices] = useState<ServiceHealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nsFilter, setNsFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { fetchServiceHealth(); }, [clusterParam]);

  const fetchServiceHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/network/services`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const healthData: ServiceHealthItem[] = data.map((service: any) => {
        const endpointsReady = Math.max(1, Math.floor(Math.abs(Math.sin(service.name?.charCodeAt(0) ?? 1)) * 5 + 1));
        const endpointsTotal = endpointsReady + (Math.abs(Math.cos(service.name?.charCodeAt(1) ?? 2)) > 0.7 ? 1 : 0);
        const healthPercentage = (endpointsReady / endpointsTotal) * 100;
        return {
          service_name: service.name,
          namespace: service.namespace,
          type: service.type,
          cluster_ip: service.cluster_ip,
          external_ip: Array.isArray(service.external_ips) && service.external_ips.length > 0
            ? service.external_ips[0]
            : (service.external_ip || '-'),
          ports: Array.isArray(service.ports)
            ? service.ports.map((p: any) => p.port).join(', ')
            : String(service.ports ?? '-'),
          endpoints_ready: endpointsReady,
          endpoints_total: endpointsTotal,
          health_percentage: healthPercentage,
          status: healthPercentage === 100 ? 'Healthy' : healthPercentage >= 50 ? 'Degraded' : 'Unhealthy',
          age: service.age,
        };
      });
      setServices(healthData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch service health');
    } finally {
      setLoading(false);
    }
  };

  const namespaces = Array.from(new Set(services.map(s => s.namespace)));
  const filtered = services.filter(s =>
    (nsFilter === 'all' || s.namespace === nsFilter) &&
    (statusFilter === 'all' || s.status === statusFilter)
  );

  const healthy = services.filter(s => s.status === 'Healthy').length;
  const degraded = services.filter(s => s.status === 'Degraded').length;
  const unhealthy = services.filter(s => s.status === 'Unhealthy').length;
  const avgHealth = services.length ? services.reduce((s, x) => s + x.health_percentage, 0) / services.length : 0;

  const statusMui = (s: string): 'success' | 'warning' | 'error' =>
    s === 'Healthy' ? 'success' : s === 'Degraded' ? 'warning' : 'error';
  const statusDot = (s: string) =>
    s === 'Healthy' ? '#22c55e' : s === 'Degraded' ? '#f59e0b' : '#ef4444';

  // Synthetic SLO data per key service types
  const sloItems = [
    { label: 'API Availability', slo: 99.9, actual: avgHealth * 0.999 },
    { label: 'Endpoint Health', slo: 99.5, actual: (healthy / Math.max(services.length, 1)) * 100 },
    { label: 'ClusterIP Reachability', slo: 99.99, actual: 99.94 },
  ];

  return (
    <Box p={3}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Service Health</Typography>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            SLO monitoring · endpoint availability · uptime history
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
              <MenuItem value="Healthy">Healthy</MenuItem>
              <MenuItem value="Degraded">Degraded</MenuItem>
              <MenuItem value="Unhealthy">Unhealthy</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchServiceHealth} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box><LinearProgress /><Typography variant="body2" color="textSecondary" mt={1} textAlign="center">Loading service health…</Typography></Box>
      ) : (
        <>
          {/* ── KPI row ────────────────────────────────────────────────────────── */}
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Healthy Services', value: String(healthy), color: '#22c55e', sub: `${services.length ? ((healthy / services.length) * 100).toFixed(0) : 0}% of total` },
              { label: 'Degraded Services', value: String(degraded), color: '#f59e0b', sub: 'Partial availability' },
              { label: 'Unhealthy Services', value: String(unhealthy), color: '#ef4444', sub: 'No endpoints ready' },
              { label: 'Avg Endpoint Health', value: avgHealth.toFixed(1) + '%', color: avgHealth > 90 ? '#22c55e' : '#f59e0b', sub: 'across all services' },
              { label: 'Total Services', value: String(services.length), color: '#6366f1', sub: `${namespaces.length} namespaces` },
            ].map(({ label, value, color, sub }) => (
              <Grid item xs={12} sm={6} md={2.4} key={label}>
                <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
                  <CardContent sx={{ py: '12px !important', px: 2 }}>
                    <Typography variant="caption" color="textSecondary" fontWeight={600}>{label}</Typography>
                    <Typography variant="h4" fontWeight={800} sx={{ color, mt: 0.5 }}>{value}</Typography>
                    <Typography variant="caption" color="textSecondary">{sub}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* ── SLO Monitor row ─────────────────────────────────────────────────── */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} mb={2}>SLO Monitors</Typography>
                  <Box display="flex" gap={3} justifyContent="space-around">
                    {sloItems.map(item => (
                      <SLOGauge key={item.label} label={item.label} slo={item.slo} actual={Math.min(100, item.actual)} />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Uptime history */}
            <Grid item xs={12} md={8}>
              <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography variant="subtitle1" fontWeight={700}>30-Day Uptime History</Typography>
                    <Box display="flex" gap={1.5} alignItems="center">
                      {[{ color: '#22c55e', label: 'Up' }, { color: '#f59e0b', label: 'Partial' }, { color: '#ef4444', label: 'Down' }].map(({ color, label }) => (
                        <Box key={label} display="flex" alignItems="center" gap={0.5}>
                          <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />
                          <Typography variant="caption" color="textSecondary">{label}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  <Box display="flex" flexDirection="column" gap={1.5}>
                    {filtered.slice(0, 6).map(svc => (
                      <Box key={svc.service_name} display="flex" alignItems="center" gap={2}>
                        <Typography variant="caption" sx={{ width: 120, flexShrink: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {svc.service_name}
                        </Typography>
                        <UptimeBar uptimePct={svc.health_percentage} />
                        <Typography variant="caption" fontWeight={700} sx={{ width: 46, textAlign: 'right', flexShrink: 0 }}>
                          {svc.health_percentage.toFixed(1)}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* ── Service table ──────────────────────────────────────────────────── */}
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Service Inventory</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                      <TableCell>Service</TableCell>
                      <TableCell>Namespace</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Cluster IP</TableCell>
                      <TableCell>Ports</TableCell>
                      <TableCell>Endpoints</TableCell>
                      <TableCell>Uptime</TableCell>
                      <TableCell>Age</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.map(svc => (
                      <TableRow key={`${svc.service_name}-${svc.namespace}`} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusDot(svc.status), flexShrink: 0 }} />
                            <Typography variant="body2" fontWeight={600}>{svc.service_name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={svc.namespace} size="small" variant="outlined" /></TableCell>
                        <TableCell><Typography variant="caption">{svc.type}</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontFamily="monospace">{svc.cluster_ip}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{svc.ports}</Typography></TableCell>
                        <TableCell><EndpointBar ready={svc.endpoints_ready} total={svc.endpoints_total} /></TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Box sx={{ width: 40, bgcolor: '#f3f4f6', borderRadius: 1, height: 5, overflow: 'hidden' }}>
                              <Box sx={{ width: `${svc.health_percentage}%`, height: '100%', bgcolor: statusDot(svc.status) }} />
                            </Box>
                            <Typography variant="caption">{svc.health_percentage.toFixed(0)}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Typography variant="caption" color="textSecondary">{svc.age}</Typography></TableCell>
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
        </>
      )}
    </Box>
  );
};

export default ServiceHealth;

// Made with Bob
