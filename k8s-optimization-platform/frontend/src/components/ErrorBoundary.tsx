import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.section ?? 'unknown'}]`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Paper
          sx={{
            p: 3,
            m: 2,
            border: '1px solid',
            borderColor: 'error.light',
            backgroundColor: 'error.50',
          }}
        >
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <ErrorOutline color="error" />
            <Typography variant="subtitle1" color="error.main" fontWeight={600}>
              {this.props.section
                ? `${this.props.section} failed to load`
                : 'Something went wrong'}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Typography>
          <Button size="small" variant="outlined" color="error" onClick={this.handleReset}>
            Retry
          </Button>
        </Paper>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
// Made with Bob
