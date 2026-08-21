import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors } from '../../theme/colors';

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
  if (score >= 80) return colors.danger;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.info;
  return colors.success;
}

function statusColor(status: string) {
  if (status === 'investigating') return colors.danger;
  if (status === 'monitoring') return colors.warning;
  return colors.textSecondary;
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

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/insider-threat${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: InsiderThreatResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insider threat data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const threats = useMemo(() => data?.threats ?? [], [data]);
  const investigating = useMemo(() => threats.filter((t) => t.status === 'investigating').length, [threats]);
  const defaultSAThreats = useMemo(() => threats.filter((t) => t.user.startsWith('default@')).length, [threats]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load insider threat data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <InsiderIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Insider Threat Detection
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real service-account threat signals for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'High Risk Identities', value: data.high_risk_users, color: data.high_risk_users > 0 ? colors.danger : colors.success },
          { label: 'Total Alerts', value: data.total_alerts, color: colors.info },
          { label: 'Under Investigation', value: investigating, color: investigating > 0 ? colors.danger : colors.success },
          { label: 'Default SA Namespaces', value: defaultSAThreats, color: defaultSAThreats > 0 ? colors.warning : colors.success },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Why these threats matter */}
      {threats.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Why these identities are insider-threat risks
          </Typography>
          <Stack spacing={1.5}>
            {threats.map((threat) => (
              <Box key={threat.id} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary, fontFamily: 'monospace' }}>
                      {threat.user}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {threat.user_type} · First detected {formatTimestamp(threat.first_detected)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip label={threat.id} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
                    <Chip label={threat.status} size="small" sx={{ bgcolor: colors.border, color: statusColor(threat.status), fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={`Risk ${threat.risk_score}`} size="small" sx={{ bgcolor: colors.border, color: riskColor(threat.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(threat).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
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
      <Paper sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
          Insider Threat Actors
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['ID', 'Identity', 'Type', 'Risk Score', 'Status', 'Pods / Actions', 'Data Scope', 'Last Activity', 'Anomalies', 'Suspicious Activities'].map((header) => (
                <TableCell key={header} sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {threats.map((threat) => (
              <TableRow key={threat.id} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={threat.id} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontFamily: 'monospace', fontWeight: 700, minWidth: 180, fontSize: 12 }}>
                  {threat.user}
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={threat.user_type} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={String(threat.risk_score)} size="small" sx={{ bgcolor: colors.border, color: riskColor(threat.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={threat.status} size="small" sx={{ bgcolor: colors.border, color: statusColor(threat.status), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontWeight: 700 }}>{threat.actions_taken}</TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Chip label={threat.data_accessed} size="small" sx={{ bgcolor: colors.border, color: threat.data_accessed === 'host-level' ? colors.danger : colors.warning, fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 145 }}>{formatTimestamp(threat.last_activity)}</TableCell>
                <TableCell sx={{ borderColor: colors.border }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {threat.anomalies.map((anomaly) => (
                      <Chip key={anomaly} label={anomaly} size="small" sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10, height: 20 }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell sx={{ borderColor: colors.border, minWidth: 260 }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {threat.suspicious_activities.slice(0, 2).map((activity) => (
                      <Chip key={activity} label={activity} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10, height: 20 }} />
                    ))}
                    {threat.suspicious_activities.length > 2 && (
                      <Chip label={`+${threat.suspicious_activities.length - 2}`} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />
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
