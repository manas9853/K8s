import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Tabs, Tab,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import GavelIcon from '@mui/icons-material/Gavel';
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
const SEV_COLOR: Record<string, string> = { critical: '#f85149', high: '#d29922', medium: '#3b82f6' };
const FW_COLOR: Record<string, string>  = {
  'CIS Benchmark': '#58a6ff',
  'PCI DSS':       '#f85149',
  'ISO 27001':     '#3fb950',
  'HIPAA':         '#a371f7',
  'GDPR':          '#d29922',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface CompFix {
  fix_id: string;
  framework: string;
  control: string;
  type: string;
  resource: string;
  issue: string;
  fix: string;
  status: string;
  impact: string;
}
interface CompPayload {
  category: string;
  total_fixes: number;
  frameworks: Record<string, number>;
  fixes: CompFix[];
  cluster_name: string;
}

// ─── SVG score ring ───────────────────────────────────────────────────────────
const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 80 }) => {
  const r    = (size / 2) - 7;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#3fb950' : pct >= 60 ? '#d29922' : '#f85149';
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={DK.surface2} strokeWidth="7" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography sx={{ color, fontSize: size > 70 ? '1rem' : '0.78rem', fontWeight: 700, lineHeight: 1 }}>{Math.round(pct)}</Typography>
      </Box>
    </Box>
  );
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
const ComplianceFixes: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]   = useState<CompPayload | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [toast, setToast]       = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/autofix/compliance-fixes${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Failed', sev: 'error' }); }
    finally { setLoading(false); }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFix = async (fix: CompFix) => {
    setApplying(fix.fix_id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: fix.type, namespace: 'default',
          issue_type: fix.type, cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ open: true, msg: body?.detail ?? `Failed (${res.status})`, sev: 'error' }); return; }
      const { ok, errMsg } = await pollCommand(body.command_id);
      if (ok) { setFixedIds(prev => new Set(prev).add(fix.fix_id)); setToast({ open: true, msg: `✅ Fixed: ${fix.control} (${fix.framework})`, sev: 'success' }); }
      else setToast({ open: true, msg: `❌ ${errMsg}`, sev: 'error' });
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Network error', sev: 'error' }); }
    finally { setApplying(null); }
  };

  const applyAllForFramework = async (fw: string) => {
    const fixes = (payload?.fixes ?? []).filter(f => f.framework === fw && !fixedIds.has(f.fix_id));
    for (const fix of fixes) await applyFix(fix);
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  const fixes = payload?.fixes ?? [];
  const frameworks = Object.keys(payload?.frameworks ?? {});
  const activeFw = frameworks[activeTab] ?? '';
  const fwFixes  = fixes.filter(f => f.framework === activeFw);
  const fwFixed  = fwFixes.filter(f => fixedIds.has(f.fix_id)).length;
  const fwScore  = fwFixes.length > 0 ? Math.round((fwFixed / fwFixes.length) * 100) : 100;
  const fwColor  = FW_COLOR[activeFw] ?? '#58a6ff';
  const fwUnfixed = fwFixes.filter(f => !fixedIds.has(f.fix_id));

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Compliance Fixes</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Framework compliance fixes for <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Tooltip title="Refresh"><IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      {/* Framework tabs */}
      <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 3, overflow: 'hidden' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ borderBottom: `1px solid ${DK.border}`, '& .MuiTab-root': { color: DK.muted, minHeight: 44 }, '& .Mui-selected': { color: DK.text }, '& .MuiTabs-indicator': { bgcolor: fwColor } }}>
          {frameworks.map((fw, i) => {
            const count = (payload?.frameworks ?? {})[fw] ?? 0;
            const c = FW_COLOR[fw] ?? '#58a6ff';
            return (
              <Tab key={fw} label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{fw}</Typography>
                  <Chip label={count} size="small" sx={{ bgcolor: `${c}1a`, color: c, border: `1px solid ${c}44`, fontSize: '0.62rem', height: 18, fontWeight: 700 }} />
                </Box>
              } />
            );
          })}
        </Tabs>

        {/* Tab body: score ring + fixes */}
        <Box sx={{ p: 2.5 }}>
          {activeFw && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 2.5 }}>
                <ScoreRing score={fwScore} size={88} />
                <Box>
                  <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '0.9rem' }}>{activeFw}</Typography>
                  <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.25 }}>
                    {fwFixed} of {fwFixes.length} controls remediated
                  </Typography>
                  {fwUnfixed.length > 0 && (
                    <Button variant="contained" size="small"
                      startIcon={applying ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : <GavelIcon />}
                      disabled={applying !== null} onClick={() => applyAllForFramework(activeFw)}
                      sx={{ mt: 1, bgcolor: fwColor, '&:hover': { opacity: 0.85 }, '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted }, fontWeight: 600, fontSize: '0.78rem', px: 1.5 }}>
                      Apply All {activeFw} ({fwUnfixed.length})
                    </Button>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {fwFixes.map(fix => {
                  const sevColor = SEV_COLOR[fix.impact] ?? DK.muted;
                  const isFixed  = fixedIds.has(fix.fix_id);
                  return (
                    <Box key={fix.fix_id} sx={{ bgcolor: DK.surface2, border: `1px solid ${isFixed ? '#3fb95044' : DK.border}`,
                      borderLeft: `3px solid ${isFixed ? '#3fb950' : sevColor}`, borderRadius: 2, p: 2,
                      display: 'flex', gap: 1.5, opacity: isFixed ? 0.55 : 1, transition: 'all 0.2s' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 0.4 }}>
                          <Chip label={fix.control} size="small" sx={{ bgcolor: `${fwColor}1a`, color: fwColor, border: `1px solid ${fwColor}44`, fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
                          <Chip label={fix.impact} size="small" sx={{ bgcolor: `${sevColor}1a`, color: sevColor, border: `1px solid ${sevColor}44`, fontSize: '0.62rem', height: 18 }} />
                        </Box>
                        <Typography sx={{ color: DK.text, fontSize: '0.83rem', fontWeight: 600 }}>{fix.issue}</Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.77rem', mt: 0.3 }}>{fix.fix}</Typography>
                      </Box>
                      <Tooltip title={isFixed ? 'Applied' : 'Apply fix'}>
                        <span>
                          <IconButton size="small" onClick={() => applyFix(fix)} disabled={applying !== null || isFixed}
                            sx={{ bgcolor: isFixed ? 'transparent' : '#238636', color: isFixed ? '#3fb950' : '#fff',
                              borderRadius: 1.5, width: 30, height: 30, flexShrink: 0,
                              '&:hover': { bgcolor: isFixed ? 'transparent' : '#2ea043' },
                              '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted } }}>
                            {isFixed ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
                             : applying === fix.fix_id ? <CircularProgress size={12} sx={{ color: '#fff' }} />
                             : <PlayArrowIcon sx={{ fontSize: 14 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
          {frameworks.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 36, color: '#3fb950', mb: 1 }} />
              <Typography sx={{ color: DK.muted }}>No compliance issues found</Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ComplianceFixes;

// Made with Bob
