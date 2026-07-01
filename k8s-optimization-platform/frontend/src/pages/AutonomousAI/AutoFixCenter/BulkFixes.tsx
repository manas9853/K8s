import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';

interface BulkFixesData {
  summary: {
    total: number;
    pending: number;
    applied: number;
    failed: number;
  };
  items: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    impact: string;
  }>;
}

const BulkFixes: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<BulkFixesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/autofix/bulk-fixes');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Bulk Fixes</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Bulk Fixes</Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Bulk Fixes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Apply fixes across multiple resources simultaneously
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total
              </Typography>
              <Typography variant="h4">
                {data.summary.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Pending
              </Typography>
              <Typography variant="h4" color="warning.main">
                {data.summary.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Applied
              </Typography>
              <Typography variant="h4" color="success.main">
                {data.summary.applied}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Failed
              </Typography>
              <Typography variant="h4" color="error.main">
                {data.summary.failed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Items
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Impact</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {item.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={item.status}
                      size="small"
                      color={item.status === 'Applied' ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={item.impact} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CheckCircleIcon />}
                    >
                      Apply
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default BulkFixes;
