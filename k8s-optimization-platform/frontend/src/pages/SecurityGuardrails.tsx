import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Collapse, IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';

interface GuardrailException {
  id: number;
  control_id: string;
  title: string;
  justification: string;
  owner: string;
  review_date: string;
  status: string;
}

interface Guardrail {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  blocked_attempts: number;
  description: string;
  why: string;
  remediation: string;
  auto_fix_supported: boolean;
  last_blocked: string;
  exception?: GuardrailException | null;
}

interface SecurityGuardrailsData {
  total_guardrails: number;
  enabled_guardrails: number;
  total_blocked_attempts: number;
  guardrails: Guardrail[];
  enforcement_mode: string;
  cluster_name?: string;
  total_pods?: number;
  total_containers?: number;
  last_scan: string;
}

// ── Visual constants ──────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  violated: { bg: '#2d1515', text: '#f87171', border: '#4a2020', label: 'VIOLATED' },
  partial:  { bg: '#2d200a', text: '#f59e0b', border: '#4a3510', label: 'PARTIAL'  },
  active:   { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a', label: 'PASSING'  },
};

// ── Per-row expandable detail ─────────────────────────────────────────────────
const GuardrailRow: React.FC<{
  g: Guardrail;
  maxAttempts: number;
  submittingId: string | null;
  onFix: (g: Guardrail) => void;
  onException: (g: Guardrail) => void;
}> = ({ g, maxAttempts, submittingId, onFix, onException }) => {
  const [open, setOpen] = useState(false);
  const st = STATUS_STYLE[g.status] || STATUS_STYLE.partial;
  const busy = submittingId === g.id;

  return (
    <>
      <TableRow
        hover
        sx={{ '&:hover': { bgcolor: '#232d3f' }, cursor: 'pointer', bgcolor: open ? '#1a2540' : undefined }}
        onClick={() => setOpen(o => !o)}
      >
        <TableCell sx={{ borderColor: '#2a3245', pr: 0.5, width: 32 }}>
          <IconButton size="small" sx={{ color: '#8892a4', p: 0 }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>

        {/* Name */}
        <TableCell sx={{ color: '#e8eaf0', fontWeight: 600, fontSize: 13, borderColor: '#2a3245' }}>{g.name}</TableCell>

        {/* Status chip */}
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={st.label} size="small"
            sx={{ bgcolor: st.bg, color: st.text, border: `1px solid ${st.border}`, fontWeight: 700, fontSize: 10 }} />
        </TableCell>

        {/* Enabled chip */}
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={g.enabled ? 'Enabled' : 'Disabled'} size="small"
            sx={{ bgcolor: g.enabled ? '#0d2d1a' : '#1e2433', color: g.enabled ? '#4ade80' : '#8892a4',
                  border: `1px solid ${g.enabled ? '#1a4a2a' : '#2a3245'}`, fontSize: 10 }} />
        </TableCell>

        {/* Blocked attempts + bar */}
        <TableCell sx={{ borderColor: '#2a3245', minWidth: 160 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LinearProgress variant="determinate"
              value={maxAttempts > 0 ? (g.blocked_attempts / maxAttempts) * 100 : 0}
              sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: '#2a3245',
                    '& .MuiLinearProgress-bar': { bgcolor: g.blocked_attempts > 50 ? '#f87171' : g.blocked_attempts > 0 ? '#f59e0b' : '#4ade80' } }}
            />
            <Typography variant="caption" fontWeight={700}
              sx={{ color: g.blocked_attempts > 50 ? '#f87171' : g.blocked_attempts > 0 ? '#f59e0b' : '#4ade80', fontSize: 12, minWidth: 28, textAlign: 'right' }}>
              {g.blocked_attempts}
            </Typography>
          </Box>
        </TableCell>

        {/* Actions */}
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" gap={0.75} onClick={e => e.stopPropagation()}>
            {g.auto_fix_supported && g.blocked_attempts > 0 ? (
              <Button size="small" variant="contained" disabled={busy} onClick={() => onFix(g)}
                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, fontSize: 10, py: 0.25, minWidth: 48 }}>
                {busy ? '…' : 'Fix'}
              </Button>
            ) : (
              <Chip label="Manual" size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
            )}
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onException(g)}
              sx={{ borderColor: '#7c5cd8', color: '#c084fc', fontSize: 10, py: 0.25 }}>
              {g.exception ? 'Exception ✓' : 'Except'}
            </Button>
          </Box>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      <TableRow sx={{ bgcolor: '#131d2e' }}>
        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box px={3} py={1.5}>
              <Box display="flex" gap={4} flexWrap="wrap">
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    WHY THIS GUARDRAIL EXISTS
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12 }}>{g.why}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    REMEDIATION
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#a5d6a7', fontSize: 12 }}>{g.remediation}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    CURRENT STATE
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12 }}>{g.description}</Typography>
                  {g.exception && (
                    <Typography variant="caption" sx={{ color: '#c084fc', display: 'block', mt: 0.5 }}>
                      Exception by {g.exception.owner} until {new Date(g.exception.review_date).toLocaleDateString()}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: '#57606a', display: 'block', mt: 0.5 }}>
                    Last evaluated: {new Date(g.last_blocked).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const SecurityGuardrailsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SecurityGuardrailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedGuardrail, setSelectedGuardrail] = useState<Guardrail | null>(null);
  const [exceptionForm, setExceptionForm] = useState({ justification: '', owner: '', review_date: '' });

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/security-guardrails${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (g: Guardrail) => {
    setSubmittingId(g.id);
    setActionMessage(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/compliance/security-guardrails/fix/${encodeURIComponent(g.id)}${clusterParam}`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to queue fix');
      setActionMessage(`Spec patch queued for "${g.name}". Command ${result.command_id} will be executed by the cluster agent.`);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to queue fix');
    } finally {
      setSubmittingId(null);
    }
  };

  const openExceptionDialog = (g: Guardrail) => {
    setSelectedGuardrail(g);
    setExceptionForm({
      justification: g.exception?.justification || '',
      owner: g.exception?.owner || '',
      review_date: g.exception?.review_date || '',
    });
    setExceptionDialogOpen(true);
  };

  const handleSaveException = async () => {
    if (!selectedGuardrail) return;
    setSubmittingId(selectedGuardrail.id);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/compliance/security-guardrails/exception${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          control_id: selectedGuardrail.id,
          title: selectedGuardrail.name,
          justification: exceptionForm.justification,
          owner: exceptionForm.owner,
          review_date: exceptionForm.review_date,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to save exception');
      setActionMessage(`Exception saved for "${selectedGuardrail.name}". Review date: ${result.review_date}`);
      setExceptionDialogOpen(false);
      setSelectedGuardrail(null);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to save exception');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error)   return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="info">No data available</Alert></Box>;

  const guardrails = data.guardrails || [];
  const violated = guardrails.filter(g => g.status !== 'active');
  const maxAttempts = Math.max(...guardrails.map(g => g.blocked_attempts), 1);

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#1e2433', border: '1px solid #2a3245',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          🔒
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Security Guardrails</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real cluster scan · {data.cluster_name || 'Cluster'} · {data.total_pods || 0} pods,&nbsp;
            {data.total_containers || 0} containers · Enforcement: {data.enforcement_mode} · Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {actionMessage && (
        <Alert
          severity={actionMessage.toLowerCase().includes('failed') ? 'error' : 'success'}
          sx={{ mb: 3, mt: 2, bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245' }}
          onClose={() => setActionMessage(null)}
        >
          {actionMessage}
        </Alert>
      )}

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3, mt: 2 }}>
        {[
          { label: 'Total Guardrails',    value: data.total_guardrails,        color: '#60a5fa' },
          { label: 'Enabled',             value: data.enabled_guardrails,       color: '#4ade80' },
          { label: 'Violated / Partial',  value: violated.length,              color: violated.length > 0 ? '#f87171' : '#4ade80' },
          { label: 'Total Violations',    value: data.total_blocked_attempts,  color: data.total_blocked_attempts > 0 ? '#f87171' : '#4ade80' },
          { label: 'Auto-fixable',        value: guardrails.filter(g => g.auto_fix_supported && g.blocked_attempts > 0).length, color: '#f59e0b' },
          { label: 'Enforcement Mode',    value: data.enforcement_mode.toUpperCase(), color: '#4ade80' },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={2} key={k.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{k.label}</Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: k.color, fontSize: k.label === 'Enforcement Mode' ? '0.8rem' : undefined }}>
                  {k.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Guardrails table */}
      <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
            All Guardrails ({data.total_guardrails})
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mb: 2 }}>
            Click any row to see why the guardrail exists, the exact remediation step, and its current cluster state.
            Fix queues a direct spec patch through the agent. Exception records an accepted business justification.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#131d2e', color: '#8892a4', borderColor: '#2a3245', fontSize: 12 } }}>
                  <TableCell sx={{ width: 32 }} />
                  <TableCell>Guardrail</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>Violations</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guardrails.map(g => (
                  <GuardrailRow key={g.id} g={g} maxAttempts={maxAttempts}
                    submittingId={submittingId} onFix={handleFix} onException={openExceptionDialog} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Violation breakdown bar */}
      {violated.length > 0 && (
        <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
              Violation Breakdown — Guardrails with Active Violations
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.25}>
              {[...violated].sort((a, b) => b.blocked_attempts - a.blocked_attempts).map(g => (
                <Box key={g.id}>
                  <Box display="flex" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: '#c8d0dc', fontWeight: 600, fontSize: 12 }}>{g.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#f87171', fontWeight: 700, fontSize: 12 }}>{g.blocked_attempts}</Typography>
                  </Box>
                  <LinearProgress variant="determinate"
                    value={(g.blocked_attempts / maxAttempts) * 100}
                    sx={{ height: 5, borderRadius: 3, bgcolor: '#2a3245',
                          '& .MuiLinearProgress-bar': { bgcolor: g.status === 'violated' ? '#f87171' : '#f59e0b' } }} />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Exception dialog */}
      <Dialog open={exceptionDialogOpen} onClose={() => setExceptionDialogOpen(false)}
        maxWidth="sm" fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: '#1e2433', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #2a3245' }}>Accept Guardrail Exception</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: '#8892a4' }}>
            Record why this guardrail violation is intentionally accepted and will not be remediated now.
          </Typography>
          <TextField label="Guardrail" value={selectedGuardrail?.name ?? ''} fullWidth disabled
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Business justification" value={exceptionForm.justification}
            onChange={e => setExceptionForm(v => ({ ...v, justification: e.target.value }))}
            fullWidth required multiline minRows={3}
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Owner" value={exceptionForm.owner}
            onChange={e => setExceptionForm(v => ({ ...v, owner: e.target.value }))}
            fullWidth required
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Review date" type="date" value={exceptionForm.review_date}
            onChange={e => setExceptionForm(v => ({ ...v, review_date: e.target.value }))}
            fullWidth required InputLabelProps={{ shrink: true, sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #2a3245', px: 3, py: 2 }}>
          <Button onClick={() => setExceptionDialogOpen(false)} sx={{ color: '#8892a4' }}>Cancel</Button>
          <Button variant="contained"
            disabled={!exceptionForm.justification || !exceptionForm.owner || !exceptionForm.review_date
                      || !selectedGuardrail || submittingId === selectedGuardrail?.id}
            onClick={handleSaveException}
            sx={{ bgcolor: '#7c5cd8', '&:hover': { bgcolor: '#6d4ec7' } }}>
            Save Exception
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const SecurityGuardrails: React.FC = () => (
  <ClusterGuard><SecurityGuardrailsInner /></ClusterGuard>
);

export default SecurityGuardrails;
