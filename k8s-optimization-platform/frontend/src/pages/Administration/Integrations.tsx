import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  { name: 'Prometheus', type: 'Monitoring', status: 'Connected', lastSync: '2025-07-14 09:00', apiVersion: 'v2.45', configuredBy: 'alice.chen', health: 'Healthy' },
  { name: 'Grafana', type: 'Monitoring', status: 'Connected', lastSync: '2025-07-14 08:50', apiVersion: 'v10.2', configuredBy: 'alice.chen', health: 'Healthy' },
  { name: 'PagerDuty', type: 'Alerting', status: 'Connected', lastSync: '2025-07-14 09:05', apiVersion: 'v2', configuredBy: 'grace.liu', health: 'Healthy' },
  { name: 'Alertmanager', type: 'Alerting', status: 'Connected', lastSync: '2025-07-14 09:01', apiVersion: 'v0.26', configuredBy: 'grace.liu', health: 'Degraded' },
  { name: 'GitHub Actions', type: 'CICD', status: 'Connected', lastSync: '2025-07-14 08:30', apiVersion: 'v3', configuredBy: 'bob.martin', health: 'Healthy' },
  { name: 'ArgoCD', type: 'CICD', status: 'Pending', lastSync: '2025-07-13 22:00', apiVersion: 'v2.9', configuredBy: 'emma.rodriguez', health: 'Unknown' },
  { name: 'Falco', type: 'Security', status: 'Connected', lastSync: '2025-07-14 09:10', apiVersion: 'v0.37', configuredBy: 'carol.james', health: 'Healthy' },
  { name: 'Twistlock', type: 'Security', status: 'Disconnected', lastSync: '2025-06-30 12:00', apiVersion: 'v32.0', configuredBy: 'carol.james', health: 'Unhealthy' },
  { name: 'Velero', type: 'Storage', status: 'Connected', lastSync: '2025-07-14 06:00', apiVersion: 'v1.12', configuredBy: 'alice.chen', health: 'Healthy' },
  { name: 'Rook-Ceph', type: 'Storage', status: 'Pending', lastSync: '2025-07-13 18:00', apiVersion: 'v1.13', configuredBy: 'henry.patel', health: 'Unknown' },
];

const typeColor: Record<string, 'primary' | 'secondary' | 'info' | 'error' | 'warning'> = {
  Monitoring: 'primary',
  Alerting: 'error',
  CICD: 'info',
  Security: 'warning',
  Storage: 'secondary',
};

const statusColor: Record<string, 'success' | 'error' | 'warning'> = {
  Connected: 'success',
  Disconnected: 'error',
  Pending: 'warning',
};

const healthColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  Healthy: 'success',
  Degraded: 'warning',
  Unhealthy: 'error',
  Unknown: 'default',
};

const Integrations: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const connected = data.filter((d) => d.status === 'Connected').length;
  const healthy = data.filter((d) => d.health === 'Healthy').length;
  const pending = data.filter((d) => d.status === 'Pending').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Platform Integrations
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Connected
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                {connected}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Healthy
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {healthy}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Pending Setup
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>
                {pending}
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
                <TableCell>Integration Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Sync</TableCell>
                <TableCell>API Version</TableCell>
                <TableCell>Configured By</TableCell>
                <TableCell>Health</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                  <TableCell>
                    <Chip label={row.type} color={typeColor[row.type]} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip label={row.status} color={statusColor[row.status]} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.lastSync}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {row.apiVersion}
                    </Typography>
                  </TableCell>
                  <TableCell>{row.configuredBy}</TableCell>
                  <TableCell>
                    <Chip label={row.health} color={healthColor[row.health]} size="small" />
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

export default Integrations;
// Made with Bob
