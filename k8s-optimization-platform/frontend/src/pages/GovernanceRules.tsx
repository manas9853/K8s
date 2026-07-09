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

interface RuleException {
  id: number;
  control_id: string;
  title: string;
  justification: string;
  owner: string;
  review_date: string;
  status: string;
}

interface Rule {
  id: string;
  name: string;
  category: string;
  severity: string;
  enabled: boolean;
  violations: number;
  auto_remediate: boolean;
  auto_fix_supported: boolean;
  signal: string;
  why: string;
  remediation: string;
  last_triggered: string;
  exception?: RuleException | null;
}

interface GovernanceRulesData {
  total_rules: number;
  enabled_rules: number;
  disabled_rules: number;
  total_violations: number;
  rules: Rule[];
  cluster_name?: string;
  total_pods_scanned?: number;
  total_containers_scanned?: number;
  last_scan: string;
}

// ── Visual constants ──────────────────────────────────────────────────────────
const SEV: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  high:     { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  medium:   { bg: '#0d1f3c', text: '#60a5fa', border: '#1e3a5f' },
  low:      { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
};

const CAT_COLOR: Record<string, string> = {
  'Security':            '#f87171',
  'Access Control':      '#c084fc',
  'Network Security':    '#60a5fa',
  'Data Protection':     '#f59e0b',
  'Resource Management': '#4ade80',
  'Compliance':          '#22d3ee',
};

// ── Per-row expanded detail ───────────────────────────────────────────────────
const RuleRow: React.FC<{
  rule: Rule;
  submittingId: string | null;
  onFix: (r: Rule) => void;
  onException: (r: Rule) => void;
}> = ({ rule: r, submittingId, onFix, onException }) => {
  const [open, setOpen] = useState(false);
  const sev = SEV[r.severity] || SEV.medium;
  const catColor = CAT_COLOR[r.category] ?? '#8892a4';
  const busy = submittingId === r.id;

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
        <TableCell sx={{ color: '#e8eaf0', fontWeight: 600, fontSize: 13, borderColor: '#2a3245' }}>{r.name}</TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={r.category} size="small"
            sx={{ bgcolor: '#1e2433', color: catColor, border: `1px solid ${catColor}44`, fontSize: 10, fontWeight: 700 }} />
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={r.severity.toUpperCase()} size="small"
            sx={{ bgcolor: sev.bg, color: sev.text, border: `1px solid ${sev.border}`, fontSize: 10, fontWeight: 700 }} />
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={r.enabled ? 'Enabled' : 'Disabled'} size="small"
            sx={{ bgcolor: r.enabled ? '#0d2d1a' : '#1e2433', color: r.enabled ? '#4ade80' : '#8892a4',
                  border: `1px solid ${r.enabled ? '#1a4a2a' : '#2a3245'}`, fontSize: 10 }} />
        </TableCell>
        <TableCell align="right" sx={{ color: r.violations > 0 ? '#f87171' : '#4ade80', fontWeight: 700, fontSize: 14, borderColor: '#2a3245' }}>
          {r.violations}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" gap={0.75} onClick={e => e.stopPropagation()}>
            {r.auto_fix_supported && r.violations > 0 ? (
              <Button size="small" variant="contained" disabled={busy} onClick={() => onFix(r)}
                sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' }, fontSize: 10, py: 0.25, minWidth: 48 }}>
                {busy ? '…' : 'Fix'}
              </Button>
            ) : (
              <Chip label="Manual" size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
            )}
            <Button size="small" variant="outlined" disabled={busy} onClick={() => onException(r)}
              sx={{ borderColor: '#7c5cd8', color: '#c084fc', fontSize: 10, py: 0.25 }}>
              {r.exception ? 'Exception ✓' : 'Except'}
            </Button>
          </Box>
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      <TableRow sx={{ bgcolor: '#131d2e' }}>
        <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box px={3} py={1.5}>
              <Box display="flex" gap={4} flexWrap="wrap">
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    WHY THIS RULE EXISTS
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12 }}>{r.why}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    REMEDIATION
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#a5d6a7', fontSize: 12 }}>{r.remediation}</Typography>
                </Box>
                <Box flex={1} minWidth={200}>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.25 }}>
                    SIGNAL / CURRENT STATE
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#c8d0dc', fontSize: 12, fontFamily: 'monospace' }}>{r.signal}</Typography>
                  <Typography variant="body2" sx={{ color: r.violations > 0 ? '#f87171' : '#4ade80', fontSize: 12, mt: 0.5 }}>
                    {r.violations > 0 ? `${r.violations} violation(s) detected` : 'No violations — rule passing'}
                  </Typography>
                  {r.exception && (
                    <Typography variant="caption" sx={{ color: '#c084fc', display: 'block', mt: 0.5 }}>
                      Exception by {r.exception.owner} until {new Date(r.exception.review_date).toLocaleDateString()}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: '#57606a', display: 'block', mt: 0.5 }}>
                    Last triggered: {new Date(r.last_triggered).toLocaleString()}
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
const GovernanceRulesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<GovernanceRulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [exceptionForm, setExceptionForm] = useState({ justification: '', owner: '', review_date: '' });

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/governance-rules${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async (rule: Rule) => {
    setSubmittingId(rule.id);
    setActionMessage(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/compliance/governance-rules/fix/${encodeURIComponent(rule.id)}${clusterParam}`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to queue fix');
      setActionMessage(`Spec patch queued for "${rule.name}". Command ${result.command_id} will be executed by the cluster agent.`);
      await fetchData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to queue fix');
    } finally {
      setSubmittingId(null);
    }
  };

  const openExceptionDialog = (rule: Rule) => {
    setSelectedRule(rule);
    setExceptionForm({
      justification: rule.exception?.justification || '',
      owner: rule.exception?.owner || '',
      review_date: rule.exception?.review_date || '',
    });
    setExceptionDialogOpen(true);
  };

  const handleSaveException = async () => {
    if (!selectedRule) return;
    setSubmittingId(selectedRule.id);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/compliance/governance-rules/exception${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          control_id: selectedRule.id,
          title: selectedRule.name,
          justification: exceptionForm.justification,
          owner: exceptionForm.owner,
          review_date: exceptionForm.review_date,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Failed to save exception');
      setActionMessage(`Exception saved for "${selectedRule.name}". Review date: ${result.review_date}`);
      setExceptionDialogOpen(false);
      setSelectedRule(null);
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

  const rules = data.rules || [];
  const violating = rules.filter(r => r.violations > 0 && r.enabled);
  const maxViolations = Math.max(...rules.map(r => r.violations), 1);

  // Group violations by category
  const byCategory = rules.reduce<Record<string, number>>((acc, r) => {
    if (r.enabled) acc[r.category] = (acc[r.category] || 0) + r.violations;
    return acc;
  }, {});
  const maxCat = Math.max(...Object.values(byCategory), 1);

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#1e2433', border: '1px solid #2a3245',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          📋
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>Governance Rules</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Real cluster scan · {data.cluster_name || 'Cluster'} · {data.total_pods_scanned || 0} pods,&nbsp;
            {data.total_containers_scanned || 0} containers · Last scan: {new Date(data.last_scan).toLocaleString()}
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
          { label: 'Total Rules',       value: data.total_rules,       color: '#60a5fa' },
          { label: 'Enabled',           value: data.enabled_rules,      color: '#4ade80' },
          { label: 'Disabled',          value: data.disabled_rules,     color: '#8892a4' },
          { label: 'Rules Violating',   value: violating.length,        color: violating.length > 0 ? '#f87171' : '#4ade80' },
          { label: 'Total Violations',  value: data.total_violations,   color: data.total_violations > 0 ? '#f87171' : '#4ade80' },
          { label: 'Auto-fixable',      value: rules.filter(r => r.auto_fix_supported && r.violations > 0).length, color: '#f59e0b' },
        ].map((k) => (
          <Grid item xs={6} sm={4} md={2} key={k.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{k.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: k.color }}>{k.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Violations by category */}
      <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>Violations by Category</Typography>
          <Grid container spacing={2}>
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <Grid item xs={12} sm={6} md={4} key={cat}>
                <Box mb={0.5} display="flex" justifyContent="space-between">
                  <Typography variant="caption" sx={{ color: CAT_COLOR[cat] ?? '#8892a4', fontWeight: 700 }}>{cat}</Typography>
                  <Typography variant="caption" sx={{ color: count > 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>{count}</Typography>
                </Box>
                <LinearProgress variant="determinate" value={(count / maxCat) * 100}
                  sx={{ height: 6, borderRadius: 3, bgcolor: '#2a3245',
                        '& .MuiLinearProgress-bar': { bgcolor: CAT_COLOR[cat] ?? '#60a5fa' } }} />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Rules table */}
      <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
            All Rules ({data.total_rules})
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mb: 2 }}>
            Click any row to expand why the rule exists, the exact remediation step, and the live signal state.
            Fix queues a direct spec patch through the agent. Exception records an accepted business justification.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#131d2e', color: '#8892a4', borderColor: '#2a3245', fontSize: 12 } }}>
                  <TableCell sx={{ width: 32 }} />
                  <TableCell>Rule</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Violations</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map(r => (
                  <RuleRow key={r.id} rule={r} submittingId={submittingId}
                    onFix={handleFix} onException={openExceptionDialog} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Violation breakdown bar */}
      {violating.length > 0 && (
        <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
              Violation Breakdown — Rules with Active Violations
            </Typography>
            <Box display="flex" flexDirection="column" gap={1.25}>
              {[...violating].sort((a, b) => b.violations - a.violations).map(r => (
                <Box key={r.id}>
                  <Box display="flex" justifyContent="space-between" mb={0.25}>
                    <Typography variant="caption" sx={{ color: '#c8d0dc', fontWeight: 600, fontSize: 12 }}>{r.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#f87171', fontWeight: 700, fontSize: 12 }}>{r.violations}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(r.violations / maxViolations) * 100}
                    sx={{ height: 5, borderRadius: 3, bgcolor: '#2a3245',
                          '& .MuiLinearProgress-bar': { bgcolor: CAT_COLOR[r.category] ?? '#60a5fa' } }} />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Exception dialog */}
      <Dialog open={exceptionDialogOpen} onClose={() => setExceptionDialogOpen(false)} maxWidth="sm" fullWidth
        sx={{ '& .MuiDialog-paper': { bgcolor: '#1e2433', color: '#e8eaf0', border: '1px solid #2a3245', borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #2a3245' }}>Accept Governance Exception</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'grid', gap: 2 }}>
          <Typography variant="body2" sx={{ color: '#8892a4' }}>
            Record why this governance rule violation is intentionally accepted and will not be remediated now.
          </Typography>
          <TextField label="Rule" value={selectedRule?.name ?? ''} fullWidth disabled
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
                      || !selectedRule || submittingId === selectedRule?.id}
            onClick={handleSaveException}
            sx={{ bgcolor: '#7c5cd8', '&:hover': { bgcolor: '#6d4ec7' } }}>
            Save Exception
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const GovernanceRules: React.FC = () => (
  <ClusterGuard><GovernanceRulesInner /></ClusterGuard>
);

export default GovernanceRules;
