import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface DriftItem {
  resource_type: string;
  resource_name: string;
  namespace: string;
  drift_type: string;
  severity: string;
  detected_at: string;
  baseline_value: string;
  current_value: string;
  auto_remediation_available: boolean;
  recommendation: string;
}

interface BaselineData {
  drift_score: number;
  total_resources: number;
  drift_detected: number;
  critical_drift: number;
  high_drift: number;
  medium_drift: number;
  low_drift: number;
  drift_items: DriftItem[];
  baseline_last_updated?: string;
  recommendation?: string;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef5350', high: '#ffa726', medium: '#90caf9', low: '#a5d6a7',
};

const BaselineComparisonInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<BaselineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/security/drift-detection/baseline${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: BaselineData = await r.json();
        if (!mounted) return;
        setData(d);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData(true);
    const id = setInterval(() => fetchData(false), 120000);
    return () => { mounted = false; clearInterval(id); };
  }, [clusterParam]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">Failed to load baseline data</Alert></Box>;

  const driftItems = Array.isArray(data.drift_items) ? data.drift_items : [];
  const critical = driftItems.filter(d => d.severity === 'critical');
  const score = data.drift_score ?? 0;
  const scoreColor = score >= 80 ? '#a5d6a7' : score >= 50 ? '#ffa726' : '#ef5350';
  const r = 54, circ = 2 * Math.PI * r, dash = (Math.min(score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CompareIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Baseline Comparison</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Security baseline vs current configuration · {data.total_resources ?? 0} resources ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE RING + STATS */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>Drift Score</Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{score}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {critical.length} critical drift item{critical.length !== 1 ? 's' : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2} mb={2}>
            {[
              { label: 'Total Detected',  count: data.drift_detected ?? 0, color: '#90caf9' },
              { label: 'Critical',        count: data.critical_drift ?? 0, color: '#ef5350' },
              { label: 'High',            count: data.high_drift ?? 0,     color: '#ffa726' },
              { label: 'Medium',          count: data.medium_drift ?? 0,   color: '#90caf9' },
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
          {data.recommendation && (
            <Paper sx={{ p: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>{data.recommendation}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* CRITICAL SPOTLIGHT */}
      {critical.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Critical Drift Items</Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              {critical.length} item{critical.length !== 1 ? 's' : ''} need immediate attention
            </Typography>
          </Box>
          <Stack spacing={1.5}>
            {critical.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>{item.drift_type}</Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {item.resource_name} · {item.namespace}
                    </Typography>
                  </Box>
                  <Chip label="CRITICAL" size="small"
                    sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', display: 'block' }}>Baseline</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: '#a5d6a7' }}>
                      {item.baseline_value}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#8892a4', alignSelf: 'center' }}>→</Typography>
                  <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', display: 'block' }}>Current</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontWeight="bold" sx={{ color: '#ef5350' }}>
                      {item.current_value}
                    </Typography>
                  </Box>
                </Box>
                {item.recommendation && (
                  <Typography variant="body2" sx={{ color: '#8892a4', fontSize: 11, mt: 1 }}>
                    ↳ {item.recommendation}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* FULL DRIFT TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Drift Items ({driftItems.length})
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: '#90caf9', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate('/drift-alerts')}
          >
            View Drift Alerts →
          </Typography>
        </Box>
        {driftItems.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No drift detected. Configuration matches baseline.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Severity', 'Drift Type', 'Resource', 'Namespace', 'Baseline', 'Current', 'Auto-Fix', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {driftItems.slice(0, 100).map((d, i) => {
                  const sev = (d.severity ?? 'low').toLowerCase();
                  return (
                    <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={sev.toUpperCase()} size="small"
                          sx={{ bgcolor: '#2a3245', color: SEV_COLOR[sev] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#e8eaf0', fontWeight: 600, borderColor: '#2a3245' }}>{d.drift_type}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.resource_name}</TableCell>
                      <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>{d.namespace}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#a5d6a7', fontFamily: 'monospace', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{d.baseline_value}</TableCell>
                      <TableCell sx={{ fontSize: 11, color: SEV_COLOR[sev] ?? '#e8eaf0', fontFamily: 'monospace', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{d.current_value}</TableCell>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={d.auto_remediation_available ? 'Yes' : 'No'} size="small"
                          sx={{ bgcolor: '#2a3245', color: d.auto_remediation_available ? '#a5d6a7' : '#8892a4', fontSize: 10 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 200 }}>{d.recommendation}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const BaselineComparison: React.FC = () => (
  <ClusterGuard><BaselineComparisonInner /></ClusterGuard>
);

export default BaselineComparison;
