import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface ArgoCDApp {
  appName: string;
  repoUrl: string;
  targetRevision: string;
  syncStatus: string;
  healthStatus: string;
  lastSyncTime: string;
  cluster: string;
}

const ArgoCD: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ArgoCDApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/argocd/apps`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const syncedCount = data.filter((r) => r.syncStatus === 'Synced').length;
  const healthyCount = data.filter((r) => r.healthStatus === 'Healthy').length;
  const clusterCount = new Set(data.map((r) => r.cluster)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>ArgoCD GitOps Dashboard</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Applications</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Synced Apps</Typography><Typography variant="h5">{syncedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Healthy / Clusters</Typography><Typography variant="h5">{healthyCount} / {clusterCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No ArgoCD application data yet. Install the k8s-agent with ArgoCD metrics enabled.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>App Name</TableCell>
                  <TableCell>Repo URL</TableCell>
                  <TableCell>Target Revision</TableCell>
                  <TableCell>Sync Status</TableCell>
                  <TableCell>Health Status</TableCell>
                  <TableCell>Last Sync Time</TableCell>
                  <TableCell>Cluster</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.appName}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.repoUrl}</TableCell>
                    <TableCell>{row.targetRevision}</TableCell>
                    <TableCell><Chip label={row.syncStatus} color={row.syncStatus === 'Synced' ? 'success' : row.syncStatus === 'OutOfSync' ? 'warning' : 'default'} size="small" /></TableCell>
                    <TableCell><Chip label={row.healthStatus} color={row.healthStatus === 'Healthy' ? 'success' : row.healthStatus === 'Degraded' ? 'error' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.lastSyncTime}</TableCell>
                    <TableCell>{row.cluster}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default ArgoCD;

// Made with Bob
