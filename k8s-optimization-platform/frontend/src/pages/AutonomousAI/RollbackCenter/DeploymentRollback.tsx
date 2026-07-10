import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, TextField,
  Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import StorageIcon from '@mui/icons-material/Storage';
import SearchIcon from '@mui/icons-material/Search';
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
interface Deployment {
  deployment: string;
  namespace: string;
  cluster: string;
  current_replicas: number;
  image: string;
  can_rollback: boolean;
}
interface DeploymentPayload {
  category: string;
  cluster_name: string;
  available_deployments: number;
  deployments: Deployment[];
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

// ─── Deployment card ──────────────────────────────────────────────────────────
const DepCard: React.FC<{
  dep: Deployment;
  expanded: boolean;
  applying: boolean;
  done: boolean;
  onExpand: () => void;
  onRollback: () => void;
}> = ({ dep, expanded, applying, done, onExpand, onRollback }) => (
  <Box sx={{
    bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 1.5,
    opacity: done ? 0.45 : 1, transition: 'opacity 0.3s',
  }}>
    {/* Header row */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer' }} onClick={onExpand}>
      <StorageIcon sx={{ fontSize: 18, color: '#3b82f6', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{dep.deployment}</Typography>
          <Chip label={dep.namespace} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.68rem', height: 18 }} />
          {dep.cluster && (
            <Chip label={dep.cluster} size="small" variant="outlined" sx={{ color: '#3b82f6', borderColor: '#3b82f6', fontSize: '0.68rem', height: 18 }} />
          )}
        </Box>
        <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.3, fontFamily: 'monospace' }} noWrap>
          {dep.image || 'image unknown'}
        </Typography>
      </Box>
      <Chip label={`${dep.current_replicas} replica${dep.current_replicas !== 1 ? 's' : ''}`} size="small"
        sx={{ bgcolor: '#1c2128', color: DK.muted, fontSize: '0.68rem', mr: 1 }} />
      <IconButton size="small" sx={{ color: DK.muted }}>
        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </IconButton>
    </Box>
    {/* Expanded detail */}
    <Collapse in={expanded}>
      <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2, borderRadius: '0 0 8px 8px' }}>
        <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 1.5 }}>
          Rollback will restart all pods in this deployment to the previous revision using{' '}
          <code style={{ color: '#3b82f6' }}>kubectl rollout undo</code>.
          Current replicas: <strong style={{ color: DK.text }}>{dep.current_replicas}</strong>
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {done ? (
            <Chip icon={<CheckCircleOutlineIcon />} label="Rollback Applied" size="small"
              sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.72rem' }} />
          ) : (
            <Button
              variant="contained" size="small" startIcon={applying ? <CircularProgress size={12} color="inherit" /> : <ReplayIcon />}
              disabled={applying || !dep.can_rollback} onClick={onRollback}
              sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              {applying ? 'Rolling back…' : 'Rollback Now'}
            </Button>
          )}
        </Box>
      </Box>
    </Collapse>
  </Box>
);

// ─── Main component ───────────────────────────────────────────────────────────
const DeploymentRollback: React.FC = () => {
  const { clusterParam, activeClusterId, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<DeploymentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/deployment-rollback${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRollback = async (dep: Deployment) => {
    const key = dep.deployment;
    setApplying(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/deployment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployment: dep.deployment, namespace: dep.namespace, cluster: dep.cluster }),
      });
      const body = await res.json();
      const cmdId = body.command_id ?? body.command_ids?.[0];
      if (!cmdId) throw new Error('No command_id returned');
      const result = await pollCommand(cmdId);
      if (result.ok) {
        setDone(p => ({ ...p, [key]: true }));
        setToast({ msg: `Rollback applied — ${dep.deployment}`, sev: 'success' });
      } else {
        setToast({ msg: result.errMsg ?? 'Rollback failed', sev: 'error' });
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Rollback failed', sev: 'error' });
    } finally {
      setApplying(p => ({ ...p, [key]: false }));
    }
  };

  const deployments = data?.deployments ?? [];
  const filtered = deployments.filter(d =>
    d.deployment.toLowerCase().includes(search.toLowerCase()) ||
    d.namespace.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Deployment Rollback</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>
            {activeClusterName} — rollback any deployment to its previous revision
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
            <KpiCard label="Available Deployments" value={data.available_deployments} accent="#3b82f6" />
            <KpiCard label="Cluster" value={data.cluster_name || activeClusterId || '—'} />
            <KpiCard label="Rolled Back" value={Object.values(done).filter(Boolean).length} accent="#3fb950" />
          </Box>

          {/* Search */}
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SearchIcon sx={{ color: DK.muted, fontSize: 18 }} />
            <TextField
              placeholder="Search deployments or namespaces…"
              value={search} onChange={e => setSearch(e.target.value)}
              size="small" fullWidth
              sx={{ '& .MuiInputBase-root': { bgcolor: DK.surface2, color: DK.text, fontSize: '0.85rem' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.border } }}
            />
          </Box>

          {/* Deployment list */}
          {filtered.length === 0 ? (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No deployments found</Typography>
          ) : (
            filtered.map(dep => (
              <DepCard
                key={dep.deployment + dep.namespace}
                dep={dep}
                expanded={expanded === dep.deployment + dep.namespace}
                applying={applying[dep.deployment] ?? false}
                done={done[dep.deployment] ?? false}
                onExpand={() => setExpanded(prev => prev === dep.deployment + dep.namespace ? null : dep.deployment + dep.namespace)}
                onRollback={() => handleRollback(dep)}
              />
            ))
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

export default DeploymentRollback;
