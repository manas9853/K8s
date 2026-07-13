import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface BackupRecord {
  name: string;
  resourceType: string;
  cluster: string;
  status: string;
  size: string;
  createdAt: string;
  retention: string;
  restoreAvailable: string;
}

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
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Velero backup list via admin backup API
    axios.get(`${API_BASE}/api/v1/admin/backups`)
      .then((r) => setData(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setData([]);
        } else {
          setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [activeClusterName]);

  const successful = data.filter((d) => d.status === 'Success').length;
  const failed = data.filter((d) => d.status === 'Failed').length;
  const restoreReady = data.filter((d) => d.restoreAvailable === 'Yes').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Backup &amp; Recovery
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Successful Backups</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>{successful}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Failed</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'error.main' }}>{failed}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Restore Ready</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>{restoreReady}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4 }}>
          <Typography color="text.secondary" textAlign="center">
            No backup records found. Install Velero and configure the backup schedule via the admin settings.
          </Typography>
        </Paper>
      )}
      {data.length > 0 && (
        <Paper elevation={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                  <TableCell>Backup Name</TableCell>
                  <TableCell>Resource Type</TableCell>
                  <TableCell>Cluster</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Retention</TableCell>
                  <TableCell>Restore Available</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.78rem' }}>{row.name}</TableCell>
                    <TableCell><Chip label={row.resourceType} color={resourceColor[row.resourceType] ?? 'default'} size="small" variant="outlined" /></TableCell>
                    <TableCell>{row.cluster}</TableCell>
                    <TableCell><Chip label={row.status} color={statusColor[row.status] ?? 'default'} size="small" /></TableCell>
                    <TableCell>{row.size}</TableCell>
                    <TableCell>{row.createdAt}</TableCell>
                    <TableCell>{row.retention}</TableCell>
                    <TableCell><Chip label={row.restoreAvailable} color={row.restoreAvailable === 'Yes' ? 'success' : 'default'} size="small" /></TableCell>
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

export default BackupRecovery;

// Made with Bob
