import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button,
  Collapse, Tabs, Tab,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import LockIcon from '@mui/icons-material/Lock';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
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
interface ConfigResource {
  resource_type: 'ConfigMap' | 'Secret';
  name: string;
  namespace: string;
  cluster: string;
  data_keys?: string[];
  key_count: number;
  values_hidden?: boolean;
  can_rollback: boolean;
}
interface ConfigPayload {
  category: string;
  cluster_name: string;
  configmaps: ConfigResource[];
  secrets: ConfigResource[];
  total_configmaps: number;
  total_secrets: number;
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
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mb: 0.5 }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
  </Box>
);

// ─── Resource card ────────────────────────────────────────────────────────────
const ResourceCard: React.FC<{
  item: ConfigResource;
  expanded: boolean;
  applying: boolean;
  done: boolean;
  onExpand: () => void;
  onRollback: () => void;
}> = ({ item, expanded, applying, done, onExpand, onRollback }) => {
  const isSecret = item.resource_type === 'Secret';
  const accent = isSecret ? '#a371f7' : '#3b82f6';
  const Icon = isSecret ? LockIcon : SettingsIcon;
  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 1.5,
      opacity: done ? 0.45 : 1, transition: 'opacity 0.3s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer' }} onClick={onExpand}>
        <Icon sx={{ fontSize: 18, color: accent, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{item.name}</Typography>
            <Chip label={item.namespace} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 18 }} />
            {item.cluster && (
              <Chip label={item.cluster} size="small" variant="outlined" sx={{ color: accent, borderColor: accent, fontSize: '0.68rem', height: 18 }} />
            )}
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.3 }}>
            {item.key_count} key{item.key_count !== 1 ? 's' : ''}
            {isSecret && ' · values hidden'}
          </Typography>
        </Box>
        <Chip label={item.resource_type} size="small"
          sx={{ bgcolor: isSecret ? '#2d1b69' : '#1a2b4a', color: accent, fontSize: '0.68rem', mr: 1 }} />
        <IconButton size="small" sx={{ color: DK.muted }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2, borderRadius: '0 0 8px 8px' }}>
          {/* Key listing */}
          {!isSecret && item.data_keys && item.data_keys.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>Data keys:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {item.data_keys.map(k => (
                  <Chip key={k} label={k} size="small" sx={{ bgcolor: DK.surface, color: '#3b82f6', fontSize: '0.68rem', fontFamily: 'monospace', border: `1px solid ${DK.border}` }} />
                ))}
              </Box>
            </Box>
          )}
          {isSecret && (
            <Box sx={{ mb: 1.5, p: 1.5, bgcolor: '#1a1230', border: '1px solid #a371f733', borderRadius: 1 }}>
              <Typography sx={{ color: '#a371f7', fontSize: '0.75rem' }}>
                🔒 Secret values are never exposed. Rollback will restore previous key structure from the last applied snapshot.
              </Typography>
            </Box>
          )}
          <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 1.5 }}>
            Rollback patches this {item.resource_type} to its previous data using the agent's <code style={{ color: accent }}>patch_configmap</code> command.
          </Typography>
          {done ? (
            <Chip icon={<CheckCircleOutlineIcon />} label="Rollback Applied" size="small"
              sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.72rem' }} />
          ) : (
            <Button
              variant="contained" size="small"
              startIcon={applying ? <CircularProgress size={12} color="inherit" /> : <ReplayIcon />}
              disabled={applying || !item.can_rollback} onClick={onRollback}
              sx={{ bgcolor: accent, '&:hover': { filter: 'brightness(1.15)' }, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              {applying ? 'Rolling back…' : 'Rollback'}
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ConfigurationRollback: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<ConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/configuration-rollback${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRollback = async (item: ConfigResource) => {
    const key = item.resource_type + ':' + item.name + ':' + item.namespace;
    setApplying(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/configuration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name, namespace: item.namespace, resource_type: item.resource_type, cluster: item.cluster }),
      });
      const body = await res.json();
      const cmdId = body.command_id ?? body.command_ids?.[0];
      if (!cmdId) throw new Error('No command_id returned');
      const result = await pollCommand(cmdId);
      if (result.ok) {
        setDone(p => ({ ...p, [key]: true }));
        setToast({ msg: `Rollback applied — ${item.name}`, sev: 'success' });
      } else {
        setToast({ msg: result.errMsg ?? 'Rollback failed', sev: 'error' });
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Rollback failed', sev: 'error' });
    } finally {
      setApplying(p => ({ ...p, [key]: false }));
    }
  };

  const configmaps = data?.configmaps ?? [];
  const secrets = data?.secrets ?? [];
  const activeList: ConfigResource[] = tab === 0 ? configmaps : secrets;

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Configuration Rollback</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>
            {activeClusterName} — revert ConfigMaps and Secrets to previous states
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress sx={{ color: '#3b82f6' }} />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
            <KpiCard label="ConfigMaps" value={data.total_configmaps} accent="#3b82f6" />
            <KpiCard label="Secrets" value={data.total_secrets} accent="#a371f7" />
            <KpiCard label="Rolled Back" value={Object.values(done).filter(Boolean).length} accent="#3fb950" />
          </Box>

          {/* Tabs */}
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}
              sx={{ '& .MuiTab-root': { color: DK.muted, textTransform: 'none', fontWeight: 600, minWidth: 140 },
                    '& .Mui-selected': { color: DK.text },
                    '& .MuiTabs-indicator': { bgcolor: '#3b82f6' },
                    borderBottom: `1px solid ${DK.border}` }}>
              <Tab label={`ConfigMaps (${data.total_configmaps})`} />
              <Tab label={`Secrets (${data.total_secrets})`} />
            </Tabs>
          </Box>

          {/* List */}
          {activeList.length === 0 ? (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No resources found</Typography>
          ) : (
            activeList.map(item => {
              const key = item.resource_type + ':' + item.name + ':' + item.namespace;
              return (
                <ResourceCard
                  key={key}
                  item={item}
                  expanded={expanded === key}
                  applying={applying[key] ?? false}
                  done={done[key] ?? false}
                  onExpand={() => setExpanded(prev => prev === key ? null : key)}
                  onRollback={() => handleRollback(item)}
                />
              );
            })
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

export default ConfigurationRollback;
