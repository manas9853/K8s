import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress as MuiCircularProgress, Alert, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Paper, LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Storage as StorageIcon,
  Layers as LayersIcon,
  FolderOutlined as FolderIcon,
  Lock as LockIcon,
  ViewInAr as PodsIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:     '#0f1724',
  card:   '#1e2433',
  hover:  '#252e42',
  border: '#2a3245',
  text:   '#e8eaf0',
  muted:  '#8b95a9',
  body:   '#c8cdd8',
  green:  '#4ade80',
  red:    '#f87171',
  yellow: '#f59e0b',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const scoreColor = (s: number) => s >= 80 ? T.green : s >= 55 ? T.yellow : T.red;
const grade      = (s: number) => s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F';
const gradeColors: Record<string, string> = { A: T.green, B: T.green, C: T.yellow, D: T.red, F: T.red };
const gradeBg:     Record<string, string> = { A: '#052e16', B: '#052e16', C: '#451a03', D: '#450a0a', F: '#450a0a' };

/** A dark circular score gauge */
const ScoreGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 56 }) => {
  const col = scoreColor(value);
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      {/* track */}
      <MuiCircularProgress variant="determinate" value={100} size={size}
        sx={{ color: T.border, position: 'absolute' }} />
      {/* fill */}
      <MuiCircularProgress variant="determinate" value={value} size={size}
        sx={{ color: col }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: size * 0.23, fontWeight: 700, color: col, lineHeight: 1 }}>
          {Math.round(value)}
        </Typography>
      </Box>
    </Box>
  );
};

/** A mini progress bar sub-score row */
const SubScore: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <Box sx={{ mb: 0.75 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
      <Typography sx={{ fontSize: 11, color: T.muted }}>{label}</Typography>
      <Typography sx={{ fontSize: 11, color: scoreColor(value) }}>{Math.round(value)}%</Typography>
    </Box>
    <LinearProgress variant="determinate" value={value}
      sx={{ height: 4, borderRadius: 2, bgcolor: T.border,
        '& .MuiLinearProgress-bar': { bgcolor: scoreColor(value), borderRadius: 2 } }} />
  </Box>
);

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; accent?: string }> = ({ label, value, sub, accent }) => (
  <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent ?? T.text, lineHeight: 1 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ─── Score computation ────────────────────────────────────────────────────────
function computeClusterScore(data: any): any {
  const ov = data.overview;
  const cpuBreak = ov?.cost_breakdown?.find((b: any) => b.category.includes('CPU'));
  const memBreak = ov?.cost_breakdown?.find((b: any) => b.category.includes('Memory'));

  // CPU/Mem efficiency = 100 - waste%
  const cpuEff = Math.max(0, 100 - (cpuBreak?.savings_percent ?? 0));
  const memEff = Math.max(0, 100 - (memBreak?.savings_percent ?? 0));

  // Cleanup score: penalise for stale resources
  // old-rs > 50 is bad; idle-ns > 5 is bad; secrets high_risk > 20 is bad; stale-cm > 20 is bad; pvcs > 2 is bad
  const rsScore  = Math.max(0, 100 - Math.min(100, (data.rsCount  / 50)  * 40));
  const nsScore  = Math.max(0, 100 - Math.min(100, (data.idleNs   / 10)  * 40));
  const secScore = Math.max(0, 100 - Math.min(100, (data.secHigh  / 20)  * 50));
  const cmScore  = Math.max(0, 100 - Math.min(100, (data.staleCm  / 30)  * 30));
  const pvcScore = Math.max(0, 100 - Math.min(100, (data.pvcs     / 5)   * 20));
  const cleanupScore = (rsScore + nsScore + secScore + cmScore + pvcScore) / 5;

  // Warning events: warn_rate as fraction of total
  const warnRate   = data.totalEvents > 0 ? data.warnEvents / data.totalEvents : 0;
  const eventScore = Math.max(0, 100 - warnRate * 100);

  // Cost efficiency (overall savings_percent from overview)
  const costScore = Math.max(0, 100 - (ov?.savings_percent ?? 0));

  const overall = Math.round(
    cpuEff     * 0.25 +
    memEff     * 0.15 +
    cleanupScore * 0.30 +
    eventScore * 0.15 +
    costScore  * 0.15
  );

  return {
    name:         data.clusterName,
    overall,
    cpu_eff:      Math.round(cpuEff),
    mem_eff:      Math.round(memEff),
    cleanup:      Math.round(cleanupScore),
    event_health: Math.round(eventScore),
    cost_score:   Math.round(costScore),
    grade:        grade(overall),
    total_pods:   data.totalPods,
    rs_count:     data.rsCount,
    idle_ns:      data.idleNs,
    stale_cm:     data.staleCm,
    stale_sec:    data.staleSec,
    pvcs:         data.pvcs,
    warn_events:  data.warnEvents,
    total_events: data.totalEvents,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const ClusterScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [scoreData, setScoreData] = useState<any | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);

      const [ovRes, rsRes, nsRes, cmRes, secRes, evRes, clRes, podsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/old-replicasets${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/idle-namespaces${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/stale-configmaps${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/stale-secrets${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/observability/events${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/clusters${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/pods${clusterParam}`),
      ]);

      const ov   = ovRes.ok   ? await ovRes.json()   : null;
      const rs   = rsRes.ok   ? await rsRes.json()   : null;
      const ns   = nsRes.ok   ? await nsRes.json()   : null;
      const cm   = cmRes.ok   ? await cmRes.json()   : null;
      const sec  = secRes.ok  ? await secRes.json()  : null;
      const evs  = evRes.ok   ? await evRes.json()   : [];
      const cls  = clRes.ok   ? await clRes.json()   : null;
      const pods = podsRes.ok ? await podsRes.json() : [];

      const warnEvents  = Array.isArray(evs) ? evs.filter((e: any) => e.type === 'Warning').length : 0;
      const totalEvents = Array.isArray(evs) ? evs.length : 0;

      // derive cluster name: from clusters API or first cluster in list
      const clusterList: any[] = Array.isArray(cls) ? cls : (cls?.clusters ?? []);
      const clusterName: string =
        clusterList[0]?.name ?? clusterList[0]?.cluster_name ?? 'xforce-devops';

      const totalPods = Array.isArray(pods)
        ? pods.length
        : (pods?.items ?? pods?.pods ?? []).length;

      const raw = {
        clusterName,
        overview:  ov,
        rsCount:   rs?.summary?.total_resources ?? 0,
        idleNs:    ns?.summary?.total_resources ?? 0,
        staleCm:   cm?.summary?.total_resources ?? 0,
        staleSec:  sec?.summary?.total_resources ?? 0,
        secHigh:   sec?.summary?.high_risk ?? 0,
        pvcs:      (ov?.savings_by_namespace ?? []).length,
        warnEvents,
        totalEvents,
        totalPods,
      };
      setScoreData(computeClusterScore(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.5 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5, bgcolor: '#161f30' };

  if (loading) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <MuiCircularProgress sx={{ color: T.green }} />
    </Box>
  );
  if (error) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: '#1a0a0a', color: T.red, border: `1px solid ${T.red}` }}>{error}</Alert>
    </Box>
  );

  const sc = scoreData;

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Cluster Optimization Score</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
              Computed from live pod requests, cleanup debt, and event health — {sc?.name ?? '…'}
            </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Hero score + sub-scores */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Big score card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, height: '100%' }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                Overall Score
              </Typography>
              <ScoreGauge value={sc.overall} size={120} />
              <Box sx={{ textAlign: 'center' }}>
                <Chip label={`Grade ${sc.grade}`} size="small"
                  sx={{ bgcolor: gradeBg[sc.grade], color: gradeColors[sc.grade],
                    border: `1px solid ${gradeColors[sc.grade]}44`, fontWeight: 700, fontSize: 13 }} />
                <Typography sx={{ fontSize: 12, color: T.muted, mt: 1 }}>
                  {sc.overall >= 80 ? 'Well optimised cluster'
                    : sc.overall >= 60 ? 'Moderate cleanup needed'
                    : 'Significant improvements required'}
                </Typography>
              </Box>
              <Box sx={{ width: '100%', mt: 1 }}>
                <SubScore label="CPU Efficiency"    value={sc.cpu_eff} />
                <SubScore label="Memory Efficiency" value={sc.mem_eff} />
                <SubScore label="Cleanup Debt"      value={sc.cleanup} />
                <SubScore label="Event Health"      value={sc.event_health} />
                <SubScore label="Cost Optimisation" value={sc.cost_score} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Cleanup debt breakdown */}
        <Grid item xs={12} md={8}>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            {[
              { label: 'Total Pods',          value: sc.total_pods,  icon: <PodsIcon sx={{ fontSize: 20 }} />,     bad: false },
              { label: 'Old ReplicaSets',     value: sc.rs_count,    icon: <LayersIcon sx={{ fontSize: 20 }} />,   bad: sc.rs_count > 50 },
              { label: 'Idle Namespaces',     value: sc.idle_ns,     icon: <FolderIcon sx={{ fontSize: 20 }} />,   bad: sc.idle_ns > 5 },
              { label: 'Stale ConfigMaps',    value: sc.stale_cm,    icon: <StorageIcon sx={{ fontSize: 20 }} />,  bad: sc.stale_cm > 20 },
              { label: 'Stale Secrets',       value: sc.stale_sec,   icon: <LockIcon sx={{ fontSize: 20 }} />,     bad: sc.stale_sec > 20 },
              { label: 'Warning Events',      value: sc.warn_events, icon: <WarningIcon sx={{ fontSize: 20 }} />,  bad: sc.warn_events > 20 },
            ].map(item => (
              <Grid item xs={6} sm={4} key={item.label}>
                <Card sx={{ bgcolor: T.card, border: `1px solid ${item.bad ? T.yellow + '44' : T.border}`, borderRadius: 2 }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                      <Box sx={{ color: item.bad ? T.yellow : T.muted }}>{item.icon}</Box>
                      <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                        {item.label}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 26, fontWeight: 700, color: item.bad ? T.yellow : T.text, lineHeight: 1 }}>
                      {item.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      {/* Score detail table */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Score Breakdown
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headSx}>Cluster</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Score</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Grade</TableCell>
              <TableCell sx={headSx}>CPU Eff.</TableCell>
              <TableCell sx={headSx}>Mem Eff.</TableCell>
              <TableCell sx={headSx}>Cleanup</TableCell>
              <TableCell sx={headSx}>Events</TableCell>
              <TableCell sx={headSx}>Cost</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow hover sx={{ '&:hover': { bgcolor: T.hover } }}>
              <TableCell sx={cellSx}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                  {sc?.name ?? 'xforce-devops'}
                </Typography>
              </TableCell>
              <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                <ScoreGauge value={sc.overall} size={44} />
              </TableCell>
              <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                <Chip label={`Grade ${sc.grade}`} size="small"
                  sx={{ bgcolor: gradeBg[sc.grade], color: gradeColors[sc.grade],
                    border: `1px solid ${gradeColors[sc.grade]}44`, fontWeight: 700, fontSize: 11 }} />
              </TableCell>
              {[sc.cpu_eff, sc.mem_eff, sc.cleanup, sc.event_health, sc.cost_score].map((v, i) => (
                <TableCell key={i} sx={{ ...cellSx, minWidth: 100 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: 5, bgcolor: T.border, borderRadius: 2, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${v}%`, bgcolor: scoreColor(v), borderRadius: 2 }} />
                    </Box>
                    <Typography sx={{ fontSize: 11, color: scoreColor(v), minWidth: 28 }}>{v}%</Typography>
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Typography sx={{ fontSize: 11, color: T.muted, mt: 2 }}>
        Score formula: CPU Eff. ×25% + Mem Eff. ×15% + Cleanup Debt ×30% + Event Health ×15% + Cost Opt. ×15%
      </Typography>
    </Box>
  );
};

export default ClusterScore;
