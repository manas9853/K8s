import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, LinearProgress, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Security as SecurityIcon, Warning as WarningIcon, Error as ErrorIcon,
  CheckCircle as CheckCircleIcon, Block as BlockIcon, ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface RuntimeThreat {
  id: string; severity: string; threat_type: string; pod_name: string;
  container_name: string; namespace: string; detected_at: string;
  status: string; details: string; recommended_action: string;
}
interface RuntimeSecurityData {
  runtime_score: number; total_threats: number; critical_threats: number;
  high_threats: number; medium_threats: number; low_threats: number;
  runtime_threats: RuntimeThreat[]; suspicious_processes: any[];
  containers_monitored: number; last_scan: string;
}

const MITRE_MAP: Record<string, { tactic: string; technique: string; id: string }> = {
  'Privileged Execution': { tactic: 'Privilege Escalation', technique: 'Exploitation for Privilege Escalation', id: 'T1068' },
  'Reverse Shell': { tactic: 'Command & Control', technique: 'Ingress Tool Transfer', id: 'T1105' },
  'Crypto Mining': { tactic: 'Impact', technique: 'Resource Hijacking', id: 'T1496' },
  'Suspicious Process': { tactic: 'Execution', technique: 'Command & Scripting Interpreter', id: 'T1059' },
  'File System Write': { tactic: 'Persistence', technique: 'Server Software Component', id: 'T1505' },
};

const SEV_COLOR: Record<string, string> = { critical: '#d32f2f', high: '#f57c00', medium: '#1976d2', low: '#388e3c' };
const SEV_BG:    Record<string, string> = { critical: '#fdecea', high: '#fff3e0', medium: '#e3f2fd', low: '#e8f5e9' };

const RuntimeSecurity: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<RuntimeSecurityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/container-security/runtime${clusterParam}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { /* keep previous data */ }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (!data) return <Alert severity="error">Failed to load runtime security data</Alert>;

  const scoreColor = data.runtime_score >= 90 ? '#388e3c' : data.runtime_score >= 70 ? '#f57c00' : '#d32f2f';
  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(data.runtime_score, 100) / 100) * circ;

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Runtime Security</Typography>
          <Typography variant="caption" color="text.secondary">
            Live threat detection · {data.containers_monitored} containers monitored · Last scan {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + SEVERITY BREAKDOWN */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Runtime Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#e0e0e0" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{data.runtime_score}</Typography>
                  <Typography variant="caption" color="text.secondary">/ 100</Typography>
                </Box>
              </Box>
              <Chip label={data.total_threats > 0 ? `${data.total_threats} Active Threats` : 'Clean'}
                size="small" sx={{ mt: 1, bgcolor: data.total_threats > 0 ? '#fdecea' : '#e8f5e9',
                  color: data.total_threats > 0 ? '#d32f2f' : '#388e3c', fontWeight: 'bold' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={9}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Threat Distribution</Typography>
              <Grid container spacing={1} mt={0.5}>
                {[
                  { label: 'Critical', count: data.critical_threats, sub: 'Quarantine immediately' },
                  { label: 'High',     count: data.high_threats,     sub: 'Investigate now' },
                  { label: 'Medium',   count: data.medium_threats,   sub: 'Review required' },
                  { label: 'Low',      count: data.low_threats,      sub: 'Monitor' },
                ].map(({ label, count, sub }) => {
                  const lbl = label.toLowerCase();
                  return (
                    <Grid item xs={6} md={3} key={label}>
                      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: SEV_BG[lbl], border: `1px solid ${SEV_COLOR[lbl]}30`, textAlign: 'center' }}>
                        <Typography variant="h4" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{count}</Typography>
                        <Typography variant="caption" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{label}</Typography>
                        <Typography variant="caption" display="block" color="text.secondary">{sub}</Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* CRITICAL THREATS SPOTLIGHT */}
      {data.runtime_threats.filter(t => t.severity === 'critical').length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#d32f2f' }} />
            <Typography variant="h6" fontWeight="bold" color="error.dark">Active Critical Threats</Typography>
          </Box>
          <Stack spacing={1.5}>
            {data.runtime_threats.filter(t => t.severity === 'critical').map((threat) => {
              const mitre = MITRE_MAP[threat.threat_type] ?? null;
              return (
                <Box key={threat.id} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2' }}>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#d32f2f', color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                        <Typography variant="subtitle2" fontWeight="bold">{threat.threat_type}</Typography>
                        {mitre && (
                          <Chip label={`MITRE ${mitre.id}`} size="small" variant="outlined"
                            sx={{ fontSize: 10, borderColor: '#9c27b0', color: '#7b1fa2' }} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" mt={0.5}>
                        {threat.pod_name} / {threat.container_name} · {threat.namespace}
                      </Typography>
                      {mitre && (
                        <Typography variant="caption" color="#7b1fa2">
                          {mitre.tactic} → {mitre.technique}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" color="error"
                        onClick={() => navigate('/attack-investigation/quarantine')} startIcon={<BlockIcon />} sx={{ fontSize: 11 }}>
                        Quarantine
                      </Button>
                      <Button size="small" variant="outlined" color="error"
                        onClick={() => navigate('/attack-investigation/kill-pod')} sx={{ fontSize: 11 }}>
                        Kill Pod
                      </Button>
                    </Stack>
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    {threat.details} · Recommended: {threat.recommended_action}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* ALL THREATS TABLE */}
      <Paper>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold">All Runtime Threats</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/attack-investigation/active-threats')}>
            Full Investigation
          </Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                {['Severity', 'Type', 'Pod', 'Container', 'Namespace', 'MITRE', 'Status', 'Detected', 'Action'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.runtime_threats.map((t) => {
                const mitre = MITRE_MAP[t.threat_type];
                return (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Chip label={t.severity.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[t.severity], color: SEV_COLOR[t.severity], fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{t.threat_type}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{t.pod_name}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{t.container_name}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{t.namespace}</TableCell>
                    <TableCell>
                      {mitre ? (
                        <Tooltip title={`${mitre.tactic}: ${mitre.technique}`}>
                          <Chip label={mitre.id} size="small" variant="outlined" sx={{ fontSize: 10, borderColor: '#9c27b0', color: '#7b1fa2' }} />
                        </Tooltip>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={t.status} size="small"
                        sx={{ bgcolor: t.status === 'active' ? '#fdecea' : t.status === 'investigating' ? '#fff3e0' : '#e8f5e9',
                          color: t.status === 'active' ? '#d32f2f' : t.status === 'investigating' ? '#f57c00' : '#388e3c', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#555' }}>{new Date(t.detected_at).toLocaleTimeString()}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{t.recommended_action}</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default RuntimeSecurity;
// Made with Bob
