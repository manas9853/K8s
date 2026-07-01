import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton,
  LinearProgress, Grid, Tooltip, Alert, FormControl, InputLabel,
  Select, MenuItem, SelectChangeEvent,
} from '@mui/material';
import {
  Timeline as TimelineIcon, Refresh as RefreshIcon,
  Security as SecurityIcon, Public as PublicIcon,
  Lock as LockIcon, TrendingUp as TrendingUpIcon,
  NetworkCheck as NetworkIcon, Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface NamespaceTraffic {
  namespace: string;
  service_count: number;
  ingress_count: number;
  external_services: number;
  internal_services: number;
  network_policies: number;
  security_score: number;
}

// Flow chord-like SVG — bidirectional arc between top services
const FlowArc: React.FC<{ items: NamespaceTraffic[] }> = ({ items }) => {
  const top = items.slice(0, 6);
  const w = 320, h = 180;
  const cx = w / 2, cy = h / 2;
  const r = 70;
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  const angleStep = (2 * Math.PI) / Math.max(top.length, 1);
  const nodes = top.map((item, i) => {
    const angle = i * angleStep - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), ...item, color: colors[i] };
  });

  const arcs: React.ReactNode[] = [];
  nodes.forEach((src, i) => {
    const tgt = nodes[(i + 1) % nodes.length];
    const mx = (src.x + tgt.x) / 2 + (cy - (src.y + tgt.y) / 2) * 0.3;
    const my = (src.y + tgt.y) / 2 - (cx - (src.x + tgt.x) / 2) * 0.3;
    arcs.push(
      <path key={i} d={`M${src.x},${src.y} Q${mx},${my} ${tgt.x},${tgt.y}`}
        fill="none" stroke={src.color} strokeWidth="1.5" strokeOpacity="0.4" />
    );
  });

  return (
    <svg width={w} height={h}>
      {arcs}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={12} fill={n.color} fillOpacity={0.15} stroke={n.color} strokeWidth={2} />
          <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
            fontSize="8" fontWeight="600" fill={n.color}>
            {n.namespace.slice(0, 4)}
          </text>
        </g>
      ))}
    </svg>
  );
};

// Security score ring
const SecurityRing: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      <svg width={34} height={34}>
        <circle cx={17} cy={17} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        <circle cx={17} cy={17} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="bold" fill={color}>
          {score}
        </text>
      </svg>
    </Box>
  );
};

const TrafficAnalysis: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [trafficData, setTrafficData] = useState<NamespaceTraffic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('security_score');

  const fetchTrafficData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/network/traffic-analysis${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTrafficData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traffic data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrafficData(); }, [clusterParam]);

  const sorted = [...trafficData].sort((a, b) => {
    if (sortBy === 'security_score') return a.security_score - b.security_score;
    if (sortBy === 'external') return b.external_services - a.external_services;
    if (sortBy === 'services') return b.service_count - a.service_count;
    return 0;
  });

  const totalServices = trafficData.reduce((s, d) => s + d.service_count, 0);
  const totalExternal = trafficData.reduce((s, d) => s + d.external_services, 0);
  const totalIngress = trafficData.reduce((s, d) => s + d.ingress_count, 0);
  const avgSecurity = trafficData.length ? trafficData.reduce((s, d) => s + d.security_score, 0) / trafficData.length : 0;
  const policyCoverage = trafficData.length
    ? (trafficData.filter(d => d.network_policies > 0).length / trafficData.length) * 100
    : 0;
  const exposedNs = trafficData.filter(d => d.external_services > 0 && d.network_policies === 0).length;

  const secColor = (s: number) => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <Box p={3}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Traffic Analysis</Typography>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            Network flow · exposure risk · policy coverage
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort by</InputLabel>
            <Select value={sortBy} label="Sort by" onChange={(e: SelectChangeEvent) => setSortBy(e.target.value)}>
              <MenuItem value="security_score">Security Risk (low first)</MenuItem>
              <MenuItem value="external">External Exposure</MenuItem>
              <MenuItem value="services">Service Count</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchTrafficData} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Services', value: String(totalServices), color: '#6366f1', sub: `${trafficData.length} namespaces` },
          { label: 'External Exposures', value: String(totalExternal), color: totalExternal > 5 ? '#ef4444' : '#f59e0b', sub: 'publicly reachable' },
          { label: 'Ingress Rules', value: String(totalIngress), color: '#3b82f6', sub: 'HTTP/HTTPS routes' },
          { label: 'Avg Security Score', value: avgSecurity.toFixed(0), color: secColor(avgSecurity), sub: '/100 (higher = safer)' },
          { label: 'Policy Coverage', value: policyCoverage.toFixed(0) + '%', color: policyCoverage >= 80 ? '#22c55e' : '#ef4444', sub: 'namespaces with policies' },
          { label: 'Exposed w/o Policy', value: String(exposedNs), color: exposedNs > 0 ? '#ef4444' : '#22c55e', sub: 'high risk' },
        ].map(({ label, value, color, sub }) => (
          <Grid item xs={12} sm={6} md={2} key={label}>
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

      {loading ? (
        <Box><LinearProgress /><Typography variant="body2" color="textSecondary" mt={1} textAlign="center">Loading traffic data…</Typography></Box>
      ) : (
        <Grid container spacing={3}>
          {/* Service flow map */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={1}>Namespace Flow Map</Typography>
                <Typography variant="caption" color="textSecondary" display="block" mb={2}>
                  Arc = bidirectional traffic between top namespaces
                </Typography>
                <Box display="flex" justifyContent="center">
                  <FlowArc items={trafficData} />
                </Box>
                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                  {trafficData.slice(0, 6).map((d, i) => (
                    <Chip key={d.namespace} label={d.namespace} size="small"
                      sx={{ bgcolor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'][i] + '22',
                        color: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'][i],
                        border: '1px solid currentColor', fontSize: 10 }} />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Policy coverage heatmap */}
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Network Security Coverage</Typography>
                <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                  {sorted.map(d => {
                    const risk = d.external_services > 0 && d.network_policies === 0;
                    const bg = risk ? '#fecaca' : d.security_score >= 80 ? '#bbf7d0' : '#fef08a';
                    const fg = risk ? '#991b1b' : d.security_score >= 80 ? '#166534' : '#854d0e';
                    return (
                      <Tooltip key={d.namespace} title={`Security: ${d.security_score} | External: ${d.external_services} | Policies: ${d.network_policies}`}>
                        <Box sx={{
                          bgcolor: bg, color: fg, borderRadius: 1, px: 1, py: 0.5,
                          fontSize: 11, fontWeight: 700, cursor: 'default', textAlign: 'center', minWidth: 70,
                        }}>
                          {d.namespace.length > 10 ? d.namespace.slice(0, 9) + '…' : d.namespace}
                          <br />Score: {d.security_score}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
                {exposedNs > 0 && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="caption">
                      <strong>{exposedNs} namespace{exposedNs > 1 ? 's' : ''}</strong> have external services without network policies — high exposure risk.
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Detailed table */}
          <Grid item xs={12}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Namespace Traffic Details</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
                        <TableCell>Namespace</TableCell>
                        <TableCell>Services</TableCell>
                        <TableCell>Ingress Rules</TableCell>
                        <TableCell>External</TableCell>
                        <TableCell>Internal</TableCell>
                        <TableCell>Net Policies</TableCell>
                        <TableCell>Security Score</TableCell>
                        <TableCell>Risk Level</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sorted.map(d => {
                        const exposed = d.external_services > 0 && d.network_policies === 0;
                        const risk = exposed ? 'High' : d.security_score < 60 ? 'Medium' : 'Low';
                        const riskColor: 'error' | 'warning' | 'success' = exposed ? 'error' : d.security_score < 60 ? 'warning' : 'success';
                        return (
                          <TableRow key={d.namespace} hover>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={1}>
                                {exposed
                                  ? <WarningIcon sx={{ fontSize: 14, color: '#ef4444' }} />
                                  : <CheckIcon sx={{ fontSize: 14, color: '#22c55e' }} />}
                                <Typography variant="body2" fontWeight={600}>{d.namespace}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell><Typography variant="body2">{d.service_count}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{d.ingress_count}</Typography></TableCell>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                {d.external_services > 0 && <PublicIcon sx={{ fontSize: 14, color: '#ef4444' }} />}
                                <Typography variant="body2" sx={{ color: d.external_services > 0 ? '#ef4444' : 'inherit' }}>
                                  {d.external_services}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                <LockIcon sx={{ fontSize: 14, color: '#22c55e' }} />
                                <Typography variant="body2">{d.internal_services}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={d.network_policies === 0 ? 'None' : String(d.network_policies)}
                                color={d.network_policies === 0 ? 'error' : 'success'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={1}>
                                <SecurityRing score={d.security_score} />
                                <Box sx={{ width: 60, bgcolor: '#f3f4f6', borderRadius: 1, height: 6, overflow: 'hidden' }}>
                                  <Box sx={{ width: `${d.security_score}%`, height: '100%', bgcolor: secColor(d.security_score) }} />
                                </Box>
                                <Typography variant="caption">{d.security_score}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell><Chip label={risk} color={riskColor} size="small" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default TrafficAnalysis;

// Made with Bob
