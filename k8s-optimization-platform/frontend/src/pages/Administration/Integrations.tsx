import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Integration {
  name: string;
  type: string;
  status: string;
  lastSync: string;
  apiVersion: string;
  configuredBy: string;
  health: string;
}

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
  const [data, setData] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/admin/integrations`)
      .then((r) => setData(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setData([]);
        } else {
          setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const connected = data.filter((d) => d.status === 'Connected').length;
  const healthy = data.filter((d) => d.health === 'Healthy').length;
  const pending = data.filter((d) => d.status === 'Pending').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Third-Party Integrations</Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Connected</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>{connected}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Healthy</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>{healthy}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Pending</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>{pending}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4 }}>
          <Typography color="text.secondary" textAlign="center">
            No integrations configured. Connect external tools via the platform admin settings.
          </Typography>
        </Paper>
      )}
      {data.length > 0 && (
        <Paper elevation={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                  <TableCell>Integration</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Health</TableCell>
                  <TableCell>Last Sync</TableCell>
                  <TableCell>API Version</TableCell>
                  <TableCell>Configured By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                    <TableCell><Chip label={row.type} color={typeColor[row.type] ?? 'default'} size="small" /></TableCell>
                    <TableCell><Chip label={row.status} color={statusColor[row.status] ?? 'default'} size="small" /></TableCell>
                    <TableCell><Chip label={row.health} color={healthColor[row.health] ?? 'default'} size="small" variant="outlined" /></TableCell>
                    <TableCell>{row.lastSync}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{row.apiVersion}</TableCell>
                    <TableCell>{row.configuredBy}</TableCell>
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

export default Integrations;

// Made with Bob
