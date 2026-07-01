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
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import axios from 'axios';

interface PendingRecommendation {
  id: string;
  type: string;
  resource: string;
  namespace: string;
  current_value: string;
  recommended_value: string;
  impact: string;
  risk: string;
  estimated_savings: string;
}

interface ManualModeData {
  mode: string;
  status: string;
  pending_reviews: number;
  approved_today: number;
  rejected_today: number;
  recommendations: PendingRecommendation[];
}

const ManualMode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ManualModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRec, setSelectedRec] = useState<PendingRecommendation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/operations/manual-mode');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch manual mode data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const handleApprove = async (id: string) => {
    try {
      await axios.post(`/api/v1/autonomous-ai/operations/manual-mode/${id}/approve`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to approve recommendation');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await axios.post(`/api/v1/autonomous-ai/operations/manual-mode/${id}/reject`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reject recommendation');
    }
  };

  const handleViewDetails = (rec: PendingRecommendation) => {
    setSelectedRec(rec);
    setDialogOpen(true);
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Manual Mode</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Manual Mode</Typography>
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
            Manual Mode
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review and approve all optimization recommendations manually
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Mode Status */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Manual Mode Active:</strong> All recommendations require your explicit approval before being applied.
        </Typography>
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Pending Reviews
              </Typography>
              <Typography variant="h4" color="warning.main">
                {data.pending_reviews}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Approved Today
              </Typography>
              <Typography variant="h4" color="success.main">
                {data.approved_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Rejected Today
              </Typography>
              <Typography variant="h4" color="error.main">
                {data.rejected_today}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Mode Status
              </Typography>
              <Chip label={data.status} color="primary" />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pending Recommendations */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Pending Recommendations
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>Recommended</TableCell>
                <TableCell>Impact</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell>Savings</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recommendations.map((rec) => (
                <TableRow key={rec.id} hover>
                  <TableCell>
                    <Chip label={rec.type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{rec.resource}</TableCell>
                  <TableCell>{rec.namespace}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {rec.current_value}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="primary" fontWeight="medium">
                      {rec.recommended_value}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={rec.impact} size="small" color="info" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rec.risk}
                      size="small"
                      color={getRiskColor(rec.risk)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="success.main" fontWeight="medium">
                      {rec.estimated_savings}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => handleViewDetails(rec)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleApprove(rec.id)}
                        >
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleReject(rec.id)}
                        >
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Details Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Recommendation Details</DialogTitle>
        <DialogContent>
          {selectedRec && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">
                  Type
                </Typography>
                <Typography variant="body1">{selectedRec.type}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Resource
                </Typography>
                <Typography variant="body1">{selectedRec.resource}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Namespace
                </Typography>
                <Typography variant="body1">{selectedRec.namespace}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Current Value
                </Typography>
                <Typography variant="body1">{selectedRec.current_value}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Recommended Value
                </Typography>
                <Typography variant="body1" color="primary" fontWeight="medium">
                  {selectedRec.recommended_value}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">
                  Impact
                </Typography>
                <Chip label={selectedRec.impact} size="small" color="info" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">
                  Risk
                </Typography>
                <Chip
                  label={selectedRec.risk}
                  size="small"
                  color={getRiskColor(selectedRec.risk)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">
                  Estimated Savings
                </Typography>
                <Typography variant="body1" color="success.main" fontWeight="medium">
                  {selectedRec.estimated_savings}
                </Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
          {selectedRec && (
            <>
              <Button
                onClick={() => {
                  handleReject(selectedRec.id);
                  setDialogOpen(false);
                }}
                color="error"
                startIcon={<CancelIcon />}
              >
                Reject
              </Button>
              <Button
                onClick={() => {
                  handleApprove(selectedRec.id);
                  setDialogOpen(false);
                }}
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
              >
                Approve
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Info Box */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <InfoIcon color="info" />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              About Manual Mode
            </Typography>
            <Typography variant="body2" color="text.secondary">
              In Manual Mode, you have complete control over all optimization decisions. 
              Every recommendation must be reviewed and explicitly approved before being applied to your cluster. 
              This mode is ideal for production environments where you want maximum oversight.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default ManualMode;

// Made with Bob
