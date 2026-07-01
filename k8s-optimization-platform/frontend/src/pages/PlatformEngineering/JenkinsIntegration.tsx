import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    pipelineName: 'payments-release',
    stage: 'Deploy',
    lastRunStatus: 'Success',
    duration: '8m 12s',
    triggeredBy: 'release-bot',
    lastRunTime: '2026-06-26 09:05 UTC',
    securityScore: 94,
  },
  {
    pipelineName: 'inventory-build',
    stage: 'Security Scan',
    lastRunStatus: 'Failed',
    duration: '5m 48s',
    triggeredBy: 'jane.doe',
    lastRunTime: '2026-06-26 08:40 UTC',
    securityScore: 67,
  },
  {
    pipelineName: 'frontend-ci',
    stage: 'Integration Tests',
    lastRunStatus: 'Running',
    duration: '3m 19s',
    triggeredBy: 'merge-queue',
    lastRunTime: '2026-06-26 10:11 UTC',
    securityScore: 88,
  },
];

const JenkinsIntegration: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const successCount = data.filter((row) => row.lastRunStatus === 'Success').length;
  const runningCount = data.filter((row) => row.lastRunStatus === 'Running').length;
  const avgSecurityScore = Math.round(data.reduce((sum, row) => sum + row.securityScore, 0) / data.length);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Jenkins CI/CD Integration</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Pipelines</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Success / Running</Typography><Typography variant="h5">{successCount} / {runningCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Avg Security Score</Typography><Typography variant="h5">{avgSecurityScore}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Pipeline Name</TableCell><TableCell>Stage</TableCell><TableCell>Last Run Status</TableCell><TableCell>Duration</TableCell><TableCell>Triggered By</TableCell><TableCell>Last Run Time</TableCell><TableCell>Security Score (0-100)</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.pipelineName}</TableCell><TableCell>{row.stage}</TableCell><TableCell><Chip label={row.lastRunStatus} color={row.lastRunStatus === 'Success' ? 'success' : row.lastRunStatus === 'Failed' ? 'error' : 'info'} size="small" /></TableCell><TableCell>{row.duration}</TableCell><TableCell>{row.triggeredBy}</TableCell><TableCell>{row.lastRunTime}</TableCell><TableCell>{row.securityScore}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default JenkinsIntegration;
// Made with Bob
