import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface TektonPipeline {
  name: string;
  namespace: string;
  status: string;
  taskCount: number;
  duration: string;
  startTime: string;
  completionTime: string;
}

const TektonPipelines: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<TektonPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/pipelines/tekton`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const succeededCount = data.filter((r) => r.status === 'Succeeded').length;
  const failedCount = data.filter((r) => r.status === 'Failed').length;
  const nsCount = new Set(data.map((r) => r.namespace)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Tekton Pipelines</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Pipeline Runs</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Succeeded / Failed</Typography><Typography variant="h5">{succeededCount} / {failedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Namespaces</Typography><Typography variant="h5">{nsCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No Tekton pipelines found. Deploy Tekton Pipelines CRDs and ensure the k8s-agent can read PipelineRun resources.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Task Count</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Start Time</TableCell>
                  <TableCell>Completion Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'Succeeded' ? 'success' : row.status === 'Failed' ? 'error' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.taskCount}</TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.startTime}</TableCell>
                    <TableCell>{row.completionTime}</TableCell>
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

export default TektonPipelines;

// Made with Bob
