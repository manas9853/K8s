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
import { colors } from '../theme/colors';

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
  bg: colors.background,
  surface: colors.surface,
  border: colors.border,
  text: colors.textPrimary,
  muted: colors.textSecondary,
};

const STATUS_COLOR: Record<string, string> = {
  implemented:  colors.success,
  approved:     colors.info,
  in_progress:  colors.purple,
  pending:      colors.warning,
  rejected:     colors.danger,
  rolled_back:  colors.textSecondary,
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: colors.danger,
  high:     colors.warning,
  medium:   colors.info,
  low:      colors.success,
};

const RISK_COLOR: Record<string, string> = {
  high:   colors.danger,
  medium: colors.warning,
  low:    colors.success,
};

const StyledChip: React.FC<{ value: string; colorMap: Record<string, string>; label?: string }> = ({ value, colorMap, label }) => {
  const c = colorMap[value] ?? colors.textSecondary;
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
      <CircularProgress sx={{ color: colors.purple }} />
    </Box>
  );

  if (error) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}44` }}>{error}</Alert>
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
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.purple },
    bgcolor: DK.surface,
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <ChangeCircleIcon sx={{ color: colors.purple, fontSize: 28 }} />
        <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>
          Change Management
        </Typography>
        {data.cluster_name && (
          <Chip label={data.cluster_name} size="small"
            sx={{ bgcolor: `${colors.purple}22`, color: colors.purple, border: `1px solid ${colors.purple}44`, fontWeight: 600 }} />
        )}
        {data.approval_required && (
          <Chip label="Approval Required" size="small"
            sx={{ bgcolor: `${colors.warning}22`, color: colors.warning, border: `1px solid ${colors.warning}44`, fontWeight: 600 }} />
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
          <KpiCard label="Pending" value={data.pending_changes} accent={colors.warning} />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Approved / In Progress" value={data.approved_changes} accent={colors.info} />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Implemented" value={data.implemented_changes} accent={colors.success} />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <KpiCard label="Rejected" value={data.rejected_changes} accent={colors.danger} />
        </Grid>
      </Grid>

      {/* Progress bar */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: '14px 16px !important' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>Implementation Progress</Typography>
            <Typography sx={{ color: colors.success, fontWeight: 700, fontSize: '0.85rem' }}>{implementedPct}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={implementedPct}
            sx={{
              height: 7,
              borderRadius: 4,
              bgcolor: colors.surfaceHover,
              '& .MuiLinearProgress-bar': { bgcolor: colors.success, borderRadius: 4 },
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
                    <TableCell key={h} sx={{ bgcolor: colors.surfaceHover, color: DK.muted, fontWeight: 700, fontSize: '0.72rem', borderBottom: `1px solid ${DK.border}`, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, '& td': { borderBottom: `1px solid ${DK.border}22` } }}>
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
