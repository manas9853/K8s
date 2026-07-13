import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface ApiKeyRow {
  keyName: string;
  createdBy: string;
  createdAt: string;
  lastUsed: string;
  expiresAt: string;
  permissions: string;
  status: string;
}

function mapToken(raw: Record<string, unknown>): ApiKeyRow {
  const active = !raw.revoked && (!raw.expires_at || new Date(String(raw.expires_at)) > new Date());
  const expired = !raw.revoked && raw.expires_at && new Date(String(raw.expires_at)) <= new Date();
  return {
    keyName: String(raw.name ?? raw.token_name ?? raw.key_name ?? '—'),
    createdBy: String(raw.created_by ?? raw.user_id ?? '—'),
    createdAt: String(raw.created_at ?? '—').slice(0, 10),
    lastUsed: String(raw.last_used_at ?? raw.last_used ?? '—').slice(0, 10),
    expiresAt: raw.expires_at ? String(raw.expires_at).slice(0, 10) : 'Never',
    permissions: String(raw.permissions ?? raw.scopes ?? 'Read'),
    status: raw.revoked ? 'Revoked' : expired ? 'Expired' : 'Active',
  };
}

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
  const [data, setData] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/tokens/list`)
      .then((r) => {
        const rows: ApiKeyRow[] = Array.isArray(r.data)
          ? (r.data as Record<string, unknown>[]).map(mapToken)
          : [];
        setData(rows);
      })
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const activeKeys = data.filter((d) => d.status === 'Active').length;
  const expiredKeys = data.filter((d) => d.status === 'Expired').length;
  const revokedKeys = data.filter((d) => d.status === 'Revoked').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        API Key Management
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
