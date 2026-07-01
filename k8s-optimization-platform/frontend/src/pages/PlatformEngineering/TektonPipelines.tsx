import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    pipelineName: 'orders-release',
    namespace: 'orders',
    lastRunName: 'orders-release-run-142',
    status: 'Succeeded',
    duration: '9m 07s',
    startTime: '2026-06-26 09:22 UTC',
    workspaces: 'source, shared-cache',
  },
  {
    pipelineName: 'fraud-detection-train',
    namespace: 'ml-platform',
    lastRunName: 'fraud-train-run-88',
    status: 'Failed',
    duration: '14m 33s',
    startTime: '2026-06-26 07:48 UTC',
    workspaces: 'datasets, artifacts',
  },
  {
    pipelineName: 'ui-preview-build',
    namespace: 'frontend',
    lastRunName: 'ui-preview-run-57',
    status: 'Running',
    duration: '4m 11s',
    startTime: '2026-06-26 10:12 UTC',
    workspaces: 'source, npm-cache',
  },
];

const TektonPipelines: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const succeededCount = data.filter((row) => row.status === 'Succeeded').length;
  const runningCount = data.filter((row) => row.status === 'Running').length;
  const namespaceCount = new Set(data.map((row) => row.namespace)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Tekton Pipelines</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Pipelines</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Succeeded / Running</Typography><Typography variant="h5">{succeededCount} / {runningCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Namespaces</Typography><Typography variant="h5">{namespaceCount}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Pipeline Name</TableCell><TableCell>Namespace</TableCell><TableCell>Last Run Name</TableCell><TableCell>Status</TableCell><TableCell>Duration</TableCell><TableCell>Start Time</TableCell><TableCell>Workspaces</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.pipelineName}</TableCell><TableCell>{row.namespace}</TableCell><TableCell>{row.lastRunName}</TableCell><TableCell><Chip label={row.status} color={row.status === 'Succeeded' ? 'success' : row.status === 'Failed' ? 'error' : 'info'} size="small" /></TableCell><TableCell>{row.duration}</TableCell><TableCell>{row.startTime}</TableCell><TableCell>{row.workspaces}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default TektonPipelines;
// Made with Bob
