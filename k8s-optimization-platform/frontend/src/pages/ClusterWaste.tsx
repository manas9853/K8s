import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Paper, LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Layers as LayersIcon,
  FolderOutlined as FolderIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';
import CostAccuracyBanner from '../components/CostAccuracyBanner';

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface CostOverview {
  current_monthly_cost:   number;
  optimized_monthly_cost: number;
  monthly_savings:        number;
  yearly_savings:         number;
  savings_percent:        number;
  cost_breakdown: Array<{
    category:        string;
    current_cost:    number;
    optimized_cost:  number;
    savings:         number;
    savings_percent: number;
  }>;
  savings_by_namespace: Array<{
    name:            string;
    current_cost:    number;
    optimized_cost:  number;
    savings:         number;
    savings_percent: number;
  }>;
}

interface CleanupSummary {
  total_resources: number;
}

interface WasteData {
  overview:     CostOverview | null;
  pvcs:         CleanupSummary | null;
  replicasets:  CleanupSummary | null;
  idleNs:       CleanupSummary | null;
  unusedDeps:   number;
  warningEvents:number;
  totalPods:    number;
  runningPods:  number;
  // derived
  cpuWastePct:  number;
  memWastePct:  number;
  storageGb:    number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const wasteColor = (pct: number) =>
  pct >= 60 ? T.red : pct >= 35 ? T.yellow : T.green;

const wasteBarColor = (pct: number) =>
  pct >= 60 ? '#450a0a' : pct >= 35 ? '#451a03' : '#052e16';

const efficiencyScore = (cpuW: number, memW: number) =>
  Math.max(0, Math.min(100, Math.round(100 - (cpuW * 0.6 + memW * 0.4))));

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string; value: string | number; sub?: string;
  accent?: string; icon?: React.ReactNode;
}> = ({ label, value, sub, accent, icon }) => (
  <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent ?? T.text, lineHeight: 1 }}>
            {value}
          </Typography>
          {sub && <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
        </Box>
        {icon && <Box sx={{ color: T.muted, mt: 0.5 }}>{icon}</Box>}
      </Box>
    </CardContent>
  </Card>
);

// ─── Waste bar ────────────────────────────────────────────────────────────────
const WasteBar: React.FC<{ label: string; pct: number; cur: number; opt: number }> = ({ label, pct, cur, opt }) => (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
      <Typography sx={{ fontSize: 13, color: T.body }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 12, color: T.muted }}>
          ${cur.toFixed(0)}/mo
        </Typography>
        <Chip label={`${pct.toFixed(1)}% waste`} size="small"
          sx={{ bgcolor: wasteBarColor(pct), color: wasteColor(pct),
            border: `1px solid ${wasteColor(pct)}44`, fontSize: 11, height: 20 }} />
      </Box>
    </Box>
    <Box sx={{ position: 'relative', height: 8, bgcolor: T.border, borderRadius: 4, overflow: 'hidden' }}>
      {/* optimized portion (green) */}
      <Box sx={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${Math.min(100, (opt / cur) * 100)}%`,
        bgcolor: T.green, borderRadius: 4,
      }} />
      {/* wasted portion (red overlay from opt to cur) */}
      <Box sx={{
        position: 'absolute', left: `${Math.min(100, (opt / cur) * 100)}%`, top: 0,
        height: '100%', width: `${Math.min(100, pct)}%`,
        bgcolor: wasteColor(pct), borderRadius: 4, opacity: 0.7,
      }} />
    </Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: T.muted }}>
        Optimal: ${opt.toFixed(0)}/mo
      </Typography>
      <Typography sx={{ fontSize: 11, color: wasteColor(pct) }}>
        Waste: ${(cur - opt).toFixed(0)}/mo
      </Typography>
    </Box>
  </Box>
);

// ─── Main component ───────────────────────────────────────────────────────────
const ClusterWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data,    setData]    = useState<WasteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch in parallel
      const [ovRes, pvcRes, rsRes, nsRes, depRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/unattached-pvcs${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/old-replicasets${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/idle-namespaces${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cleanup/unused-deployments${clusterParam}`),
      ]);

      const overview: CostOverview = ovRes.ok ? await ovRes.json() : null;
      const pvcData   = pvcRes.ok ? await pvcRes.json() : null;
      const rsData    = rsRes.ok  ? await rsRes.json()  : null;
      const nsData    = nsRes.ok  ? await nsRes.json()  : null;
      const depData   = depRes.ok ? await depRes.json() : null;

      // Derive CPU / Mem waste % from cost breakdown
      // CPU: savings_percent from cost_breakdown[0], Mem: [1]
      const cpuBreak = overview?.cost_breakdown?.find(b => b.category.includes('CPU'));
      const memBreak = overview?.cost_breakdown?.find(b => b.category.includes('Memory'));
      const cpuWastePct = cpuBreak?.savings_percent ?? 0;
      const memWastePct = memBreak?.savings_percent ?? 0;

      // Storage from PVC summaries
      const pvcResources = pvcData?.resources ?? [];
      const storageGb = pvcResources.reduce((s: number, p: any) => {
        const cap = p.capacity ?? p.capacity_gb ?? '';
        const m = String(cap).match(/(\d+(\.\d+)?)/);
        return s + (m ? parseFloat(m[1]) : 0);
      }, 0);

      setData({
        overview,
        pvcs:        pvcData?.summary  ?? null,
        replicasets: rsData?.summary   ?? null,
        idleNs:      nsData?.summary   ?? null,
        unusedDeps:  depData?.summary?.total_deployments ?? depData?.deployments?.length ?? 0,
        warningEvents: 0, // from events page — not re-fetched here
        totalPods:   0,
        runningPods: 0,
        cpuWastePct,
        memWastePct,
        storageGb,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  // Also fetch events count for warning count
  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/observability/events${clusterParam}`)
      .then(r => r.ok ? r.json() : [])
      .then((evs: any[]) => {
        setData(prev => prev ? {
          ...prev,
          warningEvents: evs.filter((e: any) => e.type === 'Warning').length,
          totalPods: 0,
          runningPods: 0,
        } : prev);
      })
      .catch(() => {});
  }, [clusterParam]); // eslint-disable-line

  const efficiency = useMemo(() =>
    data ? efficiencyScore(data.cpuWastePct, data.memWastePct) : 0,
    [data]);

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1.2 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5 };

  if (loading) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress sx={{ color: T.green }} />
    </Box>
  );

  if (error) return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      <Alert severity="error" sx={{ bgcolor: '#1a0a0a', color: T.red, border: `1px solid ${T.red}` }}>{error}</Alert>
    </Box>
  );

  const ov = data?.overview;
  const cpuBreak = ov?.cost_breakdown?.find(b => b.category.includes('CPU'));
  const memBreak = ov?.cost_breakdown?.find(b => b.category.includes('Memory'));

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>
            Cluster Waste
          </Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Resource waste analysis derived from live agent data — xforce-devops
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* Top stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Monthly Waste"
            value={`$${ov?.monthly_savings?.toFixed(0) ?? 0}`}
            sub={`$${ov?.yearly_savings?.toFixed(0) ?? 0}/yr potential`}
            accent={T.red}
            icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="CPU Waste"
            value={`${data?.cpuWastePct?.toFixed(1) ?? 0}%`}
            sub={`$${cpuBreak?.savings?.toFixed(0) ?? 0}/mo over-provisioned`}
            accent={wasteColor(data?.cpuWastePct ?? 0)}
            icon={<MemoryIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Memory Waste"
            value={`${data?.memWastePct?.toFixed(1) ?? 0}%`}
            sub={`$${memBreak?.savings?.toFixed(0) ?? 0}/mo over-provisioned`}
            accent={wasteColor(data?.memWastePct ?? 0)}
            icon={<MemoryIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Efficiency Score"
            value={`${efficiency}/100`}
            sub={efficiency >= 70 ? 'Good shape' : efficiency >= 50 ? 'Needs attention' : 'High waste'}
            accent={efficiency >= 70 ? T.green : efficiency >= 50 ? T.yellow : T.red}
            icon={<CheckIcon sx={{ fontSize: 22 }} />}
          />
        </Grid>
      </Grid>

      {/* Second row — cleanup counts */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Orphaned PVCs"
            value={data?.pvcs?.total_resources ?? 0}
            sub="Unattached volumes"
            accent={T.yellow}
            icon={<StorageIcon sx={{ fontSize: 20 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Old ReplicaSets"
            value={data?.replicasets?.total_resources ?? 0}
            sub="Zero-replica, stale"
            accent={T.yellow}
            icon={<LayersIcon sx={{ fontSize: 20 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Idle Namespaces"
            value={data?.idleNs?.total_resources ?? 0}
            sub="No active workloads"
            accent={T.yellow}
            icon={<FolderIcon sx={{ fontSize: 20 }} />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            label="Warning Events"
            value={data?.warningEvents ?? 0}
            sub="Active cluster warnings"
            accent={data?.warningEvents ? T.red : T.green}
            icon={<WarningIcon sx={{ fontSize: 20 }} />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>

        {/* Left: Resource cost breakdown bars */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, p: 2.5, height: '100%' }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text, mb: 2, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Resource Cost Breakdown
            </Typography>
            {cpuBreak && (
              <WasteBar
                label="Compute (CPU)"
                pct={cpuBreak.savings_percent}
                cur={cpuBreak.current_cost}
                opt={cpuBreak.optimized_cost}
              />
            )}
            {memBreak && (
              <WasteBar
                label="Memory"
                pct={memBreak.savings_percent}
                cur={memBreak.current_cost}
                opt={memBreak.optimized_cost}
              />
            )}

            {/* Total summary */}
            <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${T.border}` }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: 12, color: T.muted }}>Current monthly spend</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.body }}>
                  ${ov?.current_monthly_cost?.toFixed(2) ?? '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: 12, color: T.muted }}>Optimised monthly spend</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.green }}>
                  ${ov?.optimized_monthly_cost?.toFixed(2) ?? '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 12, color: T.muted }}>Potential monthly savings</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.red }}>
                  ${ov?.monthly_savings?.toFixed(2) ?? '—'} ({ov?.savings_percent?.toFixed(1) ?? 0}%)
                </Typography>
              </Box>
            </Box>

            {/* Overall waste bar */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: T.muted }}>Overall waste</Typography>
                <Typography sx={{ fontSize: 12, color: wasteColor(ov?.savings_percent ?? 0) }}>
                  {ov?.savings_percent?.toFixed(1) ?? 0}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={ov?.savings_percent ?? 0}
                sx={{
                  height: 6, borderRadius: 3, bgcolor: T.border,
                  '& .MuiLinearProgress-bar': {
                    bgcolor: wasteColor(ov?.savings_percent ?? 0),
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Right: per-namespace waste table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Waste by Namespace
              </Typography>
              <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.25 }}>
                Top {ov?.savings_by_namespace?.length ?? 0} namespaces by savings opportunity
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#161f30' }}>
                    <TableCell sx={headSx}>Namespace</TableCell>
                    <TableCell sx={{ ...headSx, textAlign: 'right' }}>Current</TableCell>
                    <TableCell sx={{ ...headSx, textAlign: 'right' }}>Optimal</TableCell>
                    <TableCell sx={{ ...headSx, textAlign: 'right' }}>Waste/mo</TableCell>
                    <TableCell sx={headSx}>Waste %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(ov?.savings_by_namespace ?? []).map((ns) => {
                    const wPct = ns.savings_percent;
                    return (
                      <TableRow key={ns.name} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                        <TableCell sx={cellSx}>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>
                            {ns.name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.muted }}>
                          ${ns.current_cost.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'right', color: T.green }}>
                          ${ns.optimized_cost.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: wasteColor(wPct) }}>
                            ${ns.savings.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ ...cellSx, minWidth: 110 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: 1, height: 5, bgcolor: T.border, borderRadius: 2, overflow: 'hidden' }}>
                              <Box sx={{
                                height: '100%', width: `${Math.min(100, wPct)}%`,
                                bgcolor: wasteColor(wPct), borderRadius: 2,
                              }} />
                            </Box>
                            <Typography sx={{ fontSize: 11, color: wasteColor(wPct), minWidth: 36, textAlign: 'right' }}>
                              {wPct.toFixed(0)}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!ov?.savings_by_namespace?.length) && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                        No namespace data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Cleanup opportunity cards */}
      <Box sx={{ mt: 3 }}>
        <Typography sx={{ fontSize: 13, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8, mb: 2 }}>
          Cleanup Opportunities
        </Typography>
        <Grid container spacing={2}>
          {[
            {
              label: 'Unattached PVCs',
              value: data?.pvcs?.total_resources ?? 0,
              desc:  'Unattached volumes consuming storage',
              icon:  <StorageIcon sx={{ fontSize: 20 }} />,
              href:  '/unattached-pvcs',
            },
            {
              label: 'Old ReplicaSets',
              value: data?.replicasets?.total_resources ?? 0,
              desc:  'Superseded RS with 0 replicas',
              icon:  <LayersIcon sx={{ fontSize: 20 }} />,
              href:  '/old-replicasets',
            },
            {
              label: 'Idle Namespaces',
              value: data?.idleNs?.total_resources ?? 0,
              desc:  'Empty namespaces with no active workloads',
              icon:  <FolderIcon sx={{ fontSize: 20 }} />,
              href:  '/idle-namespaces',
            },
            {
              label: 'Unused Deployments',
              value: data?.unusedDeps ?? 0,
              desc:  '0 ready replicas despite desired > 0',
              icon:  <WarningIcon sx={{ fontSize: 20 }} />,
              href:  '/unused-deployments',
            },
          ].map(item => (
            <Grid item xs={6} sm={3} key={item.label}>
              <Card
                component="a"
                href={item.href}
                sx={{
                  bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2,
                  textDecoration: 'none', display: 'block',
                  transition: 'border-color 0.15s',
                  '&:hover': { borderColor: T.muted, bgcolor: T.hover },
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ color: item.value > 0 ? T.yellow : T.green }}>{item.icon}</Box>
                    <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {item.label}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 28, fontWeight: 700, color: item.value > 0 ? T.yellow : T.green, lineHeight: 1 }}>
                    {item.value}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: T.muted, mt: 0.5 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};

export default ClusterWaste;
