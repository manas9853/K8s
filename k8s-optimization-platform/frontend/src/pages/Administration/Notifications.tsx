import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface NotificationChannel {
  channel: string;
  type: string;
  destination: string;
  events: number;
  status: string;
  lastNotification: string;
  createdAt: string;
}

const typeColor: Record<string, 'success' | 'info' | 'error' | 'warning' | 'secondary'> = {
  Slack: 'success',
  Email: 'info',
  PagerDuty: 'error',
  Webhook: 'warning',
  Teams: 'secondary',
};

const Notifications: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Notification channels come from admin settings API
    axios.get(`${API_BASE}/api/v1/admin/notification-channels`)
      .then((r) => setData(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        // 404 = endpoint not yet configured, not an error condition
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setData([]);
        } else {
          setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const totalChannels = data.length;
  const activeChannels = data.filter((d) => d.status === 'Active').length;
  const totalEvents = data.reduce((sum, d) => sum + d.events, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Notification Channels
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Total Channels</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>{totalChannels}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Active Channels</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>{activeChannels}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Events Sent (24h)</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main' }}>{totalEvents}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4 }}>
          <Typography color="text.secondary" textAlign="center">
            No notification channels configured. Add channels via Settings → Integrations or the platform admin API.
          </Typography>
        </Paper>
      )}
      {data.length > 0 && (
        <Paper elevation={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                  <TableCell>Channel Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell>Events (24h)</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Notification</TableCell>
                  <TableCell>Created At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.channel}</TableCell>
                    <TableCell><Chip label={row.type} color={typeColor[row.type] ?? 'default'} size="small" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.destination}</TableCell>
                    <TableCell>{row.events}</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'Active' ? 'success' : 'default'} size="small" /></TableCell>
                    <TableCell>{row.lastNotification}</TableCell>
                    <TableCell>{row.createdAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default Notifications;

// Made with Bob
