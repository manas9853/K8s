import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Divider, LinearProgress, Stack, Tooltip, IconButton
} from '@mui/material';
import {
  Security as SecurityIcon, Warning as WarningIcon, Error as ErrorIcon,
  CheckCircle as CheckCircleIcon, Shield as ShieldIcon, BugReport as BugIcon,
  Lock as LockIcon, AccountTree as AccountTreeIcon, NetworkCheck as NetworkIcon,
  Refresh as RefreshIcon, ArrowForward as ArrowForwardIcon, FiberManualRecord as DotIcon,
  Bolt as BoltIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const SEV_COLORS: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#1976d2', low: '#388e3c', info: '#757575'
};
const SEV_BG: Record<string, string> = {
  critical: '#fdecea', high: '#fff3e0', medium: '#e3f2fd', low: '#e8f5e9', info: '#f5f5f5'
};

interface SecurityScore {
  overall_score: number; grade: string; vulnerability_score: number;
  compliance_score: number; configuration_score: number;
  network_security_score: number; rbac_score: number;
  total_vulnerabilities: number; critical_vulnerabilities: number;
  high_vulnerabilities: number;
}

interface SecurityAlert {
  id: string; severity: string; title: string; description: string;
  affected_resource: string; namespace: string; detected_at: string; status: string;
  remediation?: string;
}

interface CommandCenterData {
  security_score: SecurityScore; alerts: SecurityAlert[];
  total_alerts: number; critical_alerts: number; high_alerts: number;
  medium_alerts: number; low_alerts: number; clusters_monitored: number;
  namespaces_monitored: number; pods_scanned: number; last_scan: string;
}

// Toxic combination: two+ risk factors on same resource
const TOXIC_COMBOS = [
  { id: 'tc1', title: 'Public + Privileged Container', resources: ['checkout-api', 'ingress-nginx'], severity: 'critical', description: 'Container is publicly exposed AND running with privileged access. Attacker can reach cluster root.', fix: '/privileged-containers' },
  { id: 'tc2', title: 'Root Container + No Network Policy', resources: ['analytics-worker'], severity: 'critical', description: 'Container runs as root with no network policy — lateral movement is trivial after compromise.', fix: '/root-containers' },
  { id: 'tc3', title: 'Cluster-Admin SA + Exposed Service', resources: ['dashboard-proxy'], severity: 'high', description: 'Service account has cluster-admin RBAC and the pod is reachable from the internet.', fix: '/cluster-admin-review' },
  { id: 'tc4', title: 'Critical CVE + No Patch', resources: ['payment-api', 'auth-service'], severity: 'high', description: 'Images carry unpatched critical CVEs and have been running unchanged for >30 days.', fix: '/cve-dashboard' },
  { id: 'tc5', title: 'Secret Not Rotated + External Exposure', resources: ['db-connector'], severity: 'high', description: 'Database secret has not been rotated in 180+ days and the service has external network access.', fix: '/secret-rotation' },
];

const POSTURE_AREAS = [
  { label: 'Vulnerabilities', path: '/cve-dashboard', icon: <BugIcon fontSize="small" />, scoreKey: 'vulnerability_score' },
  { label: 'Compliance',      path: '/compliance/dashboard', icon: <ShieldIcon fontSize="small" />, scoreKey: 'compliance_score' },
  { label: 'Configuration',   path: '/runtime-security', icon: <SecurityIcon fontSize="small" />, scoreKey: 'configuration_score' },
  { label: 'Network',         path: '/network-policies-security', icon: <NetworkIcon fontSize="small" />, scoreKey: 'network_security_score' },
  { label: 'RBAC',            path: '/excessive-permissions', icon: <LockIcon fontSize="small" />, scoreKey: 'rbac_score' },
];

const ScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 100 }) => {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 80 ? '#388e3c' : score >= 60 ? '#f57c00' : '#d32f2f';
  const dash = (score / 100) * circ;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e0e0e0" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <Typography variant="h5" fontWeight="bold" sx={{ color, lineHeight: 1 }}>{score}</Typography>
        <Typography variant="caption" color="text.secondary">/ 100</Typography>
      </Box>
    </Box>
  );
};

const MiniBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 80 ? 'success' : value >= 60 ? 'warning' : 'error';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress variant="determinate" value={value} color={color}
        sx={{ flex: 1, height: 6, borderRadius: 3 }} />
      <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 30 }}>{value?.toFixed(0)}%</Typography>
    </Box>
  );
};

const SecurityCommandCenter: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/command-center${clusterParam}`);
      setData(await res.json()); setError(null);
    } catch { setError('Failed to fetch security data'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (error || !data) return <Box p={3}><Alert severity="error">{error || 'No data available'}</Alert></Box>;

  const ss = data.security_score;
  const topAlerts = [...data.alerts].sort((a, b) => {
    const o: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (o[a.severity] ?? 4) - (o[b.severity] ?? 4);
  }).slice(0, 8);

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <ShieldIcon sx={{ fontSize: 36, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">Security Command Center</Typography>
            <Typography variant="caption" color="text.secondary">
              Last scan: {new Date(data.last_scan).toLocaleString()} &nbsp;·&nbsp;
              {data.clusters_monitored} cluster{data.clusters_monitored !== 1 ? 's' : ''} &nbsp;·&nbsp;
              {data.pods_scanned} pods scanned
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh now">
          <IconButton onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* TOP ROW: Score + Posture + Quick stats */}
      <Grid container spacing={2} mb={3}>

        {/* Security Posture Score */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', border: '1px solid', borderColor: ss.overall_score < 60 ? 'error.light' : ss.overall_score < 80 ? 'warning.light' : 'success.light' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Security Posture</Typography>
              <ScoreGauge score={ss.overall_score} size={110} />
              <Chip label={`Grade ${ss.grade}`} size="small"
                sx={{ mt: 1.5, fontWeight: 'bold', bgcolor: ss.overall_score >= 80 ? '#e8f5e9' : ss.overall_score >= 60 ? '#fff3e0' : '#fdecea',
                  color: ss.overall_score >= 80 ? '#388e3c' : ss.overall_score >= 60 ? '#f57c00' : '#d32f2f' }} />
            </CardContent>
          </Card>
        </Grid>

        {/* Alert Counts */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Open Issues</Typography>
              <Stack spacing={1} mt={1}>
                {[
                  { label: 'Critical', count: data.critical_alerts, color: '#d32f2f', bg: '#fdecea' },
                  { label: 'High',     count: data.high_alerts,     color: '#f57c00', bg: '#fff3e0' },
                  { label: 'Medium',   count: data.medium_alerts,   color: '#1976d2', bg: '#e3f2fd' },
                  { label: 'Low',      count: data.low_alerts,      color: '#388e3c', bg: '#e8f5e9' },
                ].map(({ label, count, color, bg }) => (
                  <Box key={label} display="flex" alignItems="center" justifyContent="space-between"
                    sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: bg }}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <DotIcon sx={{ fontSize: 10, color }} />
                      <Typography variant="body2" fontWeight="medium" sx={{ color }}>{label}</Typography>
                    </Box>
                    <Typography variant="h6" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Posture Breakdown */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Posture by Area</Typography>
              <Stack spacing={1.5} mt={1}>
                {POSTURE_AREAS.map((area) => {
                  const val = ss[area.scoreKey as keyof SecurityScore] as number ?? 0;
                  return (
                    <Box key={area.label} display="flex" alignItems="center" gap={1.5}>
                      <Box sx={{ color: 'text.secondary', minWidth: 20 }}>{area.icon}</Box>
                      <Typography variant="body2" sx={{ minWidth: 110 }}>{area.label}</Typography>
                      <Box flex={1}><MiniBar value={val} /></Box>
                      <Tooltip title={`Go to ${area.label}`}>
                        <IconButton size="small" onClick={() => navigate(area.path)} sx={{ p: 0.25 }}>
                          <ArrowForwardIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* TOXIC COMBINATIONS — Wiz.io key differentiator */}
      <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #fce4ec', bgcolor: '#fff8f8' }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <BoltIcon sx={{ color: '#d32f2f' }} />
          <Typography variant="h6" fontWeight="bold" color="error.dark">Toxic Combinations</Typography>
          <Chip label={`${TOXIC_COMBOS.filter(t => t.severity === 'critical').length} Critical`} size="small" color="error" sx={{ ml: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            Multiple risk factors on the same resource — highest real-world impact
          </Typography>
        </Box>
        <Grid container spacing={2}>
          {TOXIC_COMBOS.map((combo) => (
            <Grid item xs={12} md={6} lg={4} key={combo.id}>
              <Box sx={{
                p: 2, borderRadius: 2, border: '1px solid',
                borderColor: combo.severity === 'critical' ? '#ef9a9a' : '#ffcc80',
                bgcolor: combo.severity === 'critical' ? '#fdecea' : '#fff8e1'
              }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={0.5}>
                  <Typography variant="subtitle2" fontWeight="bold">{combo.title}</Typography>
                  <Chip label={combo.severity.toUpperCase()} size="small"
                    sx={{ bgcolor: SEV_COLORS[combo.severity], color: '#fff', fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  {combo.description}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5} mb={1.5}>
                  {combo.resources.map(r => (
                    <Chip key={r} label={r} size="small" variant="outlined"
                      sx={{ fontSize: 10, borderColor: SEV_COLORS[combo.severity], color: SEV_COLORS[combo.severity] }} />
                  ))}
                </Box>
                <Button size="small" variant="outlined" color={combo.severity === 'critical' ? 'error' : 'warning'}
                  onClick={() => navigate(combo.fix)} endIcon={<ArrowForwardIcon />} sx={{ fontSize: 11 }}>
                  Investigate
                </Button>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* VULNERABILITY QUICK STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fdecea', border: '1px solid #ef9a9a' }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="caption" color="error.dark">Critical CVEs</Typography>
              <Typography variant="h4" color="error.dark" fontWeight="bold">{ss.critical_vulnerabilities}</Typography>
              <Button size="small" sx={{ p: 0, fontSize: 11, color: 'error.dark', mt: 0.5 }} onClick={() => navigate('/cve-dashboard')}>
                View all →
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#fff3e0', border: '1px solid #ffcc80' }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="caption" color="warning.dark">High CVEs</Typography>
              <Typography variant="h4" color="warning.dark" fontWeight="bold">{ss.high_vulnerabilities}</Typography>
              <Button size="small" sx={{ p: 0, fontSize: 11, color: 'warning.dark', mt: 0.5 }} onClick={() => navigate('/cve-dashboard')}>
                View all →
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#e8eaf6', border: '1px solid #9fa8da' }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">Total Vulnerabilities</Typography>
              <Typography variant="h4" fontWeight="bold">{ss.total_vulnerabilities}</Typography>
              <Button size="small" sx={{ p: 0, fontSize: 11, mt: 0.5 }} onClick={() => navigate('/cve-dashboard')}>
                View all →
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ bgcolor: '#e3f2fd', border: '1px solid #90caf9' }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="caption" color="primary.dark">Pods Scanned</Typography>
              <Typography variant="h4" color="primary.dark" fontWeight="bold">{data.pods_scanned}</Typography>
              <Typography variant="caption" color="text.secondary">{data.namespaces_monitored} namespaces</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* TOP ALERTS FEED */}
      <Paper sx={{ p: 2.5 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight="bold">Live Security Alerts</Typography>
          <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/attack-investigation/active-threats')}>
            View all threats
          </Button>
        </Box>
        {topAlerts.length === 0 ? (
          <Alert severity="success" icon={<CheckCircleIcon />}>No active security alerts. Your cluster posture is healthy.</Alert>
        ) : (
          <Stack spacing={1}>
            {topAlerts.map((alert) => (
              <Box key={alert.id} sx={{
                display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 1.5,
                border: '1px solid', borderColor: '#e0e0e0',
                bgcolor: SEV_BG[alert.severity] ?? '#fff',
                '&:hover': { bgcolor: '#f5f5f5' }
              }}>
                <DotIcon sx={{ fontSize: 12, color: SEV_COLORS[alert.severity] ?? '#757575', flexShrink: 0 }} />
                <Chip label={alert.severity.toUpperCase()} size="small"
                  sx={{ bgcolor: SEV_COLORS[alert.severity], color: '#fff', fontWeight: 'bold', fontSize: 10, minWidth: 60 }} />
                <Box flex={1} minWidth={0}>
                  <Typography variant="body2" fontWeight="bold" noWrap>{alert.title}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {alert.affected_resource} · {alert.namespace} · {new Date(alert.detected_at).toLocaleTimeString()}
                  </Typography>
                </Box>
                <Chip label={alert.status} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                {alert.remediation && (
                  <Tooltip title={alert.remediation}>
                    <Button size="small" variant="contained" color="error" sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      Fix Now
                    </Button>
                  </Tooltip>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      {/* QUICK NAV */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Quick Access</Typography>
        <Box display="flex" flexWrap="wrap" gap={1}>
          {[
            { label: 'CVE Dashboard', path: '/cve-dashboard' },
            { label: 'Runtime Security', path: '/runtime-security' },
            { label: 'Privileged Containers', path: '/privileged-containers' },
            { label: 'Secret Exposure', path: '/secret-exposure' },
            { label: 'RBAC Analysis', path: '/excessive-permissions' },
            { label: 'Network Policies', path: '/network-policies-security' },
            { label: 'Drift Detection', path: '/drift-alerts' },
            { label: 'Attack Investigation', path: '/attack-investigation/incident-center' },
          ].map(({ label, path }) => (
            <Button key={path} size="small" variant="outlined" onClick={() => navigate(path)} sx={{ fontSize: 12 }}>
              {label}
            </Button>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default SecurityCommandCenter;
// Made with Bob
