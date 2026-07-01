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

  // Security context matrix columns
  const MATRIX_CHECKS = ['privileged', 'allowPrivilegeEscalation', 'runAsRoot', 'readOnlyRootFilesystem', 'hostNetwork', 'hostPID'];

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Privileged Containers</Typography>
          <Typography variant="caption" color="text.secondary">
            Container privilege escalation risk · {containers.length} flagged · Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* STATS */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Privileged', count: data.total_privileged ?? containers.length, color: '#d32f2f', bg: '#fdecea' },
          { label: 'Critical Risk', count: criticals.length, color: '#d32f2f', bg: '#fdecea' },
          { label: 'With Host Access', count: containers.filter((c: any) => c.host_network || c.host_pid).length, color: '#f57c00', bg: '#fff3e0' },
          { label: 'Escape-Vulnerable', count: containers.filter((c: any) => c.privileged && c.externally_reachable).length, color: '#d32f2f', bg: '#fdecea' },
        ].map(({ label, count, color, bg }) => (
          <Grid item xs={6} md={3} key={label}>
            <Card sx={{ bgcolor: bg }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* RISK EXPLAINER — Wiz style context */}
      <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <WarningIcon sx={{ color: '#d32f2f' }} />
          <Typography variant="h6" fontWeight="bold" color="error.dark">Why Privileged Containers Are Critical</Typography>
        </Box>
        <Grid container spacing={2}>
          {[
            { label: 'Container Escape', desc: 'A privileged container can mount the host filesystem and escape to the underlying node.', severity: 'critical' },
            { label: 'Lateral Movement', desc: 'Once on the node, an attacker can access all pods running on that node.', severity: 'critical' },
            { label: 'Cluster Takeover', desc: 'With node access + service account token, cluster-admin access is often achievable.', severity: 'critical' },
          ].map(r => (
            <Grid item xs={12} md={4} key={r.label}>
              <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2' }}>
                <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#d32f2f', color: '#fff', fontWeight: 'bold', fontSize: 10, mb: 1 }} />
                <Typography variant="subtitle2" fontWeight="bold">{r.label}</Typography>
                <Typography variant="caption" color="text.secondary">{r.desc}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* SECURITY CONTEXT MATRIX */}
      <Paper sx={{ mb: 3 }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold">Security Context Matrix</Typography>
          <Typography variant="caption" color="text.secondary">
            Red = dangerous setting enabled · Green = secure · Grey = not set
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Container</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Namespace</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Risk</TableCell>
                {MATRIX_CHECKS.map(col => (
                  <TableCell key={col} sx={{ fontWeight: 700, fontSize: 10, maxWidth: 80 }}>{col}</TableCell>
                ))}
                <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {containers.slice(0, 30).map((c: any, i: number) => {
                const risk = (c.risk_level ?? 'high').toLowerCase();
                const riskColor = risk === 'critical' ? '#d32f2f' : risk === 'high' ? '#f57c00' : '#388e3c';
                const riskBg   = risk === 'critical' ? '#fdecea' : risk === 'high' ? '#fff3e0' : '#e8f5e9';
                return (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>{c.name ?? c.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{c.namespace}</TableCell>
                    <TableCell>
                      <Chip label={risk.toUpperCase()} size="small"
                        sx={{ bgcolor: riskBg, color: riskColor, fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    {MATRIX_CHECKS.map(col => {
                      const val = c[col] ?? c[col.toLowerCase()];
                      const isDangerous = col === 'readOnlyRootFilesystem' ? val === false : !!val;
                      return (
                        <TableCell key={col} sx={{ textAlign: 'center' }}>
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', mx: 'auto',
                            bgcolor: val === undefined || val === null ? '#e0e0e0' : isDangerous ? '#ef9a9a' : '#a5d6a7' }} />
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Button size="small" variant="contained" color="error"
                        onClick={() => navigate('/auto-remediation-security')} sx={{ fontSize: 11 }}>
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
        <Button variant="contained" color="error" onClick={() => navigate('/auto-remediation-security')}>
          Fix All Privileged Containers
        </Button>
        <Button variant="outlined" onClick={() => navigate('/root-containers')}>
          View Root Containers
        </Button>
      </Box>
    </Box>
  );
};

export default PrivilegedContainers;
// Made with Bob
