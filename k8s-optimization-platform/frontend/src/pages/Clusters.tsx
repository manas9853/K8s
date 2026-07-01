import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useCluster } from '../contexts/ClusterContext';
import type { ClusterInfo } from '../contexts/ClusterContext';

const Clusters: React.FC = () => {
  const { clusters, loading, error, refreshClusters, deleteCluster } = useCluster();

  // ── Delete confirmation dialog ──────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ClusterInfo | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleDeleteClick = (cluster: ClusterInfo) => {
    setDeleteTarget(cluster);
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteInProgress(true);
    try {
      const result = await deleteCluster(deleteTarget.id);
      if (result.success) {
        setToast({
          open: true,
          message: `Cluster "${deleteTarget.name}" removed. All dashboard views have been updated.`,
          severity: 'success',
        });
      } else {
        setToast({
          open: true,
          message: `Failed to remove cluster: ${result.error}`,
          severity: 'error',
        });
      }
    } finally {
      setDeleteInProgress(false);
      setDeleteTarget(null);
    }
  };

  const handleToastClose = () => setToast((prev) => ({ ...prev, open: false }));

  // ── Status helpers ────────────────────────────────────────────────────────
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return <CheckCircleIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'critical':
        return <ErrorIcon color="error" />;
      default:
        return <CheckCircleIcon color="disabled" />;
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status.toLowerCase()) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'critical': return 'error';
      default: return 'default';
    }
  };

  const getHealthScoreColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'error';
  };

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalNodes = clusters.reduce((sum, c) => sum + c.nodes, 0);
  const totalPods = clusters.reduce((sum, c) => sum + c.pods, 0);
  const totalNamespaces = clusters.reduce((sum, c) => sum + c.namespaces, 0);
  const totalCost = clusters.reduce((sum, c) => sum + c.monthly_cost, 0);
  const totalSavings = clusters.reduce((sum, c) => sum + c.potential_savings, 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && clusters.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Box>
          <Typography variant="h4">Multi-Cluster Dashboard</Typography>
          <Typography variant="body2" color="textSecondary">
            Unified view of all Kubernetes clusters
          </Typography>
        </Box>
        <Tooltip title="Refresh cluster list">
          <IconButton onClick={refreshClusters} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error} — showing cached data
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4, mt: 1 }}>
        {[
          { label: 'Total Clusters', value: clusters.length },
          { label: 'Total Nodes', value: totalNodes },
          { label: 'Total Pods', value: totalPods },
          { label: 'Total Namespaces', value: totalNamespaces },
          { label: 'Monthly Cost', value: `$${totalCost.toLocaleString()}` },
          { label: 'Potential Savings', value: `$${totalSavings.toLocaleString()}`, color: 'success.main' },
        ].map((card) => (
          <Grid item xs={12} sm={6} md={2} key={card.label}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom variant="body2">
                  {card.label}
                </Typography>
                <Typography variant="h5" color={card.color}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Clusters Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cluster Name</TableCell>
              <TableCell>Environment</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Nodes</TableCell>
              <TableCell align="right">Pods</TableCell>
              <TableCell align="right">Namespaces</TableCell>
              <TableCell align="right">CPU</TableCell>
              <TableCell align="right">Memory</TableCell>
              <TableCell align="right">Health</TableCell>
              <TableCell align="right">Monthly Cost</TableCell>
              <TableCell align="right">Savings</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clusters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                  <Typography color="textSecondary">No clusters registered</Typography>
                </TableCell>
              </TableRow>
            ) : (
              clusters.map((cluster) => (
                <TableRow key={cluster.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {cluster.name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {cluster.region} · v{cluster.version}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cluster.environment}
                      size="small"
                      color={
                        cluster.environment === 'production' ? 'error'
                        : cluster.environment === 'staging' ? 'warning'
                        : cluster.environment === 'qa' ? 'info'
                        : 'default'
                      }
                    />
                  </TableCell>
                  <TableCell>{cluster.provider}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getStatusIcon(cluster.status)}
                      <Chip
                        label={cluster.status}
                        size="small"
                        color={getStatusColor(cluster.status)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">{cluster.nodes}</TableCell>
                  <TableCell align="right">{cluster.pods}</TableCell>
                  <TableCell align="right">{cluster.namespaces}</TableCell>
                  <TableCell align="right">{cluster.cpu_usage}</TableCell>
                  <TableCell align="right">{cluster.memory_usage}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={`${cluster.health_score}/100`}
                      size="small"
                      color={getHealthScoreColor(cluster.health_score)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    ${cluster.monthly_cost.toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    <Typography color="success.main" fontWeight="bold">
                      ${cluster.potential_savings.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`Remove "${cluster.name}" and all its data from every dashboard`}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteClick(cluster)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'error.main' }}>
          Remove Cluster — {deleteTarget?.name}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove <strong>{deleteTarget?.name}</strong> from the platform.
          </DialogContentText>
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: 'error.50',
              border: '1px solid',
              borderColor: 'error.200',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="error.dark" fontWeight="bold" gutterBottom>
              ⚠️ The following data will be removed from every dashboard:
            </Typography>
            <Typography variant="body2" color="error.dark" component="ul" sx={{ pl: 2, m: 0 }}>
              <li>All pods, workloads, and node data</li>
              <li>Cost and savings metrics</li>
              <li>Security and compliance findings</li>
              <li>Simulation engine state for this cluster</li>
              <li>All operations, network, and storage data</li>
            </Typography>
          </Box>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
            Cluster: <strong>{deleteTarget?.environment}</strong> ·{' '}
            {deleteTarget?.region} · {deleteTarget?.nodes} nodes · {deleteTarget?.pods} pods
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDeleteCancel} disabled={deleteInProgress}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={deleteInProgress}
            startIcon={deleteInProgress ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {deleteInProgress ? 'Removing…' : 'Remove Cluster'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast Notification ──────────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleToastClose} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Clusters;

// Made with Bob
