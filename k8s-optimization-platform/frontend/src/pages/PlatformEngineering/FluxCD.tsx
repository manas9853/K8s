import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface FluxKustomization {
  name: string;
  namespace: string;
  sourceRef: string;
  ready: boolean;
  suspended: boolean;
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
  age: string;
}

const FluxCD: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<FluxKustomization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/fluxcd/kustomizations`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const readyCount = data.filter((r) => r.ready).length;
  const suspendedCount = data.filter((r) => r.suspended).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>FluxCD Kustomizations</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Kustomizations</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Ready</Typography><Typography variant="h5">{readyCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Suspended</Typography><Typography variant="h5">{suspendedCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No FluxCD data yet. Enable FluxCD metrics in the k8s-agent configuration.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Source Ref</TableCell>
                  <TableCell>Ready</TableCell>
                  <TableCell>Suspended</TableCell>
                  <TableCell>Last Applied Revision</TableCell>
                  <TableCell>Age</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell>{row.sourceRef}</TableCell>
                    <TableCell><Chip label={row.ready ? 'Ready' : 'Not Ready'} color={row.ready ? 'success' : 'error'} size="small" /></TableCell>
                    <TableCell><Chip label={row.suspended ? 'Suspended' : 'Active'} color={row.suspended ? 'warning' : 'success'} size="small" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.lastAppliedRevision}</TableCell>
                    <TableCell>{row.age}</TableCell>
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

export default FluxCD;

// Made with Bob
