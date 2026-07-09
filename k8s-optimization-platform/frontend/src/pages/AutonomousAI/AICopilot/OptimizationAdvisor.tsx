import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Tooltip,
  IconButton,
  Snackbar,
  Alert,
  Checkbox,
  Button,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import SpeedIcon from '@mui/icons-material/Speed';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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

const IMPACT: Record<string, string> = {
  high:   '#f85149',
  medium: '#d29922',
  low:    '#3fb950',
};
const EFFORT: Record<string, string> = {
  low:    '#3fb950',
  medium: '#d29922',
  high:   '#f85149',
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Rec {
  id: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
  savings: number;
  resources_affected: number;
  affected_names: string[];
}

interface AdvisorPayload {
  advisor_type: string;
  cluster: string;
  recommendations: Rec[];
  total_potential_savings: number;
  priority_actions: number;
  last_updated: string;
}

// ─── Small badge ──────────────────────────────────────────────────────────────
const Badge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <Chip
    label={label.toUpperCase()}
    size="small"
    sx={{
      bgcolor: `${color}1a`,
      color,
      border: `1px solid ${color}44`,
      fontWeight: 700,
      fontSize: '0.65rem',
      height: 20,
    }}
  />
);

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; icon: React.ReactNode }> = ({ label, value, accent, icon }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
    <Box sx={{ color: accent ?? '#58a6ff', flexShrink: 0 }}>{icon}</Box>
    <Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  </Box>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const OptimizationAdvisor: React.FC = () => {
  const { activeClusterId, activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]       = useState<AdvisorPayload | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [applying, setApplying]     = useState<string | null>(null);   // rec id currently being applied
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [toast, setToast]           = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/copilot/optimization-advisor${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Apply one recommendation via root-cause fix endpoint ──────────────────
  const applyRec = async (rec: Rec) => {
    const podName  = rec.affected_names[0] ?? 'unknown';
    const nsGuess  = 'default'; // namespace not in advisor payload; use default
    setApplying(rec.id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name:      podName,
          namespace:          nsGuess,
          issue_type:         rec.impact === 'high' ? 'cpu_overprovisioned' : 'resource_waste',
          cpu_request:        0,
          memory_request_mb:  0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ open: true, msg: body?.detail ?? `Fix failed (HTTP ${res.status})`, sev: 'error' });
        return;
      }
      const cmdId = body.command_id;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
        if (!poll) continue;
        const status = await poll.json().catch(() => ({}));
        if (status.status === 'done') {
          setAppliedIds(prev => new Set(prev).add(rec.id));
          setToast({ open: true, msg: `✅ Applied: ${rec.title}`, sev: 'success' });
          return;
        }
        if (status.status === 'failed') {
          const err = status.result?.error ?? 'Command failed';
          const k8s = err.match(/"message":"([^"]+)"/);
          setToast({ open: true, msg: `❌ ${k8s ? k8s[1] : err.slice(0, 120)}`, sev: 'error' });
          return;
        }
      }
      setToast({ open: true, msg: `⏱ Timed out — check Command Center (cmd #${cmdId})`, sev: 'error' });
    } catch (e: any) {
      setToast({ open: true, msg: e?.message ?? 'Network error', sev: 'error' });
    } finally {
      setApplying(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const applySelected = async () => {
    if (!payload) return;
    for (const rec of payload.recommendations.filter(r => selected.has(r.id) && !appliedIds.has(r.id))) {
      await applyRec(rec);
    }
    setSelected(new Set());
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const recs        = payload?.recommendations ?? [];
  const quickWins   = recs.filter(r => r.effort === 'low' && r.impact !== 'low');
  const highImpact  = recs.filter(r => r.impact === 'high');
  const totalSavings = payload?.total_potential_savings ?? 0;
  const selectedSavings = recs
    .filter(r => selected.has(r.id))
    .reduce((s, r) => s + r.savings, 0);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>
            Optimization Advisor
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            AI-powered savings opportunities for{' '}
            <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <KpiCard label="Total Potential Savings" value={`$${totalSavings.toLocaleString()}/mo`} accent="#3fb950" icon={<AttachMoneyIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="Recommendations" value={recs.length} icon={<TrendingUpIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="High Impact" value={highImpact.length} accent="#f85149" icon={<SpeedIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="Quick Wins" value={quickWins.length} accent="#d29922" icon={<BoltIcon />} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>

        {/* ── Left: rec cards ────────────────────────────────────────────── */}
        <Grid item xs={12} md={8}>

          {/* Quick Wins section */}
          {quickWins.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <BoltIcon sx={{ fontSize: 16, color: '#d29922' }} />
                <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>
                  Quick Wins — low effort, high reward
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {quickWins.filter(r => !appliedIds.has(r.id)).map(rec => (
                  <RecCard
                    key={rec.id}
                    rec={rec}
                    selected={selected.has(rec.id)}
                    applying={applying === rec.id}
                    onToggle={() => toggleSelect(rec.id)}
                    onApply={() => applyRec(rec)}
                    highlight
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* All recommendations */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: DK.muted }} />
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>
              All Recommendations
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {recs.filter(r => !appliedIds.has(r.id)).map(rec => (
              <RecCard
                key={rec.id}
                rec={rec}
                selected={selected.has(rec.id)}
                applying={applying === rec.id}
                onToggle={() => toggleSelect(rec.id)}
                onApply={() => applyRec(rec)}
              />
            ))}
            {recs.length === 0 && (
              <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, textAlign: 'center' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 32, color: '#3fb950', mb: 1 }} />
                <Typography sx={{ color: DK.muted }}>No optimization opportunities found — cluster is well-optimized</Typography>
              </Box>
            )}
          </Box>
        </Grid>

        {/* ── Right: savings calculator sidebar ──────────────────────────── */}
        <Grid item xs={12} md={4}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, position: 'sticky', top: 16 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem', mb: 2 }}>
              Savings Calculator
            </Typography>

            {/* Selected savings */}
            <Box sx={{ bgcolor: DK.surface2, borderRadius: 1.5, p: 2, mb: 2 }}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mb: 0.5 }}>
                Selected ({selected.size} fix{selected.size !== 1 ? 'es' : ''})
              </Typography>
              <Typography sx={{ color: '#3fb950', fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>
                ${selectedSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <Typography component="span" sx={{ color: DK.muted, fontSize: '0.78rem', ml: 0.5 }}>/mo</Typography>
              </Typography>
            </Box>

            {/* All savings breakdown */}
            {recs.map(rec => (
              <Box key={rec.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: `1px solid ${DK.border}` }}>
                <Typography sx={{ color: selected.has(rec.id) ? DK.text : DK.muted, fontSize: '0.78rem', flex: 1, pr: 1 }} noWrap>
                  {rec.title}
                </Typography>
                <Typography sx={{ color: '#3fb950', fontSize: '0.78rem', fontWeight: 600, flexShrink: 0 }}>
                  ${rec.savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
            ))}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, pt: 1 }}>
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.83rem' }}>Total potential</Typography>
              <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '0.9rem' }}>
                ${totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
              </Typography>
            </Box>

            {/* Apply selected button */}
            {selected.size > 0 && (
              <Button
                fullWidth
                variant="contained"
                onClick={applySelected}
                disabled={applying !== null}
                startIcon={<PlayArrowIcon />}
                sx={{
                  mt: 2,
                  bgcolor: '#238636',
                  '&:hover': { bgcolor: '#2ea043' },
                  '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
                  fontWeight: 600,
                  fontSize: '0.83rem',
                }}
              >
                Apply Selected ({selected.size})
              </Button>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// ─── Recommendation card component ────────────────────────────────────────────
const RecCard: React.FC<{
  rec: Rec;
  selected: boolean;
  applying: boolean;
  onToggle: () => void;
  onApply: () => void;
  highlight?: boolean;
}> = ({ rec, selected, applying, onToggle, onApply, highlight }) => {
  const borderAccent = highlight ? '#d29922' : DK.border;
  const impactColor  = IMPACT[rec.impact] ?? DK.muted;
  const effortColor  = EFFORT[rec.effort] ?? DK.muted;

  const TypeIcon = rec.title.toLowerCase().includes('pvc') || rec.title.toLowerCase().includes('storage')
    ? StorageIcon
    : rec.title.toLowerCase().includes('memory')
    ? MemoryIcon
    : SpeedIcon;

  return (
    <Box
      sx={{
        bgcolor: DK.surface,
        border: `1px solid ${selected ? '#58a6ff' : borderAccent}`,
        borderLeft: `3px solid ${impactColor}`,
        borderRadius: 2,
        p: 2,
        display: 'flex',
        gap: 1.5,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: '#58a6ff', borderLeftColor: impactColor },
      }}
    >
      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onChange={onToggle}
        size="small"
        sx={{ color: DK.muted, '&.Mui-checked': { color: '#58a6ff' }, p: 0, alignSelf: 'flex-start', mt: 0.25 }}
      />

      {/* Icon */}
      <TypeIcon sx={{ fontSize: 20, color: impactColor, flexShrink: 0, mt: 0.25 }} />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>
            {rec.title}
          </Typography>
          <Badge label={rec.impact} color={impactColor} />
          <Badge label={`effort: ${rec.effort}`} color={effortColor} />
        </Box>
        <Typography sx={{ color: DK.muted, fontSize: '0.8rem', lineHeight: 1.55 }}>
          {rec.description}
        </Typography>
        {rec.affected_names.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
            {rec.affected_names.slice(0, 4).map((n, i) => (
              <Chip key={i} label={n} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.68rem', height: 20 }} />
            ))}
            {rec.affected_names.length > 4 && (
              <Chip label={`+${rec.affected_names.length - 4} more`} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 20 }} />
            )}
          </Box>
        )}
      </Box>

      {/* Right: savings + apply */}
      <Box sx={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <Box>
          <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}>
            ${rec.savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.65rem' }}>/month</Typography>
        </Box>
        <Tooltip title="Apply this fix via agent">
          <span>
            <IconButton
              size="small"
              onClick={onApply}
              disabled={applying}
              sx={{
                bgcolor: '#238636',
                color: '#fff',
                borderRadius: 1.5,
                width: 32,
                height: 32,
                '&:hover': { bgcolor: '#2ea043' },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
              }}
            >
              {applying
                ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                : <PlayArrowIcon sx={{ fontSize: 16 }} />
              }
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default OptimizationAdvisor;

// Made with Bob
