import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  { name: 'prod-cluster-full-20250714', resourceType: 'Cluster', cluster: 'prod-us-east-1', status: 'Success', size: '4.8 GB', createdAt: '2025-07-14 02:00', retention: '30 days', restoreAvailable: 'Yes' },
  { name: 'staging-ns-20250714', resourceType: 'Namespace', cluster: 'staging-us-west-2', status: 'Success', size: '820 MB', createdAt: '2025-07-14 03:00', retention: '14 days', restoreAvailable: 'Yes' },
  { name: 'prod-api-deploy-20250713', resourceType: 'Deployment', cluster: 'prod-us-east-1', status: 'Success', size: '112 MB', createdAt: '2025-07-13 22:30', retention: '7 days', restoreAvailable: 'Yes' },
  { name: 'prod-cluster-full-20250713', resourceType: 'Cluster', cluster: 'prod-us-east-1', status: 'Success', size: '4.7 GB', createdAt: '2025-07-13 02:00', retention: '30 days', restoreAvailable: 'Yes' },
  { name: 'dev-ns-backup-20250713', resourceType: 'Namespace', cluster: 'dev-eu-central-1', status: 'Failed', size: '0 B', createdAt: '2025-07-13 04:00', retention: '7 days', restoreAvailable: 'No' },
  { name: 'eu-cluster-full-20250714', resourceType: 'Cluster', cluster: 'prod-eu-central-1', status: 'In Progress', size: '2.1 GB', createdAt: '2025-07-14 05:00', retention: '30 days', restoreAvailable: 'No' },
  { name: 'staging-deploy-20250712', resourceType: 'Deployment', cluster: 'staging-us-west-2', status: 'Success', size: '98 MB', createdAt: '2025-07-12 23:00', retention: '7 days', restoreAvailable: 'Yes' },
  { name: 'prod-cluster-full-20250712', resourceType: 'Cluster', cluster: 'prod-us-east-1', status: 'Success', size: '4.7 GB', createdAt: '2025-07-12 02:00', retention: '30 days', restoreAvailable: 'Yes' },
  { name: 'vault-ns-20250711', resourceType: 'Namespace', cluster: 'prod-us-east-1', status: 'Success', size: '56 MB', createdAt: '2025-07-11 01:00', retention: '60 days', restoreAvailable: 'Yes' },
  { name: 'cicd-deploy-20250710', resourceType: 'Deployment', cluster: 'dev-eu-central-1', status: 'Failed', size: '0 B', createdAt: '2025-07-10 20:00', retention: '7 days', restoreAvailable: 'No' },
];

const statusColor: Record<string, 'success' | 'error' | 'warning'> = {
  Success: 'success',
  Failed: 'error',
  'In Progress': 'warning',
};

const resourceColor: Record<string, 'primary' | 'secondary' | 'info'> = {
  Cluster: 'primary',
  Namespace: 'secondary',
  Deployment: 'info',
};

const BackupRecovery: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const successful = data.filter((d) => d.status === 'Success').length;
  const failed = data.filter((d) => d.status === 'Failed').length;
  const restoreReady = data.filter((d) => d.restoreAvailable === 'Yes').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Backup & Recovery
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Successful Backups
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                {successful}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Failed Backups
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'error.main' }}>
                {failed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Restore Available
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {restoreReady}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper elevation={2}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell>Backup Name</TableCell>
                <TableCell>Resource Type</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Retention</TableCell>
                <TableCell align="center">Restore Available</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.name}</TableCell>
                  <TableCell>
                    <Chip label={row.resourceType} color={resourceColor[row.resourceType]} size="small" />
                  </TableCell>
                  <TableCell>{row.cluster}</TableCell>
                  <TableCell>
                    <Chip label={row.status} color={statusColor[row.status]} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.size}</TableCell>
                  <TableCell>{row.createdAt}</TableCell>
                  <TableCell>{row.retention}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={row.restoreAvailable}
                      color={row.restoreAvailable === 'Yes' ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default BackupRecovery;
// Made with Bob
