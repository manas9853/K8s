import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
  Security as SecurityIcon, Error as ErrorIcon,
  Block as BlockIcon, ArrowForward as ArrowIcon
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
  'Privileged Execution':       { tactic: 'Privilege Escalation', technique: 'Exploitation for Privilege Escalation', id: 'T1068' },
  'Root User Execution':        { tactic: 'Privilege Escalation', technique: 'Abuse Elevation Control Mechanism',     id: 'T1548' },
  'Privilege Escalation Risk':  { tactic: 'Privilege Escalation', technique: 'Setuid/Setgid',                        id: 'T1548.001' },
  'Writable Root Filesystem':   { tactic: 'Persistence',         technique: 'Server Software Component',             id: 'T1505' },
  'Unbounded Resource Usage':   { tactic: 'Impact',              technique: 'Resource Hijacking',                     id: 'T1496' },
  'Memory Pressure':            { tactic: 'Impact',              technique: 'Endpoint Denial of Service',             id: 'T1499' },
};

const SEV_COLOR: Record<string, string> = { critical: '#f87171', high: '#f59e0b', medium: '#60a5fa', low: '#4ade80' };
const SEV_BG:    Record<string, string> = { critical: '#2d1515',  high: '#2d200a',  medium: '#0d1f3c',  low: '#0d2d1a' };

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

  const scoreColor = data.runtime_score >= 90 ? '#4ade80' : data.runtime_score >= 70 ? '#f59e0b' : '#f87171';
  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(data.runtime_score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 36, color: '#60a5fa' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Runtime Security</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Live threat detection · {data.containers_monitored} containers monitored · Last scan {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + SEVERITY BREAKDOWN */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Runtime Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{data.runtime_score}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Chip label={data.total_threats > 0 ? `${data.total_threats} Active Threats` : 'Clean'}
                size="small" sx={{ mt: 1,
                  bgcolor: data.total_threats > 0 ? '#2d1515' : '#0d2d1a',
                  color:   data.total_threats > 0 ? '#f87171' : '#4ade80',
                  fontWeight: 'bold' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={9}>
          <Card sx={{ height: '100%', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Threat Distribution</Typography>
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
                      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: SEV_BG[lbl], border: `1px solid ${SEV_COLOR[lbl]}40`, textAlign: 'center' }}>
                        <Typography variant="h4" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{count}</Typography>
                        <Typography variant="caption" fontWeight="bold" sx={{ color: SEV_COLOR[lbl] }}>{label}</Typography>
                        <Typography variant="caption" display="block" sx={{ color: '#8892a4' }}>{sub}</Typography>
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
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #f87171', bgcolor: '#2d1515' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: '#f87171' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#f87171' }}>Active Critical Threats</Typography>
          </Box>
          <Stack spacing={1.5}>
            {data.runtime_threats.filter(t => t.severity === 'critical').map((threat) => {
              const mitre = MITRE_MAP[threat.threat_type] ?? null;
              return (
                <Box key={threat.id} sx={{ p: 2, borderRadius: 1.5, bgcolor: '#1a1010', border: '1px solid #f8717140' }}>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#f87171', color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{threat.threat_type}</Typography>
                        {mitre && (
                          <Chip label={`MITRE ${mitre.id}`} size="small" variant="outlined"
                            sx={{ fontSize: 10, borderColor: '#a78bfa', color: '#a78bfa' }} />
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ color: '#8892a4', mt: 0.5 }}>
                        {threat.pod_name} / {threat.container_name} · {threat.namespace}
                      </Typography>
                      {mitre && (
                        <Typography variant="caption" sx={{ color: '#a78bfa' }}>
                          {mitre.tactic} → {mitre.technique}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained"
                        onClick={() => navigate('/auto-remediation-security')} startIcon={<BlockIcon />}
                        sx={{ fontSize: 11, bgcolor: '#f87171', '&:hover': { bgcolor: '#ef4444' } }}>
                        Remediate
                      </Button>
                    </Stack>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 0.5 }}>
                    {threat.details} · Fix: {threat.recommended_action}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* ALL THREATS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>All Runtime Threats</Typography>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/attack-investigation/active-threats')}
            sx={{ color: '#60a5fa' }}>
            Full Investigation
          </Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#131d2e' }}>
                {['Severity', 'Threat Type', 'Pod', 'Namespace', 'MITRE', 'Details', 'Fix'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.runtime_threats.map((t) => {
                const mitre = MITRE_MAP[t.threat_type];
                return (
                  <TableRow key={t.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={t.severity.toUpperCase()} size="small"
                        sx={{ bgcolor: SEV_BG[t.severity], color: SEV_COLOR[t.severity], fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245' }}>{t.threat_type}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{t.pod_name}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{t.namespace}</TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      {mitre ? (
                        <Tooltip title={`${mitre.tactic}: ${mitre.technique}`}>
                          <Chip label={mitre.id} size="small" variant="outlined"
                            sx={{ fontSize: 10, borderColor: '#a78bfa', color: '#a78bfa' }} />
                        </Tooltip>
                      ) : <Typography sx={{ color: '#8892a4', fontSize: 12 }}>—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 200 }}>
                      {t.details.substring(0, 60)}…
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Typography variant="caption" sx={{ color: '#60a5fa', fontSize: 10 }}>
                        {t.recommended_action.substring(0, 40)}…
                      </Typography>
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
