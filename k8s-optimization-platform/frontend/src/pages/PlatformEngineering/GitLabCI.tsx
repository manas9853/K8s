import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface GitLabPipeline {
  project: string;
  branch: string;
  stage: string;
  status: string;
  duration: string;
  triggeredAt: string;
  triggeredBy: string;
}

const GitLabCI: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<GitLabPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/pipelines/gitlab-ci`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const passedCount = data.filter((r) => r.status === 'success' || r.status === 'passed').length;
  const failedCount = data.filter((r) => r.status === 'failed').length;
  const projectCount = new Set(data.map((r) => r.project)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitLab CI/CD Pipelines</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Pipeline Jobs</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Passed / Failed</Typography><Typography variant="h5">{passedCount} / {failedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Projects</Typography><Typography variant="h5">{projectCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No GitLab CI data yet. Configure the GitLab integration in Settings → Integrations.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell>Branch</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Triggered At</TableCell>
                  <TableCell>Triggered By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.project}</TableCell>
                    <TableCell>{row.branch}</TableCell>
                    <TableCell>{row.stage}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'success' || row.status === 'passed' ? 'success' : row.status === 'failed' ? 'error' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.triggeredAt}</TableCell>
                    <TableCell>{row.triggeredBy}</TableCell>
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

export default GitLabCI;

// Made with Bob
