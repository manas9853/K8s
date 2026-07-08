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
  critical: '#ef5350', high: '#ffa726', medium: '#90caf9', low: '#a5d6a7',
};
const STATUS_COLOR: Record<string, string> = {
  active: '#ef5350', monitoring: '#ffa726', blocked: '#a5d6a7',
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
  const riskColor = threat.risk_score >= 80 ? '#ef5350' : threat.risk_score >= 60 ? '#ffa726' : '#90caf9';
  const whyActive = buildWhyActive(threat);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={sev.toUpperCase()} size="small"
            sx={{ bgcolor: '#2a3245', color: SEV_COLOR[sev] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: '#8892a4', fontFamily: 'monospace', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
          {threat.id}
        </TableCell>
        <TableCell sx={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0', borderColor: '#2a3245', minWidth: 200 }}>
          {threat.name}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={threat.type} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={status.toUpperCase()} size="small"
            sx={{ bgcolor: '#2a3245', color: STATUS_COLOR[status] ?? '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ fontSize: 12, fontWeight: 'bold', color: riskColor, borderColor: '#2a3245' }}>
          {threat.risk_score}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
          {threat.confidence}%
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245', textAlign: 'center' }}>
          {threat.occurrences}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {threat.affected_pods.slice(0, 2).map(pod => (
              <Chip key={pod} label={pod} size="small"
                sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
            ))}
            {threat.affected_pods.length > 2 && (
              <Chip label={`+${threat.affected_pods.length - 2}`} size="small"
                sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {threat.mitre_tactics.slice(0, 1).map(tactic => (
              <Chip key={tactic} label={tactic} size="small"
                sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20 }} />
            ))}
            {threat.mitre_tactics.length > 1 && (
              <Chip label={`+${threat.mitre_tactics.length - 1}`} size="small"
                sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
          {threat.first_seen ? new Date(threat.first_seen).toLocaleString() : '—'}
        </TableCell>
        {/* Why active toggle */}
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <IconButton size="small" onClick={() => setOpen(o => !o)}
            sx={{ color: '#90caf9' }} aria-label="Show why active">
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>

      {/* Expanded "Why is this threat active?" row */}
      <TableRow sx={{ bgcolor: '#131d2e' }}>
        <TableCell colSpan={12} sx={{ p: 0, borderColor: open ? '#2a3245' : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#ffa726', mb: 1.5 }}>
                ⚡ Why is "{threat.name}" an active threat?
              </Typography>
              <Stack spacing={1}>
                {whyActive.split('\n').map((line, i) => (
                  <Box key={i} display="flex" gap={1} alignItems="flex-start">
                    <Typography variant="body2" sx={{ color: '#ef5350', fontSize: 13, lineHeight: 1.2, mt: 0.15 }}>•</Typography>
                    <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 13, lineHeight: 1.6 }}>{line}</Typography>
                  </Box>
                ))}
              </Stack>

              {/* Indicators in full */}
              {threat.indicators.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Live Indicators Detected
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75}>
                    {threat.indicators.map((ind, i) => (
                      <Chip key={i} label={ind} size="small"
                        sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Auto response */}
              <Box mt={2} sx={{ p: 1.5, borderRadius: 1, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700 }}>Recommended Remediation</Typography>
                <Typography variant="body2" sx={{ color: '#a5d6a7', mt: 0.5 }}>{threat.auto_response}</Typography>
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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">Failed to load</Alert></Box>;

  const threats = Array.isArray(data.threats) ? data.threats : [];
  const stats = data.stats;
  const criticalThreats = threats.filter(t => t.severity?.toLowerCase() === 'critical');
  const riskScore = stats.total_threats > 0
    ? Math.max(0, Math.round(100 - (stats.critical_threats / Math.max(stats.total_threats, 1)) * 100))
    : 100;
  const scoreColor = riskScore >= 80 ? '#a5d6a7' : riskScore >= 50 ? '#ffa726' : '#ef5350';
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(riskScore, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <ShieldIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Active Threats</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real-time threat detection for {data.cluster_name ?? 'cluster'} ·{' '}
            Last updated {data.last_updated ? new Date(data.last_updated).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Threat Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{riskScore}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {criticalThreats.length} critical threat{criticalThreats.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Threats', count: stats.total_threats, color: '#90caf9' },
              { label: 'Critical', count: stats.critical_threats, color: '#ef5350' },
              { label: 'High', count: stats.high_threats, color: '#ffa726' },
              { label: 'Monitoring', count: stats.monitoring_threats, color: '#90caf9' },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={2}>
            {[
              { label: 'Active', value: stats.active_threats, color: '#ef5350' },
              { label: 'Blocked', value: stats.blocked_threats, color: '#a5d6a7' },
              { label: 'Affected Pods', value: stats.total_affected_pods, color: '#ffa726' },
              { label: 'Affected NS', value: stats.total_affected_namespaces, color: '#90caf9' },
            ].map(({ label, value, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Paper sx={{ p: 1.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>{label}</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color }}>{value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      {criticalThreats.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Critical Threats — Why These Are Active</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              {criticalThreats.length} threat{criticalThreats.length !== 1 ? 's' : ''} require immediate action
            </Typography>
          </Box>
          <Stack spacing={1.5}>
            {criticalThreats.slice(0, 4).map(threat => (
              <Box key={threat.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{threat.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {threat.id} · Type: {threat.type} · {threat.occurrences} occurrence{threat.occurrences !== 1 ? 's' : ''} · Risk: {threat.risk_score} · {threat.confidence}% confidence
                    </Typography>
                  </Box>
                  <Chip label="CRITICAL" size="small" sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </Box>

                {/* Root cause explanation */}
                <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12, mb: 1, lineHeight: 1.7 }}>
                  <Box component="span" sx={{ color: '#ffa726', fontWeight: 700 }}>Why active: </Box>
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
                    <Chip key={i} label={ind} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20 }} />
                  ))}
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <Typography variant="caption" sx={{ color: '#a5d6a7' }}>↳ {threat.auto_response}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Table — click ▼ to expand "Why active?" for any row */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Active Threats ({threats.length})
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Click ▼ on any row to see the detailed reason why it is classified as an active threat
          </Typography>
        </Box>
        {threats.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No active threats detected.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'ID', 'Name', 'Type', 'Status', 'Risk', 'Confidence', 'Occurrences', 'Affected Pods', 'MITRE Tactics', 'First Seen', 'Why Active'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{h}</TableCell>
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
