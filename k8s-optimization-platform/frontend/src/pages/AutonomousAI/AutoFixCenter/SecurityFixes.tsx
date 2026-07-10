import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BugReportIcon from '@mui/icons-material/BugReport';
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
const SEV: Record<string, string> = { critical: '#f85149', high: '#d29922', medium: '#3b82f6' };

// ─── Types ────────────────────────────────────────────────────────────────────
interface SecFix {
  fix_id: string;
  severity: string;
  type: string;
  resource: string;
  namespace: string;
  issue: string;
  fix: string;
  status: string;
  cve_ids: string[];
}
interface SecPayload {
  category: string;
  total_fixes: number;
  critical: number;
  high: number;
  medium: number;
  fixes: SecFix[];
  cluster_name: string;
}

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

// ─── Fix card ─────────────────────────────────────────────────────────────────
const SecFixCard: React.FC<{
  fix: SecFix;
  applying: boolean;
  fixed: boolean;
  onApply: () => void;
}> = ({ fix, applying, fixed, onApply }) => {
  const [expanded, setExpanded] = useState(false);
  const color = SEV[fix.severity] ?? DK.muted;

  return (
    <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderLeft: `3px solid ${color}`,
      borderRadius: 2, overflow: 'hidden', opacity: fixed ? 0.45 : 1, transition: 'opacity 0.3s' }}>
      <Box onClick={() => setExpanded(e => !e)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: DK.surface2 } }}>
        {fix.severity === 'critical' && <ErrorOutlineIcon sx={{ fontSize: 17, color, flexShrink: 0 }} />}
        {fix.severity === 'high'     && <WarningAmberIcon sx={{ fontSize: 17, color, flexShrink: 0 }} />}
        {fix.severity === 'medium'   && <InfoOutlinedIcon  sx={{ fontSize: 17, color, flexShrink: 0 }} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{fix.resource}</Typography>
            <Chip label={fix.severity.toUpperCase()} size="small"
              sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontWeight: 700, fontSize: '0.62rem', height: 18 }} />
            <Chip label={fix.type.replace(/_/g, ' ')} size="small" variant="outlined"
              sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.62rem', height: 18 }} />
            {fix.namespace && fix.namespace !== 'multiple' && (
              <Chip label={fix.namespace} size="small" variant="outlined"
                sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.62rem', height: 18 }} />
            )}
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.77rem', mt: 0.3 }} noWrap>{fix.issue}</Typography>
        </Box>
        <Tooltip title={fixed ? 'Applied' : 'Apply fix'}>
          <span>
            <IconButton size="small" onClick={e => { e.stopPropagation(); onApply(); }} disabled={applying || fixed}
              sx={{ bgcolor: fixed ? 'transparent' : '#238636', color: fixed ? '#3fb950' : '#fff',
                borderRadius: 1.5, width: 30, height: 30, flexShrink: 0,
                '&:hover': { bgcolor: fixed ? 'transparent' : '#2ea043' },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted } }}>
              {fixed ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
               : applying ? <CircularProgress size={12} sx={{ color: '#fff' }} />
               : <PlayArrowIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </span>
        </Tooltip>
        {expanded ? <ExpandMoreIcon sx={{ fontSize: 17, color: DK.muted, flexShrink: 0 }} />
                  : <ChevronRightIcon sx={{ fontSize: 17, color: DK.muted, flexShrink: 0 }} />}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ borderTop: `1px solid ${DK.border}`, px: 2, py: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {fix.cve_ids.length > 0 && (
            <Box>
              <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'uppercase', mb: 0.5 }}>CVE IDs</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {fix.cve_ids.map(c => <Chip key={c} label={c} size="small"
                  icon={<BugReportIcon sx={{ fontSize: '13px !important', color: '#f85149 !important' }} />}
                  sx={{ bgcolor: '#f851491a', color: '#f85149', border: '1px solid #f8514944', fontSize: '0.67rem' }} />)}
              </Box>
            </Box>
          )}
          <Box>
            <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'uppercase', mb: 0.5 }}>Remediation</Typography>
            <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, px: 1.5, py: 0.75 }}>
              <Typography sx={{ color: DK.text, fontSize: '0.82rem', lineHeight: 1.6 }}>{fix.fix}</Typography>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const SecurityFixes: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]   = useState<SecPayload | null>(null);
  const [loading, setLoading]   = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [toast, setToast]       = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/autofix/security-fixes${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Failed', sev: 'error' }); }
    finally { setLoading(false); }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFix = async (fix: SecFix) => {
    setApplying(fix.fix_id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: fix.resource.split('/')[1] ?? fix.resource,
          namespace: fix.namespace === 'multiple' ? 'default' : (fix.namespace || 'default'),
          issue_type: fix.type, cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ open: true, msg: body?.detail ?? `Failed (${res.status})`, sev: 'error' }); return; }
      const { ok, errMsg } = await pollCommand(body.command_id);
      if (ok) { setFixedIds(prev => new Set(prev).add(fix.fix_id)); setToast({ open: true, msg: `✅ Fixed: ${fix.resource}`, sev: 'success' }); }
      else setToast({ open: true, msg: `❌ ${errMsg}`, sev: 'error' });
    } catch (e: any) { setToast({ open: true, msg: e.message ?? 'Network error', sev: 'error' }); }
    finally { setApplying(null); }
  };

  const fixAllCritical = async () => {
    if (!payload) return;
    for (const fix of payload.fixes.filter(f => f.severity === 'critical' && !fixedIds.has(f.fix_id))) await applyFix(fix);
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#f85149' }} />
    </Box>
  );

  const fixes = payload?.fixes ?? [];
  const grouped: Record<string, SecFix[]> = {};
  ['critical', 'high', 'medium'].forEach(s => { const g = fixes.filter(f => f.severity === s); if (g.length) grouped[s] = g; });
  const criticalUnfixed = fixes.filter(f => f.severity === 'critical' && !fixedIds.has(f.fix_id));

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Security Fixes</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Security vulnerability remediation for <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {criticalUnfixed.length > 0 && (
            <Button variant="contained" size="small"
              startIcon={applying ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <ErrorOutlineIcon />}
              disabled={applying !== null} onClick={fixAllCritical}
              sx={{ bgcolor: '#da3633', '&:hover': { bgcolor: '#f85149' }, fontWeight: 600, fontSize: '0.8rem' }}>
              Fix All Critical ({criticalUnfixed.length})
            </Button>
          )}
          <Tooltip title="Refresh"><IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}><RefreshIcon /></IconButton></Tooltip>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Critical</Typography><Typography sx={{ color: '#f85149', fontSize: '1.7rem', fontWeight: 700 }}>{payload?.critical ?? 0}</Typography></Box></Grid>
        <Grid item xs={6} md={3}><Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>High</Typography><Typography sx={{ color: '#d29922', fontSize: '1.7rem', fontWeight: 700 }}>{payload?.high ?? 0}</Typography></Box></Grid>
        <Grid item xs={6} md={3}><Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Medium</Typography><Typography sx={{ color: '#3b82f6', fontSize: '1.7rem', fontWeight: 700 }}>{payload?.medium ?? 0}</Typography></Box></Grid>
        <Grid item xs={6} md={3}><Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}><Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>Total</Typography><Typography sx={{ color: DK.text, fontSize: '1.7rem', fontWeight: 700 }}>{payload?.total_fixes ?? 0}</Typography></Box></Grid>
      </Grid>

      {Object.entries(grouped).map(([sev, group]) => (
        <Box key={sev} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: SEV[sev] }} />
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize' }}>{sev}</Typography>
            <Chip label={group.length} size="small" sx={{ bgcolor: `${SEV[sev]}1a`, color: SEV[sev], border: `1px solid ${SEV[sev]}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {group.map(fix => <SecFixCard key={fix.fix_id} fix={fix} applying={applying === fix.fix_id} fixed={fixedIds.has(fix.fix_id)} onApply={() => applyFix(fix)} />)}
          </Box>
        </Box>
      ))}

      {fixes.length === 0 && (
        <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 36, color: '#3fb950', mb: 1 }} />
          <Typography sx={{ color: DK.muted }}>No security issues detected — cluster is clean</Typography>
        </Box>
      )}

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default SecurityFixes;

// Made with Bob
