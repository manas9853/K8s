import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Service {
  id: string;
  name: string;
  type: string;
  namespace: string;
  health: string;
  pods: number;
  requests_per_second: number;
}

interface Dependency {
  id: string;
  source: string;
  target: string;
  type: string;
  requests_per_second: number;
  latency_ms: number;
  error_rate: number;
  critical: boolean;
}

interface CriticalPath {
  id: string;
  services: string[];
  total_latency_ms: number;
  reliability: number;
  requests_per_second: number;
}

interface DependencyMappingData {
  total_services: number;
  total_dependencies: number;
  services: Service[];
  dependencies: Dependency[];
  critical_paths: CriticalPath[];
  last_updated: string;
}

const healthColor: Record<string, 'success' | 'warning' | 'error'> = {
  healthy: 'success', degraded: 'warning', unhealthy: 'error',
};
const depTypeColor: Record<string, 'primary' | 'secondary' | 'info' | 'default'> = {
  http: 'primary', grpc: 'secondary', database: 'info', cache: 'default',
};

const DependencyMappingInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DependencyMappingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/dependency-mapping${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  // Build service id→name map for display
  const svcMap: Record<string, string> = {};
  (data.services || []).forEach((s) => { svcMap[s.id] = s.name; });

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Dependency Mapping</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Map service dependencies and relationships</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Services', value: data.total_services },
          { label: 'Total Dependencies', value: data.total_dependencies },
          { label: 'Critical Paths', value: (data.critical_paths || []).length },
          { label: 'Last Updated', value: new Date(data.last_updated).toLocaleTimeString() },
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

      {/* Services */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Services ({data.total_services})</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Health</TableCell>
                  <TableCell align="right">Pods</TableCell>
                  <TableCell align="right">Req/s</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.services || []).map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                    <TableCell>{s.type}</TableCell>
                    <TableCell>{s.namespace}</TableCell>
                    <TableCell><Chip label={s.health} size="small" color={healthColor[s.health] ?? 'default'} /></TableCell>
                    <TableCell align="right">{s.pods}</TableCell>
                    <TableCell align="right">{s.requests_per_second}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Dependencies */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dependencies ({data.total_dependencies})</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Source</TableCell>
                  <TableCell>Target</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Req/s</TableCell>
                  <TableCell align="right">Latency (ms)</TableCell>
                  <TableCell align="right">Error Rate</TableCell>
                  <TableCell>Critical</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.dependencies || []).map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{svcMap[d.source] ?? d.source}</TableCell>
                    <TableCell>{svcMap[d.target] ?? d.target}</TableCell>
                    <TableCell><Chip label={d.type} size="small" color={depTypeColor[d.type] ?? 'default'} /></TableCell>
                    <TableCell align="right">{d.requests_per_second}</TableCell>
                    <TableCell align="right" sx={{ color: d.latency_ms > 100 ? '#c62828' : 'inherit' }}>{d.latency_ms}</TableCell>
                    <TableCell align="right" sx={{ color: d.error_rate > 2 ? '#c62828' : 'inherit' }}>{d.error_rate}%</TableCell>
                    <TableCell>{d.critical && <Chip label="Critical" size="small" color="error" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Critical Paths */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Critical Paths ({(data.critical_paths || []).length})</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Path</TableCell>
                  <TableCell>Services</TableCell>
                  <TableCell align="right">Total Latency (ms)</TableCell>
                  <TableCell align="right">Reliability</TableCell>
                  <TableCell align="right">Req/s</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.critical_paths || []).map((cp) => (
                  <TableRow key={cp.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{cp.id}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {cp.services.map((sid) => (
                          <Chip key={sid} label={svcMap[sid] ?? sid} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{cp.total_latency_ms}</TableCell>
                    <TableCell align="right" sx={{ color: cp.reliability < 98 ? '#e65100' : '#2e7d32', fontWeight: 600 }}>{cp.reliability}%</TableCell>
                    <TableCell align="right">{cp.requests_per_second}</TableCell>
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

const DependencyMapping: React.FC = () => (
  <ClusterGuard><DependencyMappingInner /></ClusterGuard>
);

export default DependencyMapping;
