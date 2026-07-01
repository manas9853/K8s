import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    resourceName: 'payments-deployment',
    kind: 'Deployment',
    namespace: 'payments',
    expectedState: 'replicas=4,image=v2.1.0',
    currentState: 'replicas=5,image=v2.1.0',
    driftStatus: 'Drifted',
    detectedAt: '2026-06-26 10:02 UTC',
  },
  {
    resourceName: 'inventory-config',
    kind: 'ConfigMap',
    namespace: 'inventory',
    expectedState: 'LOG_LEVEL=info',
    currentState: 'LOG_LEVEL=info',
    driftStatus: 'Synced',
    detectedAt: '2026-06-26 09:40 UTC',
  },
  {
    resourceName: 'frontend-ingress',
    kind: 'Ingress',
    namespace: 'web',
    expectedState: 'host=app.acme.io',
    currentState: 'host=app-prod.acme.io',
    driftStatus: 'Drifted',
    detectedAt: '2026-06-26 08:55 UTC',
  },
];

const GitopsDriftDetection: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const driftedCount = data.filter((row) => row.driftStatus === 'Drifted').length;
  const syncedCount = data.filter((row) => row.driftStatus === 'Synced').length;
  const namespaceCount = new Set(data.map((row) => row.namespace)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>GitOps Drift Detection</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Resources Checked</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Drifted</Typography><Typography variant="h5">{driftedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Synced / Namespaces</Typography><Typography variant="h5">{syncedCount} / {namespaceCount}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Resource Name</TableCell><TableCell>Kind</TableCell><TableCell>Namespace</TableCell><TableCell>Expected State (Git)</TableCell><TableCell>Current State (Cluster)</TableCell><TableCell>Drift Status</TableCell><TableCell>Detected At</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.resourceName}</TableCell><TableCell>{row.kind}</TableCell><TableCell>{row.namespace}</TableCell><TableCell>{row.expectedState}</TableCell><TableCell>{row.currentState}</TableCell><TableCell><Chip label={row.driftStatus} color={row.driftStatus === 'Drifted' ? 'warning' : 'success'} size="small" /></TableCell><TableCell>{row.detectedAt}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default GitopsDriftDetection;
// Made with Bob
