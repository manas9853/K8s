import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterState from '../components/NoClusterState';
import {
  Alert,
  Box,
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
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  SwapHoriz as TrafficIcon,
  Lock as RestrictedIcon,
  LockOpen as UnrestrictedIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface TrafficFlow {
  source_namespace: string;
  target_namespace: string;
  is_restricted: boolean;
  risk_level: 'low' | 'medium' | 'high';
  connection_count: number;
  protocols: string[];
  has_network_policy: boolean;
  recommendation: string;
}

interface EastWestData {
  east_west_score: number;
  total_traffic_flows: number;
  restricted_flows: number;
  unrestricted_flows: number;
  traffic_flows: TrafficFlow[];
  recommendations: string[];
  namespaces_analyzed?: number;
  last_scan?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: colors.danger,
  medium: colors.warning,
  low: colors.success,
};

const EastWestTraffic: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters } = useCluster();
  const [data, setData] = useState<EastWestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/v1/security/network-security/east-west-traffic${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: EastWestData = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load east-west traffic data');
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
        <Alert severity="error">Failed to load east-west traffic data</Alert>
      </Box>
    );
  }

  const flows = Array.isArray(data.traffic_flows) ? data.traffic_flows : [];
  const highRiskFlows = flows.filter((flow) => flow.risk_level === 'high');
  const score = data.east_west_score ?? 0;
  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.danger;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(score, 100) / 100) * circumference;

  if (clusters.length === 0) return <NoClusterState />;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <TrafficIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            East-West Traffic
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Real namespace exposure view · {data.namespaces_analyzed ?? 0} namespaces analysed · Last scan{' '}
            {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>
                East-West Score
              </Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={radius} fill="none" stroke={colors.border} strokeWidth={11} />
                  <circle
                    cx={65}
                    cy={65}
                    r={radius}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth={11}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeLinecap="round"
                    transform="rotate(-90 65 65)"
                  />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>
                    {score}
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                    / 100
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mt: 1 }}>
                {highRiskFlows.length} high-risk flow{highRiskFlows.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Flows', count: data.total_traffic_flows ?? 0, color: colors.info },
              { label: 'Restricted', count: data.restricted_flows ?? 0, color: colors.success },
              { label: 'Unrestricted', count: data.unrestricted_flows ?? 0, color: colors.danger },
              { label: 'High Risk', count: highRiskFlows.length, color: colors.danger },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>
                      {count}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
            <Paper sx={{ p: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                {data.recommendations[0]}
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {highRiskFlows.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Unrestricted Cross-Namespace Flows
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {highRiskFlows.length} flows need immediate policy review
            </Typography>
          </Box>
          <Stack spacing={1}>
            {highRiskFlows.slice(0, 5).map((flow, index) => (
              <Box key={`${flow.source_namespace}-${flow.target_namespace}-${index}`} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {flow.source_namespace} → {flow.target_namespace}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {flow.connection_count.toLocaleString()} observed connections · {flow.protocols.join(', ') || 'N/A'}
                    </Typography>
                  </Box>
                  <Chip
                    label="HIGH"
                    size="small"
                    sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: 11, mt: 1 }}>
                  {flow.recommendation}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Flow Analysis ({flows.length})
          </Typography>
        </Box>
        {flows.length === 0 ? (
          <Box p={4}>
            <Paper
              elevation={0}
              sx={{
                maxWidth: 640,
                mx: 'auto',
                textAlign: 'center',
                p: 4,
                border: `1px solid ${colors.border}`,
                borderRadius: 2,
                bgcolor: colors.surfaceAlt,
              }}
            >
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ color: colors.textPrimary }}>
                No east-west traffic flows were generated from the latest scan
              </Typography>
              <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.7, mb: 2 }}>
                This view only produces flow records when the backend finds namespaces running pods with
                host network access. The current scan analysed {data.namespaces_analyzed ?? 0} namespaces but
                did not find any source namespace that matched that condition.
              </Typography>
              <Stack spacing={1} alignItems="center">
                {(data.recommendations || []).slice(0, 2).map((recommendation, index) => (
                  <Typography key={index} variant="body2" sx={{ color: colors.info }}>
                    • {recommendation}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Source Namespace', 'Target Namespace', 'Connections', 'Protocols', 'Policy State', 'Risk', 'Recommendation'].map((heading) => (
                    <TableCell
                      key={heading}
                      sx={{
                        fontWeight: 700,
                        fontSize: 12,
                        color: colors.textSecondary,
                        bgcolor: colors.surfaceAlt,
                        borderColor: colors.border,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {flows.slice(0, 100).map((flow, index) => {
                  const severityColor = SEVERITY_COLOR[flow.risk_level] ?? colors.info;
                  return (
                    <TableRow key={`${flow.source_namespace}-${flow.target_namespace}-${index}`} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
                        {flow.source_namespace}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
                        {flow.target_namespace}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
                        {flow.connection_count.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Box display="flex" flexWrap="wrap" gap={0.5}>
                          {flow.protocols.map((protocol) => (
                            <Chip
                              key={protocol}
                              label={protocol}
                              size="small"
                              sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10, height: 20 }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          {flow.has_network_policy ? (
                            <RestrictedIcon sx={{ fontSize: 16, color: colors.success }} />
                          ) : (
                            <UnrestrictedIcon sx={{ fontSize: 16, color: colors.danger }} />
                          )}
                          <Typography variant="caption" sx={{ color: flow.has_network_policy ? colors.success : colors.danger }}>
                            {flow.has_network_policy ? 'Restricted' : 'None'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Chip
                          label={flow.risk_level.toUpperCase()}
                          size="small"
                          sx={{ bgcolor: colors.border, color: severityColor, fontWeight: 'bold', fontSize: 10 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, maxWidth: 260 }}>
                        {flow.recommendation}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
        <Paper sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Recommended Actions
          </Typography>
          <Stack spacing={1}>
            {data.recommendations.map((recommendation, index) => (
              <Typography key={index} variant="body2" sx={{ color: colors.textSecondary }}>
                • {recommendation}
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
};

export default EastWestTraffic;
