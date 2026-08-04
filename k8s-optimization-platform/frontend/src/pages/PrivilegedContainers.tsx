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
import { colors } from '../theme/colors';

const SEV_COLOR: Record<string, string> = { critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success };
const SEV_BG:    Record<string, string> = { critical: colors.dangerBg,  high: colors.warningBg,  medium: colors.infoBg,  low: colors.successBg };

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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
      <CircularProgress size={48} sx={{ color: colors.info }} />
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
    { label: 'Total Privileged',  count: data.total_privileged ?? allContainers.length, color: colors.danger, bg: colors.dangerBg },
    { label: 'Critical Risk',     count: data.critical_risk ?? criticals.length,         color: colors.danger, bg: colors.dangerBg },
    { label: 'With Host PID/Net', count: allContainers.filter(c => c.host_network || c.host_pid || c.host_ipc).length, color: colors.warning, bg: colors.warningBg },
    { label: 'Total Containers',  count: data.total_containers ?? 0,                     color: colors.info, bg: colors.infoBg },
  ];

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: colors.danger }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Privileged Containers</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
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
        <Paper sx={{ p: 2.5, mb: 3, border: `1px solid ${colors.danger}`, bgcolor: colors.dangerBg }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.danger }}>
              Critical Risk — {criticals.length} containers in non-system namespaces with host access
            </Typography>
          </Box>
          <Grid container spacing={1.5}>
            {criticals.map((c: any, i: number) => (
              <Grid item xs={12} md={6} key={i}>
                <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: colors.dangerBg, border: `1px solid ${colors.danger}50` }}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5} flexWrap="wrap">
                    <Chip label="CRITICAL" size="small" sx={{ bgcolor: colors.danger, color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary, fontFamily: 'monospace', fontSize: 12 }}>
                      {c.pod_name}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                    Container: <strong style={{ color: colors.textPrimary }}>{c.container_name}</strong>
                    &nbsp;·&nbsp;Namespace: <strong style={{ color: colors.info }}>{c.namespace}</strong>
                  </Typography>
                  {/* Flags */}
                  <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.75}>
                    {c.privileged    && <Chip label="privileged=true"  size="small" sx={{ bgcolor: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}`, fontSize: 10 }} />}
                    {c.host_pid      && <Chip label="hostPID=true"      size="small" sx={{ bgcolor: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}`, fontSize: 10 }} />}
                    {c.host_ipc      && <Chip label="hostIPC=true"      size="small" sx={{ bgcolor: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}`, fontSize: 10 }} />}
                    {c.host_network  && <Chip label="hostNetwork=true"  size="small" sx={{ bgcolor: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}`, fontSize: 10 }} />}
                    {!c.readOnlyRootFilesystem && <Chip label="readOnly=false" size="small" sx={{ bgcolor: colors.infoBg, color: colors.info, border: `1px solid ${colors.info}`, fontSize: 10 }} />}
                  </Box>
                  <Typography variant="caption" sx={{ color: colors.danger, display: 'block', mt: 0.5 }}>
                    {c.justification}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Box mt={2} display="flex" gap={1}>
            <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
              sx={{ bgcolor: colors.danger, '&:hover': { bgcolor: colors.danger } }}>
              Remediate Critical ({criticals.length})
            </Button>
          </Box>
        </Paper>
      )}

      {/* NAMESPACE BREAKDOWN */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>Namespace Breakdown</Typography>
        <Stack spacing={1.5}>
          {nsBreakdown.map(([ns, counts]) => (
            <Box key={ns}
              onClick={() => setNsFilter(ns === nsFilter ? 'all' : ns)}
              sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
                p: 1.5, borderRadius: 1, border: `1px solid ${nsFilter === ns ? colors.info : colors.border}`,
                bgcolor: nsFilter === ns ? colors.infoBg : 'transparent',
                '&:hover': { bgcolor: colors.surfaceAlt } }}>
              <Typography variant="body2" sx={{ minWidth: 200, color: colors.textPrimary, fontFamily: 'monospace', fontSize: 12 }}>
                {ns}
              </Typography>
              <LinearProgress variant="determinate"
                value={(counts.total / allContainers.length) * 100}
                sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: colors.border,
                  '& .MuiLinearProgress-bar': {
                    bgcolor: counts.critical > 0 ? colors.danger : counts.high > 0 ? colors.warning : colors.info
                  }
                }} />
              <Box display="flex" gap={0.5}>
                {counts.critical > 0 && (
                  <Chip label={`${counts.critical}C`} size="small" sx={{ bgcolor: colors.dangerBg, color: colors.danger, fontSize: 10, fontWeight: 700 }} />
                )}
                {counts.high > 0 && (
                  <Chip label={`${counts.high}H`} size="small" sx={{ bgcolor: colors.warningBg, color: colors.warning, fontSize: 10, fontWeight: 700 }} />
                )}
                {counts.medium > 0 && (
                  <Chip label={`${counts.medium}M`} size="small" sx={{ bgcolor: colors.infoBg, color: colors.info, fontSize: 10, fontWeight: 700 }} />
                )}
              </Box>
              <Typography variant="body2" sx={{ color: colors.textSecondary, minWidth: 40, textAlign: 'right' }}>
                {counts.total} pod{counts.total !== 1 ? 's' : ''}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      {/* SECURITY CONTEXT MATRIX */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        {/* Toolbar */}
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Security Context Matrix ({filtered.length})
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: colors.danger }} />
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>Dangerous</Typography>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: colors.success, ml: 1 }} />
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>Secure</Typography>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: colors.surfaceHover, ml: 1 }} />
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>Not set</Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <TextField size="small" placeholder="Search pod / container…"
              value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: colors.textSecondary, fontSize: 18 }} /></InputAdornment>,
                sx: { bgcolor: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 1,
                  '& input': { color: colors.textPrimary }, fontSize: 13 }
              }}
              sx={{ minWidth: 190 }} variant="outlined" />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                sx={{ bgcolor: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 1, fontSize: 13 }}>
                <MenuItem value="all">All Risks</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <Select value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                sx={{ bgcolor: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 1, fontSize: 13 }}>
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
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, minWidth: 180 }}>Pod</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border }}>Container</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border }}>Namespace</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border }}>Risk</TableCell>
                {MATRIX_CHECKS.map(({ key, label, tip }) => (
                  <Tooltip key={key} title={tip} arrow placement="top">
                    <TableCell sx={{ fontWeight: 700, fontSize: 10, color: colors.textSecondary, bgcolor: colors.surfaceAlt,
                      borderColor: colors.border, textAlign: 'center', minWidth: 70, cursor: 'help' }}>
                      {label} <InfoIcon sx={{ fontSize: 10, verticalAlign: 'middle', opacity: 0.5 }} />
                    </TableCell>
                  </Tooltip>
                ))}
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((c: any, i: number) => {
                const risk = (c.risk_level ?? 'medium').toLowerCase();
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border,
                      fontFamily: 'monospace', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={c.pod_name} arrow>
                        <span>{c.pod_name}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>{c.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, borderColor: colors.border }}>
                      <Chip label={c.namespace} size="small"
                        sx={{ bgcolor: colors.surfaceAlt, color: colors.textSecondary, fontSize: 10, border: `1px solid ${colors.border}` }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Chip label={risk.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[risk] ?? colors.dangerBg, color: SEV_COLOR[risk] ?? colors.danger,
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
                        <TableCell key={key} sx={{ textAlign: 'center', borderColor: colors.border }}>
                          <Tooltip title={val === null || val === undefined ? 'Not configured' : String(val)} arrow>
                            <Box sx={{ width: 14, height: 14, borderRadius: '50%', mx: 'auto',
                              bgcolor: isNull ? colors.surfaceHover : isDangerous ? colors.danger : colors.success,
                              border: isNull ? 'none' : `1px solid ${isDangerous ? `${colors.danger}80` : `${colors.success}80`}` }} />
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ borderColor: colors.border }}>
                      <Button size="small" variant="contained"
                        onClick={() => navigate('/auto-remediation-security')}
                        sx={{ fontSize: 10, py: 0.5, bgcolor: risk === 'critical' ? colors.danger : colors.warning,
                          '&:hover': { bgcolor: risk === 'critical' ? colors.danger : colors.warning } }}>
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
            <Typography sx={{ color: colors.textSecondary }}>No containers match the current filters.</Typography>
          </Box>
        )}
      </Paper>

      {/* Footer actions */}
      <Box display="flex" gap={1} mt={3}>
        <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
          sx={{ bgcolor: colors.danger, '&:hover': { bgcolor: colors.danger } }}>
          Fix All ({allContainers.length})
        </Button>
        <Button variant="outlined" onClick={() => navigate('/root-containers')}
          sx={{ borderColor: colors.info, color: colors.info }}>
          View Root Containers
        </Button>
        <Button variant="outlined" onClick={() => navigate('/runtime-security')}
          sx={{ borderColor: colors.textSecondary, color: colors.textSecondary }}>
          Runtime Security
        </Button>
      </Box>
    </Box>
  );
};

export default PrivilegedContainers;
// Made with Bob
