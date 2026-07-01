import React from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Typography } from '@mui/material';

const ExecutiveDashboard: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  return (
    <Box>
      <Typography variant="h4">Executive Overview Dashboard</Typography>
      <Typography>Coming soon...</Typography>
    </Box>
  );
};

export default ExecutiveDashboard;

// Made with Bob
