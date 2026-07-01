/**
 * Incident Reports
 * Pulls real data from /api/v1/incidents/incidents and /api/v1/incidents/summary.
 * Shows NoClusterBanner when no cluster is attached.
 */
import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterBanner from '../components/NoClusterBanner';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, IconButton, LinearProgress,
} from '@mui/material';
import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

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
}

interface IncidentSummary {
  total_incidents: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
  total_oomkills: number;
  total_restarts: number;
  total_throttling_events: number;
}

const IncidentReports: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchData();
  }, [clusterParam, clustersLoading, clusters.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [incRes, sumRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/incidents/incidents${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/incidents/summary${clusterParam}`),
      ]);

      if (incRes.ok) {
        const raw = await incRes.json();
        setIncidents(Array.isArray(raw) ? raw : raw.incidents ?? []);
      }
      if (sumRes.ok) setSummary(await sumRes.json());
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const header = ['Incident ID', 'Type', 'Severity', 'Pod', 'Namespace', 'Cluster', 'Count', 'Timestamp', 'Message'];
    const csv = [header, ...incidents.map(i => [i.incident_id, i.type, i.severity, i.pod_name, i.namespace, i.cluster, i.count, i.timestamp, `"${i.message?.replace(/"/g, '""')}"`])].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (clustersLoading) return <LinearProgress />;
  if (clusters.length === 0) return <NoClusterBanner dataDescription="incident and event data" />;

  const sevColor = (s: string): 'error' | 'warning' | 'info' | 'default' =>
    s === 'critical' ? 'error' : s === 'high' ? 'warning' : s === 'medium' ? 'info' : 'default';
  const typeColor = (t: string): 'error' | 'warning' | 'primary' | 'default' =>
    t === 'oomkill' ? 'error' : t === 'restart' ? 'warning' : t === 'throttling' ? 'primary' : 'default';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Incident Reports</Typography>
          <Typography variant="body2" color="text.secondary">Live OOM kills, restarts, throttling, and crash events from your clusters</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>Export CSV</Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* KPI cards derived from live summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Total Incidents', value: summary?.total_incidents ?? incidents.length },
          { label: 'Critical', value: summary?.by_severity?.critical ?? 0 },
          { label: 'OOM Kills', value: summary?.total_oomkills ?? 0 },
          { label: 'Restart Events', value: summary?.total_restarts ?? 0 },
        ].map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>{kpi.label}</Typography>
                <Typography variant="h5">{kpi.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Incident ID', 'Type', 'Severity', 'Pod', 'Namespace', 'Cluster', 'Count', 'Timestamp'].map((h) => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {incidents.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>No incidents detected — your clusters are healthy 🎉</Typography>
                  </TableCell>
                </TableRow>
              )}
              {incidents.map((inc, i) => (
                <TableRow key={i} hover>
                  <TableCell><strong>{inc.incident_id}</strong></TableCell>
                  <TableCell>
                    <Chip label={inc.type} size="small" variant="outlined" color={typeColor(inc.type)} />
                  </TableCell>
                  <TableCell>
                    <Chip label={inc.severity} size="small" color={sevColor(inc.severity)} />
                  </TableCell>
                  <TableCell>{inc.pod_name}</TableCell>
                  <TableCell>{inc.namespace}</TableCell>
                  <TableCell>{inc.cluster}</TableCell>
                  <TableCell>{inc.count}</TableCell>
                  <TableCell>{new Date(inc.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default IncidentReports;

// Made with Bob
