import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface DeploymentRecord {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  strategy: string;
  age: string;
}

const DeploymentIntelligence: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/deployment-intelligence`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const healthyCount = data.filter((r) => r.ready_replicas === r.replicas).length;
  const degradedCount = data.filter((r) => r.ready_replicas < r.replicas).length;
  const nsCount = new Set(data.map((r) => r.namespace)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Deployment Intelligence &amp; Risk Scoring</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Deployments</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Healthy / Degraded</Typography><Typography variant="h5">{healthyCount} / {degradedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Namespaces</Typography><Typography variant="h5">{nsCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No deployment data yet. Ensure the K8s agent is connected and reporting workload metrics.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Deployment Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Replicas</TableCell>
                  <TableCell>Ready Replicas</TableCell>
                  <TableCell>Strategy</TableCell>
                  <TableCell>Age</TableCell>
                  <TableCell>Health</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell>{row.replicas}</TableCell>
                    <TableCell>{row.ready_replicas}</TableCell>
                    <TableCell>{row.strategy}</TableCell>
                    <TableCell>{row.age}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.ready_replicas === row.replicas ? 'Healthy' : 'Degraded'}
                        color={row.ready_replicas === row.replicas ? 'success' : 'warning'}
                        size="small"
                      />
                    </TableCell>
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

export default DeploymentIntelligence;

// Made with Bob
