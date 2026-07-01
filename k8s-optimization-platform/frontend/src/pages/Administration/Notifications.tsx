import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  { channel: 'platform-alerts', type: 'Slack', destination: '#platform-alerts', events: 12, status: 'Active', lastNotification: '2025-07-14 09:03', createdAt: '2024-02-10' },
  { channel: 'sre-oncall', type: 'PagerDuty', destination: 'sre-service@corp.pagerduty.com', events: 5, status: 'Active', lastNotification: '2025-07-14 07:45', createdAt: '2024-02-12' },
  { channel: 'devops-email', type: 'Email', destination: 'devops@corp.io', events: 8, status: 'Active', lastNotification: '2025-07-13 23:00', createdAt: '2024-03-01' },
  { channel: 'security-webhook', type: 'Webhook', destination: 'https://hooks.corp.io/security', events: 6, status: 'Active', lastNotification: '2025-07-14 08:15', createdAt: '2024-03-18' },
  { channel: 'finance-reports', type: 'Email', destination: 'finance-team@corp.io', events: 3, status: 'Inactive', lastNotification: '2025-06-30 08:00', createdAt: '2024-04-05' },
  { channel: 'devops-teams', type: 'Teams', destination: 'DevOps Channel', events: 9, status: 'Active', lastNotification: '2025-07-14 08:50', createdAt: '2024-04-20' },
  { channel: 'compliance-email', type: 'Email', destination: 'compliance@corp.io', events: 4, status: 'Active', lastNotification: '2025-07-12 10:00', createdAt: '2024-05-01' },
  { channel: 'ci-webhook', type: 'Webhook', destination: 'https://ci.corp.io/notify', events: 7, status: 'Inactive', lastNotification: '2025-07-01 14:30', createdAt: '2024-05-15' },
];

const typeColor: Record<string, 'success' | 'info' | 'error' | 'warning' | 'secondary'> = {
  Slack: 'success',
  Email: 'info',
  PagerDuty: 'error',
  Webhook: 'warning',
  Teams: 'secondary',
};

const statusColor: Record<string, 'success' | 'default'> = {
  Active: 'success',
  Inactive: 'default',
};

const Notifications: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const totalChannels = data.length;
  const activeChannels = data.filter((d) => d.status === 'Active').length;
  const totalEvents = data.reduce((sum, d) => sum + d.events, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Notification Channels
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Channels
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {totalChannels}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Active Channels
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                {activeChannels}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Events Subscribed
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {totalEvents}
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
                <TableCell>Channel Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Destination</TableCell>
                <TableCell align="center">Events Subscribed</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Notification</TableCell>
                <TableCell>Created At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{row.channel}</TableCell>
                  <TableCell>
                    <Chip label={row.type} color={typeColor[row.type]} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {row.destination}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">{row.events}</TableCell>
                  <TableCell>
                    <Chip label={row.status} color={statusColor[row.status]} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.lastNotification}</TableCell>
                  <TableCell>{row.createdAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default Notifications;
// Made with Bob
