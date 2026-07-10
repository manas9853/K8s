import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Switch,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import BoltIcon from '@mui/icons-material/Bolt';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
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

const CAT_COLOR: Record<string, string> = {
  CPU_WASTE:     '#d29922',
  MEMORY_WASTE:  '#3b82f6',
  STORAGE_WASTE: '#a371f7',
  RELIABILITY:   '#f85149',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Operation {
  operation_id: string;
  category: string;
  name: string;
  description: string;
  affected_resources: number;
  total_savings: number;
  risk: string;
}
interface BulkPayload {
  category: string;
  cluster_name: string;
  total_operations: number;
  total_potential_savings: number;
  available_namespaces: string[];
  available_operations: Operation[];
}

type ExecStatus = 'idle' | 'running' | 'done' | 'failed';
interface Progress { opId: string; label: string; status: ExecStatus; msg?: string }

// ─── Category icon ─────────────────────────────────────────────────────────
const CatIcon: React.FC<{ cat: string; sx?: object }> = ({ cat, sx = {} }) => {
  const color = CAT_COLOR[cat] ?? DK.muted;
  const s = { fontSize: 18, color, ...sx };
  if (cat === 'CPU_WASTE')     return <SpeedIcon sx={s} />;
  if (cat === 'MEMORY_WASTE')  return <MemoryIcon sx={s} />;
  if (cat === 'STORAGE_WASTE') return <StorageIcon sx={s} />;
  return <BoltIcon sx={s} />;
};

// ─── Shared poll helper ───────────────────────────────────────────────────────
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
  return { ok: false, errMsg: `Timed out (cmd #${cmdId})` };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const BulkFixes: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]       = useState<BulkPayload | null>(null);
  const [loading, setLoading]       = useState(true);
  const [nsFilter, setNsFilter]     = useState<string>('all');
  const [dryRun, setDryRun]         = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [progress, setProgress]     = useState<Progress[]>([]);
  const [running, setRunning]       = useState(false);
  const [toast, setToast]           = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/autofix/bulk-fixes${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
      setSelected(new Set());
      setProgress([]);
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Failed', sev: 'error' }); }
    finally { setLoading(false); }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const executeSelected = async () => {
    const ops = (payload?.available_operations ?? []).filter(o => selected.has(o.operation_id));
    if (ops.length === 0) return;

    if (dryRun) {
      // Dry-run: show preview without applying
      setProgress(ops.map(o => ({ opId: o.operation_id, label: o.name, status: 'done', msg: `[DRY-RUN] Would affect ${o.affected_resources} resources, saving $${o.total_savings.toFixed(0)}/mo` })));
      setToast({ open: true, msg: `🔍 Dry-run preview for ${ops.length} operation${ops.length > 1 ? 's' : ''}`, sev: 'info' });
      return;
    }

    setRunning(true);
    setProgress(ops.map(o => ({ opId: o.operation_id, label: o.name, status: 'idle' })));

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      setProgress(prev => prev.map(p => p.opId === op.operation_id ? { ...p, status: 'running' } : p));
      try {
        const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_name: op.operation_id, namespace: nsFilter === 'all' ? 'default' : nsFilter,
            issue_type: op.category.toLowerCase(), cpu_request: 0, memory_request_mb: 0 }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setProgress(prev => prev.map(p => p.opId === op.operation_id ? { ...p, status: 'failed', msg: body?.detail ?? `HTTP ${res.status}` } : p));
          continue;
        }
        const { ok, errMsg } = await pollCommand(body.command_id);
        setProgress(prev => prev.map(p => p.opId === op.operation_id
          ? { ...p, status: ok ? 'done' : 'failed', msg: ok ? `✅ ${op.affected_resources} resources patched` : `❌ ${errMsg}` } : p));
      } catch (e: any) {
        setProgress(prev => prev.map(p => p.opId === op.operation_id ? { ...p, status: 'failed', msg: e.message } : p));
      }
    }

    const done   = progress.filter(p => p.status === 'done').length + 1;
    const failed = progress.filter(p => p.status === 'failed').length;
    setToast({ open: true, msg: `Execution complete — ${ops.length - failed} succeeded, ${failed} failed`, sev: failed > 0 ? 'error' : 'success' });
    setRunning(false);
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  const ops = payload?.available_operations ?? [];
  const namespaces = payload?.available_namespaces ?? [];
  const selOps = ops.filter(o => selected.has(o.operation_id));
  const selSavings = selOps.reduce((s, o) => s + o.total_savings, 0);
  const selResources = selOps.reduce((s, o) => s + o.affected_resources, 0);

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Bulk Fixes</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Apply fixes across multiple resources simultaneously —{' '}
            <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Tooltip title="Refresh"><IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BoltIcon sx={{ color: '#58a6ff' }} />
            <Box><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Operations</Typography><Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>{ops.length}</Typography></Box>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AttachMoneyIcon sx={{ color: '#3fb950' }} />
            <Box><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Potential Savings</Typography><Typography sx={{ color: '#3fb950', fontSize: '1.5rem', fontWeight: 700 }}>${(payload?.total_potential_savings ?? 0).toFixed(0)}/mo</Typography></Box>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Selected</Typography>
            <Typography sx={{ color: '#58a6ff', fontSize: '1.5rem', fontWeight: 700 }}>{selected.size}</Typography>
          </Box>
        </Grid>
        <Grid item xs={6} md={3}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Selected Savings</Typography>
            <Typography sx={{ color: '#3fb950', fontSize: '1.5rem', fontWeight: 700 }}>${selSavings.toFixed(0)}/mo</Typography>
          </Box>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* ── Left: operation builder ── */}
        <Grid item xs={12} md={7}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${DK.border}` }}>
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>
                Select Operations
              </Typography>
            </Box>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {ops.map(op => {
                const color    = CAT_COLOR[op.category] ?? DK.muted;
                const isSel    = selected.has(op.operation_id);
                const prog     = progress.find(p => p.opId === op.operation_id);
                const isRunning = prog?.status === 'running';
                const isDone   = prog?.status === 'done';
                const isFailed = prog?.status === 'failed';
                return (
                  <Box key={op.operation_id}
                    onClick={() => !running && toggleSelect(op.operation_id)}
                    sx={{
                      bgcolor: DK.surface2, border: `1px solid ${isSel ? color : DK.border}`,
                      borderLeft: `3px solid ${color}`, borderRadius: 2, p: 2,
                      cursor: running ? 'default' : 'pointer', opacity: isDone ? 0.55 : 1,
                      transition: 'all 0.2s', '&:hover': { borderColor: running ? DK.border : color },
                    }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                      <CatIcon cat={op.category} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 0.3 }}>
                          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{op.name}</Typography>
                          <Chip label={op.category.replace('_', ' ')} size="small"
                            sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontSize: '0.62rem', height: 18, fontWeight: 700 }} />
                          <Chip label={`risk: ${op.risk}`} size="small" variant="outlined"
                            sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.62rem', height: 18 }} />
                        </Box>
                        <Typography sx={{ color: DK.muted, fontSize: '0.77rem' }}>{op.description}</Typography>
                        {prog && (
                          <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            {isRunning && <CircularProgress size={12} sx={{ color }} />}
                            <Typography sx={{ color: isDone ? '#3fb950' : isFailed ? '#f85149' : DK.muted, fontSize: '0.75rem' }}>
                              {prog.msg ?? (isRunning ? 'Applying…' : '')}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '0.88rem' }}>
                          ${op.total_savings.toFixed(0)}<Typography component="span" sx={{ color: DK.muted, fontSize: '0.65rem' }}>/mo</Typography>
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.7rem' }}>{op.affected_resources} resources</Typography>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: isSel ? color : DK.border, mt: 0.5, ml: 'auto', transition: 'background 0.2s' }} />
                      </Box>
                    </Box>
                  </Box>
                );
              })}
              {ops.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 32, color: '#3fb950', mb: 1 }} />
                  <Typography sx={{ color: DK.muted }}>No bulk operations available — cluster is optimized</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>

        {/* ── Right: execution controls ── */}
        <Grid item xs={12} md={5}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>Execution Settings</Typography>

            {/* Namespace filter */}
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: DK.muted, '&.Mui-focused': { color: '#58a6ff' } }}>Namespace filter</InputLabel>
              <Select value={nsFilter} onChange={e => setNsFilter(e.target.value)} label="Namespace filter"
                sx={{ color: DK.text, '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                  '& .MuiSvgIcon-root': { color: DK.muted } }}>
                <MenuItem value="all">All namespaces</MenuItem>
                {namespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Dry-run toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              bgcolor: dryRun ? '#1f6feb1a' : DK.surface2, border: `1px solid ${dryRun ? '#1f6feb55' : DK.border}`,
              borderRadius: 1.5, px: 2, py: 1.25, transition: 'all 0.2s' }}>
              <Box>
                <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.83rem' }}>Dry-run mode</Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Preview changes without applying</Typography>
              </Box>
              <Switch checked={dryRun} onChange={e => setDryRun(e.target.checked)} size="small"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#58a6ff' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#58a6ff' } }} />
            </Box>

            {/* Selection summary */}
            {selected.size > 0 && (
              <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, px: 2, py: 1.5 }}>
                <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.83rem', mb: 0.5 }}>Selected operations</Typography>
                {selOps.map(o => (
                  <Box key={o.operation_id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                    <Typography sx={{ color: DK.muted, fontSize: '0.77rem' }} noWrap>{o.name}</Typography>
                    <Typography sx={{ color: '#3fb950', fontSize: '0.77rem', fontWeight: 600, ml: 1, flexShrink: 0 }}>
                      ${o.total_savings.toFixed(0)}/mo
                    </Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 0.75, borderTop: `1px solid ${DK.border}` }}>
                  <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.8rem' }}>Total impact</Typography>
                  <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '0.83rem' }}>
                    {selResources} resources · ${selSavings.toFixed(0)}/mo
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Execute button */}
            <Button variant="contained" fullWidth size="large"
              startIcon={running ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : dryRun ? <CheckCircleOutlineIcon /> : <PlayArrowIcon />}
              disabled={selected.size === 0 || running}
              onClick={executeSelected}
              sx={{ bgcolor: dryRun ? '#1f6feb' : '#238636', '&:hover': { bgcolor: dryRun ? '#388bfd' : '#2ea043' },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted }, fontWeight: 700, fontSize: '0.88rem' }}>
              {running ? `Executing (${progress.filter(p => p.status === 'running').length} running)…`
               : dryRun ? `Preview ${selected.size} Operation${selected.size !== 1 ? 's' : ''}`
               : `Execute ${selected.size} Operation${selected.size !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        </Grid>
      </Grid>

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BulkFixes;

// Made with Bob
