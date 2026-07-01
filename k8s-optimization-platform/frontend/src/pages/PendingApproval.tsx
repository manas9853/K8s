import React from 'react';
import { Box, Typography, Paper, Chip, Button, LinearProgress, Divider } from '@mui/material';
import { HourglassTop as HourglassIcon, Block as BlockIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import { UserButton, useUser } from '@clerk/clerk-react';
import { PlatformStatus } from '../hooks/useUserStore';

interface Props {
  status: PlatformStatus;
  onRefresh: () => void;
  loading?: boolean;
}

const PendingApproval: React.FC<Props> = ({ status, onRefresh, loading }) => {
  const { user } = useUser();

  const isRejected = status === 'rejected';
  const isSuspended = status === 'suspended';

  const icon = isRejected || isSuspended
    ? <BlockIcon sx={{ fontSize: 56, color: 'error.main' }} />
    : <HourglassIcon sx={{ fontSize: 56, color: 'warning.main' }} />;

  const headingColor = isRejected || isSuspended ? 'error.main' : 'warning.main';
  const heading = isRejected
    ? 'Access Denied'
    : isSuspended
    ? 'Account Suspended'
    : 'Pending Admin Approval';

  const message = isRejected
    ? 'Your registration request was not approved. Please contact your platform administrator.'
    : isSuspended
    ? 'Your account has been suspended. Please contact your platform administrator.'
    : 'Your account has been created and is pending approval from a platform administrator. You will gain access once approved.';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f8fa',
        p: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          maxWidth: 480,
          width: '100%',
          p: 5,
          borderRadius: 3,
          textAlign: 'center',
        }}
      >
        {/* K8s logo */}
        <Box sx={{ mb: 3 }}>
          <svg width="48" height="48" viewBox="0 0 56 56" style={{ display: 'inline-block' }}>
            <rect width="56" height="56" rx="12" fill="#3b6fe8" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              return (
                <line
                  key={deg}
                  x1={28 + 8 * Math.cos(rad)} y1={28 + 8 * Math.sin(rad)}
                  x2={28 + 19 * Math.cos(rad)} y2={28 + 19 * Math.sin(rad)}
                  stroke="white" strokeWidth="2.5" strokeLinecap="round"
                />
              );
            })}
            <circle cx="28" cy="28" r="5.5" fill="white" />
          </svg>
        </Box>

        {icon}

        <Typography variant="h5" fontWeight={700} sx={{ mt: 2, mb: 1, color: headingColor }}>
          {heading}
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
          {message}
        </Typography>

        <Divider sx={{ mb: 3 }} />

        {/* User info */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
          <UserButton />
          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="body2" fontWeight={600}>
              {user?.fullName || user?.username}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.primaryEmailAddress?.emailAddress}
            </Typography>
          </Box>
          <Chip label={status} size="small" color={isRejected || isSuspended ? 'error' : 'warning'} />
        </Box>

        {/* What happens next */}
        {!isRejected && !isSuspended && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: 'left', bgcolor: '#fffde7', borderColor: 'warning.light' }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={700}>
              What happens next?
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                A platform administrator will review your request.
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                You'll be assigned a role (Viewer, Editor, or Admin) and one or more teams.
              </Typography>
              <Typography component="li" variant="body2">
                Once approved, you'll have full access based on your assigned role.
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Role badges */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Available roles on this platform
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Admin', 'Editor', 'Viewer', 'ReadOnly'].map((r) => (
              <Chip key={r} label={r} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {!isRejected && !isSuspended && (
          <Button variant="outlined" onClick={onRefresh} disabled={loading} size="small">
            {loading ? 'Checking…' : 'Check Approval Status'}
          </Button>
        )}

        {(isRejected || isSuspended) && (
          <Typography variant="body2" color="text.secondary">
            Contact: <strong>admin@k8s-optimization.com</strong>
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default PendingApproval;

// Made with Bob
