import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, TextField, InputAdornment, Stack, Tooltip, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  BugReport as BugIcon, Search as SearchIcon, CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon, ArrowForward as ArrowForwardIcon, Warning as WarningIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface CVEItem {
  cve_id: string; severity: string; cvss_score: number; title: string; description: string;
  affected_images: string[]; affected_pods: string[]; namespace: string;
  cluster: string; published_date: string; patch_available: boolean; remediation?: string;
}

interface CVEDashboardData {
  cves: CVEItem[]; total_cves: number; critical_cves: number; high_cves: number;
  medium_cves: number; low_cves: number; patchable_cves: number;
  unpatchable_cves: number; last_scan: string;
}

const SEV: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fdecea', color: '#d32f2f' },
  high:     { bg: '#fff3e0', color: '#f57c00' },
  medium:   { bg: '#e3f2fd', color: '#1976d2' },
  low:      { bg: '#e8f5e9', color: '#388e3c' },
};

const CVSSDot: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 9 ? '#d32f2f' : score >= 7 ? '#f57c00' : score >= 4 ? '#1976d2' : '#388e3c';
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
      <Typography variant="body2" fontWeight="bold" sx={{ color }}>{score?.toFixed(1)}</Typography>
    </Box>
  );
};

// Blast radius: estimate resource impact from CVE
const blastRadius = (cve: CVEItem) => {
  const pods = cve.affected_pods?.length ?? 0;
  const images = cve.affected_images?.length ?? 0;
  if (pods > 5 || images > 3) return { label: 'Wide', color: '#d32f2f' };
  if (pods > 2 || images > 1) return { label: 'Medium', color: '#f57c00' };
  return { label: 'Narrow', color: '#388e3c' };
};

const CVEDashboard: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<CVEDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sevFilter, setSevFilter] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 300000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/cve-dashboard${clusterParam}`);
      setData(await res.json()); setError(null);
    } catch { setError('Failed to fetch CVE data'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (error || !data) return <Box p={3}><Alert severity="error">{error || 'No data available'}</Alert></Box>;

  const filtered = data.cves.filter(c => {
    const matchText = !searchTerm ||
      c.cve_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSev = !sevFilter || c.severity.toLowerCase() === sevFilter;
    return matchText && matchSev;
  });

  const patchPct = data.total_cves > 0 ? Math.round((data.patchable_cves / data.total_cves) * 100) : 0;

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <BugIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">CVE Dashboard</Typography>
          <Typography variant="caption" color="text.secondary">
            Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Critical', count: data.critical_cves, sub: 'Immediate action', ...SEV.critical },
          { label: 'High',     count: data.high_cves,     sub: 'Patch this week',   ...SEV.high },
          { label: 'Medium',   count: data.medium_cves,   sub: 'Plan remediation',  ...SEV.medium },
          { label: 'Low',      count: data.low_cves,      sub: 'Monitor',           ...SEV.low },
          { label: 'Patchable', count: data.patchable_cves, sub: `${patchPct}% of total`, bg: '#f3e5f5', color: '#6a1b9a' },
        ].map(({ label, count, sub, bg, color }) => (
          <Grid item xs={6} md={2.4} key={label}>
            <Card sx={{ bgcolor: bg, border: `1px solid ${color}30`, cursor: 'pointer',
              '&:hover': { boxShadow: 3 } }} onClick={() => setSevFilter(label.toLowerCase() === 'patchable' ? null : label.toLowerCase())}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                <Typography variant="caption" sx={{ color: `${color}cc` }}>{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* CRITICAL CVEs SPOTLIGHT */}
      {data.cves.filter(c => c.severity === 'critical').length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <WarningIcon sx={{ color: '#d32f2f' }} />
            <Typography variant="h6" fontWeight="bold" color="error.dark">Critical CVE Spotlight</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Highest CVSS · widest blast radius</Typography>
          </Box>
          <Stack spacing={1.5}>
            {data.cves.filter(c => c.severity === 'critical').slice(0, 3).map((cve) => {
              const br = blastRadius(cve);
              return (
                <Box key={cve.cve_id} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2' }}>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="subtitle2" fontWeight="bold" color="error.dark">{cve.cve_id}</Typography>
                        <CVSSDot score={cve.cvss_score} />
                        <Chip label={`Blast: ${br.label}`} size="small"
                          sx={{ fontSize: 10, bgcolor: `${br.color}18`, color: br.color, fontWeight: 'bold' }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{cve.title}</Typography>
                    </Box>
                    <Box display="flex" gap={1} flexShrink={0}>
                      {cve.patch_available ? (
                        <Button size="small" variant="contained" color="error"
                          onClick={() => navigate('/patch-recommendations')} sx={{ fontSize: 11 }}>
                          Patch Now
                        </Button>
                      ) : (
                        <Chip label="No patch" size="small" color="default" sx={{ fontSize: 10 }} />
                      )}
                    </Box>
                  </Box>
                  <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                    <Typography variant="caption" color="text.secondary">Affected:</Typography>
                    {cve.affected_pods.slice(0, 4).map(p => (
                      <Chip key={p} label={p} size="small" variant="outlined" sx={{ fontSize: 10, borderColor: '#ef9a9a', color: '#c62828' }} />
                    ))}
                    {cve.affected_pods.length > 4 && (
                      <Chip label={`+${cve.affected_pods.length - 4} more`} size="small" sx={{ fontSize: 10 }} />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* FILTER + SEARCH */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField size="small" placeholder="Search CVEs…" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 240 }} />
          <Box display="flex" gap={1}>
            {[null, 'critical', 'high', 'medium', 'low'].map(s => (
              <Button key={s ?? 'all'} size="small"
                variant={sevFilter === s ? 'contained' : 'outlined'}
                color={s === 'critical' ? 'error' : s === 'high' ? 'warning' : 'primary'}
                onClick={() => setSevFilter(s)}
                sx={{ fontSize: 11, textTransform: 'capitalize' }}>
                {s ?? 'All'}
              </Button>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {filtered.length} / {data.total_cves} CVEs
          </Typography>
        </Box>
      </Paper>

      {/* CVE TABLE */}
      <Paper sx={{ p: 0 }}>
        {filtered.length === 0 ? (
          <Box p={3}><Alert severity="success" icon={<CheckCircleIcon />}>No CVEs match the current filter.</Alert></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  {['CVE ID', 'Severity', 'CVSS', 'Title', 'Affected Pods', 'Blast Radius', 'Namespace', 'Patch'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.slice(0, 50).map((cve) => {
                  const br = blastRadius(cve);
                  const sev = SEV[cve.severity] ?? SEV.low;
                  return (
                    <TableRow key={cve.cve_id} hover>
                      <TableCell sx={{ fontWeight: 700, fontSize: 12, color: sev.color }}>{cve.cve_id}</TableCell>
                      <TableCell>
                        <Chip label={cve.severity.toUpperCase()} size="small"
                          sx={{ bgcolor: sev.bg, color: sev.color, fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell><CVSSDot score={cve.cvss_score} /></TableCell>
                      <TableCell>
                        <Tooltip title={cve.description}><Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>{cve.title}</Typography></Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip label={cve.affected_pods.length} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontWeight="bold" sx={{ color: br.color }}>{br.label}</Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{cve.namespace}</TableCell>
                      <TableCell>
                        {cve.patch_available ? (
                          <Tooltip title={cve.remediation}>
                            <CheckCircleIcon color="success" fontSize="small" />
                          </Tooltip>
                        ) : (
                          <CancelIcon color="error" fontSize="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default CVEDashboard;
// Made with Bob
