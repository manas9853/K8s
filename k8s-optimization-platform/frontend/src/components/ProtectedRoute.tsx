import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserStore } from '../hooks/useUserStore';
import PendingApproval from '../pages/PendingApproval';
import { Box, CircularProgress, Typography } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user } = useAuth();
  const location = useLocation();
  const { platformStatus, loading: storeLoading, refresh } = useUserStore();

  // 1. Clerk is still initialising
  if (!isLoaded || storeLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Loading…
        </Typography>
      </Box>
    );
  }

  // 2. Not signed in → redirect to /login
  if (!isSignedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Signed in but not yet approved
  if (platformStatus === 'pending' || platformStatus === 'unregistered') {
    return (
      <PendingApproval
        status={platformStatus === 'unregistered' ? 'pending' : platformStatus}
        onRefresh={refresh}
        loading={storeLoading}
      />
    );
  }

  // 4. Rejected / suspended
  if (platformStatus === 'rejected' || platformStatus === 'suspended') {
    return (
      <PendingApproval
        status={platformStatus}
        onRefresh={refresh}
        loading={storeLoading}
      />
    );
  }

  // 5. Optional role-based guard (page-level)
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3,
        }}
      >
        <Typography variant="h4" color="error">
          Access Denied
        </Typography>
        <Typography variant="body1" color="text.secondary">
          You don't have permission to access this page.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Required role: {requiredRole} | Your role: {user?.role}
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

// Made with Bob
