import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, LinearProgress, Stack, Tooltip
} from '@mui/material';
import {
  Assessment as AssessmentIcon, TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon, ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SecurityScoreData {
  overall_security: {
    overall_score: number; grade: string; vulnerability_score: number;
    compliance_score: number; configuration_score: number;
    network_security_score: number; rbac_score: number;
    total_vulnerabilities: number; critical_vulnerabilities: number;
    high_vulnerabilities: number; medium_vulnerabilities: number; low_vulnerabilities: number;
  };
  namespace_security: Array<{
    namespace: string; score: number; grade: string; pod_count: number;
    total_vulnerabilities: number; critical: number; high: number; medium: number; low: number;
  }>;
  trend: { current_score: number; last_week: number; last_month: number; };
}

const SCORE_AREAS = [
  { key: 'vulnerability_score',  label: 'Vulnerabilities',  path: '/cve-dashboard',              color: '#d32f2f' },
  { key: 'compliance_score',     label: 'Compliance',       path: '/compliance/dashboard',        color: '#7b1fa2' },
  { key: 'configuration_score',  label: 'Configuration',    path: '/runtime-security',            color: '#1565c0' },
  { key: 'network_security_score', label: 'Network Security', path: '/network-policies-security', color: '#00695c' },
  { key: 'rbac_score',           label: 'RBAC',             path: '/excessive-permissions',       color: '#e65100' },
];

const ScoreRing: React.FC<{ score: number; label: string; path: string; color: string; size?: number }> = ({ score, label, path, color, size = 90 }) => {
  const navigate = useNavigate();
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <Box sx={{ textAlign: 'center', cursor: 'pointer', '&:hover': { opacity: 0.85 } }} onClick={() => navigate(path)}>
      <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e0e0e0" strokeWidth={9} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={9}
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        </svg>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <Typography variant="body1" fontWeight="bold" sx={{ color, lineHeight: 1 }}>{score?.toFixed(0)}</Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>{label}</Typography>
    </Box>
  );
};

const NsHeatCell: React.FC<{ value: number }> = ({ value }) => {
  const bg = value >= 80 ? '#e8f5e9' : value >= 60 ? '#fff3e0' : value >= 40 ? '#fce4ec' : '#fdecea';
  const color = value >= 80 ? '#388e3c' : value >= 60 ? '#f57c00' : value >= 40 ? '#c62828' : '#b71c1c';
  return (
    <Box sx={{ px: 1, py: 0.25, borderRadius: 0.5, bgcolor: bg, textAlign: 'center', minWidth: 32 }}>
      <Typography variant="caption" fontWeight="bold" sx={{ color }}>{value?.toFixed(0)}</Typography>
    </Box>
  );
};

const SecurityScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<SecurityScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/security-score${clusterParam}`);
      setData(await res.json()); setError(null);
    } catch { setError('Failed to fetch security score data'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;
  if (error || !data) return <Box p={3}><Alert severity="error">{error || 'No data available'}</Alert></Box>;

  const os = data.overall_security;
  const trend = data.trend;
  const weekDelta = (trend.current_score - trend.last_week).toFixed(1);
  const monthDelta = (trend.current_score - trend.last_month).toFixed(1);
  const weekUp = trend.current_score >= trend.last_week;
  const gradeColor = os.overall_score >= 80 ? '#388e3c' : os.overall_score >= 60 ? '#f57c00' : '#d32f2f';

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <AssessmentIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Security Score</Typography>
          <Typography variant="caption" color="text.secondary">Composite posture score across all security dimensions</Typography>
        </Box>
      </Box>

      {/* SCORE + TREND + VULNS */}
      <Grid container spacing={2} mb={3}>
        {/* Big score card */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', border: `2px solid ${gradeColor}30`, textAlign: 'center' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Overall Score</Typography>
              {/* Large ring */}
              {(() => {
                const score = os.overall_score;
                const size = 140;
                const r = (size - 16) / 2;
                const circ = 2 * Math.PI * r;
                const dash = (score / 100) * circ;
                const color = gradeColor;
                return (
                  <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
                    <svg width={size} height={size}>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e0e0e0" strokeWidth={12} />
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={12}
                        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                        transform={`rotate(-90 ${size/2} ${size/2})`} />
                    </svg>
                    <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                      <Typography variant="h3" fontWeight="bold" sx={{ color, lineHeight: 1 }}>{score}</Typography>
                      <Typography variant="caption" color="text.secondary">/ 100</Typography>
                    </Box>
                  </Box>
                );
              })()}
              <Box mt={1.5} display="flex" justifyContent="center" gap={1}>
                <Chip label={`Grade ${os.grade}`} size="small" sx={{ bgcolor: gradeColor, color: '#fff', fontWeight: 'bold' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Trend */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Score Trend</Typography>
              <Stack spacing={2} mt={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">vs Last Week</Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {weekUp ? <TrendingUpIcon color="success" /> : <TrendingDownIcon color="error" />}
                    <Typography variant="h5" fontWeight="bold" color={weekUp ? 'success.main' : 'error.main'}>
                      {weekUp ? '+' : ''}{weekDelta}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">from {trend.last_week.toFixed(1)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">vs Last Month</Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    {trend.current_score >= trend.last_month ? <TrendingUpIcon color="success" /> : <TrendingDownIcon color="error" />}
                    <Typography variant="h5" fontWeight="bold" color={trend.current_score >= trend.last_month ? 'success.main' : 'error.main'}>
                      {trend.current_score >= trend.last_month ? '+' : ''}{monthDelta}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">from {trend.last_month.toFixed(1)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Vulnerability counts */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Vulnerability Exposure</Typography>
              <Grid container spacing={1} mt={0.5}>
                {[
                  { label: 'Critical', count: os.critical_vulnerabilities, color: '#d32f2f', bg: '#fdecea' },
                  { label: 'High',     count: os.high_vulnerabilities,     color: '#f57c00', bg: '#fff3e0' },
                  { label: 'Medium',   count: os.medium_vulnerabilities,   color: '#1976d2', bg: '#e3f2fd' },
                  { label: 'Low',      count: os.low_vulnerabilities,      color: '#388e3c', bg: '#e8f5e9' },
                ].map(({ label, count, color, bg }) => (
                  <Grid item xs={6} key={label}>
                    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: bg, textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => navigate('/cve-dashboard')}>
                      <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                      <Typography variant="caption" sx={{ color }}>{label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* SCORE RINGS per area */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>Posture Breakdown</Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>Click any area to drill down into findings</Typography>
        <Box display="flex" justifyContent="space-around" flexWrap="wrap" gap={2}>
          {SCORE_AREAS.map((area) => (
            <ScoreRing key={area.key} score={(os as any)[area.key] ?? 0}
              label={area.label} path={area.path} color={area.color} size={92} />
          ))}
        </Box>
        <Box mt={3}>
          <Stack spacing={1.5}>
            {SCORE_AREAS.map((area) => {
              const val = (os as any)[area.key] ?? 0;
              return (
                <Box key={area.key} display="flex" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ minWidth: 140 }}>{area.label}</Typography>
                  <Box flex={1}>
                    <LinearProgress variant="determinate" value={val}
                      sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: area.color } }} />
                  </Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 40, color: area.color }}>
                    {val?.toFixed(1)}%
                  </Typography>
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(area.path)} sx={{ fontSize: 11 }}>
                    View
                  </Button>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Paper>

      {/* NAMESPACE HEATMAP */}
      <Paper sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight="bold">Namespace Security Heatmap</Typography>
          <Typography variant="caption" color="text.secondary">
            <Box component="span" sx={{ display: 'inline-flex', gap: 1 }}>
              {[['≥80', '#388e3c'], ['60–79', '#f57c00'], ['40–59', '#c62828'], ['<40', '#b71c1c']].map(([l, c]) => (
                <Box key={l} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
                  <Typography variant="caption" sx={{ color: c }}>{l}</Typography>
                </Box>
              ))}
            </Box>
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead>
              <tr>
                {['Namespace', 'Score', 'Grade', 'Pods', 'Total Vulns', 'Critical', 'High', 'Medium', 'Low'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 12, color: '#666', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.namespace_security.map((ns) => (
                <tr key={ns.namespace} style={{ background: '#fafafa' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: 13 }}>{ns.namespace}</td>
                  <td style={{ padding: '6px 8px' }}><NsHeatCell value={ns.score} /></td>
                  <td style={{ padding: '6px 8px' }}>
                    <Chip label={ns.grade} size="small"
                      sx={{ bgcolor: ns.score >= 80 ? '#e8f5e9' : ns.score >= 60 ? '#fff3e0' : '#fdecea',
                        color: ns.score >= 80 ? '#388e3c' : ns.score >= 60 ? '#f57c00' : '#d32f2f', fontWeight: 'bold' }} />
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 13 }}>{ns.pod_count}</td>
                  <td style={{ padding: '6px 8px', fontSize: 13 }}>{ns.total_vulnerabilities}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {ns.critical > 0 && <Chip label={ns.critical} size="small" sx={{ bgcolor: '#fdecea', color: '#d32f2f', fontWeight: 'bold', fontSize: 11 }} />}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {ns.high > 0 && <Chip label={ns.high} size="small" sx={{ bgcolor: '#fff3e0', color: '#f57c00', fontWeight: 'bold', fontSize: 11 }} />}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {ns.medium > 0 && <Chip label={ns.medium} size="small" sx={{ bgcolor: '#e3f2fd', color: '#1976d2', fontSize: 11 }} />}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {ns.low > 0 && <Chip label={ns.low} size="small" sx={{ bgcolor: '#e8f5e9', color: '#388e3c', fontSize: 11 }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Paper>
    </Box>
  );
};

export default SecurityScore;
// Made with Bob
