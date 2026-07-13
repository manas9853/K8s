import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, LinearProgress, Alert, IconButton, LinearProgress as BarProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Dns as DnsIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface NodeRow {
  name: string;
  role: string;
  status: string;
  cpu_usage: number;
  memory_usage: number;
  cpu_capacity: number;
  memory_capacity_gb: number;
  pod_count: number;
  age_days: number;
}

const NodeOptimization: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/clusters/nodes`, {
        params: { cluster_id: clusterParam },
      });
      setNodes(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const avgCpu = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.cpu_usage ?? 0), 0) / nodes.length
    : 0;
  const avgMem = nodes.length > 0
    ? nodes.reduce((s, n) => s + (n.memory_usage ?? 0), 0) / nodes.length
    : 0;
  const idleNodes = nodes.filter((n) => (n.cpu_usage ?? 0) < 20 && (n.memory_usage ?? 0) < 20).length;

  const utilizationColor = (pct: number): 'error' | 'warning' | 'success' => {
    if (pct > 80) return 'error';
    if (pct > 60) return 'warning';
    return 'success';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Node Optimization</Typography>
          <Typography variant="body2" color="text.secondary">
            Node utilization and right-sizing opportunities — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={fetchData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <DnsIcon color="primary" />
                <Typography color="text.secondary">Total Nodes</Typography>
              </Box>
              <Typography variant="h4">{nodes.length}</Typography>
              <Typography variant="body2" color="text.secondary">{idleNodes} potentially idle</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SpeedIcon color="warning" />
                <Typography color="text.secondary">Avg CPU Usage</Typography>
              </Box>
              <Typography variant="h4" color={avgCpu > 80 ? 'error.main' : 'text.primary'}>
                {avgCpu.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MemoryIcon color="info" />
                <Typography color="text.secondary">Avg Memory Usage</Typography>
              </Box>
              <Typography variant="h4" color={avgMem > 80 ? 'error.main' : 'text.primary'}>
                {avgMem.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {nodes.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary" textAlign="center">
            No node data yet. Connect a cluster agent to see node utilization and right-sizing opportunities.
          </Typography>
        </Paper>
      )}

      {nodes.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Node</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>CPU Usage</TableCell>
                  <TableCell>Memory Usage</TableCell>
                  <TableCell>Pods</TableCell>
                  <TableCell>Age (days)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodes.map((n, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{n.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={n.role || 'worker'}
                        color={n.role?.includes('control') ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={n.status || '—'}
                        color={n.status === 'Ready' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ width: 160 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BarProgress
                          variant="determinate"
                          value={Math.min(n.cpu_usage ?? 0, 100)}
                          color={utilizationColor(n.cpu_usage ?? 0)}
                          sx={{ flexGrow: 1 }}
                        />
                        <Typography variant="caption">{(n.cpu_usage ?? 0).toFixed(1)}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ width: 160 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BarProgress
                          variant="determinate"
                          value={Math.min(n.memory_usage ?? 0, 100)}
                          color={utilizationColor(n.memory_usage ?? 0)}
                          sx={{ flexGrow: 1 }}
                        />
                        <Typography variant="caption">{(n.memory_usage ?? 0).toFixed(1)}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{n.pod_count ?? '—'}</TableCell>
                    <TableCell>{n.age_days ?? '—'}</TableCell>
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

export default NodeOptimization;
