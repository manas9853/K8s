import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, MenuItem, Select,
  FormControl, InputLabel, SelectChangeEvent, LinearProgress
} from '@mui/material';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';

interface Change {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  description: string;
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
  cluster_name?: string;
  approval_required: boolean;
  last_scan: string;
}

const DK = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

const STATUS_COLOR: Record<string, string> = {
  implemented:  '#3fb950',
  approved:     '#3b82f6',
  in_progress:  '#a371f7',
  pending:      '#d29922',
  rejected:     '#f85149',
  rolled_back:  '#8b949e',
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

const RISK_COLOR: Record<string, string> = {
  high:   '#f85149',
  medium: '#d29922',
  low:    '#3fb950',
};

const StyledChip: React.FC<{ value: string; colorMap: Record<string, string>; label?: string }> = ({ value, colorMap, label }) => {
  const c = colorMap[value] ?? '#8b949e';
  return (
    <Chip
      label={label ?? value.replace('_', ' ')}
      size="small"
      sx={{
        bgcolor: `${c}22`,
        color: c,
        border: `1px solid ${c}44`,
        fontWeight: 600,
        fontSize: '0.7rem',
        textTransform: 'capitalize',
      }}
    />
  );
};

const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; sub?: string }> = ({ label, value, accent, sub }) => (
  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: '16px !important' }}>
      <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{value}</Typography>
      {sub && <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

const ChangeManagementInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ChangeManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/change-management${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data?.changes) return [];
    return data.changes.filter((c) => {
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || c.priority === priorityFilter;
      return matchStatus && matchPriority;
    });
  }, [data, statusFilter, priorityFilter]);

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#a371f7' }} />
    </Box>
  );

  if (error) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: '#2d1317', color: '#f85149', border: '1px solid #f8514944' }}>{error}</Alert>
    </Box>
  );

  if (!data) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="info">No data available</Alert>
    </Box>
  );

  const implementedPct = data.total_changes > 0
    ? Math.round((data.implemented_changes / data.total_changes) * 100)
    : 0;

  const selectSx = {
    color: DK.text,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.border },
    '& .MuiSvgIcon-root': { color: DK.muted },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#a371f7' },
    bgcolor: DK.surface,
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <ChangeCircleIcon sx={{ color: '#a371f7', fontSize: 28 }} />
        <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>
          Change Management
        </Typography>
        {data.cluster_name && (
          <Chip label={data.cluster_name} size="small"
            sx={{ bgcolor: '#a371f722', color: '#a371f7', border: '1px solid #a371f744', fontWeight: 600 }} />
        )}
        {data.approval_required && (
          <Chip label="Approval Required" size="small"
            sx={{ bgcolor: '#d2992222', color: '#d29922', border: '1px solid #d2992244', fontWeight: 600 }} />
        )}
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mb: 3 }}>
        Change requests derived from live cluster security and compliance findings
      </Typography>

      {/* KPI Row */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Total Changes" value={data.total_changes} />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Pending" value={data.pending_changes} accent="#d29922" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Approved / In Progress" value={data.approved_changes} accent="#3b82f6" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Implemented" value={data.implemented_changes} accent="#3fb950" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Rejected" value={data.rejected_changes} accent="#f85149" />
        </Grid>
      </Grid>

      {/* Progress bar */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: '14px 16px !important' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>Implementation Progress</Typography>
            <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '0.85rem' }}>{implementedPct}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={implementedPct}
            sx={{
              height: 7,
              borderRadius: 4,
              bgcolor: '#21262d',
              '& .MuiLinearProgress-bar': { bgcolor: '#3fb950', borderRadius: 4 },
            }}
          />
          <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 0.75 }}>
            {data.implemented_changes} of {data.total_changes} changes implemented · last scan {new Date(data.last_scan).toLocaleTimeString()}
          </Typography>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: '12px 16px !important' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: DK.muted }}>Status</InputLabel>
                <Select value={statusFilter} label="Status"
                  onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}
                  sx={selectSx} MenuProps={{ PaperProps: { sx: { bgcolor: DK.surface, color: DK.text } } }}>
                  {['all','pending','approved','in_progress','implemented','rejected','rolled_back'].map(v => (
                    <MenuItem key={v} value={v}>{v === 'all' ? 'All Statuses' : v.replace('_', ' ')}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: DK.muted }}>Priority</InputLabel>
                <Select value={priorityFilter} label="Priority"
                  onChange={(e: SelectChangeEvent) => setPriorityFilter(e.target.value)}
                  sx={selectSx} MenuProps={{ PaperProps: { sx: { bgcolor: DK.surface, color: DK.text } } }}>
                  {['all','critical','high','medium','low'].map(v => (
                    <MenuItem key={v} value={v}>{v === 'all' ? 'All Priorities' : v.charAt(0).toUpperCase()+v.slice(1)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Changes Table */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
        <CardContent sx={{ p: '16px !important' }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
            Change Requests — {filtered.length} of {data.total_changes}
          </Typography>
          <TableContainer sx={{ maxHeight: 540, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 3 } }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['ID','Title','Description','Type','Priority','Status','Risk','Requester','Approver','Requested'].map(h => (
                    <TableCell key={h} sx={{ bgcolor: '#1c2128', color: DK.muted, fontWeight: 700, fontSize: '0.72rem', borderBottom: `1px solid ${DK.border}`, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} hover sx={{ '&:hover': { bgcolor: '#1c2128' }, '& td': { borderBottom: `1px solid ${DK.border}22` } }}>
                    <TableCell sx={{ color: DK.muted, fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{c.id}</TableCell>
                    <TableCell sx={{ color: DK.text, fontWeight: 600, fontSize: '0.8rem', minWidth: 180 }}>{c.title}</TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.75rem', maxWidth: 260 }}>{c.description}</TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.78rem' }}>{c.type}</TableCell>
                    <TableCell><StyledChip value={c.priority} colorMap={PRIORITY_COLOR} /></TableCell>
                    <TableCell><StyledChip value={c.status} colorMap={STATUS_COLOR} /></TableCell>
                    <TableCell><StyledChip value={c.risk_level} colorMap={RISK_COLOR} label={c.risk_level + ' risk'} /></TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.78rem', fontFamily: 'monospace' }}>{c.requester}</TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.78rem', fontFamily: 'monospace' }}>{c.approver ?? '—'}</TableCell>
                    <TableCell sx={{ color: DK.muted, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(c.requested_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ color: DK.muted, py: 4, borderBottom: 'none' }}>
                      No changes match the current filters
                    </TableCell>
                  </TableRow>
                )}
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
