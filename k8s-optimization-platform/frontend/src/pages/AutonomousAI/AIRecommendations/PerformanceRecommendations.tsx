import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { API_BASE_URL } from '../../../config/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg:       '#0d1117',
  surface:  '#161b22',
  surface2: '#1c2128',
  border:   '#30363d',
  text:     '#e6edf3',
  muted:    '#8b949e',
};

const CAT_ICON: Record<string, React.ElementType> = {
  THROTTLING: SpeedIcon,
  STABILITY:  MemoryIcon,
  CAPACITY:   StorageIcon,
};
const CAT_COLOR: Record<string, string> = {
  THROTTLING: '#d29922',
  STABILITY:  '#f85149',
  CAPACITY:   '#3b82f6',
};

const URGENCY_COLOR: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rec {
  id: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
  confidence: number;
  affected_pod?: string;
  namespace?: string;
  cluster?: string;
  agent_command?: { command: string; params: Record<string, string | number> };
}
interface PerfPayload {
  category: string;
  cluster_name: string;
  performance_score: number;
  total_recommendations: number;
  summary: { total_pods: number; oom_pods: number; no_probe_pods: number; no_cpu_limit_pods: number };
  recommendations: Rec[];
}

// ─── Agent poll helper ────────────────────────────────────────────────────────
async function pollCommand(cmdId: number): Promise<{ ok: boolean; errMsg?: string }> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const res = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
    if (!res) continue;
    const s = await res.json().catch(() => ({}));
    if (s.status === 'done') return { ok: true };
    if (s.status === 'failed') {
      const err = s.result?.error ?? 'Command failed';
      const k8s = err.match(/"message":"([^"]+)"/);
      return { ok: false, errMsg: k8s ? k8s[1] : err.slice(0, 120) };
    }
  }
  return { ok: false, errMsg: `Timed out — check Command Center (cmd #${cmdId})` };
}

// ─── SVG Score Ring ───────────────────────────────────────────────────────────
const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 42; const c = 2 * Math.PI * r;
  const fill = c - (c * score) / 100;
  const color = score >= 80 ? '#3fb950' : score >= 60 ? '#d29922' : '#f85149';
  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      <circle cx={56} cy={56} r={r} fill="none" stroke={DK.border} strokeWidth={8} />
      <circle cx={56} cy={56} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 56 56)" />
      <text x={56} y={61} textAnchor="middle" fill={color} fontSize={22} fontWeight={700}>{score}</text>
    </svg>
  );
};

// ─── Rec card ─────────────────────────────────────────────────────────────────
const RecCard: React.FC<{
  rec: Rec;
  applying: boolean;
  done: boolean;
  onApply: () => void;
}> = ({ rec, applying, done, onApply }) => {
  const catColor = CAT_COLOR[rec.category] ?? DK.muted;
  const urgColor = URGENCY_COLOR[rec.priority] ?? DK.muted;
  const CatIcon = CAT_ICON[rec.category] ?? SpeedIcon;
  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderLeft: `3px solid ${catColor}`,
      borderRadius: 2, p: 2, mb: 1.5, display: 'flex', gap: 1.5,
      opacity: done ? 0.45 : 1, transition: 'opacity 0.3s',
      '&:hover': { borderColor: '#58a6ff66', borderLeftColor: catColor },
    }}>
      <CatIcon sx={{ fontSize: 18, color: catColor, flexShrink: 0, mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.4 }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{rec.title}</Typography>
          <Chip label={rec.priority.toUpperCase()} size="small"
            sx={{ bgcolor: urgColor + '22', color: urgColor, fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${urgColor}44` }} />
          <Chip label={rec.category} size="small"
            sx={{ bgcolor: catColor + '22', color: catColor, fontSize: '0.65rem' }} />
        </Box>
        <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 0.75 }}>{rec.description}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {rec.affected_pod && (
            <Chip label={rec.affected_pod} size="small" sx={{ bgcolor: DK.surface2, color: '#3b82f6', fontSize: '0.68rem', height: 18, fontFamily: 'monospace' }} />
          )}
          {rec.namespace && (
            <Chip label={rec.namespace} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 18 }} />
          )}
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start' }}>
        {done ? (
          <Chip icon={<CheckCircleOutlineIcon />} label="Applied" size="small"
            sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.68rem' }} />
        ) : (
          <Button size="small" variant="outlined"
            startIcon={applying ? <CircularProgress size={12} /> : <PlayArrowIcon />}
            disabled={applying} onClick={onApply}
            sx={{ borderColor: catColor, color: catColor, textTransform: 'none', fontSize: '0.75rem',
                  '&:hover': { bgcolor: catColor + '22' } }}>
            {applying ? 'Fixing…' : 'Apply Fix'}
          </Button>
        )}
      </Box>
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const PerformanceRecommendations: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<PerfPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/recommendations/performance${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async (rec: Rec) => {
    setApplying(p => ({ ...p, [rec.id]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: rec.affected_pod ?? rec.title, namespace: rec.namespace ?? 'default',
          issue_type: 'performance', cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json();
      const cmdId = body.command_id;
      if (!cmdId) throw new Error('No command_id');
      const result = await pollCommand(cmdId);
      if (result.ok) {
        setDone(p => ({ ...p, [rec.id]: true }));
        setToast({ msg: `Fix applied — ${rec.title}`, sev: 'success' });
      } else {
        setToast({ msg: result.errMsg ?? 'Failed', sev: 'error' });
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Failed', sev: 'error' });
    } finally {
      setApplying(p => ({ ...p, [rec.id]: false }));
    }
  };

  const recs = data?.recommendations ?? [];
  const categories = [...new Set(recs.map(r => r.category))];

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Performance Recommendations</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>{activeClusterName}</Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted }}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* Score ring + summary */}
          <Box sx={{ display: 'flex', gap: 3, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <ScoreRing score={data.performance_score} />
              <Box>
                <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mb: 0.5 }}>Performance Score</Typography>
                <Typography sx={{ color: DK.text, fontSize: '0.82rem' }}>{data.total_recommendations} issues found</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, flex: 1 }}>
              {[
                { label: 'Total Pods', v: data.summary.total_pods },
                { label: 'OOM Pods', v: data.summary.oom_pods, accent: '#f85149' },
                { label: 'No CPU Limit', v: data.summary.no_cpu_limit_pods, accent: '#d29922' },
                { label: 'No Probe', v: data.summary.no_probe_pods, accent: '#d29922' },
              ].map(({ label, v, accent }) => (
                <Box key={label} sx={{ bgcolor: DK.surface, border: `1px solid ${accent ? accent + '33' : DK.border}`, borderRadius: 1.5, p: 1.5 }}>
                  <Typography sx={{ color: DK.muted, fontSize: '0.68rem' }}>{label}</Typography>
                  <Typography sx={{ color: accent ?? DK.text, fontWeight: 700, fontSize: '1.1rem' }}>{v}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Grouped by category */}
          {categories.map(cat => {
            const catRecs = recs.filter(r => r.category === cat);
            const catColor = CAT_COLOR[cat] ?? DK.muted;
            const CatIcon = CAT_ICON[cat] ?? SpeedIcon;
            return (
              <Box key={cat} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <CatIcon sx={{ fontSize: 16, color: catColor }} />
                  <Typography sx={{ color: catColor, fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat}</Typography>
                  <Chip label={catRecs.length} size="small" sx={{ bgcolor: catColor + '22', color: catColor, fontSize: '0.68rem', height: 18 }} />
                </Box>
                {catRecs.map(rec => (
                  <RecCard key={rec.id} rec={rec}
                    applying={applying[rec.id] ?? false}
                    done={done[rec.id] ?? false}
                    onApply={() => handleApply(rec)}
                  />
                ))}
              </Box>
            );
          })}

          {recs.length === 0 && (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No performance issues found — cluster is healthy</Typography>
          )}
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.sev ?? 'info'} sx={{ width: '100%' }}>{toast?.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default PerformanceRecommendations;
