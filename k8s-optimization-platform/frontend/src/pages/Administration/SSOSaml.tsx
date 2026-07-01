import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Divider,
} from '@mui/material';

const DUMMY_DATA = [
  {
    provider: 'Okta',
    status: 'Connected',
    entityId: 'https://okta.corp.io/saml/metadata',
    signOnUrl: 'https://okta.corp.io/sso/saml',
    lastSync: '2025-07-14 08:00',
    usersSynced: 142,
    groupsSynced: 18,
  },
  {
    provider: 'Azure AD',
    status: 'Connected',
    entityId: 'https://sts.windows.net/tenant-id-7a2f/',
    signOnUrl: 'https://login.microsoftonline.com/tenant-id-7a2f/saml2',
    lastSync: '2025-07-14 07:55',
    usersSynced: 308,
    groupsSynced: 34,
  },
  {
    provider: 'Google Workspace',
    status: 'Disconnected',
    entityId: 'https://accounts.google.com/o/saml2?idpid=C09xyz',
    signOnUrl: 'https://accounts.google.com/o/saml2/idp?idpid=C09xyz',
    lastSync: '2025-06-30 15:20',
    usersSynced: 0,
    groupsSynced: 0,
  },
];

const statusColor: Record<string, 'success' | 'error'> = {
  Connected: 'success',
  Disconnected: 'error',
};

const providerIcon: Record<string, string> = {
  Okta: '🔐',
  'Azure AD': '☁️',
  'Google Workspace': '🔵',
};

const SSOSaml: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const connected = data.filter((d) => d.status === 'Connected').length;
  const totalUsersSynced = data.reduce((sum, d) => sum + d.usersSynced, 0);
  const totalGroupsSynced = data.reduce((sum, d) => sum + d.groupsSynced, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        SSO / SAML Configuration
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Connected Providers
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                {connected} / {data.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Users Synced
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {totalUsersSynced}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Groups Synced
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'secondary.main' }}>
                {totalGroupsSynced}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {data.map((provider, i) => (
          <Grid item xs={12} md={4} key={i}>
            <Card elevation={2} sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {providerIcon[provider.provider]} {provider.provider}
                  </Typography>
                  <Chip
                    label={provider.status}
                    color={statusColor[provider.status]}
                    size="small"
                  />
                </Box>
                <Divider sx={{ mb: 2 }} />
                {[
                  { label: 'Entity ID', value: provider.entityId },
                  { label: 'Sign-On URL', value: provider.signOnUrl },
                  { label: 'Last Sync', value: provider.lastSync },
                  { label: 'Users Synced', value: String(provider.usersSynced) },
                  { label: 'Groups Synced', value: String(provider.groupsSynced) },
                ].map((item, j) => (
                  <Box key={j} sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {item.label}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: item.label.includes('URL') || item.label.includes('ID') ? 'monospace' : 'inherit',
                        wordBreak: 'break-all',
                        fontWeight: 500,
                      }}
                    >
                      {item.value}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default SSOSaml;
// Made with Bob
