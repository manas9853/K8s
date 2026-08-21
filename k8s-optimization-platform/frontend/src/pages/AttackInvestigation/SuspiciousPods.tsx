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
  Collapse,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Block as BlockIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';
import { colors } from '../../theme/colors';

interface SuspiciousPod {
  pod_name: string;
  namespace: string;
  node_ip: string;
  suspicious_indicators: string[];
  risk_score: number;
  first_detected: string;
  status: string;
  anomalies: string[];
  image: string;
  service_account: string;
}

interface SuspiciousPodsResponse {
  total_suspicious: number;
  critical: number;
  high: number;
  medium: number;
  suspicious_pods: SuspiciousPod[];
  cluster_name?: string;
  last_updated?: string;
}

const RISK_COLOR = (score: number) => {
  if (score >= 80) return colors.danger;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.info;
  return colors.success;
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildReason(pod: SuspiciousPod) {
  const reasons: string[] = [];

  if (pod.suspicious_indicators.length > 0) {
    reasons.push(`The backend marked this pod suspicious because it detected: ${pod.suspicious_indicators.slice(0, 3).join(' · ')}.`);
  }

  if (pod.anomalies.length > 0) {
    reasons.push(`High-impact anomalies were present: ${pod.anomalies.join(' · ')}.`);
  }

  if (pod.service_account === 'default') {
    reasons.push('It is using the default service account, which increases the risk of overly broad permissions.');
  }

  reasons.push(`Current risk score is ${pod.risk_score}, so the pod is classified as ${pod.status}.`);
  return reasons;
}

const PodRow: React.FC<{ pod: SuspiciousPod }> = ({ pod }) => {
  const [open, setOpen] = useState(false);
  const riskColor = RISK_COLOR(pod.risk_score);
  const reasons = buildReason(pod);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
        <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontWeight: 600 }}>{pod.pod_name}</TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border }}>{pod.namespace}</TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace' }}>{pod.node_ip || 'N/A'}</TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, maxWidth: 220 }}>{pod.image || 'N/A'}</TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border }}>{pod.service_account || 'N/A'}</TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={String(pod.risk_score)} size="small" sx={{ bgcolor: colors.border, color: riskColor, fontWeight: 'bold' }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={pod.status.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: pod.status === 'active' ? colors.danger : colors.warning, fontWeight: 'bold' }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {pod.suspicious_indicators.slice(0, 2).map((indicator) => (
              <Chip key={indicator} label={indicator} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10, height: 20 }} />
            ))}
            {pod.suspicious_indicators.length > 2 && <Chip label={`+${pod.suspicious_indicators.length - 2}`} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <IconButton size="small" onClick={() => setOpen((value) => !value)} sx={{ color: colors.info }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={9} sx={{ p: 0, borderColor: open ? colors.border : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.warning, mb: 1.5 }}>
                Why this pod is suspicious
              </Typography>
              <Stack spacing={1}>
                {reasons.map((reason) => (
                  <Typography key={reason} variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                    • {reason}
                  </Typography>
                ))}
              </Stack>

              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ p: 1.5, bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.75 }}>
                      All Indicators
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                      {pod.suspicious_indicators.map((indicator) => (
                        <Chip key={indicator} label={indicator} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
                      ))}
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ p: 1.5, bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.75 }}>
                      All Anomalies
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                      {pod.anomalies.length > 0 ? pod.anomalies.map((anomaly) => (
                        <Chip key={anomaly} label={anomaly} size="small" sx={{ bgcolor: colors.border, color: colors.danger, fontSize: 10 }} />
                      )) : <Typography variant="body2" sx={{ color: colors.textSecondary }}>No high-impact anomaly tags</Typography>}
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <IconButton size="small" sx={{ color: colors.info }}><VisibilityIcon fontSize="small" /></IconButton>
                <IconButton size="small" sx={{ color: colors.warning }}><BlockIcon fontSize="small" /></IconButton>
                <IconButton size="small" sx={{ color: colors.danger }}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const SuspiciousPodsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SuspiciousPodsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuspiciousPods = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-pods${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: SuspiciousPodsResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suspicious pods');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchSuspiciousPods(true);
    const interval = setInterval(() => fetchSuspiciousPods(false), 120000);
    return () => clearInterval(interval);
  }, [fetchSuspiciousPods]);

  const pods = useMemo(() => (Array.isArray(data?.suspicious_pods) ? data!.suspicious_pods : []), [data]);
  const highRiskPods = useMemo(() => pods.filter((pod) => pod.risk_score >= 60), [pods]);

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
        <Alert severity="error">Failed to load suspicious pods</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Suspicious Pods
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real threat-hunting output for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchSuspiciousPods(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Suspicious', value: data.total_suspicious, color: colors.danger },
          { label: 'Critical', value: data.critical, color: colors.danger },
          { label: 'High', value: data.high, color: colors.warning },
          { label: 'Medium', value: data.medium, color: colors.info },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {highRiskPods.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            High-Risk Pods — Why They Were Flagged
          </Typography>
          <Stack spacing={1.5}>
            {highRiskPods.slice(0, 4).map((pod) => (
              <Box key={`${pod.namespace}-${pod.pod_name}`} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                  {pod.pod_name}
                </Typography>
                <Typography variant="body2" sx={{ color: colors.textMuted, mt: 0.5, lineHeight: 1.7 }}>
                  {buildReason(pod)[0]} {buildReason(pod)[1] || ''}
                </Typography>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                  Namespace {pod.namespace} · Service account {pod.service_account} · Node {pod.node_ip || 'N/A'}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Detected Suspicious Pods ({pods.length})
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Showing all real fields returned by the backend. Expand a row for the full reason and all indicator data.
          </Typography>
        </Box>
        {pods.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>
              No suspicious pods found.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Pod Name', 'Namespace', 'Node IP', 'Image', 'Service Account', 'Risk Score', 'Status', 'Indicators', 'Details'].map((heading) => (
                    <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pods.map((pod) => <PodRow key={`${pod.namespace}-${pod.pod_name}`} pod={pod} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const SuspiciousPods: React.FC = () => (
  <ClusterGuard>
    <SuspiciousPodsInner />
  </ClusterGuard>
);

export default SuspiciousPods;
