/**
 * ClusterGuard
 * ─────────────
 * Wraps a page and shows a "no clusters onboarded" prompt instead of the page
 * content when the platform has no registered clusters yet.
 *
 * Usage:
 *   <ClusterGuard>
 *     <MyPage />
 *   </ClusterGuard>
 *
 * If clusters are loading it shows a spinner.
 * If clusters list is empty it renders a redirect CTA to cluster onboarding.
 * Otherwise it renders children normally.
 */
import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material';
import { CloudOff as CloudOffIcon, Add as AddIcon } from '@mui/icons-material';
import { useCluster } from '../contexts/ClusterContext';

interface ClusterGuardProps {
  children: ReactNode;
}

const ClusterGuard: React.FC<ClusterGuardProps> = ({ children }) => {
  const { clusters, loading } = useCluster();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (clusters.length === 0) {
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
  }

  return <>{children}</>;
};

export default ClusterGuard;

// Made with Bob
