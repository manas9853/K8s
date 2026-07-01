import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, Select,
  FormControl, InputLabel, SelectChangeEvent
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Change {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  requester: string;
  approver: string | null;
  requested_at: string;
  approved_at: string | null;
  implemented_at: string | null;
  risk_level: string;
}

interface ChangeManagementData {
  total_changes: number;
  pending_changes: number;
  approved_changes: number;
  rejected_changes: number;
  implemented_changes: number;
  changes: Change[];
  approval_required: boolean;
  last_scan: string;
}

const statusColor: Record<string, 'warning' | 'success' | 'error' | 'primary' | 'default'> = {
  pending: 'warning', approved: 'success', rejected: 'error',
  implemented: 'primary', rolled_back: 'default',
};

const priorityColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

const riskColor: Record<string, 'error' | 'warning' | 'default'> = {
  high: 'error', medium: 'warning', low: 'default',
};

const ChangeManagementInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ChangeManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/change-management${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!data?.changes) return [];
    return data.changes.filter((c) => {
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || c.priority === priorityFilter;
      return matchStatus && matchPriority;
    });
  }, [data, statusFilter, priorityFilter]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Change Management</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Change tracking and approval workflow</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Changes', value: data.total_changes },
          { label: 'Pending', value: data.pending_changes },
          { label: 'Approved', value: data.approved_changes },
          { label: 'Implemented', value: data.implemented_changes },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" variant="caption">{k.label}</Typography>
                <Typography variant="h5" fontWeight={700}>{k.value ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Extra status counts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Rejected', value: data.rejected_changes, color: 'error' as const },
          { label: 'Approval Required', value: data.approval_required ? 'Yes' : 'No', color: 'default' as const },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Box mt={0.5}>
                  <Typography variant="h6" fontWeight={700}>{k.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                  <MenuItem value="implemented">Implemented</MenuItem>
                  <MenuItem value="rolled_back">Rolled Back</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select value={priorityFilter} label="Priority" onChange={(e: SelectChangeEvent) => setPriorityFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Change Requests ({filtered.length} of {data.total_changes})
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>ID</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Requester</TableCell>
                  <TableCell>Approver</TableCell>
                  <TableCell>Requested</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.id}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{c.title}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell><Chip label={c.priority} size="small" color={priorityColor[c.priority] ?? 'default'} /></TableCell>
                    <TableCell><Chip label={c.status.replace('_', ' ')} size="small" color={statusColor[c.status] ?? 'default'} /></TableCell>
                    <TableCell><Chip label={c.risk_level} size="small" color={riskColor[c.risk_level] ?? 'default'} /></TableCell>
                    <TableCell>{c.requester}</TableCell>
                    <TableCell>{c.approver ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{new Date(c.requested_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const ChangeManagement: React.FC = () => (
  <ClusterGuard><ChangeManagementInner /></ClusterGuard>
);

export default ChangeManagement;
