import React, { useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Visibility as InsiderIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface InsiderThreatRecord {
  id: string;
  user: string;
  user_type: string;
  risk_score: number;
  status: string;
  suspicious_activities: string[];
  last_activity: string;
  first_detected: string;
  actions_taken: number;
  data_accessed: string;
  anomalies: string[];
}

interface InsiderThreatResponse {
  high_risk_users: number;
  total_alerts: number;
  threats: InsiderThreatRecord[];
  cluster_name?: string;
  last_updated?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function riskColor(score: number) {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
}

function statusColor(status: string) {
  if (status === 'investigating') return '#ef5350';
  if (status === 'monitoring') return '#ffa726';
  return '#8892a4';
}

function buildReason(threat: InsiderThreatRecord): string[] {
  const reasons: string[] = [];
  const namespace = threat.user.includes('@') ? threat.user.split('@')[1] : '';

  if (threat.user_type === 'service_account' && threat.user.startsWith('default@')) {
    reasons.push(
      `The default service account is being shared across ${threat.actions_taken} pod${threat.actions_taken > 1 ? 's' : ''} in namespace ${namespace}. ` +
      'Shared identities mean a compromise of any one pod grants the attacker the same Kubernetes API privileges as all other pods using that account.'
    );
    reasons.push(
      `The service account token is auto-mounted into every pod in the namespace. An insider or compromised workload ` +
      `can use this token to query the Kubernetes API, read secrets, or pivot to other namespaces.`
    );
    reasons.push(
      `The backend detected this pattern from ${formatTimestamp(threat.first_detected)}, indicating long-term default SA usage rather than a short-lived misconfiguration.`
    );
  }

  if (threat.status === 'investigating') {
    reasons.push(
      'This identity is flagged for active investigation because it corresponds to a service account running ' +
      'a privileged workload that has direct host-level access.'
    );
  }

  if (threat.data_accessed === 'host-level') {
    reasons.push(
      'Data access level is host-level. This means the workload identity can reach beyond namespace boundaries to interact directly with the underlying node.'
    );
  } else if (threat.data_accessed === 'namespace-wide') {
    reasons.push(
      `Data access scope is namespace-wide, meaning the shared token can read any resource in the ${namespace} namespace including Secrets and ConfigMaps.`
    );
  }

  if (threat.suspicious_activities.length > 0) {
    reasons.push(`Backend suspicious activity signals: ${threat.suspicious_activities.slice(0, 3).join(' · ')}.`);
  }

  reasons.push(`Risk score is ${threat.risk_score} and status is ${threat.status}.`);
  return reasons;
}

const InsiderThreatInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<InsiderThreatResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/insider-threat${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: InsiderThreatResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load insider threat data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

  const threats = useMemo(() => data?.threats ?? [], [data]);
  const investigating = useMemo(() => threats.filter((t) => t.status === 'investigating').length, [threats]);
  const defaultSAThreats = useMemo(() => threats.filter((t) => t.user.startsWith('default@')).length, [threats]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load insider threat data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <InsiderIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Insider Threat Detection
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real service-account threat signals for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'High Risk Identities', value: data.high_risk_users, color: data.high_risk_users > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Total Alerts', value: data.total_alerts, color: '#90caf9' },
          { label: 'Under Investigation', value: investigating, color: investigating > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Default SA Namespaces', value: defaultSAThreats, color: defaultSAThreats > 0 ? '#ffa726' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Why these threats matter */}
      {threats.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these identities are insider-threat risks
          </Typography>
          <Stack spacing={1.5}>
            {threats.map((threat) => (
              <Box key={threat.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0', fontFamily: 'monospace' }}>
                      {threat.user}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {threat.user_type} · First detected {formatTimestamp(threat.first_detected)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip label={threat.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                    <Chip label={threat.status} size="small" sx={{ bgcolor: '#2a3245', color: statusColor(threat.status), fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={`Risk ${threat.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(threat.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(threat).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Full table */}
      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Insider Threat Actors
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['ID', 'Identity', 'Type', 'Risk Score', 'Status', 'Pods / Actions', 'Data Scope', 'Last Activity', 'Anomalies', 'Suspicious Activities'].map((header) => (
                <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {threats.map((threat) => (
              <TableRow key={threat.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={threat.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontFamily: 'monospace', fontWeight: 700, minWidth: 180, fontSize: 12 }}>
                  {threat.user}
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={threat.user_type} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={String(threat.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(threat.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={threat.status} size="small" sx={{ bgcolor: '#2a3245', color: statusColor(threat.status), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontWeight: 700 }}>{threat.actions_taken}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={threat.data_accessed} size="small" sx={{ bgcolor: '#2a3245', color: threat.data_accessed === 'host-level' ? '#ef5350' : '#ffa726', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 145 }}>{formatTimestamp(threat.last_activity)}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {threat.anomalies.map((anomaly) => (
                      <Chip key={anomaly} label={anomaly} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20 }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245', minWidth: 260 }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {threat.suspicious_activities.slice(0, 2).map((activity) => (
                      <Chip key={activity} label={activity} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
                    ))}
                    {threat.suspicious_activities.length > 2 && (
                      <Chip label={`+${threat.suspicious_activities.length - 2}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

const InsiderThreat: React.FC = () => (
  <ClusterGuard>
    <InsiderThreatInner />
  </ClusterGuard>
);

export default InsiderThreat;
