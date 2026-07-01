/**
 * NoDataState
 * ─────────────
 * Used when a page has successfully loaded from a connected cluster
 * but found zero items (e.g. no zombie resources, no threats detected).
 *
 * Communicates to the user that their cluster is clean/safe for this feature.
 *
 * Usage:
 *   if (items.length === 0) return <NoDataState title="No zombie resources found" message="..." icon={...} />;
 */
import React, { ReactNode } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { CheckCircleOutline as CheckIcon } from '@mui/icons-material';

interface NoDataStateProps {
  /** Short heading, e.g. "No zombie resources found" */
  title: string;
  /** Longer explanation message */
  message?: string;
  /** Optional icon override (defaults to a green checkmark) */
  icon?: ReactNode;
}

const NoDataState: React.FC<NoDataStateProps> = ({
  title,
  message = 'Your cluster is healthy. No issues were detected for this feature.',
  icon,
}) => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh" p={4}>
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
          bgcolor: '#f0fdf4',
        }}
      >
        {icon ?? (
          <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        )}
        <Typography variant="h5" fontWeight="bold" gutterBottom color="success.dark">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
          {message}
        </Typography>
      </Paper>
    </Box>
  );
};

export default NoDataState;

// Made with Bob
