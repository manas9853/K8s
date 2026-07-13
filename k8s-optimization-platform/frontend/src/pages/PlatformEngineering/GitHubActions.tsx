import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface WorkflowRun {
  workflow: string;
  repo: string;
  branch: string;
  status: string;
  conclusion: string;
  duration: string;
  triggeredAt: string;
}

const GitHubActions: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/pipelines/github-actions`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const successCount = data.filter((r) => r.conclusion === 'success').length;
  const failCount = data.filter((r) => r.conclusion === 'failure').length;
  const repoCount = new Set(data.map((r) => r.repo)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitHub Actions Pipelines</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Workflow Runs</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Success / Failed</Typography><Typography variant="h5">{successCount} / {failCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Repositories</Typography><Typography variant="h5">{repoCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No GitHub Actions data yet. Configure the GitHub integration in Settings → Integrations.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Workflow</TableCell>
                  <TableCell>Repository</TableCell>
                  <TableCell>Branch</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Conclusion</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Triggered At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.workflow}</TableCell>
                    <TableCell>{row.repo}</TableCell>
                    <TableCell>{row.branch}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'completed' ? 'success' : 'default'} size="small" /></TableCell>
                    <TableCell><Chip label={row.conclusion} color={row.conclusion === 'success' ? 'success' : row.conclusion === 'failure' ? 'error' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.triggeredAt}</TableCell>
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

export default GitHubActions;

// Made with Bob
