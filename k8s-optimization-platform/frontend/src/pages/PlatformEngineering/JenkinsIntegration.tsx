import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface JenkinsJob {
  jobName: string;
  lastBuild: string;
  buildNumber: number;
  status: string;
  duration: string;
  triggeredBy: string;
  timestamp: string;
}

const JenkinsIntegration: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<JenkinsJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/pipelines/jenkins`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const successCount = data.filter((r) => r.status === 'SUCCESS').length;
  const failedCount = data.filter((r) => r.status === 'FAILURE').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Jenkins Integration</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Jobs</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Successful</Typography><Typography variant="h5">{successCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Failed</Typography><Typography variant="h5">{failedCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No Jenkins data yet. Configure the Jenkins integration in Settings → Integrations.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Job Name</TableCell>
                  <TableCell>Last Build</TableCell>
                  <TableCell>Build #</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Triggered By</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.jobName}</TableCell>
                    <TableCell>{row.lastBuild}</TableCell>
                    <TableCell>{row.buildNumber}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'SUCCESS' ? 'success' : row.status === 'FAILURE' ? 'error' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.duration}</TableCell>
                    <TableCell>{row.triggeredBy}</TableCell>
                    <TableCell>{row.timestamp}</TableCell>
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

export default JenkinsIntegration;

// Made with Bob
