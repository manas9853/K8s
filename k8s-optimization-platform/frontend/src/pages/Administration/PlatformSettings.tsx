import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Divider,
} from '@mui/material';

const DUMMY_DATA = {
  general: {
    title: 'General Settings',
    icon: '⚙️',
    settings: [
      { key: 'Platform Name', value: 'K8s Optimization Platform' },
      { key: 'Version', value: 'v2.4.1' },
      { key: 'Default Namespace', value: 'kube-system' },
      { key: 'Log Level', value: 'INFO' },
    ],
  },
  dataRetention: {
    title: 'Data Retention',
    icon: '🗃️',
    settings: [
      { key: 'Metrics Retention Days', value: '90' },
      { key: 'Log Retention Days', value: '30' },
      { key: 'Audit Log Retention Days', value: '365' },
    ],
  },
  performance: {
    title: 'Performance',
    icon: '⚡',
    settings: [
      { key: 'Cache TTL', value: '300s' },
      { key: 'API Rate Limit', value: '1000 req/min' },
      { key: 'Max Concurrent Jobs', value: '25' },
    ],
  },
  notifications: {
    title: 'Notifications',
    icon: '🔔',
    settings: [
      { key: 'Default Alert Threshold', value: '80%' },
      { key: 'Enable Email Reports', value: 'Yes' },
      { key: 'Report Schedule', value: 'Weekly — Monday 08:00 UTC' },
    ],
  },
};

const tagStyle: Record<string, { color: 'success' | 'info' | 'warning' | 'error' | 'default' }> = {
  'v2.4.1': { color: 'success' },
  INFO: { color: 'info' },
  Yes: { color: 'success' },
  No: { color: 'default' },
};

const PlatformSettings: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);

  const totalSettings = Object.values(data).reduce((sum, cat) => sum + cat.settings.length, 0);
  const totalCategories = Object.keys(data).length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
        Platform Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Global platform configuration managed by administrators.
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Configuration Categories
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {totalCategories}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Settings
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {totalSettings}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Platform Version
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                v2.4.1
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {Object.values(data).map((category, i) => (
          <Grid item xs={12} sm={6} key={i}>
            <Card elevation={2} sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  {category.icon} {category.title}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {category.settings.map((setting, j) => (
                  <Box
                    key={j}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 1,
                      borderBottom: j < category.settings.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {setting.key}
                    </Typography>
                    {tagStyle[setting.value] ? (
                      <Chip
                        label={setting.value}
                        color={tagStyle[setting.value].color}
                        size="small"
                      />
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontFamily:
                            setting.key.toLowerCase().includes('version') ||
                            setting.key.toLowerCase().includes('namespace') ||
                            setting.key.toLowerCase().includes('ttl')
                              ? 'monospace'
                              : 'inherit',
                          color: 'text.primary',
                        }}
                      >
                        {setting.value}
                      </Typography>
                    )}
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

export default PlatformSettings;
// Made with Bob
