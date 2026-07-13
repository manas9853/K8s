import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface DriftEvent {
  resourceName: string;
  kind: string;
  namespace: string;
  expectedState: string;
  currentState: string;
  driftStatus: string;
  detectedAt: string;
}

const GitopsDriftDetection: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DriftEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/gitops/drift`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const driftedCount = data.filter((r) => r.driftStatus === 'Drifted').length;
  const syncedCount = data.filter((r) => r.driftStatus === 'Synced').length;
  const namespaceCount = new Set(data.map((r) => r.namespace)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitOps Drift Detection</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Resources Checked</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Drifted</Typography><Typography variant="h5">{driftedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Synced / Namespaces</Typography><Typography variant="h5">{syncedCount} / {namespaceCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No drift events detected. GitOps sync is healthy or drift tracking is not yet configured.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Resource Name</TableCell>
                  <TableCell>Kind</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Expected State (Git)</TableCell>
                  <TableCell>Current State (Cluster)</TableCell>
                  <TableCell>Drift Status</TableCell>
                  <TableCell>Detected At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.resourceName}</TableCell>
                    <TableCell>{row.kind}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.expectedState}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.currentState}</TableCell>
                    <TableCell><Chip label={row.driftStatus} color={row.driftStatus === 'Drifted' ? 'warning' : 'success'} size="small" /></TableCell>
                    <TableCell>{row.detectedAt}</TableCell>
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

export default GitopsDriftDetection;

// Made with Bob
