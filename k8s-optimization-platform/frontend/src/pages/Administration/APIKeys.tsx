import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  { keyName: 'ci-pipeline-key', createdBy: 'bob.martin', createdAt: '2024-03-01', lastUsed: '2025-07-14', expiresAt: '2026-03-01', permissions: 'Read/Write', status: 'Active' },
  { keyName: 'monitoring-reader', createdBy: 'alice.chen', createdAt: '2024-04-10', lastUsed: '2025-07-14', expiresAt: '2026-04-10', permissions: 'Read', status: 'Active' },
  { keyName: 'grafana-datasource', createdBy: 'grace.liu', createdAt: '2024-02-20', lastUsed: '2025-07-13', expiresAt: '2025-08-20', permissions: 'Read', status: 'Active' },
  { keyName: 'admin-automation', createdBy: 'alice.chen', createdAt: '2023-12-01', lastUsed: '2025-06-30', expiresAt: '2024-12-01', permissions: 'Admin', status: 'Expired' },
  { keyName: 'legacy-deploy-key', createdBy: 'david.kim', createdAt: '2023-06-15', lastUsed: '2024-11-01', expiresAt: '2024-06-15', permissions: 'Read/Write', status: 'Revoked' },
  { keyName: 'security-scanner', createdBy: 'carol.james', createdAt: '2024-05-05', lastUsed: '2025-07-12', expiresAt: '2026-05-05', permissions: 'Read', status: 'Active' },
  { keyName: 'backup-service', createdBy: 'henry.patel', createdAt: '2024-06-01', lastUsed: '2025-07-14', expiresAt: '2026-06-01', permissions: 'Read/Write', status: 'Active' },
  { keyName: 'temp-audit-access', createdBy: 'emma.rodriguez', createdAt: '2025-06-01', lastUsed: '2025-06-20', expiresAt: '2025-07-01', permissions: 'Read', status: 'Expired' },
  { keyName: 'webhook-publisher', createdBy: 'frank.nguyen', createdAt: '2024-07-10', lastUsed: '2025-07-10', expiresAt: '2026-07-10', permissions: 'Write', status: 'Revoked' },
  { keyName: 'platform-admin-key', createdBy: 'grace.liu', createdAt: '2024-01-15', lastUsed: '2025-07-14', expiresAt: '2027-01-15', permissions: 'Admin', status: 'Active' },
];

const permColor: Record<string, 'info' | 'warning' | 'error'> = {
  Read: 'info',
  'Read/Write': 'warning',
  Write: 'warning',
  Admin: 'error',
};

const statusColor: Record<string, 'success' | 'default' | 'error'> = {
  Active: 'success',
  Expired: 'default',
  Revoked: 'error',
};

const APIKeys: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const activeKeys = data.filter((d) => d.status === 'Active').length;
  const expiredKeys = data.filter((d) => d.status === 'Expired').length;
  const revokedKeys = data.filter((d) => d.status === 'Revoked').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        API Key Management
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Active Keys
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                {activeKeys}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Expired Keys
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                {expiredKeys}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Revoked Keys
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'error.main' }}>
                {revokedKeys}
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
                <TableCell>Key Name</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell>Expires At</TableCell>
                <TableCell>Permissions</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.keyName}</TableCell>
                  <TableCell>{row.createdBy}</TableCell>
                  <TableCell>{row.createdAt}</TableCell>
                  <TableCell>{row.lastUsed}</TableCell>
                  <TableCell>{row.expiresAt}</TableCell>
                  <TableCell>
                    <Chip label={row.permissions} color={permColor[row.permissions]} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip label={row.status} color={statusColor[row.status]} size="small" variant="outlined" />
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

export default APIKeys;
// Made with Bob
