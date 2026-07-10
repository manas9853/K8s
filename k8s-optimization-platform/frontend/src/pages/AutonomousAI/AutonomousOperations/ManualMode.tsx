import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import SpeedIcon from '@mui/icons-material/Speed';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
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

const RISK: Record<string, string> = {
  low:    '#3fb950',
  medium: '#d29922',
  high:   '#f85149',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentCmd { command: string; params: Record<string, string>; }
interface Rec {
  id: string;
  type: string;
  resource: string;
  namespace: string;
  cluster: string;
  current: string;
  recommended: string;
  savings: number;
  risk: string;
  confidence: number;
  requires_approval: boolean;
  agent_command?: AgentCmd;
}
interface ManualPayload {
  mode: string;
  cluster_name: string;
  pending_reviews: number;
  recommendations: Rec[];
  stats: { total_recommendations: number; approved: number; rejected: number; pending: number };
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
  </Box>
);

// ─── Type icon ────────────────────────────────────────────────────────────────
const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const sx = { fontSize: 16 };
  if (type.includes('cpu'))     return <SpeedIcon sx={{ ...sx, color: '#d29922' }} />;
  if (type.includes('mem'))     return <MemoryIcon sx={{ ...sx, color: '#3b82f6' }} />;
  return <StorageIcon sx={{ ...sx, color: '#8b949e' }} />;
};

// ─── Diff row ─────────────────────────────────────────────────────────────────
const DiffRow: React.FC<{ label: string; from: string; to: string }> = ({ label, from, to }) => (
  <Box sx={{ mb: 1 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>{label}</Typography>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box sx={{ bgcolor: '#f851491a', border: '1px solid #f8514944', borderRadius: 1, px: 1, py: 0.25 }}>
        <Typography sx={{ color: '#f85149', fontSize: '0.8rem', fontFamily: 'monospace' }}>- {from}</Typography>
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>→</Typography>
      <Box sx={{ bgcolor: '#3fb9501a', border: '1px solid #3fb95044', borderRadius: 1, px: 1, py: 0.25 }}>
        <Typography sx={{ color: '#3fb950', fontSize: '0.8rem', fontFamily: 'monospace' }}>+ {to}</Typography>
      </Box>
    </Box>
  </Box>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const ManualMode: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]       = useState<ManualPayload | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Rec | null>(null);
  const [actioning, setActioning]   = useState<string | null>(null);  // rec id being actioned
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [toast, setToast]           = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/manual-mode${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPayload(data);
      // Auto-select first item
      if (data.recommendations?.length > 0) setSelected(data.recommendations[0]);
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Approve: enqueue agent command ────────────────────────────────────────
  const handleApprove = async (rec: Rec) => {
    if (!rec.agent_command) {
      // No agent command — just dismiss optimistically
      setDismissed(prev => new Set(prev).add(rec.id));
      setToast({ open: true, msg: `✅ Approved: ${rec.resource}`, sev: 'success' });
      if (selected?.id === rec.id) setSelected(null);
      return;
    }
    setActioning(rec.id);
    setToast({ open: true, msg: '⏳ Applying fix — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name:     rec.resource.split('/')[1] ?? rec.resource,
          namespace:         rec.namespace || 'default',
          issue_type:        rec.type,
          cpu_request:       0,
          memory_request_mb: 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ open: true, msg: body?.detail ?? `Failed (HTTP ${res.status})`, sev: 'error' });
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
          setDismissed(prev => new Set(prev).add(rec.id));
          setToast({ open: true, msg: `✅ Applied: ${rec.resource}`, sev: 'success' });
          if (selected?.id === rec.id) setSelected(null);
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
      setActioning(null);
    }
  };

  const handleReject = (rec: Rec) => {
    setDismissed(prev => new Set(prev).add(rec.id));
    setToast({ open: true, msg: `Rejected: ${rec.resource}`, sev: 'info' });
    if (selected?.id === rec.id) setSelected(null);
  };

  const handleDefer = (rec: Rec) => {
    setDismissed(prev => new Set(prev).add(rec.id));
    setToast({ open: true, msg: `Deferred: ${rec.resource}`, sev: 'info' });
    if (selected?.id === rec.id) setSelected(null);
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  const recs     = (payload?.recommendations ?? []).filter(r => !dismissed.has(r.id));
  const reviewed = dismissed.size;
  const total    = (payload?.recommendations ?? []).length;
  const progress = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  // When selected item is dismissed, auto-advance to next
  const visibleSelected = selected && !dismissed.has(selected.id) ? selected : (recs[0] ?? null);

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Manual Mode</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Every change requires your approval —{' '}
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
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><KpiCard label="Pending Reviews" value={recs.length} accent="#d29922" /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Approved" value={payload?.stats.approved ?? 0} accent="#3fb950" /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Rejected" value={payload?.stats.rejected ?? 0} accent="#f85149" /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Total Savings Available" value={Math.round(recs.reduce((s, r) => s + r.savings, 0))} accent="#58a6ff" /></Grid>
      </Grid>

      {/* Progress bar */}
      <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: DK.text, fontSize: '0.83rem', fontWeight: 600 }}>Review Progress</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>{reviewed} of {total} reviewed</Typography>
        </Box>
        <Box sx={{ height: 6, bgcolor: DK.surface2, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ width: `${progress}%`, height: '100%', bgcolor: progress === 100 ? '#3fb950' : '#58a6ff', borderRadius: 3, transition: 'width 0.4s ease' }} />
        </Box>
      </Box>

      {recs.length === 0 ? (
        <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 5, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 40, color: '#3fb950', mb: 1 }} />
          <Typography sx={{ color: DK.muted }}>All recommendations reviewed — queue is empty</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {/* ── Left: approval queue list ── */}
          <Grid item xs={12} md={4}>
            <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${DK.border}` }}>
                <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem' }}>
                  Queue ({recs.length})
                </Typography>
              </Box>
              <Box sx={{ maxHeight: 480, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 2 } }}>
                {recs.map(rec => {
                  const riskColor = RISK[rec.risk] ?? DK.muted;
                  const isActive  = visibleSelected?.id === rec.id;
                  return (
                    <Box
                      key={rec.id}
                      onClick={() => setSelected(rec)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        px: 2, py: 1.5,
                        cursor: 'pointer',
                        bgcolor: isActive ? DK.surface2 : 'transparent',
                        borderLeft: `3px solid ${isActive ? '#58a6ff' : 'transparent'}`,
                        borderBottom: `1px solid ${DK.border}`,
                        '&:hover': { bgcolor: DK.surface2 },
                      }}
                    >
                      <TypeIcon type={rec.type} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ color: DK.text, fontSize: '0.8rem', fontWeight: 600 }} noWrap>
                          {rec.resource.split('/')[1] ?? rec.resource}
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }} noWrap>
                          {rec.namespace} · ${rec.savings.toFixed(0)}/mo
                        </Typography>
                      </Box>
                      <Chip label={rec.risk} size="small" sx={{ bgcolor: `${riskColor}1a`, color: riskColor, border: `1px solid ${riskColor}44`, fontSize: '0.62rem', fontWeight: 700, height: 18 }} />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Grid>

          {/* ── Right: detail + diff panel ── */}
          <Grid item xs={12} md={8}>
            {visibleSelected ? (
              <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, overflow: 'hidden' }}>
                {/* Detail header */}
                <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${DK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5 }}>
                      <TypeIcon type={visibleSelected.type} />
                      <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '0.95rem' }}>
                        {visibleSelected.resource}
                      </Typography>
                      <Chip
                        label={visibleSelected.type.replace(/_/g, ' ')}
                        size="small"
                        sx={{ bgcolor: DK.surface2, color: DK.muted, border: `1px solid ${DK.border}`, fontSize: '0.65rem', height: 20 }}
                      />
                    </Box>
                    <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>
                      {visibleSelected.namespace}
                      {visibleSelected.cluster ? ` · ${visibleSelected.cluster}` : ''}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '1rem' }}>
                    ${visibleSelected.savings.toFixed(0)}<Typography component="span" sx={{ color: DK.muted, fontSize: '0.72rem' }}>/mo</Typography>
                  </Typography>
                </Box>

                {/* Diff view */}
                <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${DK.border}` }}>
                  <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
                    Proposed Change
                  </Typography>
                  <DiffRow label="Resource" from={visibleSelected.current} to={visibleSelected.recommended} />
                  <Box sx={{ display: 'flex', gap: 2, mt: 1.5 }}>
                    <Box>
                      <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'uppercase', mb: 0.25 }}>Risk</Typography>
                      <Chip label={visibleSelected.risk} size="small" sx={{ bgcolor: `${RISK[visibleSelected.risk] ?? DK.muted}1a`, color: RISK[visibleSelected.risk] ?? DK.muted, border: `1px solid ${RISK[visibleSelected.risk] ?? DK.muted}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ color: DK.muted, fontSize: '0.68rem', textTransform: 'uppercase', mb: 0.25 }}>AI Confidence</Typography>
                      <Typography sx={{ color: '#3fb950', fontSize: '0.83rem', fontWeight: 600 }}>
                        {Math.round(visibleSelected.confidence * 100)}%
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Action buttons */}
                <Box sx={{ px: 2.5, py: 2, display: 'flex', gap: 1.5 }}>
                  <Button
                    variant="contained"
                    startIcon={actioning === visibleSelected.id ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <CheckCircleOutlineIcon />}
                    disabled={actioning !== null}
                    onClick={() => handleApprove(visibleSelected)}
                    sx={{ bgcolor: '#238636', '&:hover': { bgcolor: '#2ea043' }, '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted }, fontWeight: 600 }}
                  >
                    Approve & Apply
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PauseCircleOutlineIcon />}
                    onClick={() => handleDefer(visibleSelected)}
                    disabled={actioning !== null}
                    sx={{ borderColor: DK.border, color: DK.muted, '&:hover': { borderColor: '#58a6ff', color: '#58a6ff' } }}
                  >
                    Defer
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CancelOutlinedIcon />}
                    onClick={() => handleReject(visibleSelected)}
                    disabled={actioning !== null}
                    sx={{ borderColor: DK.border, color: DK.muted, '&:hover': { borderColor: '#f85149', color: '#f85149' } }}
                  >
                    Reject
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
                <PlayArrowIcon sx={{ fontSize: 40, color: DK.border, mb: 1 }} />
                <Typography sx={{ color: DK.muted }}>Select an item from the queue to review</Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      )}

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ManualMode;

// Made with Bob
