import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Chip, Divider,
  LinearProgress, Alert, Paper,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface SettingItem {
  key: string;
  value: string;
}

interface SettingsSection {
  title: string;
  settings: SettingItem[];
}

const tagStyle: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {};

const PlatformSettings: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/admin/settings`)
      .then((r) => {
        const d = r.data;
        if (Array.isArray(d)) {
          setSections(d);
        } else if (d && typeof d === 'object') {
          // Transform object format: {general: {title, settings}, ...}
          const secs: SettingsSection[] = Object.values(d).map((v: unknown) => v as SettingsSection);
          setSections(secs);
        } else {
          setSections([]);
        }
      })
      .catch((e) => {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setSections([]);
        } else {
          setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const getTagColor = (value: string): 'success' | 'info' | 'warning' | 'error' | 'default' => {
    const upper = value.toUpperCase();
    if (upper === 'YES' || upper === 'TRUE' || upper === 'ENABLED') return 'success';
    if (upper === 'NO' || upper === 'FALSE' || upper === 'DISABLED') return 'error';
    if (upper === 'INFO' || upper === 'DEBUG') return 'info';
    if (upper === 'WARN' || upper === 'WARNING') return 'warning';
    return 'default';
  };

  const isChipValue = (value: string): boolean => {
    const specialValues = ['yes', 'no', 'true', 'false', 'enabled', 'disabled', 'info', 'debug', 'warn', 'warning'];
    return specialValues.includes(value.toLowerCase());
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>Platform Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Platform configuration and runtime settings
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {sections.length === 0 && !loading && !error && (
        <Paper sx={{ p: 4 }}>
          <Typography color="text.secondary" textAlign="center">
            No platform settings available. Configure settings via the admin API or environment variables.
          </Typography>
        </Paper>
      )}

      <Grid container spacing={3}>
        {sections.map((section, si) => (
          <Grid item xs={12} sm={6} key={si}>
            <Card elevation={2} sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  {section.title}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {(section.settings ?? []).map(({ key, value }, ki) => (
                  <Box
                    key={ki}
                    sx={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', py: 0.75,
                      borderBottom: ki < section.settings.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">{key}</Typography>
                    {isChipValue(value) ? (
                      <Chip label={value} color={getTagColor(value)} size="small" />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {value}
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
