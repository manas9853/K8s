import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box, Typography, Paper, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, LinearProgress, Alert, IconButton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  DeleteForever as DeleteIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface OrphanedPVC {
  name: string;
  namespace: string;
  capacity_gb: number;
  storage_class: string;
  age_days: number;
  estimated_monthly_cost: number;
}

interface ConsumptionRow {
  namespace: string;
  total_gb: number;
  pvc_count: number;
  utilization_percent: number;
}

const StorageOptimization: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [orphaned, setOrphaned] = useState<OrphanedPVC[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orphanRes, consumptionRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/v1/storage/orphaned-pvcs`, { params: { cluster_id: clusterParam } }),
        axios.get(`${API_BASE}/api/v1/storage/consumption`, { params: { cluster_id: clusterParam } }),
      ]);

      if (orphanRes.status === 'fulfilled') {
        setOrphaned(Array.isArray(orphanRes.value.data) ? orphanRes.value.data : []);
      }
      if (consumptionRes.status === 'fulfilled') {
        setConsumption(Array.isArray(consumptionRes.value.data) ? consumptionRes.value.data : []);
      }
      if (orphanRes.status === 'rejected' && consumptionRes.status === 'rejected') {
        const e = orphanRes.reason;
        const msg = axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e);
        setError(String(msg));
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? err.message : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalOrphanedGB = orphaned.reduce((s, r) => s + (r.capacity_gb ?? 0), 0);
  const totalSavings = orphaned.reduce((s, r) => s + (r.estimated_monthly_cost ?? 0), 0);
  const totalConsumptionGB = consumption.reduce((s, r) => s + (r.total_gb ?? 0), 0);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Storage Optimization</Typography>
          <Typography variant="body2" color="text.secondary">
            Orphaned PVCs and namespace storage consumption — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={fetchData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <CostAccuracyBanner clusterName={activeClusterName} />

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <DeleteIcon color="error" />
                <Typography color="text.secondary">Orphaned PVCs</Typography>
              </Box>
              <Typography variant="h4" color="error.main">{orphaned.length}</Typography>
              <Typography variant="body2" color="text.secondary">{totalOrphanedGB.toFixed(1)} GB reclaimable</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingDownIcon color="warning" />
                <Typography color="text.secondary">Monthly Savings</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">
                ${totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <StorageIcon color="primary" />
                <Typography color="text.secondary">Total Consumption</Typography>
              </Box>
              <Typography variant="h4">{totalConsumptionGB.toFixed(1)} GB</Typography>
              <Typography variant="body2" color="text.secondary">Across {consumption.length} namespaces</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {orphaned.length === 0 && consumption.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary" textAlign="center">
            No storage data yet. Connect a cluster agent to see PVC consumption and orphaned volumes.
          </Typography>
        </Paper>
      )}

      {orphaned.length > 0 && (
        <Paper sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ p: 2 }}>Orphaned PVCs</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Capacity (GB)</TableCell>
                  <TableCell>Storage Class</TableCell>
                  <TableCell>Age (days)</TableCell>
                  <TableCell>Est. Monthly Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orphaned.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.namespace}</TableCell>
                    <TableCell>{r.capacity_gb?.toFixed(1)}</TableCell>
                    <TableCell><Chip label={r.storage_class || 'default'} size="small" /></TableCell>
                    <TableCell>{r.age_days}</TableCell>
                    <TableCell>${(r.estimated_monthly_cost ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {consumption.length > 0 && (
        <Paper>
          <Typography variant="h6" sx={{ p: 2 }}>Namespace Consumption</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Total (GB)</TableCell>
                  <TableCell>PVC Count</TableCell>
                  <TableCell>Utilization</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumption.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.namespace}</TableCell>
                    <TableCell>{r.total_gb?.toFixed(1)}</TableCell>
                    <TableCell>{r.pvc_count}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${(r.utilization_percent ?? 0).toFixed(1)}%`}
                        color={r.utilization_percent > 80 ? 'error' : r.utilization_percent > 60 ? 'warning' : 'success'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default StorageOptimization;
