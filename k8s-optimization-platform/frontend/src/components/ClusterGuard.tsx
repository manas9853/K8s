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
import { Box, CircularProgress } from '@mui/material';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from './NoClusterState';

interface ClusterGuardProps {
  children: ReactNode;
}

const ClusterGuard: React.FC<ClusterGuardProps> = ({ children }) => {
  const { clusters, loading } = useCluster();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (clusters.length === 0) {
    return <NoClusterState />;
  }

  return <>{children}</>;
};

export default ClusterGuard;

// Made with Bob
