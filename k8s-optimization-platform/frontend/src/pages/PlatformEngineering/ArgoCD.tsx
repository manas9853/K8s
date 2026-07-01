import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    appName: 'payments-service',
    repoUrl: 'https://github.com/acme/payments-gitops',
    targetRevision: 'main',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    lastSyncTime: '2026-06-26 09:15 UTC',
    cluster: 'prod-us-east-1',
  },
  {
    appName: 'inventory-api',
    repoUrl: 'https://github.com/acme/inventory-gitops',
    targetRevision: 'release-2026.06',
    syncStatus: 'OutOfSync',
    healthStatus: 'Degraded',
    lastSyncTime: '2026-06-26 08:42 UTC',
    cluster: 'staging-eu-west-1',
  },
  {
    appName: 'frontend-web',
    repoUrl: 'https://github.com/acme/frontend-gitops',
    targetRevision: 'develop',
    syncStatus: 'Unknown',
    healthStatus: 'Healthy',
    lastSyncTime: '2026-06-25 23:10 UTC',
    cluster: 'dev-ap-south-1',
  },
];

const ArgoCD: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const syncedCount = data.filter((row) => row.syncStatus === 'Synced').length;
  const healthyCount = data.filter((row) => row.healthStatus === 'Healthy').length;
  const clusterCount = new Set(data.map((row) => row.cluster)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>ArgoCD GitOps Dashboard</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Applications</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Synced Apps</Typography><Typography variant="h5">{syncedCount}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color="text.secondary">Healthy / Clusters</Typography><Typography variant="h5">{healthyCount} / {clusterCount}</Typography></CardContent></Card>
        </Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>App Name</TableCell>
                <TableCell>Repo URL</TableCell>
                <TableCell>Target Revision</TableCell>
                <TableCell>Sync Status</TableCell>
                <TableCell>Health Status</TableCell>
                <TableCell>Last Sync Time</TableCell>
                <TableCell>Cluster</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.appName}</TableCell>
                  <TableCell>{row.repoUrl}</TableCell>
                  <TableCell>{row.targetRevision}</TableCell>
                  <TableCell><Chip label={row.syncStatus} color={row.syncStatus === 'Synced' ? 'success' : row.syncStatus === 'OutOfSync' ? 'warning' : 'default'} size="small" /></TableCell>
                  <TableCell><Chip label={row.healthStatus} color={row.healthStatus === 'Healthy' ? 'success' : 'error'} size="small" /></TableCell>
                  <TableCell>{row.lastSyncTime}</TableCell>
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
export default ArgoCD;
// Made with Bob
