/**
 * NoClusterState
 * ──────────────
 * The single "no clusters attached yet" empty state, for pages that guard
 * their own render (rather than using <ClusterGuard> at the export level).
 * Same copy/layout as ClusterGuard's empty branch — kept in one place so
 * every page shows an identical message instead of each hand-rolling one.
 *
 * Usage:
 *   if (clusters.length === 0) return <NoClusterState />;
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Paper } from '@mui/material';
import { CloudOff as CloudOffIcon, Add as AddIcon } from '@mui/icons-material';

const NoClusterState: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="60vh"
      p={4}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          p: 6,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <CloudOffIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          No clusters attached yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4, lineHeight: 1.7 }}>
          This page displays live data from your registered clusters. Connect a
          cluster first and the metrics, findings, and alerts will populate
          automatically.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => navigate('/cluster-onboarding')}
        >
          Go to Cluster Onboarding
        </Button>
      </Paper>
    </Box>
  );
};

export default NoClusterState;
