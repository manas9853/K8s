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

interface PolicyException {
  id: number;
  control_id: string;
  title: string;
  justification: string;
  owner: string;
  review_date: string;
  status: string;
}

interface Policy {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  enforcement: string;
  violations: number;
  description: string;
  risk: string;
  remediation: string;
  why: string;
  auto_fix_supported: boolean;
  last_evaluated: string;
  exception?: PolicyException | null;
}

interface PolicyEngineData {
  total_policies: number;
  enabled_policies: number;
  disabled_policies: number;
  total_violations: number;
  policies: Policy[];
  policy_engine_version: string;
  cluster_name?: string;
  total_pods_scanned?: number;
  total_containers_scanned?: number;
  last_sync: string;
}

// ── Visual constants ──────────────────────────────────────────────────────────
const RISK: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: colors.dangerBg, text: colors.danger, border: colors.dangerBg },
  high:     { bg: colors.warningBg, text: colors.warning, border: colors.warningBg },
  medium:   { bg: colors.infoBg, text: colors.info, border: colors.info },
  low:      { bg: colors.successBg, text: colors.success, border: colors.successBg },
};

const ENF: Record<string, { bg: string; text: string; border: string }> = {
  enforce: { bg: colors.dangerBg, text: colors.danger, border: colors.dangerBg },
  audit:   { bg: colors.infoBg, text: colors.info, border: colors.info },
  warn:    { bg: colors.warningBg, text: colors.warning, border: colors.warningBg },
};

const TYPE_COLOR: Record<string, string> = {
  Security:   colors.danger,
  Network:    colors.info,
  Resource:   colors.warning,
  Compliance: colors.success,
};

// ── Per-row expanded detail ───────────────────────────────────────────────────
const PolicyRow: React.FC<{
  p: Policy;
  submittingId: string | null;
  onFix: (p: Policy) => void;
  onException: (p: Policy) => void;
}> = ({ p, submittingId, onFix, onException }) => {
  const [open, setOpen] = useState(false);
  const risk = RISK[p.risk] || RISK.medium;
  const enf  = ENF[p.enforcement]  || ENF.audit;
  const typeColor = TYPE_COLOR[p.type] ?? colors.textSecondary;
  const busy = submittingId === p.id;

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
        <TableCell sx={{ color: colors.textPrimary, fontWeight: 600, fontSize: 13, borderColor: colors.border }}>{p.name}</TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={p.type} size="small" sx={{ bgcolor: colors.surface, color: typeColor, border: `1px solid ${typeColor}33`, fontSize: 10, fontWeight: 700 }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={p.enabled ? 'Enabled' : 'Disabled'} size="small"
            sx={{ bgcolor: p.enabled ? colors.successBg : colors.surface, color: p.enabled ? colors.success : colors.textSecondary,
                  border: `1px solid ${p.enabled ? colors.successBg : colors.border}`, fontSize: 10 }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={p.enforcement.toUpperCase()} size="small"
            sx={{ bgcolor: enf.bg, color: enf.text, border: `1px solid ${enf.border}`, fontSize: 10, fontWeight: 700 }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={(p.risk || 'medium').toUpperCase()} size="small"
            sx={{ bgcolor: risk.bg, color: risk.text, border: `1px solid ${risk.border}`, fontSize: 10, fontWeight: 700 }} />
        </TableCell>
        <TableCell align="right" sx={{ color: p.violations > 0 ? colors.danger : colors.success, fontWeight: 700, fontSize: 14, borderColor: colors.border }}>
          {p.violations}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" gap={0.75} onClick={e => e.stopPropagation()}>
            {p.auto_fix_supported && p.violations > 0 ? (
              <Button size="small" variant="contained" disabled={busy} onClick={() => onFix(p)}
                sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info }, fontSize: 10, py: 0.25, minWidth: 48 }}>
                {busy ? '…' : 'Fix'}
              </Button>
            ) : (
              <Chip label="Manual" size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
            )}
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onException(p)}
              sx={{ borderColor: colors.purple, color: colors.purple, fontSize: 10, py: 0.25 }}>
              {p.exception ? 'Exception ✓' : 'Except'}
            </Button>
          </Box>
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={8} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box px={3} py={1.5} display="grid" gap={1}>
              <Box display="flex" gap={4} flexWrap="wrap">
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.info, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    WHY THIS MATTERS
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>{p.why}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.success, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    REMEDIATION
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.success, fontSize: 12 }}>{p.remediation}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.25 }}>
                    CURRENT STATE
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>{p.description}</Typography>
                  {p.exception && (
                    <Typography variant="caption" sx={{ color: colors.purple, display: 'block', mt: 0.5 }}>
                      Exception by {p.exception.owner} until {new Date(p.exception.review_date).toLocaleDateString()}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mt: 0.5 }}>
                    Last evaluated: {new Date(p.last_evaluated).toLocaleString()}
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
const PolicyEngineInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PolicyEngineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [exceptionForm, setExceptionForm] = useState({ justification: '', owner: '', review_date: '' });

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/policy-engine${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (policy: Policy) => {
    setSubmittingId(policy.id);
    setActionMessage(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/compliance/policy-engine/fix/${encodeURIComponent(policy.id)}${clusterParam}`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to queue fix');
      setActionMessage(`Spec patch queued for "${policy.name}". Command ${result.command_id} will be executed by the cluster agent.`);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to queue fix');
    } finally {
      setSubmittingId(null);
    }
  };

  const openExceptionDialog = (policy: Policy) => {
    setSelectedPolicy(policy);
    setExceptionForm({
      justification: policy.exception?.justification || '',
      owner: policy.exception?.owner || '',
      review_date: policy.exception?.review_date || '',
    });
    setExceptionDialogOpen(true);
  };

  const handleSaveException = async () => {
    if (!selectedPolicy) return;
    setSubmittingId(selectedPolicy.id);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/compliance/policy-engine/exception${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          control_id: selectedPolicy.id,
          title: selectedPolicy.name,
          justification: exceptionForm.justification,
          owner: exceptionForm.owner,
          review_date: exceptionForm.review_date,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to save exception');
      setActionMessage(`Exception saved for "${selectedPolicy.name}". Review date: ${result.review_date}`);
      setExceptionDialogOpen(false);
      setSelectedPolicy(null);
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

  const policies = data.policies || [];
  const violating = policies.filter(p => p.violations > 0 && p.enabled);
  const maxViolations = Math.max(...policies.map(p => p.violations), 1);

  // Group violations by type for the summary bars
  const byType = policies.reduce<Record<string, number>>((acc, p) => {
    if (p.enabled) acc[p.type] = (acc[p.type] || 0) + p.violations;
    return acc;
  }, {});

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          ⚙️
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>Policy Engine</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            v{data.policy_engine_version} · {data.cluster_name || 'Cluster'} · {data.total_pods_scanned || 0} pods, {data.total_containers_scanned || 0} containers · Last sync: {new Date(data.last_sync).toLocaleString()}
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
          { label: 'Total Policies',      value: data.total_policies,       color: colors.info },
          { label: 'Enabled',             value: data.enabled_policies,      color: colors.success },
          { label: 'Disabled',            value: data.disabled_policies,     color: colors.textSecondary },
          { label: 'Policies Violating',  value: violating.length,           color: violating.length > 0 ? colors.danger : colors.success },
          { label: 'Total Violations',    value: data.total_violations,      color: data.total_violations > 0 ? colors.danger : colors.success },
          { label: 'Auto-fixable',        value: policies.filter(p => p.auto_fix_supported && p.violations > 0).length, color: colors.warning },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={2} key={k.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{k.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: k.color }}>{k.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Violations by type */}
      <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>Violations by Policy Type</Typography>
          <Grid container spacing={2}>
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <Grid item xs={12} sm={6} md={3} key={type}>
                <Box mb={0.5} display="flex" justifyContent="space-between">
                  <Typography variant="caption" sx={{ color: TYPE_COLOR[type] ?? colors.textSecondary, fontWeight: 700 }}>{type}</Typography>
                  <Typography variant="caption" sx={{ color: count > 0 ? colors.danger : colors.success, fontWeight: 700 }}>{count}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min((count / Math.max(...Object.values(byType))) * 100, 100)}
                  sx={{ height: 6, borderRadius: 3, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: TYPE_COLOR[type] ?? colors.info } }}
                />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Policy table */}
      <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
            All Policies ({data.total_policies})
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 2 }}>
            Click any row to expand the reason this policy exists, the remediation step, and its current cluster state. Fix queues a direct spec patch through the agent. Exception records why the violation is intentionally accepted.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: colors.surfaceAlt, color: colors.textSecondary, borderColor: colors.border, fontSize: 12 } }}>
                  <TableCell sx={{ width: 32 }} />
                  <TableCell>Policy</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Enforcement</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell align="right">Violations</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.map((p) => (
                  <PolicyRow
                    key={p.id}
                    p={p}
                    submittingId={submittingId}
                    onFix={handleFix}
                    onException={openExceptionDialog}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Top violations mini-bar */}
      {violating.length > 0 && (
        <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
              Violation Breakdown — Policies with Active Violations
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.25}>
              {[...violating].sort((a, b) => b.violations - a.violations).map(p => (
                <Box key={p.id}>
                  <Box display="flex" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: colors.textMuted, fontWeight: 600, fontSize: 12 }}>{p.name}</Typography>
                    <Typography variant="caption" sx={{ color: colors.danger, fontWeight: 700, fontSize: 12 }}>{p.violations}</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(p.violations / maxViolations) * 100}
                    sx={{ height: 5, borderRadius: 3, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: TYPE_COLOR[p.type] ?? colors.info } }}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Exception dialog */}
      <Dialog
        open={exceptionDialogOpen}
        onClose={() => setExceptionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ borderBottom: `1px solid ${colors.border}` }}>Accept Policy Exception</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            Record why this policy violation is intentionally accepted and will not be remediated now.
          </Typography>
          <TextField
            label="Policy"
            value={selectedPolicy?.name ?? ''}
            fullWidth disabled
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Business justification"
            value={exceptionForm.justification}
            onChange={(e) => setExceptionForm(v => ({ ...v, justification: e.target.value }))}
            fullWidth required multiline minRows={3}
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Owner"
            value={exceptionForm.owner}
            onChange={(e) => setExceptionForm(v => ({ ...v, owner: e.target.value }))}
            fullWidth required
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Review date"
            type="date"
            value={exceptionForm.review_date}
            onChange={(e) => setExceptionForm(v => ({ ...v, review_date: e.target.value }))}
            fullWidth required
            InputLabelProps={{ shrink: true, sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${colors.border}`, px: 3, py: 2 }}>
          <Button onClick={() => setExceptionDialogOpen(false)} sx={{ color: colors.textSecondary }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!exceptionForm.justification || !exceptionForm.owner || !exceptionForm.review_date || !selectedPolicy || submittingId === selectedPolicy?.id}
            onClick={handleSaveException}
            sx={{ bgcolor: colors.purple, '&:hover': { bgcolor: colors.purple } }}
          >
            Save Exception
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const PolicyEngine: React.FC = () => (
  <ClusterGuard><PolicyEngineInner /></ClusterGuard>
);

export default PolicyEngine;
