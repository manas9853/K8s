import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Checkbox,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { API_BASE_URL } from '../../../config/api';
import { colors } from '../../../theme/colors';

// ─── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg:       colors.background,
  surface:  colors.surface,
  surface2: colors.surfaceHover,
  border:   colors.border,
  text:     colors.textPrimary,
  muted:    colors.textSecondary,
};

const CAT_COLOR: Record<string, string> = {
  CPU_WASTE:     colors.warning,
  MEMORY_WASTE:  colors.info,
  STORAGE_WASTE: colors.purple,
};
const CAT_ICON: Record<string, React.ElementType> = {
  CPU_WASTE:     SpeedIcon,
  MEMORY_WASTE:  MemoryIcon,
  STORAGE_WASTE: StorageIcon,
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Fix {
  fix_id: string;
  category: string;
  type: string;
  resource: string;
  namespace: string;
  cluster?: string;
  current_cpu?: string;
  recommended_cpu?: string;
  current_memory?: string;
  recommended_memory?: string;
  size?: string;
  savings: number;
  risk: string;
  confidence: number;
  status: string;
  agent_command?: { command: string; params: Record<string, string> };
}
interface ResourcePayload {
  category: string;
  cluster_name: string;
  total_fixes: number;
  potential_savings: number;
  fixes: Fix[];
}

// ─── Shared agent-poll helper ─────────────────────────────────────────────────
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

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; icon: React.ReactNode }> = ({ label, value, accent, icon }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
    <Box sx={{ color: accent ?? colors.info }}>{icon}</Box>
    <Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  </Box>
);

// ─── Fix card ─────────────────────────────────────────────────────────────────
const FixCard: React.FC<{
  fix: Fix;
  checked: boolean;
  applying: boolean;
  fixed: boolean;
  onToggle: () => void;
  onApply: () => void;
}> = ({ fix, checked, applying, fixed, onToggle, onApply }) => {
  const color    = CAT_COLOR[fix.category] ?? DK.muted;
  const Icon     = CAT_ICON[fix.category] ?? SpeedIcon;
  const current  = fix.current_cpu ?? fix.current_memory ?? fix.size ?? '—';
  const recommended = fix.recommended_cpu ?? fix.recommended_memory ?? 'Delete';

  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${checked ? colors.info : DK.border}`,
      borderLeft: `3px solid ${color}`, borderRadius: 2, p: 2,
      display: 'flex', gap: 1.5, opacity: fixed ? 0.45 : 1, transition: 'all 0.2s',
      '&:hover': { borderColor: fixed ? DK.border : colors.info, borderLeftColor: color },
    }}>
      <Checkbox checked={checked} onChange={onToggle} size="small" disabled={fixed}
        sx={{ color: DK.muted, '&.Mui-checked': { color: colors.info }, p: 0, alignSelf: 'flex-start', mt: 0.25 }} />
      <Icon sx={{ fontSize: 18, color, flexShrink: 0, mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.4 }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{fix.resource}</Typography>
          <Chip label={fix.category.replace('_', ' ')} size="small"
            sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontSize: '0.62rem', height: 18, fontWeight: 700 }} />
          <Chip label={fix.namespace} size="small" variant="outlined"
            sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.62rem', height: 18 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box sx={{ bgcolor: `${colors.danger}1a`, border: `1px solid ${colors.danger}44`, borderRadius: 1, px: 0.75, py: 0.15 }}>
            <Typography sx={{ color: colors.danger, fontSize: '0.75rem', fontFamily: 'monospace' }}>- {current}</Typography>
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.7rem' }}>→</Typography>
          <Box sx={{ bgcolor: `${colors.success}1a`, border: `1px solid ${colors.success}44`, borderRadius: 1, px: 0.75, py: 0.15 }}>
            <Typography sx={{ color: colors.success, fontSize: '0.75rem', fontFamily: 'monospace' }}>+ {recommended}</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
        <Typography sx={{ color: colors.success, fontWeight: 700, fontSize: '0.9rem', lineHeight: 1 }}>
          ${fix.savings.toFixed(0)}<Typography component="span" sx={{ color: DK.muted, fontSize: '0.65rem' }}>/mo</Typography>
        </Typography>
        <Tooltip title={fixed ? 'Applied' : 'Apply via agent'}>
          <span>
            <IconButton size="small" onClick={onApply} disabled={applying || fixed}
              sx={{ bgcolor: fixed ? 'transparent' : colors.success, color: fixed ? colors.success : '#fff',
                borderRadius: 1.5, width: 30, height: 30,
                '&:hover': { bgcolor: fixed ? 'transparent' : colors.success },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted } }}>
              {fixed ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
               : applying ? <CircularProgress size={12} sx={{ color: '#fff' }} />
               : <PlayArrowIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const ResourceFixes: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]     = useState<ResourcePayload | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [applying, setApplying]   = useState<string | null>(null);
  const [fixedIds, setFixedIds]   = useState<Set<string>>(new Set());
  const [toast, setToast]         = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/autofix/resource-fixes${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally { setLoading(false); }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFix = async (fix: Fix) => {
    setApplying(fix.fix_id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: fix.resource, namespace: fix.namespace || 'default',
          issue_type: fix.type, cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ open: true, msg: body?.detail ?? `Failed (${res.status})`, sev: 'error' }); return; }
      const { ok, errMsg } = await pollCommand(body.command_id);
      if (ok) {
        setFixedIds(prev => new Set(prev).add(fix.fix_id));
        setToast({ open: true, msg: `✅ Fixed: ${fix.resource}`, sev: 'success' });
      } else {
        setToast({ open: true, msg: `❌ ${errMsg}`, sev: 'error' });
      }
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Network error', sev: 'error' }); }
    finally { setApplying(null); }
  };

  const applySelected = async () => {
    const fixes = (payload?.fixes ?? []).filter(f => selected.has(f.fix_id) && !fixedIds.has(f.fix_id));
    for (const fix of fixes) await applyFix(fix);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: colors.info }} />
    </Box>
  );

  const fixes   = payload?.fixes ?? [];
  const CATS    = ['CPU_WASTE', 'MEMORY_WASTE', 'STORAGE_WASTE'];
  const grouped = CATS.reduce((acc, cat) => ({ ...acc, [cat]: fixes.filter(f => f.category === cat) }), {} as Record<string, Fix[]>);
  const selSavings = fixes.filter(f => selected.has(f.fix_id)).reduce((s, f) => s + f.savings, 0);

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Resource Fixes</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            CPU · Memory · Storage fixes for <span style={{ color: colors.info }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {selected.size > 0 && (
            <Button variant="contained" size="small" startIcon={applying ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <PlayArrowIcon />}
              disabled={applying !== null} onClick={applySelected}
              sx={{ bgcolor: colors.success, '&:hover': { bgcolor: colors.success }, fontWeight: 600 }}>
              Fix Selected ({selected.size}) — ${selSavings.toFixed(0)}/mo
            </Button>
          )}
          <Tooltip title="Refresh"><IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}><RefreshIcon /></IconButton></Tooltip>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><KpiCard label="Total Fixes" value={fixes.length} icon={<PlayArrowIcon />} /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Potential Savings" value={`$${(payload?.potential_savings ?? 0).toFixed(0)}/mo`} accent={colors.success} icon={<AttachMoneyIcon />} /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="CPU Issues" value={grouped.CPU_WASTE?.length ?? 0} accent={colors.warning} icon={<SpeedIcon />} /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Storage Issues" value={grouped.STORAGE_WASTE?.length ?? 0} accent={colors.purple} icon={<StorageIcon />} /></Grid>
      </Grid>

      {CATS.map(cat => {
        const catFixes = grouped[cat] ?? [];
        if (catFixes.length === 0) return null;
        const Icon  = CAT_ICON[cat];
        const color = CAT_COLOR[cat];
        return (
          <Box key={cat} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
              <Icon sx={{ fontSize: 16, color }} />
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>{cat.replace('_', ' ')}</Typography>
              <Chip label={catFixes.length} size="small" sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {catFixes.map(fix => (
                <FixCard key={fix.fix_id} fix={fix}
                  checked={selected.has(fix.fix_id)} applying={applying === fix.fix_id}
                  fixed={fixedIds.has(fix.fix_id)}
                  onToggle={() => toggleSelect(fix.fix_id)} onApply={() => applyFix(fix)} />
              ))}
            </Box>
          </Box>
        );
      })}

      {fixes.length === 0 && (
        <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 36, color: colors.success, mb: 1 }} />
          <Typography sx={{ color: DK.muted }}>No resource fixes needed — cluster is right-sized</Typography>
        </Box>
      )}

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ResourceFixes;

// Made with Bob
