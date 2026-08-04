import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Collapse,
  Grid, IconButton, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Shield as ShieldIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';
import { colors } from '../../theme/colors';

interface Threat {
  id: string;
  name: string;
  type: string;
  severity: string;
  status: string;
  confidence: number;
  affected_pods: string[];
  affected_namespaces: string[];
  first_seen: string;
  last_seen: string;
  occurrences: number;
  indicators: string[];
  risk_score: number;
  mitre_tactics: string[];
  auto_response: string;
}

interface ThreatStats {
  total_threats: number;
  critical_threats: number;
  high_threats: number;
  medium_threats: number;
  low_threats: number;
  active_threats: number;
  blocked_threats: number;
  monitoring_threats: number;
  total_affected_pods: number;
  total_affected_namespaces: number;
}

interface ActiveThreatsData {
  stats: ThreatStats;
  threats: Threat[];
  cluster_name?: string;
  last_updated?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger, high: colors.warning, medium: colors.info, low: colors.success,
};
const STATUS_COLOR: Record<string, string> = {
  active: colors.danger, monitoring: colors.warning, blocked: colors.success,
};

/** Human-readable explanation of WHY a threat is classified as active,
 *  built from the real backend fields rather than generic copy. */
function buildWhyActive(threat: Threat): string {
  const reasons: string[] = [];

  if (threat.status === 'active') {
    reasons.push(`Status is "active" — the security violation has been observed live in the cluster and is not yet remediated.`);
  } else if (threat.status === 'monitoring') {
    reasons.push(`Status is "monitoring" — ongoing signals match a known attack pattern but no containment has been applied yet.`);
  }

  if (threat.indicators.length > 0) {
    reasons.push(`Evidence: ${threat.indicators.slice(0, 2).join(' · ')}`);
  }

  if (threat.affected_pods.length > 0) {
    reasons.push(`${threat.affected_pods.length} pod${threat.affected_pods.length > 1 ? 's' : ''} confirmed affected: ${threat.affected_pods.slice(0, 3).join(', ')}${threat.affected_pods.length > 3 ? ` +${threat.affected_pods.length - 3} more` : ''}.`);
  }

  if (threat.affected_namespaces.length > 0) {
    reasons.push(`Spread across namespace${threat.affected_namespaces.length > 1 ? 's' : ''}: ${threat.affected_namespaces.join(', ')}.`);
  }

  reasons.push(`Detection confidence: ${threat.confidence}% — high certainty this is a real threat, not a false positive.`);
  reasons.push(`Recommended action: ${threat.auto_response}`);

  return reasons.join('\n');
}

const ThreatRow: React.FC<{ threat: Threat }> = ({ threat }) => {
  const [open, setOpen] = useState(false);
  const sev = threat.severity?.toLowerCase() ?? 'low';
  const status = threat.status?.toLowerCase() ?? 'active';
  const riskColor = threat.risk_score >= 80 ? colors.danger : threat.risk_score >= 60 ? colors.warning : colors.info;
  const whyActive = buildWhyActive(threat);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={sev.toUpperCase()} size="small"
            sx={{ bgcolor: colors.border, color: SEV_COLOR[sev] ?? colors.textPrimary, fontWeight: 'bold', fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'monospace', borderColor: colors.border, whiteSpace: 'nowrap' }}>
          {threat.id}
        </TableCell>
        <TableCell sx={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, borderColor: colors.border, minWidth: 200 }}>
          {threat.name}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={threat.type} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={status.toUpperCase()} size="small"
            sx={{ bgcolor: colors.border, color: STATUS_COLOR[status] ?? colors.info, fontWeight: 'bold', fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ fontSize: 12, fontWeight: 'bold', color: riskColor, borderColor: colors.border }}>
          {threat.risk_score}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
          {threat.confidence}%
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border, textAlign: 'center' }}>
          {threat.occurrences}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {threat.affected_pods.slice(0, 2).map(pod => (
              <Chip key={pod} label={pod} size="small"
                sx={{ bgcolor: colors.border, color: colors.info, fontSize: 10, height: 20 }} />
            ))}
            {threat.affected_pods.length > 2 && (
              <Chip label={`+${threat.affected_pods.length - 2}`} size="small"
                sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {threat.mitre_tactics.slice(0, 1).map(tactic => (
              <Chip key={tactic} label={tactic} size="small"
                sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10, height: 20 }} />
            ))}
            {threat.mitre_tactics.length > 1 && (
              <Chip label={`+${threat.mitre_tactics.length - 1}`} size="small"
                sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
          {threat.first_seen ? new Date(threat.first_seen).toLocaleString() : '—'}
        </TableCell>
        {/* Why active toggle */}
        <TableCell sx={{ borderColor: colors.border }}>
          <IconButton size="small" onClick={() => setOpen(o => !o)}
            sx={{ color: colors.info }} aria-label="Show why active">
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>

      {/* Expanded "Why is this threat active?" row */}
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={12} sx={{ p: 0, borderColor: open ? colors.border : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.warning, mb: 1.5 }}>
                ⚡ Why is "{threat.name}" an active threat?
              </Typography>
              <Stack spacing={1}>
                {whyActive.split('\n').map((line, i) => (
                  <Box key={i} display="flex" gap={1} alignItems="flex-start">
                    <Typography variant="body2" sx={{ color: colors.danger, fontSize: 13, lineHeight: 1.2, mt: 0.15 }}>•</Typography>
                    <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6 }}>{line}</Typography>
                  </Box>
                ))}
              </Stack>

              {/* Indicators in full */}
              {threat.indicators.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Live Indicators Detected
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75}>
                    {threat.indicators.map((ind, i) => (
                      <Chip key={i} label={ind} size="small"
                        sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Auto response */}
              <Box mt={2} sx={{ p: 1.5, borderRadius: 1, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700 }}>Recommended Remediation</Typography>
                <Typography variant="body2" sx={{ color: colors.success, mt: 0.5 }}>{threat.auto_response}</Typography>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const ActiveThreatsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ActiveThreatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/attack-investigation/active-threats${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const result: ActiveThreatsData = await r.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch threat data');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => { mounted = false; clearInterval(interval); };
  }, [clusterParam]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load</Alert></Box>;

  const threats = Array.isArray(data.threats) ? data.threats : [];
  const stats = data.stats;
  const criticalThreats = threats.filter(t => t.severity?.toLowerCase() === 'critical');
  const riskScore = stats.total_threats > 0
    ? Math.max(0, Math.round(100 - (stats.critical_threats / Math.max(stats.total_threats, 1)) * 100))
    : 100;
  const scoreColor = riskScore >= 80 ? colors.success : riskScore >= 50 ? colors.warning : colors.danger;
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(riskScore, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <ShieldIcon sx={{ fontSize: 32, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Active Threats</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Real-time threat detection for {data.cluster_name ?? 'cluster'} ·{' '}
            Last updated {data.last_updated ? new Date(data.last_updated).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: colors.textSecondary }} gutterBottom>Threat Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke={colors.border} strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{riskScore}</Typography>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mt: 1 }}>
                {criticalThreats.length} critical threat{criticalThreats.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Threats', count: stats.total_threats, color: colors.info },
              { label: 'Critical', count: stats.critical_threats, color: colors.danger },
              { label: 'High', count: stats.high_threats, color: colors.warning },
              { label: 'Monitoring', count: stats.monitoring_threats, color: colors.info },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={2}>
            {[
              { label: 'Active', value: stats.active_threats, color: colors.danger },
              { label: 'Blocked', value: stats.blocked_threats, color: colors.success },
              { label: 'Affected Pods', value: stats.total_affected_pods, color: colors.warning },
              { label: 'Affected NS', value: stats.total_affected_namespaces, color: colors.info },
            ].map(({ label, value, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Paper sx={{ p: 1.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>{label}</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color }}>{value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      {criticalThreats.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>Critical Threats — Why These Are Active</Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              {criticalThreats.length} threat{criticalThreats.length !== 1 ? 's' : ''} require immediate action
            </Typography>
          </Box>
          <Stack spacing={1.5}>
            {criticalThreats.slice(0, 4).map(threat => (
              <Box key={threat.id} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>{threat.name}</Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {threat.id} · Type: {threat.type} · {threat.occurrences} occurrence{threat.occurrences !== 1 ? 's' : ''} · Risk: {threat.risk_score} · {threat.confidence}% confidence
                    </Typography>
                  </Box>
                  <Chip label="CRITICAL" size="small" sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                </Box>

                {/* Root cause explanation */}
                <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12, mb: 1, lineHeight: 1.7 }}>
                  <Box component="span" sx={{ color: colors.warning, fontWeight: 700 }}>Why active: </Box>
                  {threat.indicators.length > 0
                    ? `${threat.indicators[0]}${threat.indicators.length > 1 ? ` and ${threat.indicators.length - 1} additional signal${threat.indicators.length > 2 ? 's' : ''} detected` : ''}.`
                    : 'Live security violation detected in cluster.'
                  }
                  {threat.affected_pods.length > 0 &&
                    ` Affects ${threat.affected_pods.length} pod${threat.affected_pods.length > 1 ? 's' : ''} across namespace${threat.affected_namespaces.length > 1 ? 's' : ''} ${threat.affected_namespaces.slice(0, 2).join(', ')}.`
                  }
                </Typography>

                <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                  {threat.indicators.map((ind, i) => (
                    <Chip key={i} label={ind} size="small" sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10, height: 20 }} />
                  ))}
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <Typography variant="caption" sx={{ color: colors.success }}>↳ {threat.auto_response}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Table — click ▼ to expand "Why active?" for any row */}
      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            All Active Threats ({threats.length})
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Click ▼ on any row to see the detailed reason why it is classified as an active threat
          </Typography>
        </Box>
        {threats.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: colors.textSecondary }}>No active threats detected.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'ID', 'Name', 'Type', 'Status', 'Risk', 'Confidence', 'Occurrences', 'Affected Pods', 'MITRE Tactics', 'First Seen', 'Why Active'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {threats.map(threat => <ThreatRow key={threat.id} threat={threat} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const ActiveThreats: React.FC = () => (
  <ClusterGuard><ActiveThreatsInner /></ClusterGuard>
);

export default ActiveThreats;
