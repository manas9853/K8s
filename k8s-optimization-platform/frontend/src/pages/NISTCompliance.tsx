import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface NISTFunction {
  function: string;
  categories: number;
  controls: number;
  passed: number;
  failed: number;
  score: number;
}

interface ControlException {
  id: number;
  control_id: string;
  title: string;
  justification: string;
  owner: string;
  review_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface FailedControl {
  control_id: string;
  function: string;
  title: string;
  severity: string;
  description: string;
  remediation: string;
  affected_resources: number;
  auto_fix_supported?: boolean;
  exception?: ControlException | null;
}

interface NISTData {
  overall_score: number;
  maturity_level: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  functions: NISTFunction[];
  failed_controls_detail?: FailedControl[];
  framework_version: string;
  cluster_name?: string;
  total_pods_scanned?: number;
  total_containers_scanned?: number;
  last_assessment: string;
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? colors.success : s >= 80 ? colors.info : s >= 70 ? colors.warning : colors.danger;

// Dark-theme accent per function
const FUNC_COLOR: Record<string, string> = {
  'ID — Identify':  colors.info,
  'PR — Protect':   colors.success,
  'DE — Detect':    colors.warning,
  'RS — Respond':   colors.purple,
  'RC — Recover':   colors.info,
};

const SEV: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: colors.dangerBg, text: colors.danger, border: colors.dangerBg },
  high:     { bg: colors.warningBg, text: colors.warning, border: colors.warningBg },
  medium:   { bg: colors.infoBg, text: colors.info, border: colors.info },
  low:      { bg: colors.successBg, text: colors.success, border: colors.successBg },
};

const NISTComplianceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<NISTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingControlId, setSubmittingControlId] = useState<string | null>(null);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedControl, setSelectedControl] = useState<FailedControl | null>(null);
  const [exceptionForm, setExceptionForm] = useState({ justification: '', owner: '', review_date: '' });

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/nist${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (control: FailedControl) => {
    setSubmittingControlId(control.control_id);
    setActionMessage(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/compliance/nist/fix/${encodeURIComponent(control.control_id)}${clusterParam}`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to queue fix');
      setActionMessage(`Direct spec patch queued for ${control.control_id}. Command ${result.command_id} will be executed by the cluster agent.`);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to queue fix');
    } finally {
      setSubmittingControlId(null);
    }
  };

  const openExceptionDialog = (control: FailedControl) => {
    setSelectedControl(control);
    setExceptionForm({
      justification: control.exception?.justification || '',
      owner: control.exception?.owner || '',
      review_date: control.exception?.review_date || '',
    });
    setExceptionDialogOpen(true);
  };

  const handleSaveException = async () => {
    if (!selectedControl) return;
    setSubmittingControlId(selectedControl.control_id);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/compliance/nist/exception${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          control_id: selectedControl.control_id,
          title: selectedControl.title,
          justification: exceptionForm.justification,
          owner: exceptionForm.owner,
          review_date: exceptionForm.review_date,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to save exception');
      setActionMessage(`Exception saved for ${result.control_id}. Review date: ${result.review_date}`);
      setExceptionDialogOpen(false);
      setSelectedControl(null);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to save exception');
    } finally {
      setSubmittingControlId(null);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="info">No data available</Alert></Box>;

  const failedDetail = data.failed_controls_detail ?? [];

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: colors.surface, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          🔐
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            NIST Cybersecurity Framework
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            {data.framework_version} · Real cluster scan · {data.cluster_name || 'Cluster'} · {data.total_pods_scanned || 0} pods, {data.total_containers_scanned || 0} containers scanned · Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {actionMessage && (
        <Alert
          severity={actionMessage.toLowerCase().includes('failed') ? 'error' : 'success'}
          sx={{ mb: 3, mt: 2, bgcolor: colors.surfaceAlt, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
        >
          {actionMessage}
        </Alert>
      )}

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3, mt: 2 }}>
        {[
          { label: 'Overall Score',    value: `${data.overall_score}%`,  color: scoreColor(data.overall_score) },
          { label: 'Maturity Level',   value: data.maturity_level,        color: colors.warning },
          { label: 'Total Controls',   value: data.total_controls,        color: colors.info },
          { label: 'Passed',           value: data.passed_controls,       color: colors.success },
          { label: 'Failed',           value: data.failed_controls,       color: colors.danger },
          { label: 'Framework',        value: data.framework_version,     color: colors.textSecondary },
          { label: 'Last Assessment',  value: new Date(data.last_assessment).toLocaleDateString(), color: colors.textPrimary },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={3} key={k.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                  {k.label}
                </Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: k.color, fontSize: k.label === 'Maturity Level' || k.label === 'Framework' ? '0.85rem' : undefined, lineHeight: 1.3 }}>
                  {k.value ?? 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Function scorecards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(data.functions || []).map((fn) => {
          const accent = FUNC_COLOR[fn.function] ?? colors.info;
          return (
            <Grid item xs={12} sm={6} md={4} lg={2.4} key={fn.function}>
              <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: accent, mb: 1 }}>
                    {fn.function}
                  </Typography>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>{fn.passed}/{fn.controls} controls</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: scoreColor(fn.score) }}>{fn.score}%</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={fn.score}
                    sx={{ height: 6, borderRadius: 3, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: accent } }}
                  />
                  <Typography variant="caption" sx={{ color: colors.textSecondary }}>{fn.categories} categories</Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Function details table */}
      <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
            CSF Function Details
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 2 }}>
            Each function score is computed from real workload security signals collected from the cluster.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: colors.surfaceAlt, color: colors.textSecondary, borderColor: colors.border } }}>
                  <TableCell>Function</TableCell>
                  <TableCell align="right">Categories</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.functions || []).map((fn) => {
                  const accent = FUNC_COLOR[fn.function] ?? colors.info;
                  return (
                    <TableRow key={fn.function} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                      <TableCell sx={{ fontWeight: 700, color: accent, fontSize: 13, borderColor: colors.border }}>{fn.function}</TableCell>
                      <TableCell align="right" sx={{ color: colors.textSecondary, fontSize: 13, borderColor: colors.border }}>{fn.categories}</TableCell>
                      <TableCell align="right" sx={{ color: colors.textSecondary, fontSize: 13, borderColor: colors.border }}>{fn.controls}</TableCell>
                      <TableCell align="right" sx={{ color: colors.success, fontWeight: 600, fontSize: 13, borderColor: colors.border }}>{fn.passed}</TableCell>
                      <TableCell align="right" sx={{ color: fn.failed > 0 ? colors.danger : colors.textSecondary, fontWeight: 600, fontSize: 13, borderColor: colors.border }}>{fn.failed}</TableCell>
                      <TableCell sx={{ borderColor: colors.border }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={fn.score}
                            sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: colors.border, '& .MuiLinearProgress-bar': { bgcolor: accent } }}
                          />
                          <Typography variant="caption" fontWeight={700} sx={{ color: scoreColor(fn.score), fontSize: 12 }}>{fn.score}%</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Failed controls detail */}
      {failedDetail.length > 0 && (
        <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
              Failed Controls — Why They Matter
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 2 }}>
              Each failure comes from real workload configuration in your cluster. Fix applies a direct spec patch. Keep This / Accept Exception records the business rationale for leaving the current state unchanged.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: colors.surfaceAlt, color: colors.textSecondary, borderColor: colors.border, fontSize: 12 } }}>
                    <TableCell>Control</TableCell>
                    <TableCell>Function</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Remediation</TableCell>
                    <TableCell align="right">Affected</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failedDetail.map((c) => {
                    const sev = SEV[c.severity] || SEV.medium;
                    const accent = FUNC_COLOR[c.function] ?? colors.info;
                    return (
                      <TableRow key={c.control_id} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
                        <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: colors.info, fontSize: 12, borderColor: colors.border }}>{c.control_id}</TableCell>
                        <TableCell sx={{ color: accent, fontSize: 11, borderColor: colors.border, whiteSpace: 'nowrap', fontWeight: 600 }}>{c.function}</TableCell>
                        <TableCell sx={{ borderColor: colors.border }}>
                          <Chip label={c.severity.toUpperCase()} size="small" sx={{ bgcolor: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, fontWeight: 'bold', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ borderColor: colors.border }}>
                          <Box>
                            <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 12 }}>{c.description}</Typography>
                            {c.exception && (
                              <Typography variant="caption" sx={{ color: colors.purple, display: 'block', mt: 0.75 }}>
                                Exception accepted by {c.exception.owner} until {new Date(c.exception.review_date).toLocaleDateString()}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: colors.success, fontSize: 12, borderColor: colors.border }}>{c.remediation}</TableCell>
                        <TableCell align="right" sx={{ color: c.affected_resources > 5 ? colors.danger : colors.textSecondary, fontWeight: 'bold', fontSize: 12, borderColor: colors.border }}>{c.affected_resources}</TableCell>
                        <TableCell sx={{ borderColor: colors.border, minWidth: 180 }}>
                          <Box display="flex" flexDirection="column" gap={1}>
                            {c.auto_fix_supported ? (
                              <Button
                                size="small"
                                variant="contained"
                                disabled={submittingControlId === c.control_id}
                                onClick={() => handleFix(c)}
                                sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info }, fontSize: 11 }}
                              >
                                {submittingControlId === c.control_id ? 'Queueing…' : 'Fix'}
                              </Button>
                            ) : (
                              <Chip label="Manual remediation" size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, width: 'fit-content' }} />
                            )}
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={submittingControlId === c.control_id}
                              onClick={() => openExceptionDialog(c)}
                              sx={{ borderColor: colors.purple, color: colors.purple, fontSize: 11 }}
                            >
                              {c.exception ? 'Update Exception' : 'Keep This / Accept Exception'}
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
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
        <DialogTitle sx={{ borderBottom: `1px solid ${colors.border}` }}>
          Keep This Finding / Accept Exception
        </DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            Use this only when you intentionally want to keep the current NIST deviation and record why no change should be made now.
          </Typography>
          <TextField
            label="Control"
            value={selectedControl ? `${selectedControl.control_id} — ${selectedControl.title}` : ''}
            fullWidth
            disabled
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Business justification"
            value={exceptionForm.justification}
            onChange={(e) => setExceptionForm((v) => ({ ...v, justification: e.target.value }))}
            fullWidth
            required
            multiline
            minRows={3}
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Owner"
            value={exceptionForm.owner}
            onChange={(e) => setExceptionForm((v) => ({ ...v, owner: e.target.value }))}
            fullWidth
            required
            InputLabelProps={{ sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
          <TextField
            label="Review date"
            type="date"
            value={exceptionForm.review_date}
            onChange={(e) => setExceptionForm((v) => ({ ...v, review_date: e.target.value }))}
            fullWidth
            required
            InputLabelProps={{ shrink: true, sx: { color: colors.textSecondary } }}
            sx={{ '& .MuiOutlinedInput-root': { color: colors.textPrimary, '& fieldset': { borderColor: colors.border } } }}
          />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${colors.border}`, px: 3, py: 2 }}>
          <Button onClick={() => setExceptionDialogOpen(false)} sx={{ color: colors.textSecondary }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!exceptionForm.justification || !exceptionForm.owner || !exceptionForm.review_date || !selectedControl || submittingControlId === selectedControl?.control_id}
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

const NISTCompliance: React.FC = () => (
  <ClusterGuard><NISTComplianceInner /></ClusterGuard>
);

export default NISTCompliance;
