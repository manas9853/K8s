import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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

const SEV: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

const TYPE_COLOR: Record<string, string> = {
  OOMKill:    '#f85149',
  CrashLoop:  '#d29922',
  Throttling: '#3b82f6',
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AgentCmd {
  command: string;
  params: Record<string, string>;
}

interface Incident {
  incident_id: string;
  type: string;
  severity: string;
  title: string;
  status: string;
  root_cause: string;
  confidence: number;
  affected_pods: string[];
  namespace: string;
  cluster: string;
  timestamp: string;
  recommendations: string[];
  agent_command?: AgentCmd;
}

interface InvPayload {
  investigator_type: string;
  cluster_name: string;
  active_incidents: number;
  warning_events_count: number;
  incidents: Incident[];
  severity_breakdown: Record<string, number>;
  last_updated: string;
}

// ─── Severity icon ────────────────────────────────────────────────────────────
const SevIcon: React.FC<{ sev: string }> = ({ sev }) => {
  const sx = { fontSize: 18, color: SEV[sev] ?? DK.muted };
  if (sev === 'critical') return <ErrorOutlineIcon sx={sx} />;
  if (sev === 'high')     return <WarningAmberIcon sx={sx} />;
  return <InfoOutlinedIcon sx={sx} />;
};

// ─── Type icon ────────────────────────────────────────────────────────────────
const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const color = TYPE_COLOR[type] ?? DK.muted;
  const sx = { fontSize: 18, color };
  if (type === 'OOMKill')   return <MemoryIcon sx={sx} />;
  if (type === 'CrashLoop') return <RestartAltIcon sx={sx} />;
  return <WarningAmberIcon sx={sx} />;
};

// ─── Confidence bar ────────────────────────────────────────────────────────────
const ConfidenceBar: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? '#3fb950' : pct >= 65 ? '#d29922' : '#f85149';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1, height: 4, bgcolor: DK.surface2, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </Box>
      <Typography sx={{ color, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>{pct}%</Typography>
    </Box>
  );
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mb: 0.25 }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>{value}</Typography>
  </Box>
);

// ─── Incident card ────────────────────────────────────────────────────────────
const IncidentCard: React.FC<{
  inc: Incident;
  applying: boolean;
  fixed: boolean;
  onApply: (inc: Incident) => void;
}> = ({ inc, applying, fixed, onApply }) => {
  const [expanded, setExpanded] = useState(false);
  const sevColor = SEV[inc.severity] ?? DK.muted;

  return (
    <Box
      sx={{
        bgcolor: DK.surface,
        border: `1px solid ${DK.border}`,
        borderLeft: `3px solid ${sevColor}`,
        borderRadius: 2,
        overflow: 'hidden',
        opacity: fixed ? 0.5 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* ── Summary row ── */}
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: DK.surface2 } }}
      >
        <TypeIcon type={inc.type} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>
              {inc.title}
            </Typography>
            <Chip label={inc.severity} size="small" sx={{ bgcolor: `${sevColor}1a`, color: sevColor, border: `1px solid ${sevColor}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            {inc.namespace && (
              <Chip label={inc.namespace} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.65rem', height: 20 }} />
            )}
            {inc.cluster && (
              <Chip label={inc.cluster} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
          {/* Timeline bar — relative time */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: inc.status === 'active' ? '#f85149' : '#3fb950', flexShrink: 0 }} />
            <Typography sx={{ color: DK.muted, fontSize: '0.7rem' }}>
              {new Date(inc.timestamp).toLocaleString()} · {inc.type}
            </Typography>
          </Box>
        </Box>

        {/* Confidence */}
        <Box sx={{ width: 100, flexShrink: 0 }}>
          <Typography sx={{ color: DK.muted, fontSize: '0.65rem', mb: 0.5 }}>AI confidence</Typography>
          <ConfidenceBar value={inc.confidence} />
        </Box>

        {/* Apply button */}
        <Tooltip title={fixed ? 'Already applied' : 'Apply fix via agent'}>
          <span>
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); onApply(inc); }}
              disabled={applying || fixed}
              sx={{
                bgcolor: fixed ? 'transparent' : '#238636',
                color: fixed ? '#3fb950' : '#fff',
                borderRadius: 1.5,
                width: 32,
                height: 32,
                flexShrink: 0,
                '&:hover': { bgcolor: fixed ? 'transparent' : '#2ea043' },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
              }}
            >
              {fixed
                ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                : applying
                ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                : <PlayArrowIcon sx={{ fontSize: 16 }} />
              }
            </IconButton>
          </span>
        </Tooltip>

        {/* Expand chevron */}
        {expanded
          ? <ExpandMoreIcon sx={{ fontSize: 18, color: DK.muted, flexShrink: 0 }} />
          : <ChevronRightIcon sx={{ fontSize: 18, color: DK.muted, flexShrink: 0 }} />
        }
      </Box>

      {/* ── Expanded detail ── */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: `1px solid ${DK.border}`, px: 2, py: 2 }}>
          <Grid container spacing={2}>

            {/* Root cause */}
            <Grid item xs={12} md={6}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>Root Cause</Typography>
              <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography sx={{ color: DK.text, fontSize: '0.83rem', lineHeight: 1.6 }}>{inc.root_cause}</Typography>
              </Box>
            </Grid>

            {/* Affected pods */}
            <Grid item xs={12} md={6}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>Affected Pods</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {inc.affected_pods.map((p, i) => (
                  <Chip key={i} label={p} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.72rem' }} />
                ))}
              </Box>
            </Grid>

            {/* Recommendations */}
            <Grid item xs={12}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>Recommended Actions</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {inc.recommendations.map((r, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: sevColor, flexShrink: 0, mt: '6px' }} />
                    <Typography sx={{ color: DK.text, fontSize: '0.82rem', lineHeight: 1.6 }}>{r}</Typography>
                  </Box>
                ))}
              </Box>
            </Grid>

          </Grid>
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const IncidentInvestigator: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]     = useState<InvPayload | null>(null);
  const [loading, setLoading]     = useState(true);
  const [applying, setApplying]   = useState<string | null>(null);
  const [fixedIds, setFixedIds]   = useState<Set<string>>(new Set());
  const [toast, setToast]         = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/copilot/incident-investigator${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async (inc: Incident) => {
    const cmd  = inc.agent_command;
    if (!cmd) return;
    const podName  = inc.affected_pods[0] ?? inc.title;
    const ns       = inc.namespace || 'default';

    setApplying(inc.incident_id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name:     podName,
          namespace:         ns,
          issue_type:        inc.type === 'OOMKill' ? 'oomkill' : 'crash_loop',
          cpu_request:       0,
          memory_request_mb: 0,
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
          setFixedIds(prev => new Set(prev).add(inc.incident_id));
          setToast({ open: true, msg: `✅ Fixed: ${inc.type} on ${podName}`, sev: 'success' });
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

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#f85149' }} />
    </Box>
  );

  const incidents = payload?.incidents ?? [];
  const sev       = payload?.severity_breakdown ?? {};

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>
            Incident Investigator
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            AI root-cause analysis for{' '}
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
          <KpiCard label="Active Incidents" value={payload?.active_incidents ?? 0} accent="#f85149" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="Critical" value={sev.critical ?? 0} accent="#f85149" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="High" value={sev.high ?? 0} accent="#d29922" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard label="Warning Events" value={payload?.warning_events_count ?? 0} accent="#3b82f6" />
        </Grid>
      </Grid>

      {/* Severity legend */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        {Object.entries(SEV).map(([key, color]) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'capitalize' }}>
              {key} ({sev[key] ?? 0})
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Incident feed */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {incidents.length === 0 && (
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 36, color: '#3fb950', mb: 1 }} />
            <Typography sx={{ color: DK.muted }}>No active incidents detected</Typography>
          </Box>
        )}
        {incidents.map(inc => (
          <IncidentCard
            key={inc.incident_id}
            inc={inc}
            applying={applying === inc.incident_id}
            fixed={fixedIds.has(inc.incident_id)}
            onApply={handleApply}
          />
        ))}
      </Box>

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

export default IncidentInvestigator;

// Made with Bob
