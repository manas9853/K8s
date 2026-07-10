import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Switch,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BlockIcon from '@mui/icons-material/Block';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface Activity {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  result: string;
}
interface ClusterSummary {
  total_pods: number;
  oom_pods: number;
  unstable_pods: number;
  fixable_automatically: number;
}
interface AutonomousPayload {
  mode: string;
  cluster_name: string;
  autonomous_enabled: boolean;
  cluster_summary: ClusterSummary;
  guardrails: string[];
  recent_activities: Activity[];
  last_updated: string;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
  </Box>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const AutonomousMode: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]       = useState<AutonomousPayload | null>(null);
  const [loading, setLoading]       = useState(true);
  const [enabled, setEnabled]       = useState(false);
  const [toggling, setToggling]     = useState(false);
  const [toast, setToast]           = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' | 'warning' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/autonomous-mode${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AutonomousPayload = await res.json();
      setPayload(data);
      setEnabled(data.autonomous_enabled);
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async () => {
    const newState = !enabled;
    setToggling(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/autonomous-mode/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setEnabled(newState);
        setToast({
          open: true,
          msg: newState ? '🤖 Autonomous Mode ACTIVATED — AI is now optimizing your cluster' : '⏸ Autonomous Mode DEACTIVATED',
          sev: newState ? 'success' : 'warning',
        });
      } else {
        setToast({ open: true, msg: 'Failed to toggle autonomous mode', sev: 'error' });
      }
    } catch {
      setToast({ open: true, msg: 'Network error', sev: 'error' });
    } finally {
      setToggling(false);
    }
  };

  const handleEmergencyStop = async () => {
    if (!enabled) return;
    setToggling(true);
    try {
      await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/autonomous-mode/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setEnabled(false);
      setToast({ open: true, msg: '🛑 Emergency Stop — Autonomous Mode halted immediately', sev: 'warning' });
    } catch {
      setToast({ open: true, msg: 'Emergency stop failed — contact your cluster admin', sev: 'error' });
    } finally {
      setToggling(false);
    }
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  const cs = payload?.cluster_summary;
  const glowColor = enabled ? '#238636' : DK.border;
  const activities = payload?.recent_activities ?? [];

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Autonomous Mode</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Fully automated AI optimization —{' '}
            <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Centered toggle card ── */}
      <Box
        sx={{
          bgcolor: DK.surface,
          border: `1px solid ${glowColor}`,
          borderRadius: 3,
          p: 4,
          mb: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          boxShadow: enabled ? `0 0 24px ${glowColor}55` : 'none',
          transition: 'all 0.4s ease',
        }}
      >
        {/* Pulsing status dot */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: enabled ? '#3fb950' : DK.muted,
              boxShadow: enabled ? '0 0 0 0 #3fb95088' : 'none',
              animation: enabled ? 'pulse 2s infinite' : 'none',
              '@keyframes pulse': {
                '0%':   { boxShadow: '0 0 0 0 #3fb95066' },
                '70%':  { boxShadow: '0 0 0 10px transparent' },
                '100%': { boxShadow: '0 0 0 0 transparent' },
              },
            }}
          />
          <Typography sx={{ color: enabled ? '#3fb950' : DK.muted, fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {enabled ? 'AUTONOMOUS MODE: ACTIVE' : 'AUTONOMOUS MODE: INACTIVE'}
          </Typography>
        </Box>

        {/* Big icon */}
        <AutoModeIcon sx={{
          fontSize: 64,
          color: enabled ? '#3fb950' : DK.border,
          transition: 'color 0.4s ease',
          animation: enabled ? 'spin 8s linear infinite' : 'none',
          '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        }} />

        <Typography sx={{ color: DK.muted, fontSize: '0.83rem', textAlign: 'center', maxWidth: 420 }}>
          {enabled
            ? 'AI is continuously monitoring and optimizing your cluster. All changes are within guardrail bounds.'
            : 'Enable to let the AI continuously apply low-risk optimizations without manual approval.'}
        </Typography>

        {/* Toggle switch */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem' }}>Disabled</Typography>
          {toggling
            ? <CircularProgress size={28} sx={{ color: '#3fb950' }} />
            : (
              <Switch
                checked={enabled}
                onChange={handleToggle}
                sx={{
                  transform: 'scale(1.3)',
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#3fb950' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#3fb950' },
                }}
              />
            )
          }
          <Typography sx={{ color: enabled ? '#3fb950' : DK.muted, fontSize: '0.83rem', fontWeight: enabled ? 700 : 400 }}>Enabled</Typography>
        </Box>
      </Box>

      {/* ── Emergency Stop — always visible ── */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<BlockIcon />}
          onClick={handleEmergencyStop}
          disabled={!enabled || toggling}
          sx={{
            bgcolor: '#da3633',
            '&:hover': { bgcolor: '#f85149' },
            '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
            fontWeight: 700,
            fontSize: '0.9rem',
            px: 4,
            py: 1.25,
            letterSpacing: '0.05em',
          }}
        >
          🛑 EMERGENCY STOP
        </Button>
      </Box>

      {/* Cluster snapshot + guardrails row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>

        {/* Cluster KPIs */}
        <Grid item xs={12} md={6}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem', mb: 2 }}>Cluster Snapshot</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6}><KpiCard label="Total Pods" value={cs?.total_pods ?? 0} /></Grid>
              <Grid item xs={6}><KpiCard label="OOM Pods" value={cs?.oom_pods ?? 0} accent="#f85149" /></Grid>
              <Grid item xs={6}><KpiCard label="Unstable Pods" value={cs?.unstable_pods ?? 0} accent="#d29922" /></Grid>
              <Grid item xs={6}><KpiCard label="Auto-Fixable" value={cs?.fixable_automatically ?? 0} accent="#3fb950" /></Grid>
            </Grid>
          </Box>
        </Grid>

        {/* Guardrails */}
        <Grid item xs={12} md={6}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ShieldOutlinedIcon sx={{ fontSize: 18, color: '#d29922' }} />
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>Safety Guardrails</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {(payload?.guardrails ?? []).map((g, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: '#d29922', flexShrink: 0, mt: '3px' }} />
                  <Typography sx={{ color: DK.muted, fontSize: '0.8rem', lineHeight: 1.5 }}>{g}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Activity feed */}
      <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${DK.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: enabled ? '#3fb950' : DK.muted }} />
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem' }}>
            Recent Activity Feed
          </Typography>
        </Box>
        {activities.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 28, color: DK.border, mb: 0.75 }} />
            <Typography sx={{ color: DK.muted, fontSize: '0.83rem' }}>No activity yet — enable Autonomous Mode to start</Typography>
          </Box>
        ) : (
          activities.map((act, i) => (
            <Box key={act.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.25, borderBottom: i < activities.length - 1 ? `1px solid ${DK.border}` : 'none' }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: act.result === 'success' ? '#3fb950' : '#f85149' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ color: DK.text, fontSize: '0.82rem' }} noWrap>{act.action}</Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }} noWrap>{act.resource}</Typography>
              </Box>
              <Typography sx={{ color: DK.muted, fontSize: '0.7rem', flexShrink: 0 }}>
                {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </Typography>
              <Chip
                label={act.result}
                size="small"
                sx={{ bgcolor: act.result === 'success' ? '#3fb9501a' : '#f851491a', color: act.result === 'success' ? '#3fb950' : '#f85149', border: `1px solid ${act.result === 'success' ? '#3fb95044' : '#f8514944'}`, fontSize: '0.65rem', height: 18 }}
              />
            </Box>
          ))
        )}
      </Box>

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AutonomousMode;

// Made with Bob
