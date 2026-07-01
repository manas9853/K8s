import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    workflowName: 'deploy-prod',
    repo: 'acme/platform-web',
    branch: 'main',
    lastRunStatus: 'Success',
    duration: '6m 14s',
    triggeredBy: 'ops-bot',
    securityChecksPassed: 'Yes',
  },
  {
    workflowName: 'build-and-test',
    repo: 'acme/inventory-service',
    branch: 'develop',
    lastRunStatus: 'Failed',
    duration: '4m 36s',
    triggeredBy: 'rahul.s',
    securityChecksPassed: 'No',
  },
  {
    workflowName: 'helm-lint',
    repo: 'acme/gitops-config',
    branch: 'feature/chart-update',
    lastRunStatus: 'Running',
    duration: '2m 03s',
    triggeredBy: 'merge-queue',
    securityChecksPassed: 'Yes',
  },
];

const GitHubActions: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const passedCount = data.filter((row) => row.securityChecksPassed === 'Yes').length;
  const failedCount = data.filter((row) => row.lastRunStatus === 'Failed').length;
  const repoCount = new Set(data.map((row) => row.repo)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitHub Actions Integration</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Workflows</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Security Checks Passed</Typography><Typography variant="h5">{passedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Failed Runs / Repos</Typography><Typography variant="h5">{failedCount} / {repoCount}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Workflow Name</TableCell><TableCell>Repo</TableCell><TableCell>Branch</TableCell><TableCell>Last Run Status</TableCell><TableCell>Duration</TableCell><TableCell>Triggered By</TableCell><TableCell>Security Checks Passed</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.workflowName}</TableCell><TableCell>{row.repo}</TableCell><TableCell>{row.branch}</TableCell><TableCell><Chip label={row.lastRunStatus} color={row.lastRunStatus === 'Success' ? 'success' : row.lastRunStatus === 'Failed' ? 'error' : 'info'} size="small" /></TableCell><TableCell>{row.duration}</TableCell><TableCell>{row.triggeredBy}</TableCell><TableCell><Chip label={row.securityChecksPassed} color={row.securityChecksPassed === 'Yes' ? 'success' : 'error'} size="small" /></TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default GitHubActions;
// Made with Bob
