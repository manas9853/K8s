import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Badge,
  Tab,
  Tabs,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import SecurityIcon from '@mui/icons-material/Security';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import SpeedIcon from '@mui/icons-material/Speed';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RecommendIcon from '@mui/icons-material/Recommend';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import DeleteIcon from '@mui/icons-material/Delete';
import PolicyIcon from '@mui/icons-material/Policy';
import { API_BASE_URL } from '../config/api';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface NetworkPolicy {
  name: string;
  namespace: string;
  pod_selector: Record<string, string>;
  policy_types: string[];
  ingress_rules_count: number;
  egress_rules_count: number;
  age: string;
  labels: Record<string, string>;
  created_at: string;
}

interface AuditFinding {
  level: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
  check: string;
  resource: string;
  message: string;
}

interface NetworkPolicyAudit {
  score: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  cni: string;
  total_namespaces: number;
  covered_namespaces: number;
  uncovered_namespaces: number;
  total_policies: number;
  findings: AuditFinding[];
}

interface Investigation {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

interface Recommendation {
  category: 'performance' | 'cost' | 'reliability' | 'security';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  action: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const NetworkPolicies: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');

  const [policies, setPolicies]       = useState<NetworkPolicy[]>([]);
  const [audit, setAudit]             = useState<NetworkPolicyAudit | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<NetworkPolicy | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab]     = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => Promise<void> } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchAll = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const [polRes, auditRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/network/network-policies${param}`),
        fetch(`${API_BASE_URL}/v1/network/network-policy-audit${param}`),
      ]);
      if (!polRes.ok) throw new Error(`Policies API ${polRes.status}`);
      if (!auditRes.ok) throw new Error(`Audit API ${auditRes.status}`);
      const [polData, auditData] = await Promise.all([polRes.json(), auditRes.json()]);
      setPolicies(polData);
      setAudit(auditData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch network policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchAll(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const fmtTime = (ts: string | null | undefined): string => {
    if (!ts) return '-';
    try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return ts; }
  };

  const isPolicyCoverage = (pol: NetworkPolicy): 'full' | 'partial' | 'none' => {
    const hasIngress = pol.policy_types.includes('Ingress');
    const hasEgress  = pol.policy_types.includes('Egress');
    if (hasIngress && hasEgress) return 'full';
    if (hasIngress || hasEgress)  return 'partial';
    return 'none';
  };

  const isDefaultDeny = (pol: NetworkPolicy): boolean =>
    Object.keys(pol.pod_selector).length === 0 &&
    (pol.ingress_rules_count === 0 || pol.egress_rules_count === 0);

  const getStatusColor = (pol: NetworkPolicy): 'success' | 'warning' | 'error' => {
    const cov = isPolicyCoverage(pol);
    if (cov === 'full') return 'success';
    if (cov === 'partial') return 'warning';
    return 'error';
  };

  const getStatusIcon = (pol: NetworkPolicy) => {
    const c = getStatusColor(pol);
    if (c === 'success') return <CheckCircleIcon color="success" />;
    if (c === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  // ─── Investigations ─────────────────────────────────────────────────────────

  const generateInvestigations = (pol: NetworkPolicy): Investigation[] => {
    const inv: Investigation[] = [];

    if (!pol.policy_types.includes('Egress')) {
      inv.push({
        type: 'warning',
        title: 'No Egress Control',
        description: 'Policy does not control outbound traffic. Pods can freely connect to any destination.',
        action: 'Add an Egress policy type to restrict outbound connections and prevent data exfiltration.',
      });
    }

    if (!pol.policy_types.includes('Ingress')) {
      inv.push({
        type: 'warning',
        title: 'No Ingress Control',
        description: 'Policy does not control inbound traffic. Any source can reach matched pods.',
        action: 'Add an Ingress policy type with specific allow rules.',
      });
    }

    if (Object.keys(pol.pod_selector).length === 0) {
      inv.push({
        type: 'info',
        title: 'Applies to All Pods',
        description: 'Empty pod selector — this policy applies to every pod in the namespace.',
        action: 'Verify this is intentional. Consider using targeted selectors for least-privilege.',
      });
    }

    if (pol.ingress_rules_count === 0 && pol.policy_types.includes('Ingress')) {
      inv.push({
        type: 'info',
        title: 'Ingress Default Deny',
        description: 'No ingress allow rules defined — all inbound traffic is blocked (default deny).',
      });
    }

    if (pol.egress_rules_count === 0 && pol.policy_types.includes('Egress')) {
      inv.push({
        type: 'info',
        title: 'Egress Default Deny',
        description: 'No egress allow rules defined — all outbound traffic is blocked (default deny).',
      });
    }

    if (!pol.created_at) {
      inv.push({
        type: 'info',
        title: 'Missing Creation Timestamp',
        description: 'Age data is unavailable for this policy. It may have been created before cluster monitoring was enabled.',
      });
    }

    return inv;
  };

  // ─── Recommendations ────────────────────────────────────────────────────────

  const generateRecommendations = (pol: NetworkPolicy): Recommendation[] => {
    const rec: Recommendation[] = [];

    if (!pol.policy_types.includes('Egress')) {
      rec.push({
        category: 'security',
        priority: 'high',
        title: 'Add Egress Policy',
        description: `${pol.name} only restricts ingress traffic.`,
        impact: 'Unrestricted egress enables data exfiltration and lateral movement.',
        action: 'Define egress rules allowing only required destinations (DNS on 53, specific services).',
      });
    }

    if (Object.keys(pol.pod_selector).length === 0 && !isDefaultDeny(pol)) {
      rec.push({
        category: 'security',
        priority: 'medium',
        title: 'Use Targeted Pod Selector',
        description: 'Policy matches all pods in namespace.',
        impact: 'A misconfigured broad policy can block or expose all workloads.',
        action: 'Set pod selector labels matching only the intended workloads.',
      });
    }

    if (pol.ingress_rules_count > 10) {
      rec.push({
        category: 'reliability',
        priority: 'low',
        title: 'Simplify Ingress Rules',
        description: `Policy has ${pol.ingress_rules_count} ingress rules — may be complex to audit.`,
        impact: 'Complex policies are harder to debug and may have unintended allow rules.',
        action: 'Consider splitting into smaller focused policies per service.',
      });
    }

    if (!pol.labels || Object.keys(pol.labels).length === 0) {
      rec.push({
        category: 'reliability',
        priority: 'low',
        title: 'Add Labels',
        description: 'Policy has no labels.',
        impact: 'Hard to select, filter, or manage in bulk without labels.',
        action: 'Add labels like app, team, or environment for better governance.',
      });
    }

    return rec;
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const showSnack = (message: string, severity: 'success' | 'error' = 'success') =>
    setSnackbar({ open: true, message, severity });

  const askConfirm = (label: string, fn: () => Promise<void>) => {
    setConfirmAction({ label, fn });
    setConfirmOpen(true);
  };

  const runConfirmed = async () => {
    if (!confirmAction) return;
    setConfirmOpen(false);
    setActionLoading(true);
    try { await confirmAction.fn(); }
    finally { setActionLoading(false); setConfirmAction(null); }
  };

  const runCommand = async (url: string, opts: RequestInit = {}): Promise<void> => {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    const cmdId = body.command_id;
    if (!cmdId) return;
    showSnack('Command queued — waiting for agent…');
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2500));
      const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
      if (!poll) continue;
      const status = await poll.json().catch(() => ({}));
      if (status.status === 'done') return;
      if (status.status === 'failed') throw new Error(status.result?.error || 'Command failed');
    }
    throw new Error('Timed out waiting for agent response');
  };

  const handleDelete = (pol: NetworkPolicy) => {
    askConfirm(
      `Delete NetworkPolicy "${pol.name}" in namespace "${pol.namespace}"? This will immediately remove traffic enforcement.`,
      async () => {
        try {
          await runCommand(
            `${API_BASE_URL}/v1/workloads/network-policies/${pol.namespace}/${pol.name}`,
            { method: 'DELETE' }
          );
          showSnack(`NetworkPolicy "${pol.name}" deleted`);
          setDetailsOpen(false);
          fetchAll(selectedClusterId);
        } catch (e: any) {
          showSnack(e.message || 'Delete failed', 'error');
        }
      }
    );
  };

  // ─── Derived stats ──────────────────────────────────────────────────────────

  const filtered = policies.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPolicies     = policies.length;
  const ingressPolicies   = policies.filter(p => p.policy_types.includes('Ingress')).length;
  const egressPolicies    = policies.filter(p => p.policy_types.includes('Egress')).length;
  const bothPolicies      = policies.filter(p => p.policy_types.includes('Ingress') && p.policy_types.includes('Egress')).length;
  const totalIssues       = policies.reduce((sum, p) =>
    sum + generateInvestigations(p).filter(i => i.type === 'error' || i.type === 'warning').length, 0);

  // ─── Guard states ────────────────────────────────────────────────────────────

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* ── Header ── */}
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h4" gutterBottom>Network Policies</Typography>
          <Typography variant="body2" color="text.secondary">
            Kubernetes network policies controlling pod-to-pod and external traffic
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* ── Audit Score Banner ── */}
      {audit && (
        <Paper variant="outlined" sx={{ mb: 3, p: 2 }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <SecurityIcon color="action" />
            <Box flex={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Security Score: {audit.score}/100 &nbsp;
                <Chip label={`Risk: ${audit.risk}`} size="small" variant="outlined" />
              </Typography>
              <LinearProgress
                variant="determinate"
                value={audit.score}
                sx={{ mt: 0.5, height: 6, borderRadius: 3, maxWidth: 400 }}
              />
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap">
              <Chip size="small" label={`${audit.total_namespaces} namespaces`} variant="outlined" />
              <Chip size="small" label={`${audit.covered_namespaces} covered`} variant="outlined" />
              {audit.uncovered_namespaces > 0 && (
                <Chip size="small" label={`${audit.uncovered_namespaces} uncovered`} variant="outlined" />
              )}
              <Chip size="small" label={`CNI: ${audit.cni}`} variant="outlined" />
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Summary Cards ── */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <PolicyIcon color="primary" />
                <Typography color="text.secondary" gutterBottom>Total Policies</Typography>
              </Box>
              <Typography variant="h4">{totalPolicies}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Full Coverage</Typography>
              <Typography variant="h4">{bothPolicies}</Typography>
              <Typography variant="body2" color="text.secondary">Ingress + Egress</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Traffic Direction</Typography>
              <Typography variant="h4">{ingressPolicies}</Typography>
              <Typography variant="body2" color="text.secondary">{egressPolicies} egress</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <Badge badgeContent={totalIssues} color="error">
                  <BugReportIcon color="action" />
                </Badge>
                <Typography color="text.secondary" gutterBottom>Issues Found</Typography>
              </Box>
              <Typography variant="h4">{totalIssues}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Search ── */}
      <Box display="flex" gap={2} mb={2}>
        <TextField
          placeholder="Search policies…"
          variant="outlined"
          size="small"
          fullWidth
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon /></InputAdornment>
            ),
          }}
        />
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchAll(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Table ── */}
      <TableContainer component={Paper}>
        {loading && <LinearProgress />}
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Policy Types</TableCell>
              <TableCell>Pod Selector</TableCell>
              <TableCell align="center">Ingress Rules</TableCell>
              <TableCell align="center">Egress Rules</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography color="text.secondary">
                    {loading ? 'Loading…' : searchTerm ? 'No policies match your search' : 'No network policies found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : filtered.map(pol => {
              const inv   = generateInvestigations(pol);
              const count = inv.filter(i => i.type === 'error' || i.type === 'warning').length;
              return (
                <TableRow key={`${pol.namespace}/${pol.name}`} hover>
                  <TableCell>
                    <Tooltip title={isPolicyCoverage(pol) === 'full' ? 'Full coverage' : isPolicyCoverage(pol) === 'partial' ? 'Partial coverage' : 'No coverage'}>
                      {getStatusIcon(pol)}
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">{pol.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={pol.namespace} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      {pol.policy_types.includes('Ingress') && (
                        <Chip label="Ingress" size="small" variant="outlined" />
                      )}
                      {pol.policy_types.includes('Egress') && (
                        <Chip label="Egress" size="small" variant="outlined" />
                      )}
                      {pol.policy_types.length === 0 && (
                        <Chip label="None" size="small" variant="outlined" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {Object.keys(pol.pod_selector).length === 0
                      ? <Chip label="all pods" size="small" variant="outlined" />
                      : Object.entries(pol.pod_selector).slice(0, 2).map(([k, v]) => (
                          <Chip key={k} label={`${k}=${v}`} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{pol.ingress_rules_count}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{pol.egress_rules_count}</Typography>
                  </TableCell>
                  <TableCell>
                    <Badge badgeContent={count} color="error">
                      <Chip
                        label={count === 0 ? 'Healthy' : `${count} issues`}
                        size="small"
                        color={count === 0 ? 'success' : 'error'}
                      />
                    </Badge>
                  </TableCell>
                  <TableCell>{pol.age || '-'}</TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => { setSelectedPolicy(pol); setDetailsOpen(true); setActiveTab(0); }}>
                          <InfoIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Policy">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(pol)}
                          disabled={actionLoading}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary">
          Showing {filtered.length} of {totalPolicies} policies
        </Typography>
      </Box>

      {/* ── Audit Findings Section ── */}
      {audit && audit.findings.length > 0 && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Audit Findings ({audit.findings.length})
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell width={80}>Level</TableCell>
                  <TableCell width={180}>Check</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Finding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.findings.map((f, i) => (
                  <TableRow key={i} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        {f.level === 'PASS' && <CheckCircleIcon fontSize="small" color="success" />}
                        {f.level === 'FAIL' && <ErrorIcon fontSize="small" color="error" />}
                        {f.level === 'WARN' && <WarningIcon fontSize="small" color="warning" />}
                        {f.level === 'INFO' && <InfoIcon fontSize="small" color="info" />}
                        <Typography variant="caption" fontWeight={600}>{f.level}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant="body2">{f.check}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {f.resource}
                      </Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2">{f.message}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
        {selectedPolicy && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedPolicy.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{selectedPolicy.namespace}</Typography>
                </Box>
                {getStatusIcon(selectedPolicy)}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Overview" />
                <Tab label="Investigations" />
                <Tab label="Recommendations" />
                <Tab label="Diagnostics" />
                <Tab label="Actions" />
              </Tabs>

              {/* Overview */}
              {activeTab === 0 && (
                <Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Policy Scope</Typography>
                          <Typography>
                            Types: {selectedPolicy.policy_types.length > 0
                              ? selectedPolicy.policy_types.join(', ')
                              : 'None defined'}
                          </Typography>
                          <Typography>Ingress rules: {selectedPolicy.ingress_rules_count}</Typography>
                          <Typography>Egress rules: {selectedPolicy.egress_rules_count}</Typography>
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="caption" color="text.secondary" display="block">Pod Selector:</Typography>
                          {Object.keys(selectedPolicy.pod_selector).length === 0
                            ? <Chip label="all pods (empty selector)" size="small" color="warning" variant="outlined" />
                            : Object.entries(selectedPolicy.pod_selector).map(([k, v]) => (
                                <Chip key={k} label={`${k}=${v}`} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                              ))}
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Metadata</Typography>
                          <Typography>Age: {selectedPolicy.age || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Created: {fmtTime(selectedPolicy.created_at)}
                          </Typography>
                          {Object.keys(selectedPolicy.labels).length > 0 && (
                            <>
                              <Divider sx={{ my: 1 }} />
                              <Typography variant="caption" color="text.secondary" display="block">Labels:</Typography>
                              {Object.entries(selectedPolicy.labels).slice(0, 6).map(([k, v]) => (
                                <Chip key={k} label={`${k}=${v}`} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />
                              ))}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Coverage Analysis</Typography>
                          <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
                            <Chip
                              label={`Ingress: ${selectedPolicy.policy_types.includes('Ingress') ? 'Controlled' : 'Uncontrolled'}`}
                              color={selectedPolicy.policy_types.includes('Ingress') ? 'success' : 'error'}
                              size="small"
                            />
                            <Chip
                              label={`Egress: ${selectedPolicy.policy_types.includes('Egress') ? 'Controlled' : 'Uncontrolled'}`}
                              color={selectedPolicy.policy_types.includes('Egress') ? 'success' : 'error'}
                              size="small"
                            />
                            {isDefaultDeny(selectedPolicy) && (
                              <Chip label="Default Deny" color="info" size="small" />
                            )}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {isPolicyCoverage(selectedPolicy) === 'full'
                              ? 'This policy controls both inbound and outbound traffic — full zero-trust coverage.'
                              : isPolicyCoverage(selectedPolicy) === 'partial'
                              ? 'This policy controls only one traffic direction. Add the missing type for complete isolation.'
                              : 'This policy does not specify any policy types. Traffic control is undefined.'}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Investigations */}
              {activeTab === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <TroubleshootIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Active Investigations
                  </Typography>
                  {generateInvestigations(selectedPolicy).map((inv, idx) => (
                    <Accordion key={idx}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {inv.type === 'error'   && <ErrorIcon color="error" />}
                          {inv.type === 'warning' && <WarningIcon color="warning" />}
                          {inv.type === 'info'    && <InfoIcon color="info" />}
                          <Typography>{inv.title}</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>{inv.description}</Typography>
                        {inv.action && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">Recommended Action:</Typography>
                            <Typography variant="body2">{inv.action}</Typography>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedPolicy).length === 0 && (
                    <Alert severity="success">No issues found — policy is well-configured!</Alert>
                  )}
                </Box>
              )}

              {/* Recommendations */}
              {activeTab === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <RecommendIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Optimization Recommendations
                  </Typography>
                  {generateRecommendations(selectedPolicy).map((rec, idx) => (
                    <Card key={idx} sx={{ mb: 2 }} variant="outlined">
                      <CardContent>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Chip
                            label={rec.category}
                            size="small"
                            color={
                              rec.category === 'security'     ? 'error'   :
                              rec.category === 'performance'  ? 'warning' :
                              rec.category === 'cost'         ? 'info'    : 'success'
                            }
                          />
                          <Chip
                            label={rec.priority}
                            size="small"
                            variant="outlined"
                            color={
                              rec.priority === 'high'   ? 'error'   :
                              rec.priority === 'medium' ? 'warning' : 'default'
                            }
                          />
                        </Box>
                        <Typography variant="subtitle2" gutterBottom>{rec.title}</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>{rec.description}</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="caption" color="text.secondary">Impact:</Typography>
                        <Typography variant="body2" paragraph>{rec.impact}</Typography>
                        <Typography variant="caption" color="text.secondary">Action:</Typography>
                        <Typography variant="body2">{rec.action}</Typography>
                      </CardContent>
                    </Card>
                  ))}
                  {generateRecommendations(selectedPolicy).length === 0 && (
                    <Alert severity="success">No recommendations — policy looks optimal!</Alert>
                  )}
                </Box>
              )}

              {/* Diagnostics */}
              {activeTab === 3 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <HealthAndSafetyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Health Checks
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedPolicy.policy_types.includes('Ingress') ? 'success' : 'error'} />
                      </ListItemIcon>
                      <ListItemText
                        primary="Ingress Traffic Control"
                        secondary={selectedPolicy.policy_types.includes('Ingress')
                          ? `${selectedPolicy.ingress_rules_count} allow rule(s)`
                          : 'Not controlled — inbound traffic is unrestricted'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedPolicy.policy_types.includes('Egress') ? 'success' : 'error'} />
                      </ListItemIcon>
                      <ListItemText
                        primary="Egress Traffic Control"
                        secondary={selectedPolicy.policy_types.includes('Egress')
                          ? `${selectedPolicy.egress_rules_count} allow rule(s)`
                          : 'Not controlled — outbound traffic is unrestricted'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={Object.keys(selectedPolicy.pod_selector).length > 0 ? 'success' : 'warning'} />
                      </ListItemIcon>
                      <ListItemText
                        primary="Pod Selector Specificity"
                        secondary={Object.keys(selectedPolicy.pod_selector).length > 0
                          ? `Targeted: ${Object.entries(selectedPolicy.pod_selector).map(([k, v]) => `${k}=${v}`).join(', ')}`
                          : 'Broad: applies to all pods in namespace'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Default Deny Pattern"
                        secondary={isDefaultDeny(selectedPolicy)
                          ? 'Default deny detected — explicit allows required'
                          : 'No default deny — some traffic may flow implicitly'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SpeedIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Rule Complexity"
                        secondary={`${selectedPolicy.ingress_rules_count + selectedPolicy.egress_rules_count} total rules`}
                      />
                    </ListItem>
                  </List>
                </Box>
              )}

              {/* Actions */}
              {activeTab === 4 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <BuildIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Available Actions
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Policy Management</Typography>
                          <Button
                            variant="contained"
                            color="error"
                            fullWidth
                            sx={{ mb: 1 }}
                            onClick={() => handleDelete(selectedPolicy)}
                            disabled={actionLoading}
                            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
                          >
                            Delete Policy
                          </Button>
                          <Typography variant="caption" color="text.secondary">
                            Deleting a NetworkPolicy immediately removes all traffic enforcement for matched pods.
                            Ensure replacement policy is in place before deleting.
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmAction?.label}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={runConfirmed}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default NetworkPolicies;

// Made with Bob
