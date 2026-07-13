import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Divider,
  LinearProgress, Alert, Paper,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface SSOProvider {
  provider: string;
  status: string;
  entityId: string;
  signOnUrl: string;
  lastSync: string;
  usersSynced: number;
  groupsSynced: number;
}

const statusColor: Record<string, 'success' | 'error'> = {
  Connected: 'success',
  Disconnected: 'error',
};

const SSOSaml: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SSOProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/admin/sso-providers`)
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
  const totalUsers = data.reduce((s, d) => s + d.usersSynced, 0);
  const totalGroups = data.reduce((s, d) => s + d.groupsSynced, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>SSO / SAML Configuration</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Identity provider connections and SAML configuration status
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Connected Providers</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>{connected}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Users Synced</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>{totalUsers}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Groups Synced</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'secondary.main' }}>{totalGroups}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4 }}>
          <Typography color="text.secondary" textAlign="center">
            No SSO/SAML providers configured. Connect Okta, Azure AD, or Google Workspace via the admin settings.
          </Typography>
        </Paper>
      )}

      {data.map((provider, i) => (
        <Card key={i} elevation={2} sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{provider.provider}</Typography>
              <Chip
                label={provider.status}
                color={statusColor[provider.status] ?? 'default'}
                size="small"
              />
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {[
                { label: 'Entity ID', value: provider.entityId },
                { label: 'Sign-On URL', value: provider.signOnUrl },
                { label: 'Last Sync', value: provider.lastSync },
                { label: 'Users Synced', value: String(provider.usersSynced) },
                { label: 'Groups Synced', value: String(provider.groupsSynced) },
              ].map(({ label, value }) => (
                <Grid item xs={12} sm={6} key={label}>
                  <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    {value}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default SSOSaml;

// Made with Bob
