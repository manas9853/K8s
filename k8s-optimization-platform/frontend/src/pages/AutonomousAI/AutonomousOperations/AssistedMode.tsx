import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Switch,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import SpeedIcon from '@mui/icons-material/Speed';
import StorageIcon from '@mui/icons-material/Storage';
import SecurityIcon from '@mui/icons-material/Security';
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

const CAT_COLOR: Record<string, string> = {
  COST:        '#3fb950',
  PERFORMANCE: '#d29922',
  STORAGE:     '#3b82f6',
  SECURITY:    '#f85149',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rule {
  rule_id: string;
  category: string;
  name: string;
  condition: string;
  fires_when: string;
  enabled: boolean;
  applied_today: number;
}
interface AssistedPayload {
  mode: string;
  cluster_name: string;
  auto_approve_threshold: number;
  rules: Rule[];
  stats: { total_rules: number; enabled_rules: number; auto_applied_today: number; pending_approval: number };
}

// ─── Category icon ────────────────────────────────────────────────────────────
const CatIcon: React.FC<{ cat: string }> = ({ cat }) => {
  const color = CAT_COLOR[cat] ?? DK.muted;
  const sx = { fontSize: 18, color };
  if (cat === 'COST')        return <AttachMoneyIcon sx={sx} />;
  if (cat === 'PERFORMANCE') return <SpeedIcon sx={sx} />;
  if (cat === 'STORAGE')     return <StorageIcon sx={sx} />;
  return <SecurityIcon sx={sx} />;
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: number | string; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
  </Box>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const AssistedMode: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]     = useState<AssistedPayload | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/assisted-mode${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AssistedPayload = await res.json();
      setPayload(data);
      // Seed local toggle state from backend
      const init: Record<string, boolean> = {};
      data.rules.forEach(r => { init[r.rule_id] = r.enabled; });
      setLocalEnabled(init);
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleRule = async (ruleId: string) => {
    // Optimistic update
    setLocalEnabled(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
    setToggling(ruleId);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/operations/assisted-mode/rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        // Revert on failure
        setLocalEnabled(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
        setToast({ open: true, msg: `Failed to toggle rule`, sev: 'error' });
      } else {
        const newState = localEnabled[ruleId] ? 'disabled' : 'enabled';
        setToast({ open: true, msg: `Rule ${newState}`, sev: 'info' });
      }
    } catch {
      setLocalEnabled(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
    } finally {
      setToggling(null);
    }
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#58a6ff' }} />
    </Box>
  );

  const rules      = payload?.rules ?? [];
  const stats      = payload?.stats;
  const enabledCount = Object.values(localEnabled).filter(Boolean).length;

  // Group rules by category
  const grouped: Record<string, Rule[]> = {};
  rules.forEach(r => { (grouped[r.category] ??= []).push(r); });

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Assisted Mode</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            Rule-based auto-approval for low-risk changes —{' '}
            <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Auto-approve threshold banner */}
      <Box sx={{ bgcolor: '#1f6feb1a', border: '1px solid #1f6feb55', borderRadius: 2, px: 2.5, py: 1.5, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#58a6ff', flexShrink: 0 }} />
        <Typography sx={{ color: '#58a6ff', fontSize: '0.83rem' }}>
          Auto-approve threshold: changes saving ≥ <strong>${payload?.auto_approve_threshold ?? 50}/mo</strong> with risk = LOW are applied automatically when the rule is enabled.
        </Typography>
      </Box>

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}><KpiCard label="Total Rules" value={stats?.total_rules ?? 0} /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Active Rules" value={enabledCount} accent="#3fb950" /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Auto-Applied Today" value={stats?.auto_applied_today ?? 0} accent="#58a6ff" /></Grid>
        <Grid item xs={6} md={3}><KpiCard label="Pending Approval" value={stats?.pending_approval ?? 0} accent="#d29922" /></Grid>
      </Grid>

      {/* Rule cards by category */}
      {Object.entries(grouped).map(([cat, catRules]) => {
        const catColor = CAT_COLOR[cat] ?? DK.muted;
        return (
          <Box key={cat} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CatIcon cat={cat} />
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>{cat}</Typography>
              <Chip label={catRules.length} size="small" sx={{ bgcolor: `${catColor}1a`, color: catColor, border: `1px solid ${catColor}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {catRules.map(rule => {
                const isOn = localEnabled[rule.rule_id] ?? rule.enabled;
                return (
                  <Box
                    key={rule.rule_id}
                    sx={{
                      bgcolor: DK.surface,
                      border: `1px solid ${isOn ? catColor + '44' : DK.border}`,
                      borderLeft: `3px solid ${isOn ? catColor : DK.border}`,
                      borderRadius: 2,
                      px: 2,
                      py: 1.75,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      opacity: isOn ? 1 : 0.6,
                      transition: 'all 0.2s',
                    }}
                  >
                    <CatIcon cat={cat} />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                        <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>{rule.name}</Typography>
                        {isOn && (
                          <Chip label="ACTIVE" size="small" sx={{ bgcolor: `${catColor}1a`, color: catColor, border: `1px solid ${catColor}44`, fontWeight: 700, fontSize: '0.62rem', height: 18 }} />
                        )}
                      </Box>
                      <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{rule.condition}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: rule.applied_today > 0 ? catColor : DK.border }} />
                        <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>{rule.fires_when} · Applied today: {rule.applied_today}</Typography>
                      </Box>
                    </Box>

                    {toggling === rule.rule_id
                      ? <CircularProgress size={20} sx={{ color: catColor }} />
                      : (
                        <Tooltip title={isOn ? 'Disable rule' : 'Enable rule'}>
                          <Switch
                            checked={isOn}
                            onChange={() => toggleRule(rule.rule_id)}
                            size="small"
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': { color: catColor },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: catColor },
                            }}
                          />
                        </Tooltip>
                      )
                    }
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}

      {rules.length === 0 && (
        <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 36, color: DK.border, mb: 1 }} />
          <Typography sx={{ color: DK.muted }}>No rules configured — add rules via backend configuration</Typography>
        </Box>
      )}

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AssistedMode;

// Made with Bob
