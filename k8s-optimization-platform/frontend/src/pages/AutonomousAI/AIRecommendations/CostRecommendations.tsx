import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import CostAccuracyBanner from '../../../components/CostAccuracyBanner';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Checkbox,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
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

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#f85149',
  medium: '#d29922',
  low:    '#3fb950',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface NsCost { namespace: string; cost: number; cluster?: string }
interface Rec {
  id: string;
  priority: string;
  title: string;
  description: string;
  savings: number;
  effort: string;
  confidence: number;
  affected_namespace?: string;
  cluster?: string;
}
interface CostPayload {
  category: string;
  cluster_name: string;
  total_recommendations: number;
  potential_savings: number;
  namespace_costs: NsCost[];
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; icon?: React.ReactNode }> = ({ label, value, accent, icon }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
    {icon && <Box sx={{ color: accent ?? '#58a6ff' }}>{icon}</Box>}
    <Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  </Box>
);

// ─── Namespace cost bar ───────────────────────────────────────────────────────
const NsCostBar: React.FC<{ ns: NsCost; maxCost: number }> = ({ ns, maxCost }) => {
  const pct = maxCost > 0 ? Math.round((ns.cost / maxCost) * 100) : 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: `1px solid ${DK.border}` }}>
      <Typography sx={{ color: DK.text, fontSize: '0.82rem', minWidth: 140, flexShrink: 0 }} noWrap>{ns.namespace}</Typography>
      <Box sx={{ flex: 1, bgcolor: DK.surface2, borderRadius: 1, height: 6, overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: pct > 70 ? '#f85149' : pct > 40 ? '#d29922' : '#3b82f6', borderRadius: 1, transition: 'width 0.5s' }} />
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.78rem', minWidth: 64, textAlign: 'right' }}>${ns.cost}/mo</Typography>
    </Box>
  );
};

// ─── Recommendation card ──────────────────────────────────────────────────────
const RecCard: React.FC<{
  rec: Rec;
  checked: boolean;
  applying: boolean;
  done: boolean;
  onToggle: () => void;
  onApply: () => void;
}> = ({ rec, checked, applying, done, onToggle, onApply }) => {
  const color = PRIORITY_COLOR[rec.priority] ?? DK.muted;
  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${checked ? '#58a6ff' : DK.border}`,
      borderLeft: `3px solid ${color}`, borderRadius: 2, p: 2, mb: 1.5,
      display: 'flex', gap: 1.5, opacity: done ? 0.45 : 1, transition: 'all 0.2s',
      '&:hover': { borderColor: done ? DK.border : '#58a6ff66', borderLeftColor: color },
    }}>
      <Checkbox checked={checked} onChange={onToggle} size="small" disabled={done}
        sx={{ color: DK.muted, '&.Mui-checked': { color: '#58a6ff' }, p: 0, alignSelf: 'flex-start', mt: 0.25 }} />
      <AttachMoneyIcon sx={{ fontSize: 18, color, flexShrink: 0, mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.4 }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{rec.title}</Typography>
          <Chip label={rec.priority.toUpperCase()} size="small"
            sx={{ bgcolor: color + '22', color, fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${color}44` }} />
          <Chip label={`effort: ${rec.effort}`} size="small"
            sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.65rem' }} />
        </Box>
        <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 0.75 }}>{rec.description}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {rec.affected_namespace && (
            <Chip label={rec.affected_namespace} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 18 }} />
          )}
          <Chip label={`confidence: ${Math.round((rec.confidence || 0) * 100)}%`} size="small"
            sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 18 }} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75, flexShrink: 0 }}>
        <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '0.95rem' }}>${rec.savings}/mo</Typography>
        {done ? (
          <Chip icon={<CheckCircleOutlineIcon />} label="Applied" size="small"
            sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.68rem' }} />
        ) : (
          <Button size="small" variant="outlined"
            startIcon={applying ? <CircularProgress size={12} /> : <PlayArrowIcon />}
            disabled={applying} onClick={onApply}
            sx={{ borderColor: color, color, textTransform: 'none', fontSize: '0.75rem',
                  '&:hover': { bgcolor: color + '22' } }}>
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        )}
      </Box>
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const CostRecommendations: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<CostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/recommendations/cost${clusterParam}`);
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
        body: JSON.stringify({ resource_name: rec.affected_namespace ?? rec.title, namespace: rec.affected_namespace ?? 'default',
          issue_type: 'cost_optimization', cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json();
      const cmdId = body.command_id;
      if (!cmdId) throw new Error('No command_id');
      const result = await pollCommand(cmdId);
      if (result.ok) {
        setDone(p => ({ ...p, [rec.id]: true }));
        setToast({ msg: `Applied — ${rec.title}`, sev: 'success' });
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
  const nsCosts = data?.namespace_costs ?? [];
  const maxCost = nsCosts.length > 0 ? Math.max(...nsCosts.map(n => n.cost)) : 1;
  const selectedTotal = recs.filter(r => checked[r.id] && !done[r.id]).reduce((s, r) => s + r.savings, 0);
  const selectedCount = Object.values(checked).filter(Boolean).length;

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Cost Recommendations</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>
            {activeClusterName} — AI-powered cost savings sorted by ROI
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
            <KpiCard label="Total Recommendations" value={data.total_recommendations} icon={<AttachMoneyIcon />} />
            <KpiCard label="Potential Savings" value={`$${data.potential_savings}/mo`} accent="#3fb950" icon={<TrendingDownIcon />} />
            {selectedCount > 0 && (
              <KpiCard label="Selected Savings" value={`$${selectedTotal.toFixed(2)}/mo`} accent="#3b82f6" icon={<AttachMoneyIcon />} />
            )}
          </Box>

          {/* Namespace cost bar chart */}
          {nsCosts.length > 0 && (
            <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, mb: 3 }}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5 }}>
                Cost by Namespace
              </Typography>
              {nsCosts.map(ns => <NsCostBar key={ns.namespace} ns={ns} maxCost={maxCost} />)}
            </Box>
          )}

          {/* Recommendations */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>
              Recommendations ({recs.length})
            </Typography>
            {selectedCount > 0 && (
              <Button variant="contained" size="small"
                onClick={() => recs.filter(r => checked[r.id] && !done[r.id]).forEach(r => handleApply(r))}
                sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, textTransform: 'none', fontWeight: 600 }}>
                Apply Selected ({selectedCount}) — save ${selectedTotal.toFixed(2)}/mo
              </Button>
            )}
          </Box>

          {recs.length === 0 ? (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No recommendations found</Typography>
          ) : (
            recs.map(rec => (
              <RecCard key={rec.id} rec={rec}
                checked={checked[rec.id] ?? false}
                applying={applying[rec.id] ?? false}
                done={done[rec.id] ?? false}
                onToggle={() => setChecked(p => ({ ...p, [rec.id]: !p[rec.id] }))}
                onApply={() => handleApply(rec)}
              />
            ))
          )}
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.sev ?? 'info'} sx={{ width: '100%' }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CostRecommendations;
