import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FolderIcon from '@mui/icons-material/Folder';
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

const RISK_COLOR: Record<string, string> = {
  extreme: '#f85149',
  high:    '#d29922',
  medium:  '#3b82f6',
  low:     '#3fb950',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Namespace {
  namespace: string;
  cluster: string;
  pod_count: number;
  deployment_count: number;
  risk: string;
  can_rollback: boolean;
}
interface NsPayload {
  category: string;
  cluster_name: string;
  namespaces: Namespace[];
  total_namespaces: number;
}

// Confirm flow step type
type ConfirmStep = 0 | 1 | 2 | 3; // 0=idle, 1=warn, 2=type name, 3=executing

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

// ─── Namespace card with 3-step confirm flow ──────────────────────────────────
const NsCard: React.FC<{
  ns: Namespace;
  confirmStep: ConfirmStep;
  typedName: string;
  done: boolean;
  onInitiate: () => void;
  onProceed: () => void;
  onTypeName: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ ns, confirmStep, typedName, done, onInitiate, onProceed, onTypeName, onConfirm, onCancel }) => {
  const risk = ns.risk || 'low';
  const riskColor = RISK_COLOR[risk] ?? DK.muted;
  const nameMatch = typedName.trim().toLowerCase() === ns.namespace.toLowerCase();

  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${confirmStep > 0 ? riskColor + '66' : DK.border}`,
      borderRadius: 2, mb: 2, opacity: done ? 0.4 : 1, transition: 'all 0.2s',
    }}>
      {/* Card header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
        <FolderIcon sx={{ fontSize: 20, color: '#3b82f6', flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem' }}>{ns.namespace}</Typography>
            <Chip label={`RISK: ${risk.toUpperCase()}`} size="small"
              sx={{ bgcolor: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}44`, fontSize: '0.68rem', fontWeight: 700 }} />
            {ns.cluster && (
              <Chip label={ns.cluster} size="small" variant="outlined" sx={{ color: DK.muted, borderColor: DK.border, fontSize: '0.68rem', height: 18 }} />
            )}
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.25 }}>
            {ns.deployment_count} deployment{ns.deployment_count !== 1 ? 's' : ''} · {ns.pod_count} pod{ns.pod_count !== 1 ? 's' : ''}
          </Typography>
        </Box>
        {done ? (
          <Chip icon={<CheckCircleOutlineIcon />} label="Rolled Back" size="small"
            sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.72rem' }} />
        ) : confirmStep === 0 ? (
          <Button variant="outlined" size="small" startIcon={<ReplayIcon />}
            disabled={!ns.can_rollback}
            onClick={onInitiate}
            sx={{ borderColor: riskColor, color: riskColor, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem',
                  '&:hover': { bgcolor: riskColor + '22' } }}>
            Rollback Namespace
          </Button>
        ) : null}
      </Box>

      {/* Step 1: Warning */}
      {confirmStep === 1 && (
        <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
            <WarningAmberIcon sx={{ color: riskColor, fontSize: 20, mt: 0.2 }} />
            <Box>
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem' }}>
                This will restart all {ns.deployment_count} deployment{ns.deployment_count !== 1 ? 's' : ''} in <em>{ns.namespace}</em>
              </Typography>
              <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.25 }}>
                All pods in this namespace will be rolling-restarted. Services remain available during rollout if they have multiple replicas.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" size="small" onClick={onProceed}
              sx={{ bgcolor: riskColor, '&:hover': { filter: 'brightness(1.1)' }, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}>
              I Understand — Continue
            </Button>
            <Button variant="text" size="small" onClick={onCancel} sx={{ color: DK.muted, textTransform: 'none', fontSize: '0.8rem' }}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 2: Type namespace name to confirm */}
      {confirmStep === 2 && (
        <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2 }}>
          <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 1 }}>
            Type <strong style={{ color: DK.text }}>{ns.namespace}</strong> to confirm rollback:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              value={typedName} onChange={e => onTypeName(e.target.value)}
              placeholder={ns.namespace}
              size="small" autoFocus
              sx={{ '& .MuiInputBase-root': { bgcolor: DK.surface, color: DK.text, fontSize: '0.85rem', fontFamily: 'monospace' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: nameMatch ? '#3fb950' : DK.border } }}
            />
            <Button variant="contained" size="small" disabled={!nameMatch}
              onClick={onConfirm}
              sx={{ bgcolor: riskColor, '&:hover': { filter: 'brightness(1.1)' }, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem',
                    '&:disabled': { opacity: 0.4 } }}>
              Rollback Now
            </Button>
            <Button variant="text" size="small" onClick={onCancel} sx={{ color: DK.muted, textTransform: 'none', fontSize: '0.8rem' }}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 3: Executing */}
      {confirmStep === 3 && (
        <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={16} sx={{ color: riskColor }} />
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            Rolling back {ns.deployment_count} deployment{ns.deployment_count !== 1 ? 's' : ''}…
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const NamespaceRollback: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<NsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<Record<string, ConfirmStep>>({});
  const [typedName, setTypedName] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/namespace-rollback${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setStep = (ns: string, step: ConfirmStep) =>
    setConfirmStep(p => ({ ...p, [ns]: step }));

  const handleConfirm = async (ns: Namespace) => {
    setStep(ns.namespace, 3);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/namespace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: ns.namespace, cluster: ns.cluster }),
      });
      const body = await res.json();
      // namespace rollback returns array of command_ids
      const ids: number[] = body.command_ids ?? (body.command_id ? [body.command_id] : []);
      if (ids.length === 0) throw new Error('No command_ids returned');
      // Poll all in parallel
      const results = await Promise.all(ids.map(id => pollCommand(id)));
      const failed = results.find(r => !r.ok);
      if (!failed) {
        setDone(p => ({ ...p, [ns.namespace]: true }));
        setToast({ msg: `Namespace ${ns.namespace} rolled back successfully`, sev: 'success' });
      } else {
        setToast({ msg: failed.errMsg ?? 'Rollback failed', sev: 'error' });
        setStep(ns.namespace, 0);
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Rollback failed', sev: 'error' });
      setStep(ns.namespace, 0);
    }
  };

  const namespaces = data?.namespaces ?? [];
  const extremeCount = namespaces.filter(n => n.risk === 'extreme').length;

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Namespace Rollback</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>
            {activeClusterName} — restart all deployments in a namespace to previous state
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
            <KpiCard label="Total Namespaces" value={data.total_namespaces} />
            <KpiCard label="Extreme Risk" value={extremeCount} accent="#f85149" />
            <KpiCard label="Rolled Back" value={Object.values(done).filter(Boolean).length} accent="#3fb950" />
          </Box>

          {/* Extreme-risk warning banner */}
          {extremeCount > 0 && (
            <Box sx={{ bgcolor: '#2d0b0b', border: '1px solid #f8514966', borderRadius: 2, p: 2, mb: 3, display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <WarningAmberIcon sx={{ color: '#f85149', fontSize: 20 }} />
              <Typography sx={{ color: '#f85149', fontSize: '0.85rem', fontWeight: 600 }}>
                {extremeCount} namespace{extremeCount !== 1 ? 's' : ''} marked as Extreme Risk — rollback will affect production workloads
              </Typography>
            </Box>
          )}

          {/* Namespace list */}
          {namespaces.map(ns => (
            <NsCard
              key={ns.namespace}
              ns={ns}
              confirmStep={confirmStep[ns.namespace] ?? 0}
              typedName={typedName[ns.namespace] ?? ''}
              done={done[ns.namespace] ?? false}
              onInitiate={() => setStep(ns.namespace, 1)}
              onProceed={() => setStep(ns.namespace, 2)}
              onTypeName={v => setTypedName(p => ({ ...p, [ns.namespace]: v }))}
              onConfirm={() => handleConfirm(ns)}
              onCancel={() => { setStep(ns.namespace, 0); setTypedName(p => ({ ...p, [ns.namespace]: '' })); }}
            />
          ))}
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

export default NamespaceRollback;
