import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, CircularProgress, Alert, Stack
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

/* ── Design tokens ─────────────────────────────────────────────────── */
const T = {
  bg:      '#0f1724',
  card:    '#1e2433',
  border:  '#2a3245',
  text:    '#e8eaf0',
  muted:   '#8892a4',
  accent:  '#3b82d4',
  // severity
  critical: { fg: '#f87171', bg: '#2d1515' },
  high:     { fg: '#f59e0b', bg: '#2d200a' },
  medium:   { fg: '#60a5fa', bg: '#0d1f3c' },
  low:      { fg: '#4ade80', bg: '#0d2d1a' },
  // score bands
  scoreColor: (s: number) => s >= 80 ? '#4ade80' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f87171' : '#f43f5e',
};

/* ── Interfaces ─────────────────────────────────────────────────────── */
interface OverallSecurity {
  overall_score: number; grade: string;
  vulnerability_score: number; compliance_score: number;
  configuration_score: number; network_security_score: number; rbac_score: number;
  total_vulnerabilities: number;
  critical_vulnerabilities: number; high_vulnerabilities: number;
  medium_vulnerabilities: number; low_vulnerabilities: number;
  no_resource_requests: number; high_memory_pressure: number;
  high_risk_pods: number; medium_risk_pods: number;
  stale_secrets_high: number; total_pods: number;
}
interface NamespaceSecurity {
  namespace: string; score: number; grade: string; pod_count: number;
  no_limits: number; mem_pressure: number;
  risk_high: number; risk_medium: number; stale_secrets: number;
  total_issues: number; total_vulnerabilities: number;
  critical: number; high: number; medium: number; low: number;
}
interface SecurityScoreData {
  overall_security: OverallSecurity;
  namespace_security: NamespaceSecurity[];
  trend: { current_score: number; last_week: number; last_month: number };
}

/* ── Score ring ─────────────────────────────────────────────────────── */
const ScoreRing: React.FC<{
  score: number; label: string; size?: number; color: string; onClick?: () => void
}> = ({ score, label, size = 92, color, onClick }) => {
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <Box sx={{ textAlign: 'center', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { opacity: 0.8 } : {} }}
      onClick={onClick}>
      <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth={9} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={9}
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        </svg>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <Typography sx={{ color, fontWeight: 700, fontSize: 15, lineHeight: 1 }}>{score?.toFixed(0)}</Typography>
        </Box>
      </Box>
      <Typography sx={{ color: T.muted, fontSize: 11, mt: 0.5 }}>{label}</Typography>
    </Box>
  );
};

/* ── Small severity chip ────────────────────────────────────────────── */
const SevChip: React.FC<{ count: number; level: 'critical'|'high'|'medium'|'low' }> = ({ count, level }) => {
  if (!count) return <Typography sx={{ color: T.muted, fontSize: 12 }}>—</Typography>;
  const { fg, bg } = T[level];
  return (
    <Box sx={{ display:'inline-block', px:1, py:0.2, borderRadius:0.5, bgcolor: bg, border:`1px solid ${fg}30` }}>
      <Typography sx={{ color: fg, fontWeight: 700, fontSize: 12 }}>{count}</Typography>
    </Box>
  );
};

/* ── Main component ─────────────────────────────────────────────────── */
const SecurityScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<SecurityScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60_000);
    return () => clearInterval(i);
  }, [clusterParam]); // eslint-disable-line

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/security-score${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch security score');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: T.bg }}>
      <CircularProgress size={48} sx={{ color: T.accent }} />
    </Box>
  );
  if (error || !data) return (
    <Box p={3} sx={{ bgcolor: T.bg, minHeight: '100vh' }}>
      <Alert severity="error" sx={{ bgcolor: T.critical.bg, color: T.critical.fg }}>{error || 'No data'}</Alert>
    </Box>
  );

  const os   = data.overall_security;
  const tr   = data.trend;
  const mainColor = T.scoreColor(os.overall_score);
  const weekDelta  = (tr.current_score - tr.last_week).toFixed(1);
  const monthDelta = (tr.current_score - tr.last_month).toFixed(1);
  const weekUp  = tr.current_score >= tr.last_week;
  const monthUp = tr.current_score >= tr.last_month;

  const SCORE_AREAS = [
    { key: 'vulnerability_score',    label: 'Vulnerabilities',  path: '/cve-dashboard',              color: T.critical.fg },
    { key: 'compliance_score',       label: 'Compliance',       path: '/compliance/dashboard',        color: '#a78bfa' },
    { key: 'configuration_score',    label: 'Configuration',    path: '/runtime-security',            color: T.medium.fg },
    { key: 'network_security_score', label: 'Network Security', path: '/network-policies-security',  color: '#34d399' },
    { key: 'rbac_score',             label: 'RBAC',             path: '/excessive-permissions',       color: T.high.fg },
  ];

  /* large ring */
  const sz = 152;
  const R  = (sz - 18) / 2;
  const C  = 2 * Math.PI * R;
  const D  = (os.overall_score / 100) * C;

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3, color: T.text }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <AssessmentIcon sx={{ fontSize: 36, color: T.accent }} />
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Security Score</Typography>
          <Typography sx={{ fontSize: 12, color: T.muted }}>
            Composite posture score across all security dimensions
          </Typography>
        </Box>
      </Box>

      {/* Top row: big score + trend + vulns */}
      <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', md:'220px 200px 1fr' }, gap: 2, mb: 3 }}>

        {/* Big score ring */}
        <Box sx={{ bgcolor: T.card, border:`1px solid ${T.border}`, borderRadius: 2, p: 3,
          display:'flex', flexDirection:'column', alignItems:'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: T.muted, textTransform:'uppercase', letterSpacing:1 }}>
            Overall Score
          </Typography>
          <Box sx={{ position:'relative', width: sz, height: sz }}>
            <svg width={sz} height={sz}>
              <circle cx={sz/2} cy={sz/2} r={R} fill="none" stroke={T.border} strokeWidth={12} />
              <circle cx={sz/2} cy={sz/2} r={R} fill="none" stroke={mainColor} strokeWidth={12}
                strokeDasharray={`${D} ${C - D}`} strokeLinecap="round"
                transform={`rotate(-90 ${sz/2} ${sz/2})`} />
            </svg>
            <Box sx={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' }}>
              <Typography sx={{ fontSize: 36, fontWeight: 800, color: mainColor, lineHeight: 1 }}>
                {os.overall_score}
              </Typography>
              <Typography sx={{ fontSize: 11, color: T.muted }}>/ 100</Typography>
            </Box>
          </Box>
          <Box sx={{ px: 2, py: 0.4, borderRadius: 1, bgcolor: `${mainColor}20`, border:`1px solid ${mainColor}50` }}>
            <Typography sx={{ color: mainColor, fontWeight: 700, fontSize: 14 }}>Grade {os.grade}</Typography>
          </Box>
          <Typography sx={{ fontSize: 11, color: T.muted }}>{os.total_pods} pods monitored</Typography>
        </Box>

        {/* Trend */}
        <Box sx={{ bgcolor: T.card, border:`1px solid ${T.border}`, borderRadius: 2, p: 3 }}>
          <Typography sx={{ fontSize: 12, color: T.muted, textTransform:'uppercase', letterSpacing:1, mb: 2 }}>
            Score Trend
          </Typography>
          <Stack spacing={2.5}>
            <Box>
              <Typography sx={{ fontSize: 11, color: T.muted, mb: 0.3 }}>vs Last Week</Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                {weekUp
                  ? <TrendingUpIcon sx={{ color: '#4ade80', fontSize: 20 }} />
                  : <TrendingDownIcon sx={{ color: T.critical.fg, fontSize: 20 }} />}
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: weekUp ? '#4ade80' : T.critical.fg }}>
                  {weekUp ? '+' : ''}{weekDelta}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: T.muted }}>from {tr.last_week.toFixed(1)}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: T.muted, mb: 0.3 }}>vs Last Month</Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                {monthUp
                  ? <TrendingUpIcon sx={{ color: '#4ade80', fontSize: 20 }} />
                  : <TrendingDownIcon sx={{ color: T.critical.fg, fontSize: 20 }} />}
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: monthUp ? '#4ade80' : T.critical.fg }}>
                  {monthUp ? '+' : ''}{monthDelta}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: T.muted }}>from {tr.last_month.toFixed(1)}</Typography>
            </Box>
          </Stack>
        </Box>

        {/* Vulnerability exposure */}
        <Box sx={{ bgcolor: T.card, border:`1px solid ${T.border}`, borderRadius: 2, p: 3 }}>
          <Typography sx={{ fontSize: 12, color: T.muted, textTransform:'uppercase', letterSpacing:1, mb: 2 }}>
            Vulnerability Exposure
          </Typography>
          <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 1.5 }}>
            {([
              { label:'Critical', count: os.critical_vulnerabilities, ...T.critical },
              { label:'High',     count: os.high_vulnerabilities,     ...T.high },
              { label:'Medium',   count: os.medium_vulnerabilities,   ...T.medium },
              { label:'Low',      count: os.low_vulnerabilities,      ...T.low },
            ] as Array<{label:string;count:number;fg:string;bg:string}>).map(({ label, count, fg, bg }) => (
              <Box key={label} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: bg, border:`1px solid ${fg}30`,
                textAlign:'center', cursor:'pointer', '&:hover':{ opacity:0.85 } }}
                onClick={() => navigate('/cve-dashboard')}>
                <Typography sx={{ fontSize: 28, fontWeight: 800, color: fg, lineHeight: 1 }}>{count}</Typography>
                <Typography sx={{ fontSize: 11, color: fg, mt: 0.3 }}>{label}</Typography>
              </Box>
            ))}
          </Box>
          <Box mt={2} sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 1 }}>
            {([
              { label:'No Resource Limits', count: os.no_resource_requests,   fg: T.high.fg },
              { label:'Mem Pressure >90%',  count: os.high_memory_pressure,   fg: T.critical.fg },
              { label:'Stale Secrets',      count: os.stale_secrets_high,     fg: '#a78bfa' },
              { label:'Total Pods',         count: os.total_pods,             fg: T.muted },
            ] as Array<{label:string;count:number;fg:string}>).map(({ label, count, fg }) => (
              <Box key={label} sx={{ display:'flex', alignItems:'center', gap: 0.8 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: fg }}>{count}</Typography>
                <Typography sx={{ fontSize: 11, color: T.muted }}>{label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Posture breakdown */}
      <Box sx={{ bgcolor: T.card, border:`1px solid ${T.border}`, borderRadius: 2, p: 3, mb: 3 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: T.text, mb: 0.5 }}>Posture Breakdown</Typography>
        <Typography sx={{ fontSize: 12, color: T.muted, mb: 3 }}>Click any area to drill down into findings</Typography>
        <Box sx={{ display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap: 3, mb: 4 }}>
          {SCORE_AREAS.map(a => (
            <ScoreRing key={a.key} score={(os as any)[a.key] ?? 0}
              label={a.label} color={a.color} size={92}
              onClick={() => navigate(a.path)} />
          ))}
        </Box>
        <Stack spacing={1.5}>
          {SCORE_AREAS.map(a => {
            const val: number = (os as any)[a.key] ?? 0;
            return (
              <Box key={a.key} display="flex" alignItems="center" gap={2}>
                <Typography sx={{ minWidth: 148, fontSize: 13, color: T.text }}>{a.label}</Typography>
                <Box flex={1} sx={{ height: 8, borderRadius: 4, bgcolor: T.border, overflow:'hidden' }}>
                  <Box sx={{ width:`${val}%`, height:'100%', borderRadius: 4, bgcolor: a.color }} />
                </Box>
                <Typography sx={{ minWidth: 44, fontSize: 13, fontWeight: 700, color: a.color, textAlign:'right' }}>
                  {val.toFixed(1)}%
                </Typography>
                <Box sx={{ display:'flex', alignItems:'center', gap: 0.5, cursor:'pointer', color: T.muted,
                  '&:hover':{ color: T.accent }, fontSize: 12 }}
                  onClick={() => navigate(a.path)}>
                  <Typography sx={{ fontSize: 12 }}>View</Typography>
                  <ArrowForwardIcon sx={{ fontSize: 13 }} />
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* Namespace security heatmap */}
      <Box sx={{ bgcolor: T.card, border:`1px solid ${T.border}`, borderRadius: 2, p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: T.text }}>Namespace Security Heatmap</Typography>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            {([['≥80','#4ade80'],['60–79','#f59e0b'],['40–59','#f87171'],['<40','#f43f5e']] as [string,string][]).map(([l,c]) => (
              <Box key={l} display="flex" alignItems="center" gap={0.4}>
                <Box sx={{ width: 8, height: 8, borderRadius:'50%', bgcolor: c }} />
                <Typography sx={{ fontSize: 11, color: c }}>{l}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:'0 3px' }}>
            <thead>
              <tr>
                {['Namespace','Score','Grade','Pods','Issues','Critical','High','Medium','Low','No Limits','Mem >90%','Stale Sec.'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'4px 8px', fontSize:11, color: T.muted, fontWeight:600,
                    whiteSpace:'nowrap', borderBottom:`1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.namespace_security.map((ns) => {
                const sc = T.scoreColor(ns.score);
                return (
                  <tr key={ns.namespace} style={{ background: T.bg }}>
                    <td style={{ padding:'6px 8px', fontSize:13, fontWeight:600, color: T.text, whiteSpace:'nowrap' }}>
                      {ns.namespace}
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <Box sx={{ px:1, py:0.2, borderRadius:0.5, bgcolor:`${sc}18`, border:`1px solid ${sc}40`, display:'inline-block' }}>
                        <Typography sx={{ color: sc, fontWeight:700, fontSize:12 }}>{ns.score.toFixed(0)}</Typography>
                      </Box>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <Box sx={{ px:1, py:0.2, borderRadius:0.5, bgcolor:`${sc}18`, border:`1px solid ${sc}40`, display:'inline-block' }}>
                        <Typography sx={{ color: sc, fontWeight:700, fontSize:12 }}>{ns.grade}</Typography>
                      </Box>
                    </td>
                    <td style={{ padding:'6px 8px', fontSize:13, color: T.muted }}>{ns.pod_count}</td>
                    <td style={{ padding:'6px 8px' }}>
                      <Typography sx={{ fontSize:13, color: ns.total_issues > 0 ? T.high.fg : T.muted, fontWeight: ns.total_issues > 0 ? 700 : 400 }}>
                        {ns.total_issues}
                      </Typography>
                    </td>
                    <td style={{ padding:'6px 8px' }}><SevChip count={ns.critical} level="critical" /></td>
                    <td style={{ padding:'6px 8px' }}><SevChip count={ns.high}     level="high" /></td>
                    <td style={{ padding:'6px 8px' }}><SevChip count={ns.medium}   level="medium" /></td>
                    <td style={{ padding:'6px 8px' }}><SevChip count={ns.low}      level="low" /></td>
                    <td style={{ padding:'6px 8px' }}>
                      <Typography sx={{ fontSize:13, color: ns.no_limits > 0 ? T.high.fg : T.muted }}>
                        {ns.no_limits || '—'}
                      </Typography>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <Typography sx={{ fontSize:13, color: ns.mem_pressure > 0 ? T.critical.fg : T.muted }}>
                        {ns.mem_pressure || '—'}
                      </Typography>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <Typography sx={{ fontSize:13, color: ns.stale_secrets > 0 ? '#a78bfa' : T.muted }}>
                        {ns.stale_secrets || '—'}
                      </Typography>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Box>
    </Box>
  );
};

export default SecurityScore;
// Made with Bob
