import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { API_BASE_URL } from '../../../config/api';

// ─── Design tokens (red-accent danger theme) ──────────────────────────────────
const DK = {
  bg:       '#0d1117',
  surface:  '#161b22',
  surface2: '#1c2128',
  border:   '#30363d',
  text:     '#e6edf3',
  muted:    '#8b949e',
};
const DANGER = '#f85149';
const DANGER_DARK = '#2d0b0b';
const DANGER_BORDER = '#f8514966';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Snapshot {
  snapshot_id: number;
  timestamp: string;
  pod_count: number;
  can_rollback: boolean;
}
interface ClusterPayload {
  category: string;
  cluster_name: string;
  total_pods: number;
  total_deployments: number;
  total_namespaces: number;
  snapshots: Snapshot[];
  risk: string;
}

type ConfirmStep = 0 | 1 | 2 | 3 | 4; // 0=idle,1=warn,2=type name,3=select snapshot,4=executing

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
  <Box sx={{ bgcolor: DK.surface, border: `1px solid ${accent ? accent + '44' : DK.border}`, borderRadius: 2, p: 2 }}>
    <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mb: 0.5 }}>{label}</Typography>
    <Typography sx={{ color: accent ?? DK.text, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
  </Box>
);

// ─── Snapshot row ─────────────────────────────────────────────────────────────
const SnapshotRow: React.FC<{ snap: Snapshot; selected: boolean; onSelect: () => void }> = ({ snap, selected, onSelect }) => (
  <Box onClick={onSelect} sx={{
    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
    bgcolor: selected ? DANGER_DARK : DK.surface2,
    border: `1px solid ${selected ? DANGER : DK.border}`, borderRadius: 1.5, mb: 1, cursor: 'pointer',
    '&:hover': { borderColor: DANGER + '88' },
  }}>
    <AccessTimeIcon sx={{ fontSize: 16, color: DK.muted, flexShrink: 0 }} />
    <Box sx={{ flex: 1 }}>
      <Typography sx={{ color: DK.text, fontSize: '0.82rem', fontWeight: selected ? 600 : 400 }}>
        {new Date(snap.timestamp).toLocaleString()}
      </Typography>
      <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
        Snapshot #{snap.snapshot_id} · {snap.pod_count} pods
      </Typography>
    </Box>
    {selected && (
      <Chip label="Selected" size="small" sx={{ bgcolor: DANGER + '22', color: DANGER, fontSize: '0.68rem', border: `1px solid ${DANGER}44` }} />
    )}
  </Box>
);

// ─── Main component ───────────────────────────────────────────────────────────
const ClusterRollback: React.FC = () => {
  const { clusterParam, activeClusterId, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<ClusterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(0);
  const [typedName, setTypedName] = useState('');
  const [selectedSnap, setSelectedSnap] = useState<number | null>(null);
  const [executing, setExecuting] = useState(false);
  const [rollbackDone, setRollbackDone] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [aborted, setAborted] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/cluster-rollback${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clusterName = data?.cluster_name ?? activeClusterId ?? '';
  const nameMatch = typedName.trim().toLowerCase() === clusterName.toLowerCase();

  const handleAbort = () => {
    setAborted(true);
    setConfirmStep(0);
    setTypedName('');
    setSelectedSnap(null);
    setExecuting(false);
    setToast({ msg: '🛑 Cluster rollback aborted', sev: 'error' });
  };

  const handleExecute = async () => {
    if (!data) return;
    setConfirmStep(4);
    setExecuting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/rollback/cluster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: clusterName, snapshot_id: selectedSnap }),
      });
      const body = await res.json();
      const ids: number[] = body.command_ids ?? (body.command_id ? [body.command_id] : []);
      if (ids.length === 0) throw new Error('No command_ids returned');
      const results = await Promise.all(ids.map(id => pollCommand(id)));
      const failed = results.find(r => !r.ok);
      if (!failed) {
        setRollbackDone(true);
        setToast({ msg: `Cluster ${clusterName} rolled back — ${ids.length} deployments restarted`, sev: 'success' });
      } else {
        setToast({ msg: failed.errMsg ?? 'Rollback failed', sev: 'error' });
        setConfirmStep(0);
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Rollback failed', sev: 'error' });
      setConfirmStep(0);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Danger header */}
      <Box sx={{ bgcolor: DANGER_DARK, border: `1px solid ${DANGER_BORDER}`, borderRadius: 2, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <WarningAmberIcon sx={{ color: DANGER, fontSize: 22 }} />
              <Typography variant="h5" sx={{ color: DANGER, fontWeight: 700 }}>Cluster Rollback</Typography>
            </Box>
            <Typography sx={{ color: '#e6edf3cc', fontSize: '0.85rem' }}>
              {activeClusterName} — restart ALL deployments across the entire cluster
            </Typography>
          </Box>
          {/* ABORT button — always visible */}
          <Button
            variant="contained" startIcon={<BlockIcon />}
            onClick={handleAbort}
            disabled={confirmStep === 0 && !executing}
            sx={{ bgcolor: DANGER, '&:hover': { bgcolor: '#c13636' }, textTransform: 'none', fontWeight: 700,
                  fontFamily: 'monospace', letterSpacing: 1, flexShrink: 0,
                  '&:disabled': { bgcolor: DK.surface, color: DK.muted } }}
          >
            ABORT
          </Button>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress sx={{ color: DANGER }} />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
            <KpiCard label="Total Pods" value={data.total_pods} accent={DANGER} />
            <KpiCard label="Deployments" value={data.total_deployments} accent={DANGER} />
            <KpiCard label="Namespaces" value={data.total_namespaces} />
            <KpiCard label="Snapshots" value={data.snapshots.length} />
          </Box>

          {rollbackDone ? (
            <Box sx={{ bgcolor: '#0b2d0b', border: '1px solid #3fb95066', borderRadius: 2, p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
              <CheckCircleOutlineIcon sx={{ color: '#3fb950', fontSize: 32 }} />
              <Box>
                <Typography sx={{ color: '#3fb950', fontWeight: 700, fontSize: '1rem' }}>Cluster rollback complete</Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.82rem', mt: 0.25 }}>
                  All deployments in {clusterName} have been rolled back and restarted.
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              {/* Step 0: Initiate */}
              {confirmStep === 0 && (
                <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3 }}>
                  <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.95rem', mb: 1 }}>
                    Cluster-wide rollback
                  </Typography>
                  <Typography sx={{ color: DK.muted, fontSize: '0.82rem', mb: 2 }}>
                    This operation will restart every deployment in cluster <strong style={{ color: DK.text }}>{clusterName}</strong>.
                    It is irreversible once started. Use only in emergencies.
                  </Typography>
                  <Button variant="contained" startIcon={<ReplayIcon />} onClick={() => setConfirmStep(1)}
                    sx={{ bgcolor: DANGER, '&:hover': { bgcolor: '#c13636' }, textTransform: 'none', fontWeight: 600 }}>
                    Begin Cluster Rollback
                  </Button>
                </Box>
              )}

              {/* Step 1: Warning acknowledgement */}
              {confirmStep === 1 && (
                <Box sx={{ bgcolor: DANGER_DARK, border: `1px solid ${DANGER_BORDER}`, borderRadius: 2, p: 3 }}>
                  <Typography sx={{ color: DANGER, fontWeight: 700, fontSize: '1rem', mb: 1 }}>
                    ⚠ DANGER — Production Impact
                  </Typography>
                  <Box component="ul" sx={{ color: DK.muted, fontSize: '0.82rem', pl: 2.5, mb: 2, '& li': { mb: 0.5 } }}>
                    <li>All {data.total_deployments} deployments will be rolling-restarted simultaneously</li>
                    <li>Single-replica services <strong style={{ color: DANGER }}>will experience downtime</strong></li>
                    <li>This cannot be undone automatically — you must re-trigger deployments manually to reverse</li>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={() => setConfirmStep(2)}
                      sx={{ bgcolor: DANGER, '&:hover': { bgcolor: '#c13636' }, textTransform: 'none', fontWeight: 600 }}>
                      I Understand the Risk
                    </Button>
                    <Button variant="outlined" onClick={() => setConfirmStep(0)}
                      sx={{ borderColor: DK.border, color: DK.muted, textTransform: 'none' }}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Step 2: Type cluster name */}
              {confirmStep === 2 && (
                <Box sx={{ bgcolor: DANGER_DARK, border: `1px solid ${DANGER_BORDER}`, borderRadius: 2, p: 3 }}>
                  <Typography sx={{ color: DK.muted, fontSize: '0.82rem', mb: 1 }}>
                    Type the cluster name <strong style={{ color: DANGER }}>{clusterName}</strong> to proceed:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                    <TextField
                      value={typedName} onChange={e => setTypedName(e.target.value)}
                      placeholder={clusterName} size="small" autoFocus
                      sx={{ maxWidth: 320,
                            '& .MuiInputBase-root': { bgcolor: DK.surface, color: DK.text, fontFamily: 'monospace' },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: nameMatch ? '#3fb950' : DANGER } }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" disabled={!nameMatch} onClick={() => setConfirmStep(3)}
                      sx={{ bgcolor: DANGER, '&:hover': { bgcolor: '#c13636' }, textTransform: 'none', fontWeight: 600,
                            '&:disabled': { opacity: 0.4 } }}>
                      Continue to Snapshot Selection
                    </Button>
                    <Button variant="outlined" onClick={() => setConfirmStep(0)}
                      sx={{ borderColor: DK.border, color: DK.muted, textTransform: 'none' }}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Step 3: Select snapshot */}
              {confirmStep === 3 && (
                <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DANGER_BORDER}`, borderRadius: 2, p: 3 }}>
                  <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>Select a rollback snapshot:</Typography>
                  <Box sx={{ mb: 2 }}>
                    {data.snapshots.map(snap => (
                      <SnapshotRow
                        key={snap.snapshot_id}
                        snap={snap}
                        selected={selectedSnap === snap.snapshot_id}
                        onSelect={() => setSelectedSnap(snap.snapshot_id)}
                      />
                    ))}
                    {data.snapshots.length === 0 && (
                      <Typography sx={{ color: DK.muted, fontSize: '0.82rem' }}>No snapshots available — rollback will use previous revision</Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained"
                      disabled={data.snapshots.length > 0 && selectedSnap === null}
                      onClick={handleExecute}
                      sx={{ bgcolor: DANGER, '&:hover': { bgcolor: '#c13636' }, textTransform: 'none', fontWeight: 700 }}>
                      Execute Cluster Rollback
                    </Button>
                    <Button variant="outlined" onClick={() => setConfirmStep(0)}
                      sx={{ borderColor: DK.border, color: DK.muted, textTransform: 'none' }}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Step 4: Executing */}
              {confirmStep === 4 && (
                <Box sx={{ bgcolor: DANGER_DARK, border: `1px solid ${DANGER_BORDER}`, borderRadius: 2, p: 3,
                           display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CircularProgress size={24} sx={{ color: DANGER, flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ color: DANGER, fontWeight: 700 }}>Rolling back cluster {clusterName}…</Typography>
                    <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.25 }}>
                      Restarting {data.total_deployments} deployments across {data.total_namespaces} namespaces.
                      This may take several minutes.
                    </Typography>
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Snapshots reference panel */}
          {confirmStep === 0 && !rollbackDone && data.snapshots.length > 0 && (
            <Box sx={{ mt: 3, bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3 }}>
              <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Available Snapshots ({data.snapshots.length})
              </Typography>
              {data.snapshots.map(snap => (
                <Box key={snap.snapshot_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1,
                  borderBottom: `1px solid ${DK.border}`, '&:last-child': { borderBottom: 'none' } }}>
                  <AccessTimeIcon sx={{ fontSize: 14, color: DK.muted }} />
                  <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>
                    {new Date(snap.timestamp).toLocaleString()} — {snap.pod_count} pods
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          <Tooltip title="Refresh">
            <IconButton onClick={fetchData} sx={{ color: DK.muted, mt: 2 }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.sev ?? 'info'} sx={{ width: '100%' }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ClusterRollback;
