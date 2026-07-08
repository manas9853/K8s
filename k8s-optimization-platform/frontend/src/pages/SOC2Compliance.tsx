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

interface Criterion {
  name: string;
  description: string;
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
  criterion: string;
  title: string;
  severity: string;
  description: string;
  remediation: string;
  affected_resources: number;
  auto_fix_supported?: boolean;
  exception?: ControlException | null;
}

interface SOC2Data {
  overall_score: number;
  grade: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  trust_service_criteria: Criterion[];
  failed_controls_detail?: FailedControl[];
  audit_period: string;
  next_audit: string;
  cluster_name?: string;
  total_pods_scanned?: number;
  total_containers_scanned?: number;
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? '#2e7d32' : s >= 80 ? '#1565c0' : s >= 70 ? '#e65100' : '#c62828';

const SEV: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  high:     { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  medium:   { bg: '#0d1f3c', text: '#60a5fa', border: '#1e3a5f' },
  low:      { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
};

const SOC2ComplianceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SOC2Data | null>(null);
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
      const r = await fetch(`${API_BASE_URL}/v1/compliance/soc2${clusterParam}`);
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
      const response = await fetch(`${API_BASE_URL}/v1/compliance/soc2/fix/${control.control_id}${clusterParam}`, {
        method: 'POST',
      });
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
      const response = await fetch(`${API_BASE_URL}/v1/compliance/soc2/exception${clusterParam}`, {
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
  if (error) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="info">No data available</Alert></Box>;

  const failedDetail = data.failed_controls_detail ?? [];

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#1e2433', border: '1px solid #2a3245',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          📋
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            SOC 2 Type II Compliance
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real cluster scan · {data.cluster_name || 'Cluster'} · {data.total_pods_scanned || 0} pods, {data.total_containers_scanned || 0} containers scanned · Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* Action banner */}
      {actionMessage && (
        <Alert
          severity={actionMessage.toLowerCase().includes('failed') ? 'error' : 'success'}
          sx={{ mb: 3, mt: 2, bgcolor: '#131d2e', color: '#e8eaf0', border: '1px solid #2a3245' }}
        >
          {actionMessage}
        </Alert>
      )}

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 3, mt: 2 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%`, color: scoreColor(data.overall_score) },
          { label: 'Grade', value: data.grade, color: scoreColor(data.overall_score) },
          { label: 'Total Controls', value: data.total_controls, color: '#60a5fa' },
          { label: 'Passed', value: data.passed_controls, color: '#4ade80' },
          { label: 'Failed', value: data.failed_controls, color: '#f87171' },
          { label: 'Audit Period', value: data.audit_period, color: '#e8eaf0' },
          { label: 'Next Audit', value: new Date(data.next_audit).toLocaleDateString(), color: '#f59e0b' },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={3} key={k.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>
                  {k.label}
                </Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: k.color }}>
                  {k.value ?? 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Trust Service Criteria */}
      <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
            Trust Service Criteria
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mb: 2 }}>
            Each criterion score is derived from real cluster signals captured by the in-cluster agent.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#131d2e', color: '#8892a4', borderColor: '#2a3245' } }}>
                  <TableCell>Criterion</TableCell>
                  <TableCell>What it measures</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.trust_service_criteria || []).map((c) => (
                  <TableRow key={c.name} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ color: '#e8eaf0', fontWeight: 600, fontSize: 13, borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{c.name}</TableCell>
                    <TableCell sx={{ color: '#8892a4', fontSize: 12, borderColor: '#2a3245' }}>{c.description}</TableCell>
                    <TableCell align="right" sx={{ color: '#8892a4', fontSize: 13, borderColor: '#2a3245' }}>{c.controls}</TableCell>
                    <TableCell align="right" sx={{ color: '#4ade80', fontWeight: 600, fontSize: 13, borderColor: '#2a3245' }}>{c.passed}</TableCell>
                    <TableCell align="right" sx={{ color: c.failed > 0 ? '#f87171' : '#8892a4', fontWeight: 600, fontSize: 13, borderColor: '#2a3245' }}>{c.failed}</TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress variant="determinate" value={c.score}
                          sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#2a3245', '& .MuiLinearProgress-bar': { bgcolor: scoreColor(c.score) } }} />
                        <Typography variant="caption" fontWeight={700} sx={{ color: scoreColor(c.score), fontSize: 12 }}>{c.score}%</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Failed controls with Fix / Accept Exception */}
      {failedDetail.length > 0 && (
        <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
              Failed Controls — Why They Matter
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mb: 2 }}>
              Each control failure is derived from real pod/container configurations in your cluster. Fix applies a direct spec patch. Accept Exception records a business justification for keeping the current configuration.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#131d2e', color: '#8892a4', borderColor: '#2a3245', fontSize: 12 } }}>
                    <TableCell>Control</TableCell>
                    <TableCell>Criterion</TableCell>
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
                    return (
                      <TableRow key={c.control_id} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                        <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#60a5fa', fontSize: 12, borderColor: '#2a3245' }}>{c.control_id}</TableCell>
                        <TableCell sx={{ color: '#8892a4', fontSize: 11, borderColor: '#2a3245', whiteSpace: 'nowrap' }}>{c.criterion}</TableCell>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Chip label={c.severity.toUpperCase()} size="small" sx={{ bgcolor: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, fontWeight: 'bold', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Box>
                            <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12 }}>{c.description}</Typography>
                            {c.exception && (
                              <Typography variant="caption" sx={{ color: '#c084fc', display: 'block', mt: 0.75 }}>
                                Exception accepted by {c.exception.owner} until {new Date(c.exception.review_date).toLocaleDateString()}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: '#a5d6a7', fontSize: 12, borderColor: '#2a3245' }}>{c.remediation}</TableCell>
                        <TableCell align="right" sx={{ color: c.affected_resources > 5 ? '#f87171' : '#8892a4', fontWeight: 'bold', fontSize: 12, borderColor: '#2a3245' }}>{c.affected_resources}</TableCell>
                        <TableCell sx={{ borderColor: '#2a3245', minWidth: 180 }}>
                          <Box display="flex" flexDirection="column" gap={1}>
                            {c.auto_fix_supported ? (
                              <Button size="small" variant="contained"
                                disabled={submittingControlId === c.control_id}
                                onClick={() => handleFix(c)}
                                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, fontSize: 11 }}>
                                {submittingControlId === c.control_id ? 'Queueing…' : 'Fix'}
                              </Button>
                            ) : (
                              <Chip label="Manual remediation" size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', width: 'fit-content' }} />
                            )}
                            <Button size="small" variant="outlined"
                              disabled={submittingControlId === c.control_id}
                              onClick={() => openExceptionDialog(c)}
                              sx={{ borderColor: '#7c5cd8', color: '#c084fc', fontSize: 11 }}>
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
      <Dialog open={exceptionDialogOpen} onClose={() => setExceptionDialogOpen(false)} maxWidth="sm" fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: '#1e2433', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #2a3245' }}>
          Keep This Finding / Accept Exception
        </DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: '#8892a4' }}>
            Use this only when you intentionally want to keep the current SOC 2 deviation and record why no change should be made now.
          </Typography>
          <TextField label="Control" value={selectedControl ? `${selectedControl.control_id} — ${selectedControl.title}` : ''} fullWidth disabled
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Business justification" value={exceptionForm.justification}
            onChange={(e) => setExceptionForm((v) => ({ ...v, justification: e.target.value }))}
            fullWidth required multiline minRows={3}
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Owner" value={exceptionForm.owner}
            onChange={(e) => setExceptionForm((v) => ({ ...v, owner: e.target.value }))}
            fullWidth required
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
          <TextField label="Review date" type="date" value={exceptionForm.review_date}
            onChange={(e) => setExceptionForm((v) => ({ ...v, review_date: e.target.value }))}
            fullWidth required InputLabelProps={{ shrink: true, sx: { color: '#8892a4' } }}
            sx={{ '& .MuiOutlinedInput-root': { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }} />
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #2a3245', px: 3, py: 2 }}>
          <Button onClick={() => setExceptionDialogOpen(false)} sx={{ color: '#8892a4' }}>Cancel</Button>
          <Button variant="contained"
            disabled={!exceptionForm.justification || !exceptionForm.owner || !exceptionForm.review_date || !selectedControl || submittingControlId === selectedControl?.control_id}
            onClick={handleSaveException}
            sx={{ bgcolor: '#7c5cd8', '&:hover': { bgcolor: '#6d4ec7' } }}>
            Save Exception
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

const SOC2Compliance: React.FC = () => (
  <ClusterGuard><SOC2ComplianceInner /></ClusterGuard>
);

export default SOC2Compliance;
