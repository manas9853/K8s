import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress,
  Alert, IconButton, Card, CardContent, Grid,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface K8sEvent {
  name: string;
  namespace: string;
  reason: string;
  message: string;
  event_type: string;
  involved_object_kind: string;
  involved_object_name: string;
  count: number;
  first_time: string;
  last_time: string;
  cluster_id: string;
}

const RealTimeAlerts: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [alerts, setAlerts] = useState<K8sEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/observability/events`, {
        params: { event_type: 'Warning' },
      });
      setAlerts(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const criticalCount = alerts.filter((a) => a.reason?.toLowerCase().includes('kill') || a.reason?.toLowerCase().includes('oom')).length;
  const warningCount = alerts.filter((a) => a.event_type === 'Warning').length;

  const reasonColor = (reason: string): 'error' | 'warning' | 'info' => {
    const r = reason?.toLowerCase() ?? '';
    if (r.includes('kill') || r.includes('oom') || r.includes('fail')) return 'error';
    if (r.includes('back') || r.includes('evict')) return 'warning';
    return 'info';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Real-Time Alerts</Typography>
          <Typography variant="body2" color="text.secondary">
            Live warning events — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={fetchAlerts}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <WarningIcon color="warning" />
                <Typography color="text.secondary">Total Alerts</Typography>
              </Box>
              <Typography variant="h4">{alerts.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorIcon color="error" />
                <Typography color="text.secondary">Critical</Typography>
              </Box>
              <Typography variant="h4" color="error.main">{criticalCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <InfoIcon color="info" />
                <Typography color="text.secondary">Warnings</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">{warningCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {alerts.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary" textAlign="center">
            No active alerts. Connect a cluster agent to stream live Kubernetes events.
          </Typography>
        </Paper>
      )}

      {alerts.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reason</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Object</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Count</TableCell>
                  <TableCell>Last Seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((a, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Chip label={a.reason || '—'} color={reasonColor(a.reason)} size="small" />
                    </TableCell>
                    <TableCell>{a.namespace || '—'}</TableCell>
                    <TableCell>{a.involved_object_kind}/{a.involved_object_name}</TableCell>
                    <TableCell sx={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.message || '—'}
                    </TableCell>
                    <TableCell>{a.count ?? 1}</TableCell>
                    <TableCell>{a.last_time ? new Date(a.last_time).toLocaleString() : '—'}</TableCell>
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

export default RealTimeAlerts;
