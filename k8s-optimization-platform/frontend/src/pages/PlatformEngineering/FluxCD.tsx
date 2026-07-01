import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    kustomizationName: 'platform-core',
    sourceRepo: 'https://github.com/acme/platform-config',
    path: './clusters/prod/core',
    ready: 'Yes',
    lastAppliedRevision: 'main@sha1:4f2a9d1',
    interval: '5m',
    cluster: 'prod-us-east-1',
  },
  {
    kustomizationName: 'tenant-apps',
    sourceRepo: 'https://github.com/acme/tenant-config',
    path: './apps/staging',
    ready: 'No',
    lastAppliedRevision: 'release@sha1:b18cd33',
    interval: '10m',
    cluster: 'staging-eu-west-1',
  },
  {
    kustomizationName: 'observability-stack',
    sourceRepo: 'https://github.com/acme/ops-config',
    path: './infra/observability',
    ready: 'Yes',
    lastAppliedRevision: 'main@sha1:91ab772',
    interval: '15m',
    cluster: 'dev-ap-south-1',
  },
];

const FluxCD: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const readyCount = data.filter((row) => row.ready === 'Yes').length;
  const uniqueRepos = new Set(data.map((row) => row.sourceRepo)).size;
  const clusterCount = new Set(data.map((row) => row.cluster)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>FluxCD Dashboard</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Kustomizations</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Ready</Typography><Typography variant="h5">{readyCount}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Repos / Clusters</Typography><Typography variant="h5">{uniqueRepos} / {clusterCount}</Typography></CardContent></Card>
        </Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Kustomization Name</TableCell>
                <TableCell>Source Repo</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Ready</TableCell>
                <TableCell>Last Applied Revision</TableCell>
                <TableCell>Interval</TableCell>
                <TableCell>Cluster</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.kustomizationName}</TableCell>
                  <TableCell>{row.sourceRepo}</TableCell>
                  <TableCell>{row.path}</TableCell>
                  <TableCell><Chip label={row.ready} color={row.ready === 'Yes' ? 'success' : 'error'} size="small" /></TableCell>
                  <TableCell>{row.lastAppliedRevision}</TableCell>
                  <TableCell>{row.interval}</TableCell>
                  <TableCell>{row.cluster}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default FluxCD;
// Made with Bob
