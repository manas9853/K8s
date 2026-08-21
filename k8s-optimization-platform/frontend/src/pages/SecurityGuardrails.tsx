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
import { colors } from '../theme/colors';

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
  violated: { bg: colors.dangerBg, text: colors.danger, border: colors.dangerBg, label: 'VIOLATED' },
  partial:  { bg: colors.warningBg, text: colors.warning, border: colors.warningBg, label: 'PARTIAL'  },
  active:   { bg: colors.successBg, text: colors.success, border: colors.successBg, label: 'PASSING'  },
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
        sx={{ '&:hover': { bgcolor: colors.surfaceHover }, cursor: 'pointer', bgcolor: open ? colors.infoBg : undefined }}
        onClick={() => setOpen(o => !o)}
      >
        <TableCell sx={{ borderColor: colors.border, pr: 0.5, width: 32 }}>
          <IconButton size="small" sx={{ color: colors.textSecondary, p: 0 }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>

        {/* Name */}
        <TableCell sx={{ color: colors.textPrimary, fontWeight: 600, fontSize: 13, borderColor: colors.border }}>{g.name}</TableCell>

        {/* Status chip */}
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={st.label} size="small"
            sx={{ bgcolor: st.bg, color: st.text, border: `1px solid ${st.border}`, fontWeight: 700, fontSize: 10 }} />
        </TableCell>

        {/* Enabled chip */}
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={g.enabled ? 'Enabled' : 'Disabled'} size="small"
            sx={{ bgcolor: g.enabled ? colors.successBg : colors.surface, color: g.enabled ? colors.success : colors.textSecondary,
                  border: `1px solid ${g.enabled ? colors.successBg : colors.border}`, fontSize: 10 }} />
        </TableCell>

        {/* Blocked attempts + bar */}
        <TableCell sx={{ borderColor: colors.border, minWidth: 160 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LinearProgress variant="determinate"
              value={maxAttempts > 0 ? (g.blocked_attempts / maxAttempts) * 100 : 0}
              sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: colors.border,
                    '& .MuiLinearProgress-bar': { bgcolor: g.blocked_attempts > 50 ? colors.danger : g.blocked_attempts > 0 ? colors.warning : colors.success } }}
            />
            <Typography variant="caption" fontWeight={700}
              sx={{ color: g.blocked_attempts > 50 ? colors.danger : g.blocked_attempts > 0 ? colors.warning : colors.success, fontSize: 12, minWidth: 28, textAlign: 'right' }}>
              {g.blocked_attempts}
            </Typography>
          </Box>
        </TableCell>

        {/* Actions */}
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" gap={0.75} onClick={e => e.stopPropagation()}>
            {g.auto_fix_supported && g.blocked_attempts > 0 ? (
              <Button size="small" variant="contained" disabled={busy} onClick={() => onFix(g)}
                sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info }, fontSize: 10, py: 0.25, minWidth: 48 }}>
                {busy ? '…' : 'Fix'}
              </Button>
            ) : (
              <Chip label="Manual" size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
            )}
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onException(g)}
              sx={{ borderColor: colors.purple, color: colors.purple, fontSize: 10, py: 0.25 }}>
              {g.exception ? 'Exception ✓' : 'Except'}
            </Button>
          </Box>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={6} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box px={3} py={1.5}>
              <Box display="flex" gap={4} flexWrap="wrap">
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.info, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    WHY THIS GUARDRAIL EXISTS
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>{g.why}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.success, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    REMEDIATION
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.success, fontSize: 12 }}>{g.remediation}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    CURRENT STATE
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>{g.description}</Typography>
                  {g.exception && (
                    <Typography variant="caption" sx={{ color: colors.purple, display: 'block', mt: 0.5 }}>
                      Exception by {g.exception.owner} until {new Date(g.exception.review_date).toLocaleDateString()}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mt: 0.5 }}>
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
  if (error)   return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="info">No data available</Alert></Box>;

  const guardrails = data.guardrails || [];
  const violated = guardrails.filter(g => g.status !== 'active');
  const maxAttempts = Math.max(...guardrails.map(g => g.blocked_attempts), 1);

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}`,
                   display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          🔒
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Security Guardrails</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Real cluster scan · {data.cluster_name || 'Cluster'} · {data.total_pods || 0} pods,&nbsp;
            {data.total_containers || 0} containers · Enforcement: {data.enforcement_mode} · Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {actionMessage && (
        <Alert
          severity={actionMessage.toLowerCase().includes('failed') ? 'error' : 'success'}
          sx={{ mb: 3, mt: 2, bgcolor: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
          onClose={() => setActionMessage(null)}
        >
          {actionMessage}
        </Alert>
      )}

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3, mt: 2 }}>
        {[
          { label: 'Total Guardrails',    value: data.total_guardrails,        color: colors.info },
          { label: 'Enabled',             value: data.enabled_guardrails,       color: colors.success },
          { label: 'Violated / Partial',  value: violated.length,              color: violated.length > 0 ? colors.danger : colors.success },
          { label: 'Total Violations',    value: data.total_blocked_attempts,  color: data.total_blocked_attempts > 0 ? colors.danger : colors.success },
          { label: 'Auto-fixable',        value: guardrails.filter(g => g.auto_fix_supported && g.blocked_attempts > 0).length, color: colors.warning },
          { label: 'Enforcement Mode',    value: data.enforcement_mode.toUpperCase(), color: colors.success },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={2} key={k.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{k.label}</Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: k.color, fontSize: k.label === 'Enforcement Mode' ? '0.8rem' : undefined }}>
                  {k.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Guardrails table */}
      <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
            All Guardrails ({data.total_guardrails})
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 2 }}>
            Click any row to see why the guardrail exists, the exact remediation step, and its current cluster state.
            Fix queues a direct spec patch through the agent. Exception records an accepted business justification.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: colors.surfaceAlt, color: colors.textSecondary, borderColor: colors.border, fontSize: 12 } }}>
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
        <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
              Violation Breakdown — Guardrails with Active Violations
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.25}>
              {[...violated].sort((a, b) => b.blocked_attempts - a.blocked_attempts).map(g => (
                <Box key={g.id}>
                  <Box display="flex" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: colors.textMuted, fontWeight: 600, fontSize: 12 }}>{g.name}</Typography>
                    <Typography variant="caption" sx={{ color: colors.danger, fontWeight: 700, fontSize: 12 }}>{g.blocked_attempts}</Typography>
                  </Box>
                  <LinearProgress variant="determinate"
                    value={(g.blocked_attempts / maxAttempts) * 100}
                    sx={{ height: 5, borderRadius: 3, bgcolor: colors.border,
                          '& .MuiLinearProgress-bar': { bgcolor: g.status === 'violated' ? colors.danger : colors.warning } }} />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Exception dialog */}
      <Dialog open={exceptionDialogOpen} onClose={() => setExceptionDialogOpen(false)}
        maxWidth="sm" fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: `1px solid ${colors.border}` }}>Accept Guardrail Exception</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            Record why this guardrail violation is intentionally accepted and will not be remediated now.
          </Typography>
          <TextField label="Guardrail" value={selectedGuardrail?.name ?? ''} fullWidth disabled
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }} />
          <TextField label="Business justification" value={exceptionForm.justification}
            onChange={e => setExceptionForm(v => ({ ...v, justification: e.target.value }))}
            fullWidth required multiline minRows={3}
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }} />
          <TextField label="Owner" value={exceptionForm.owner}
            onChange={e => setExceptionForm(v => ({ ...v, owner: e.target.value }))}
            fullWidth required
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }} />
          <TextField label="Review date" type="date" value={exceptionForm.review_date}
            onChange={e => setExceptionForm(v => ({ ...v, review_date: e.target.value }))}
            fullWidth required InputLabelProps={{ shrink: true, sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }} />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${colors.border}`, px: 3, py: 2 }}>
          <Button onClick={() => setExceptionDialogOpen(false)} sx={{ color: colors.textSecondary }}>Cancel</Button>
          <Button variant="contained"
            disabled={!exceptionForm.justification || !exceptionForm.owner || !exceptionForm.review_date
                      || !selectedGuardrail || submittingId === selectedGuardrail?.id}
            onClick={handleSaveException}
            sx={{ bgcolor: colors.purple, '&:hover': { bgcolor: colors.purple } }}>
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
