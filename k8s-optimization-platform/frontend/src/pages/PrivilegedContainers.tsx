import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Security as SecurityIcon, Warning as WarningIcon, Block as BlockIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

const PrivilegedContainers: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/container-security/privileged${clusterParam}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const i = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/container-security/privileged${clusterParam}`)
        .then(r => r.json()).then(d => setData(d)).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  const containers: any[] = Array.isArray(data.privileged_containers) ? data.privileged_containers : [];
  const criticals = containers.filter((c: any) => (c.risk_level ?? '').toLowerCase() === 'critical');

  const MATRIX_CHECKS = ['privileged', 'allowPrivilegeEscalation', 'runAsRoot', 'readOnlyRootFilesystem', 'hostNetwork', 'hostPID'];

  const STAT_ROWS = [
    { label: 'Total Privileged', count: data.total_privileged ?? containers.length, color: '#f87171', bg: '#2d1515' },
    { label: 'Critical Risk', count: data.critical_risk ?? criticals.length, color: '#f87171', bg: '#2d1515' },
    { label: 'With Host Access', count: containers.filter((c: any) => c.host_network || c.host_pid).length, color: '#f59e0b', bg: '#2d200a' },
    { label: 'Escape-Vulnerable', count: containers.filter((c: any) => c.privileged && c.externally_reachable).length, color: '#f87171', bg: '#2d1515' },
  ];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Privileged Containers</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Container privilege escalation risk · {containers.length} flagged · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
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

      {/* RISK EXPLAINER */}
      <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <WarningIcon sx={{ color: '#f87171' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>Why Privileged Containers Are Critical</Typography>
        </Box>
        <Grid container spacing={2}>
          {[
            { label: 'Container Escape', desc: 'A privileged container can mount the host filesystem and escape to the underlying node.', severity: 'critical' },
            { label: 'Lateral Movement', desc: 'Once on the node, an attacker can access all pods running on that node.', severity: 'critical' },
            { label: 'Cluster Takeover', desc: 'With node access + service account token, cluster-admin access is often achievable.', severity: 'critical' },
          ].map(r => (
            <Grid item xs={12} md={4} key={r.label}>
              <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140' }}>
                <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#f87171', color: '#fff', fontWeight: 'bold', fontSize: 10, mb: 1 }} />
                <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{r.label}</Typography>
                <Typography variant="caption" sx={{ color: '#8892a4' }}>{r.desc}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* SECURITY CONTEXT MATRIX */}
      <Paper sx={{ mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Security Context Matrix</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Red = dangerous · Green = secure · Grey = not set
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#131d2e' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>Container</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>Namespace</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>Risk</TableCell>
                {MATRIX_CHECKS.map(col => (
                  <TableCell key={col} sx={{ fontWeight: 700, fontSize: 10, maxWidth: 80, color: '#8892a4', borderColor: '#2a3245' }}>{col}</TableCell>
                ))}
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {containers.slice(0, 30).map((c: any, i: number) => {
                const risk = (c.risk_level ?? 'high').toLowerCase();
                const riskColor = SEV_COLOR[risk] ?? '#f87171';
                const riskBg    = SEV_BG[risk] ?? '#2d1515';
                return (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>{c.name ?? c.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{c.namespace}</TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={risk.toUpperCase()} size="small"
                        sx={{ bgcolor: riskBg, color: riskColor, fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    {MATRIX_CHECKS.map(col => {
                      const val = c[col] ?? c[col.toLowerCase()];
                      const isDangerous = col === 'readOnlyRootFilesystem' ? val === false : !!val;
                      return (
                        <TableCell key={col} sx={{ textAlign: 'center', borderColor: '#2a3245' }}>
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', mx: 'auto',
                            bgcolor: val === undefined || val === null ? '#3a3a4a' : isDangerous ? '#f87171' : '#4ade80' }} />
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Button size="small" variant="contained"
                        onClick={() => navigate('/auto-remediation-security')}
                        sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                        Fix
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box display="flex" gap={1}>
        <Button variant="contained" onClick={() => navigate('/auto-remediation-security')}
          sx={{ bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
          Fix All Privileged Containers
        </Button>
        <Button variant="outlined" onClick={() => navigate('/root-containers')}
          sx={{ borderColor: '#60a5fa', color: '#60a5fa' }}>
          View Root Containers
        </Button>
      </Box>
    </Box>
  );
};

export default PrivilegedContainers;
// Made with Bob
