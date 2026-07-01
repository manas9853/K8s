import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    pipelineName: 'platform-release',
    project: 'acme/platform-engineering',
    branch: 'main',
    status: 'Success',
    duration: '7m 51s',
    stage: 'Deploy',
    securityScanStatus: 'Passed',
  },
  {
    pipelineName: 'service-build',
    project: 'acme/orders-service',
    branch: 'develop',
    status: 'Failed',
    duration: '5m 22s',
    stage: 'Test',
    securityScanStatus: 'Findings',
  },
  {
    pipelineName: 'chart-validation',
    project: 'acme/helm-charts',
    branch: 'feature/network-policies',
    status: 'Running',
    duration: '2m 44s',
    stage: 'Lint',
    securityScanStatus: 'Running',
  },
];

const GitLabCI: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const successCount = data.filter((row) => row.status === 'Success').length;
  const activeStages = new Set(data.map((row) => row.stage)).size;
  const passedScans = data.filter((row) => row.securityScanStatus === 'Passed').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitLab CI Integration</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Pipelines</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Successful Pipelines</Typography><Typography variant="h5">{successCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Passed Scans / Stages</Typography><Typography variant="h5">{passedScans} / {activeStages}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Pipeline Name</TableCell><TableCell>Project</TableCell><TableCell>Branch</TableCell><TableCell>Status</TableCell><TableCell>Duration</TableCell><TableCell>Stage</TableCell><TableCell>Security Scan Status</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.pipelineName}</TableCell><TableCell>{row.project}</TableCell><TableCell>{row.branch}</TableCell><TableCell><Chip label={row.status} color={row.status === 'Success' ? 'success' : row.status === 'Failed' ? 'error' : 'info'} size="small" /></TableCell><TableCell>{row.duration}</TableCell><TableCell>{row.stage}</TableCell><TableCell><Chip label={row.securityScanStatus} color={row.securityScanStatus === 'Passed' ? 'success' : row.securityScanStatus === 'Findings' ? 'warning' : 'info'} size="small" /></TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default GitLabCI;
// Made with Bob
