import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Paper, IconButton,
  LinearProgress, Chip, CircularProgress, Alert, Divider,
} from '@mui/material';
import EcoIcon from '@mui/icons-material/EnergySavingsLeaf';
import { Refresh as RefreshIcon, CheckCircle as CheckCircleIcon,
         TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon,
         TrendingFlat as TrendingFlatIcon } from '@mui/icons-material';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import ClusterGuard from '../components/ClusterGuard';

// ── Design tokens ──────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';
const PURPLE = '#a371f7';

// ── Helpers ────────────────────────────────────────────────────────────────────
const gradeColor = (g: string) =>
  !g       ? DK.muted :
  g === 'A' || g === 'A+' ? GREEN  :
  g === 'B+'               ? ACCENT :
  g.startsWith('B')        ? AMBER  : RED;

const scoreColor = (s: number) => s >= 75 ? GREEN : s >= 60 ? AMBER : RED;

const tooltipStyle = { backgroundColor: DK.surface, border: `1px solid ${DK.border}`, color: DK.text, fontSize: 12 };

// ── CircularScore: SVG ring showing a score ────────────────────────────────────
const CircularScore: React.FC<{ score: number; size?: number }> = ({ score, size = 64 }) => {
  const r  = (size / 2) - 6;
  const c  = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={DK.border}  strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" fontWeight={700} sx={{ color, fontSize: size < 64 ? 9 : 11 }}>
          {score}
        </Typography>
      </Box>
    </Box>
  );
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScoreDim {
  score: number; weight: number; weighted_score: number;
  factors: { factor: string; value: number; target: number; score: number }[];
}
interface SustainabilityData {
  overall_score: number; grade: string; previous_score?: number; improvement?: number;
  target_score: number; cluster_scores: any[];
  score_breakdown: {
    energy_efficiency:    ScoreDim;
    carbon_footprint:     ScoreDim;
    resource_optimization:ScoreDim;
    lifecycle_management: ScoreDim;
  };
  industry_comparison: { your_score: number; industry_average: number; top_quartile: number; percentile: number };
  achievements: { achievement: string; date: string }[];
  recommendations: { priority: string; recommendation: string; impact_on_score: number; effort: string }[];
  trend: string;
  last_updated: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  energy_efficiency:     'Energy Efficiency',
  carbon_footprint:      'Carbon Footprint',
  resource_optimization: 'Resource Optimization',
  lifecycle_management:  'Lifecycle Management',
};

// ── Inner page ─────────────────────────────────────────────────────────────────
const SustainabilityScoreInner: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data,    setData]    = useState<SustainabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/finops/sustainability-score${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress sx={{ color: GREEN }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)  return null;

  const sb = data.score_breakdown;
  const ic = data.industry_comparison;

  // Radar: your score + industry average + target 85
  const radarData = Object.entries(sb ?? {}).map(([key, dim]: [string, any]) => ({
    dimension: CATEGORY_LABELS[key] ?? key,
    'Your Score':       dim.score,
    'Industry Average': ic?.industry_average ?? 0,
    'Target (85)':      85,
  }));

  // Trend icon
  const TrendIcon = data.trend === 'improving' ? TrendingUpIcon
                  : data.trend === 'declining' ? TrendingDownIcon
                  : TrendingFlatIcon;
  const trendColor = data.trend === 'improving' ? GREEN
                   : data.trend === 'declining' ? RED : DK.muted;

  // Sorted recommendations: high first
  const sortedRecs = [...(data.recommendations ?? [])].sort((a, b) => {
    const rank = (p: string) => p === 'high' ? 0 : p === 'medium' ? 1 : 2;
    return rank(a.priority) - rank(b.priority);
  });

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <EcoIcon sx={{ fontSize: 34, color: GREEN }} />
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ color: DK.text, lineHeight: 1.2 }}>
              Sustainability Score
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted }}>{activeClusterName}</Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Big score display ── */}
      <Paper sx={{ p: 4, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3, textAlign: 'center' }}>
        <Box display="flex" justifyContent="center" alignItems="center" gap={4} flexWrap="wrap">
          {/* Score number */}
          <Box>
            <Typography variant="caption" sx={{ color: DK.muted, textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>
              Overall Score
            </Typography>
            <Typography sx={{ fontSize: 80, fontWeight: 800, color: scoreColor(data.overall_score), lineHeight: 1 }}>
              {data.overall_score}
            </Typography>
            <Typography variant="body2" sx={{ color: DK.muted }}>out of 100</Typography>
          </Box>

          {/* Grade circle */}
          <Box sx={{
            width: 88, height: 88, borderRadius: '50%',
            border: `4px solid ${gradeColor(data.grade)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography variant="h4" fontWeight={800} sx={{ color: gradeColor(data.grade) }}>
              {data.grade}
            </Typography>
          </Box>

          {/* Trend + meta */}
          <Box>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <TrendIcon sx={{ color: trendColor, fontSize: 28 }} />
              <Typography variant="body1" fontWeight={600} sx={{ color: trendColor, textTransform: 'capitalize' }}>
                {data.trend ?? '—'}
              </Typography>
            </Box>
            {data.previous_score != null && (
              <Typography variant="body2" sx={{ color: DK.muted }}>
                Previous: <strong style={{ color: DK.text }}>{data.previous_score}</strong>
                {data.improvement != null && (
                  <span style={{ color: data.improvement >= 0 ? GREEN : RED, marginLeft: 6 }}>
                    ({data.improvement >= 0 ? '+' : ''}{data.improvement} pts)
                  </span>
                )}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: DK.muted, mt: 0.5 }}>
              Target: <strong style={{ color: ACCENT }}>{data.target_score}</strong>
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* ── Score breakdown 2×2 grid ── */}
      {sb && (
        <Box mb={3}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Score Breakdown
          </Typography>
          <Grid container spacing={2}>
            {(Object.entries(sb) as [string, ScoreDim][]).map(([key, dim]) => {
              const color = scoreColor(dim.score);
              return (
                <Grid item xs={12} sm={6} key={key}>
                  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${color}33`, height: '100%' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={2} mb={2}>
                        <CircularScore score={dim.score} size={64} />
                        <Box flex={1}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: DK.text }}>
                            {CATEGORY_LABELS[key] ?? key}
                          </Typography>
                          <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
                            <Chip label={`${dim.score}/100`} size="small"
                              sx={{ bgcolor: `${color}22`, color, border: `1px solid ${color}55`, fontSize: 11 }} />
                            <Chip label={`Weight ${dim.weight}%`} size="small"
                              sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: 11 }} />
                            <Chip label={`Contrib. ${dim.weighted_score?.toFixed(1)} pts`} size="small"
                              sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: 11 }} />
                          </Box>
                        </Box>
                      </Box>

                      {/* Factors */}
                      {dim.factors?.length > 0 && (
                        <Box>
                          <Divider sx={{ borderColor: DK.border, mb: 1 }} />
                          {dim.factors.slice(0, 4).map((f, fi) => (
                            <Box key={fi} display="flex" justifyContent="space-between"
                              alignItems="center" py={0.4}>
                              <Typography variant="caption" sx={{ color: DK.muted, flex: 1 }}>
                                {f.factor}
                              </Typography>
                              <Box display="flex" gap={0.5} alignItems="center">
                                <Typography variant="caption" sx={{ color: DK.text, mr: 0.5 }}>
                                  {f.value} / {f.target}
                                </Typography>
                                <Chip label={f.score} size="small"
                                  sx={{
                                    height: 18, fontSize: 10,
                                    bgcolor: `${scoreColor(f.score)}22`,
                                    color: scoreColor(f.score),
                                  }} />
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      <Grid container spacing={3} mb={3}>
        {/* ── RadarChart ── */}
        {radarData.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
              <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
                Dimensions Radar
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid stroke={DK.border} />
                  <PolarAngleAxis dataKey="dimension"
                    tick={{ fill: DK.muted, fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]}
                    tick={{ fill: DK.muted, fontSize: 9 }} />
                  <Radar name="Your Score"       dataKey="Your Score"
                    stroke={GREEN}  fill={GREEN}  fillOpacity={0.25} strokeWidth={2} />
                  <Radar name="Industry Average" dataKey="Industry Average"
                    stroke={ACCENT} fill={ACCENT} fillOpacity={0.10} strokeWidth={1.5} />
                  <Radar name="Target (85)"      dataKey="Target (85)"
                    stroke={AMBER}  fill="none"   strokeWidth={1.5} strokeDasharray="4 3" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* ── Industry comparison percentile bar ── */}
        {ic && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, height: '100%' }}>
              <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
                Industry Comparison
              </Typography>
              <Divider sx={{ borderColor: DK.border, mb: 2 }} />

              {[
                { label: 'Your Score',        value: ic.your_score,       color: GREEN  },
                { label: 'Industry Average',  value: ic.industry_average, color: DK.muted },
                { label: 'Top Quartile',      value: ic.top_quartile,     color: PURPLE },
              ].map(({ label, value, color }) => (
                <Box key={label} mb={2}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" sx={{ color: DK.muted }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color }}>{value}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={Math.min(value, 100)}
                    sx={{
                      height: 6, borderRadius: 1, bgcolor: DK.border,
                      '& .MuiLinearProgress-bar': { bgcolor: color },
                    }} />
                </Box>
              ))}

              {/* Percentile indicator */}
              <Divider sx={{ borderColor: DK.border, my: 2 }} />
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" sx={{ color: DK.muted }}>Your Percentile</Typography>
                <Box sx={{
                  px: 2, py: 0.5, borderRadius: 2,
                  bgcolor: ic.percentile >= 75 ? `${GREEN}22` : ic.percentile >= 50 ? `${AMBER}22` : `${RED}22`,
                  border: `1px solid ${ic.percentile >= 75 ? GREEN : ic.percentile >= 50 ? AMBER : RED}55`,
                }}>
                  <Typography variant="h6" fontWeight={800}
                    sx={{ color: ic.percentile >= 75 ? GREEN : ic.percentile >= 50 ? AMBER : RED }}>
                    {ic.percentile}th
                  </Typography>
                </Box>
              </Box>
              <Box position="relative" mt={1.5}>
                <LinearProgress variant="determinate" value={ic.percentile}
                  sx={{
                    height: 10, borderRadius: 1, bgcolor: DK.border,
                    '& .MuiLinearProgress-bar': {
                      bgcolor: ic.percentile >= 75 ? GREEN : ic.percentile >= 50 ? AMBER : RED,
                    },
                  }} />
                {/* Your position marker */}
                <Box sx={{
                  position: 'absolute', top: -3, left: `calc(${ic.percentile}% - 2px)`,
                  width: 4, height: 16, bgcolor: DK.text, borderRadius: 1,
                }} />
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* ── Achievements ── */}
      {data.achievements?.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Achievements
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            {data.achievements.map((a, i) => (
              <Box key={i} display="flex" alignItems="center" gap={1.5} py={0.5}>
                <CheckCircleIcon sx={{ color: GREEN, fontSize: 18, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: DK.text, flex: 1 }}>{a.achievement}</Typography>
                <Typography variant="caption" sx={{ color: DK.muted, flexShrink: 0 }}>{a.date}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* ── Recommendations ── */}
      {sortedRecs.length > 0 && (
        <Paper sx={{ p: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}` }}>
          <Typography variant="h6" fontWeight={600} sx={{ color: DK.text, mb: 2 }}>
            Recommendations
          </Typography>
          <Box display="flex" flexDirection="column" gap={1.5}>
            {sortedRecs.map((r, i) => {
              const high = r.priority === 'high';
              const med  = r.priority === 'medium';
              const pColor = high ? RED : med ? AMBER : DK.muted;
              return (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 2,
                  p: 2, borderRadius: 1,
                  bgcolor: high ? `${RED}0d` : med ? `${AMBER}0d` : DK.surface2,
                  border: `1px solid ${pColor}33`,
                }}>
                  <Chip label={r.priority.toUpperCase()} size="small"
                    sx={{
                      flexShrink: 0, fontSize: 10, fontWeight: 700,
                      bgcolor: `${pColor}22`, color: pColor, border: `1px solid ${pColor}55`,
                    }} />
                  <Typography variant="body2" sx={{ color: DK.text, flex: 1, pt: 0.2 }}>
                    {r.recommendation}
                  </Typography>
                  <Box display="flex" gap={0.75} flexShrink={0} flexWrap="wrap" justifyContent="flex-end">
                    <Chip label={`+${r.impact_on_score} pts`} size="small"
                      sx={{ bgcolor: `${GREEN}22`, color: GREEN, border: `1px solid ${GREEN}44`, fontSize: 11 }} />
                    <Chip label={r.effort} size="small"
                      sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: 11 }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

// ── Default export wrapped in ClusterGuard ─────────────────────────────────────
const SustainabilityScore: React.FC = () => (
  <ClusterGuard>
    <SustainabilityScoreInner />
  </ClusterGuard>
);

export default SustainabilityScore;

// Made with Bob
