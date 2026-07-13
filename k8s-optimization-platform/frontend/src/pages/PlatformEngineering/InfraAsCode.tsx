import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface IaCResource {
  name: string;
  provider: string;
  resourceType: string;
  module: string;
  status: string;
  driftDetected: boolean;
  lastApplied: string;
}

const InfraAsCode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<IaCResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/iac`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const driftCount = data.filter((r) => r.driftDetected).length;
  const managedCount = data.filter((r) => r.status === 'managed').length;
  const providerCount = new Set(data.map((r) => r.provider)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Infrastructure as Code</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">IaC Resources</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Managed / Drift</Typography><Typography variant="h5">{managedCount} / {driftCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Providers</Typography><Typography variant="h5">{providerCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No IaC resources found. Connect Terraform or Pulumi state via the agent configuration.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Resource Name</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Resource Type</TableCell>
                  <TableCell>Module</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Drift Detected</TableCell>
                  <TableCell>Last Applied</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>{row.resourceType}</TableCell>
                    <TableCell>{row.module}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'managed' ? 'success' : 'default'} size="small" /></TableCell>
                    <TableCell><Chip label={row.driftDetected ? 'Drift' : 'Clean'} color={row.driftDetected ? 'warning' : 'success'} size="small" /></TableCell>
                    <TableCell>{row.lastApplied}</TableCell>
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

export default InfraAsCode;

// Made with Bob
