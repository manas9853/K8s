import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Tooltip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, InputAdornment,
  Select, MenuItem, FormControl, LinearProgress, Stack
} from '@mui/material';
import {
  Security as SecurityIcon, Warning as WarningIcon,
  ArrowForward as ArrowIcon, Search as SearchIcon, Info as InfoIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

// Security context matrix columns → {label, dangerous when true/false}
const MATRIX_CHECKS: Array<{ key: string; label: string; dangerWhenTrue: boolean; tip: string }> = [
  { key: 'privileged',              label: 'Privileged',   dangerWhenTrue: true,  tip: 'Full host access — can escape to node' },
  { key: 'allowPrivilegeEscalation',label: 'Priv-Esc',    dangerWhenTrue: true,  tip: 'setuid/setgid binaries can gain root' },
  { key: 'runAsRoot',               label: 'Root',         dangerWhenTrue: true,  tip: 'Process runs as UID 0' },
  { key: 'readOnlyRootFilesystem',  label: 'Read-Only FS', dangerWhenTrue: false, tip: 'Writable root filesystem can persist payloads' },
  { key: 'hostNetwork',             label: 'Host Net',     dangerWhenTrue: true,  tip: 'Shares host network namespace' },
  { key: 'hostPID',                 label: 'Host PID',     dangerWhenTrue: true,  tip: 'Sees all host processes' },
  { key: 'hostIPC',                 label: 'Host IPC',     dangerWhenTrue: true,  tip: 'Shares host IPC namespace' },
];

const PrivilegedContainers: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [nsFilter, setNsFilter] = useState('all');

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE_URL}/v1/security/container-security/privileged${clusterParam}`)
        .then(r => r.json()).then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const i = setInterval(load, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress size={48} sx={{ color: '#60a5fa' }} />
    </Box>
  );
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const allContainers: any[] = Array.isArray(data.privileged_containers) ? data.privileged_containers : [];

  // Namespace breakdown
  const nsCounts: Record<string, { total: number; critical: number; high: number; medium: number }> = {};
  for (const c of allContainers) {
    const ns = c.namespace;
    if (!nsCounts[ns]) nsCounts[ns] = { total: 0, critical: 0, high: 0, medium: 0 };
    nsCounts[ns].total++;
    const risk = (c.risk_level ?? 'medium').toLowerCase() as 'critical' | 'high' | 'medium';
    if (nsCounts[ns][risk] !== undefined) nsCounts[ns][risk]++;
  }
  const nsBreakdown = Object.entries(nsCounts).sort((a, b) => b[1].total - a[1].total);

  const namespaces = nsBreakdown.map(([ns]) => ns);

  // Filtered containers
  const filtered = allContainers.filter(c => {
    if (riskFilter !== 'all' && c.risk_level !== riskFilter) return false;
    if (nsFilter  !== 'all' && c.namespace  !== nsFilter)   return false;
    if (search) {
      const s = search.toLowerCase();
      return c.pod_name.toLowerCase().includes(s) ||
             c.container_name.toLowerCase().includes(s) ||
             c.namespace.toLowerCase().includes(s);
    }
    return true;
  });

  const criticals = allContainers.filter(c => c.risk_level === 'critical');

  const STAT_ROWS = [
    { label: 'Total Privileged',  count: data.total_privileged ?? allContainers.length, color: '#f87171', bg: '#2d1515' },
    { label: 'Critical Risk',     count: data.critical_risk ?? criticals.length,         color: '#f87171', bg: '#2d1515' },
    { label: 'With Host PID/Net', count: allContainers.filter(c => c.host_network || c.host_pid || c.host_ipc).length, color: '#f59e0b', bg: '#2d200a' },
    { label: 'Total Containers',  count: data.total_containers ?? 0,                     color: '#60a5fa', bg: '#0d1f3c' },
  ];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: '#f87171' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Privileged Containers</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real cluster data · {allContainers.length} privileged containers across {namespaces.length} namespaces · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        {STAT_ROWS.map(({ label, count, color, bg }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: bg, border: `1px solid ${color}40` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {criticals.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>
              Critical Risk — {criticals.length} containers in non-system namespaces with host access
            </Typography>
          </Box>
          <Grid container spacing={1.5}>
            {criticals.map((c: any, i: number) => (
              <Grid item xs={12} md={6} key={i}>
                <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717150' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                    <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#f87171', color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0', fontFamily: 'monospace', fontSize: 12 }}>
                      {c.pod_name}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>
                    Container: <strong style={{ color: '#e8eaf0' }}>{c.container_name}</strong>
                    &nbsp;·&nbsp;Namespace: <strong style={{ color: '#60a5fa' }}>{c.namespace}</strong>
                  </Typography>
                  {/* Flags */}
                  <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.75}>
                    {c.privileged    && <Chip label="privileged=true"  size="small" sx={{ bgcolor: '#2d1515', color: '#f87171', border: '1px solid #f87171', fontSize: 10 }} />}
                    {c.host_pid      && <Chip label="hostPID=true"      size="small" sx={{ bgcolor: '#2d200a', color: '#f59e0b', border: '1px solid #f59e0b', fontSize: 10 }} />}
                    {c.host_ipc      && <Chip label="hostIPC=true"      size="small" sx={{ bgcolor: '#2d200a', color: '#f59e0b', border: '1px solid #f59e0b', fontSize: 10 }} />}
                    {c.host_network  && <Chip label="hostNetwork=true"  size="small" sx={{ bgcolor: '#2d200a', color: '#f59e0b', border: '1px solid #f59e0b', fontSize: 10 }} />}
                    {!c.readOnlyRootFilesystem && <Chip label="readOnly=false" size="small" sx={{ bgcolor: '#0d1f3c', color: '#60a5fa', border: '1px solid #60a5fa', fontSize: 10 }} />}
                  </Box>
                  <Typography variant="caption" sx={{ color: '#f87171', display: 'block', mt: 0.5 }}>
                    {c.justification}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
              sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
              Remediate Critical ({criticals.length})
            </Button>
          </Box>
        </Paper>
      )}

      {/* NAMESPACE BREAKDOWN */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>Namespace Breakdown</Typography>
        <Stack spacing={1.5}>
          {nsBreakdown.map(([ns, counts]) => (
            <Box key={ns}
              onClick={() => setNsFilter(ns === nsFilter ? 'all' : ns)}
              sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
                p: 1.5, borderRadius: 1, border: `1px solid ${nsFilter === ns ? '#60a5fa' : '#2a3245'}`,
                bgcolor: nsFilter === ns ? '#0d1f3c' : 'transparent',
                '&:hover': { bgcolor: '#131d2e' } }}>
              <Typography variant="body2" sx={{ minWidth: 200, color: '#e8eaf0', fontFamily: 'monospace', fontSize: 12 }}>
                {ns}
              </Typography>
              <LinearProgress variant="determinate"
                value={(counts.total / allContainers.length) * 100}
                sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: '#2a3245',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: counts.critical > 0 ? '#f87171' : counts.high > 0 ? '#f59e0b' : '#60a5fa'
                  }
                }} />
              <Box display="flex" gap={0.5}>
                {counts.critical > 0 && (
                  <Chip label={`${counts.critical}C`} size="small" sx={{ bgcolor: '#2d1515', color: '#f87171', fontSize: 10, fontWeight: 700 }} />
                )}
                {counts.high > 0 && (
                  <Chip label={`${counts.high}H`} size="small" sx={{ bgcolor: '#2d200a', color: '#f59e0b', fontSize: 10, fontWeight: 700 }} />
                )}
                {counts.medium > 0 && (
                  <Chip label={`${counts.medium}M`} size="small" sx={{ bgcolor: '#0d1f3c', color: '#60a5fa', fontSize: 10, fontWeight: 700 }} />
                )}
              </Box>
              <Typography variant="body2" sx={{ color: '#8892a4', minWidth: 40, textAlign: 'right' }}>
                {counts.total} pod{counts.total !== 1 ? 's' : ''}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      {/* SECURITY CONTEXT MATRIX */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        {/* Toolbar */}
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Security Context Matrix ({filtered.length})
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#f87171' }} />
              <Typography variant="caption" sx={{ color: '#8892a4' }}>Dangerous</Typography>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#4ade80', ml: 1 }} />
              <Typography variant="caption" sx={{ color: '#8892a4' }}>Secure</Typography>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#3a3a4a', ml: 1 }} />
              <Typography variant="caption" sx={{ color: '#8892a4' }}>Not set</Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <TextField size="small" placeholder="Search pod / container…"
              value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#8892a4', fontSize: 18 }} /></InputAdornment>,
                sx: { bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1,
                  '& input': { color: '#e8eaf0' }, fontSize: 13 }
              }}
              sx={{ minWidth: 190 }} variant="outlined" />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                sx={{ bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1, fontSize: 13 }}>
                <MenuItem value="all">All Risks</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <Select value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                sx={{ bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 1, fontSize: 13 }}>
                <MenuItem value="all">All Namespaces</MenuItem>
                {namespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', minWidth: 180 }}>Pod</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245' }}>Container</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245' }}>Namespace</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245' }}>Risk</TableCell>
                {MATRIX_CHECKS.map(({ key, label, tip }) => (
                  <Tooltip key={key} title={tip} arrow placement="top">
                    <TableCell sx={{ fontWeight: 700, fontSize: 10, color: '#8892a4', bgcolor: '#131d2e',
                      borderColor: '#2a3245', textAlign: 'center', minWidth: 70, cursor: 'help' }}>
                      {label} <InfoIcon sx={{ fontSize: 10, verticalAlign: 'middle', opacity: 0.5 }} />
                    </TableCell>
                  </Tooltip>
                ))}
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((c: any, i: number) => {
                const risk = (c.risk_level ?? 'medium').toLowerCase();
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245',
                      fontFamily: 'monospace', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={c.pod_name} arrow>
                        <span>{c.pod_name}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{c.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, borderColor: '#2a3245' }}>
                      <Chip label={c.namespace} size="small"
                        sx={{ bgcolor: '#1a2035', color: '#8892a4', fontSize: 10, border: '1px solid #2a3245' }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={risk.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[risk] ?? '#2d1515', color: SEV_COLOR[risk] ?? '#f87171',
                          fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    {MATRIX_CHECKS.map(({ key, dangerWhenTrue }) => {
                      // Map API field names to container fields
                      const fieldMap: Record<string, any> = {
                        privileged:               c.privileged,
                        allowPrivilegeEscalation: c.allowPrivilegeEscalation ?? c.allow_privilege_escalation,
                        runAsRoot:                c.runAsRoot ?? c.run_as_root,
                        readOnlyRootFilesystem:   c.readOnlyRootFilesystem ?? c.read_only_root_fs,
                        hostNetwork:              c.hostNetwork ?? c.host_network,
                        hostPID:                  c.hostPID ?? c.host_pid,
                        hostIPC:                  c.hostIPC ?? c.host_ipc,
                      };
                      const val = fieldMap[key];
                      const isDangerous = dangerWhenTrue ? val === true : val === false;
                      const isNull = val === undefined || val === null;
                      return (
                        <TableCell key={key} sx={{ textAlign: 'center', borderColor: '#2a3245' }}>
                          <Tooltip title={val === null || val === undefined ? 'Not configured' : String(val)} arrow>
                            <Box sx={{ width: 14, height: 14, borderRadius: '50%', mx: 'auto',
                              bgcolor: isNull ? '#3a3a4a' : isDangerous ? '#f87171' : '#4ade80',
                              border: isNull ? 'none' : `1px solid ${isDangerous ? '#f8717180' : '#4ade8080'}` }} />
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Button size="small" variant="contained"
                        onClick={() => navigate('/auto-remediation-security')}
                        sx={{ fontSize: 10, py: 0.5, bgcolor: risk === 'critical' ? '#f87171' : '#f59e0b',
                          '&:hover': { bgcolor: risk === 'critical' ? '#ef4444' : '#d97706' } }}>
                        Fix
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {filtered.length === 0 && (
          <Box p={3} textAlign="center">
            <Typography sx={{ color: '#8892a4' }}>No containers match the current filters.</Typography>
          </Box>
        )}
      </Paper>

      {/* Footer actions */}
      <Box display="flex" gap={1} mt={3}>
        <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
          sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
          Fix All ({allContainers.length})
        </Button>
        <Button variant="outlined" onClick={() => navigate('/root-containers')}
          sx={{ borderColor: '#60a5fa', color: '#60a5fa' }}>
          View Root Containers
        </Button>
        <Button variant="outlined" onClick={() => navigate('/runtime-security')}
          sx={{ borderColor: '#8892a4', color: '#8892a4' }}>
          Runtime Security
        </Button>
      </Box>
    </Box>
  );
};

export default PrivilegedContainers;
// Made with Bob
