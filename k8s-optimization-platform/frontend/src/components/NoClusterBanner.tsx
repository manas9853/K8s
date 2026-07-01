/**
 * NoClusterBanner
 * ───────────────
 * Shown on any Reports (or data-heavy) page when no cluster is registered yet.
 * Matches the empty-state style used in CommandCenter so the experience is
 * consistent across the platform.
 */
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Add as AddIcon, Storage as StorageIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface Props {
  /** What kind of data this page shows — used in the description sentence. */
  dataDescription?: string;
}

const NoClusterBanner: React.FC<Props> = ({
  dataDescription = 'report data',
}) => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        p: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        textAlign: 'center',
      }}
    >
      <StorageIcon sx={{ fontSize: 64, color: 'text.disabled' }} />

      <Box>
        <Typography variant="h5" color="text.secondary" gutterBottom>
          No clusters attached yet
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 480, mx: 'auto' }}
        >
          {`Connect a Kubernetes cluster and the platform will automatically pull real ${dataDescription} from your infrastructure.`}
        </Typography>
      </Box>

      <Button
        variant="contained"
        size="large"
        startIcon={<AddIcon />}
        onClick={() => navigate('/cluster-onboarding')}
      >
        Connect a Cluster
      </Button>

      <Typography variant="caption" color="text.disabled">
        You'll be redirected to Cluster Onboarding
      </Typography>
    </Box>
  );
};

export default NoClusterBanner;

// Made with Bob
