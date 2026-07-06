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

// ─── Dark theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:     '#0f1724',
  card:   '#1e2433',
  hover:  '#252e42',
  border: '#2a3245',
  text:   '#e8eaf0',
  muted:  '#8b95a9',
  body:   '#c8cdd8',
  green:  '#4ade80',
  red:    '#f87171',
  yellow: '#f59e0b',
};
const selectSx = {
  color: T.text, fontSize: 13, height: 38,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
  '& .MuiSvgIcon-root': { color: T.muted },
  bgcolor: T.card,
};
const menuProps = { PaperProps: { sx: { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}` } } };

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

  const cellSx = { color: T.body, borderBottom: `1px solid ${T.border}`, fontSize: 12, py: 1 };
  const headSx = { color: T.muted, borderBottom: `1px solid ${T.border}`, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.8, fontWeight: 600, py: 1.5 };
  const dlgSx = { '& .MuiDialog-paper': { bgcolor: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 2 } };

  if (clustersLoading) {
    return <Box sx={{ bgcolor: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: T.green }} /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Typography sx={{ color: T.text }} variant="h5">No clusters attached yet</Typography>
        <Typography sx={{ color: T.muted }} textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')} sx={{ bgcolor: T.green, color: '#000', '&:hover': { bgcolor: '#22c55e' } }}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3 }}>
      {/* ── Header ── */}
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>Network Policies</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mt: 0.5 }}>
            Pod-to-pod and external traffic control · {filtered.length} of {totalPolicies} shown
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel sx={{ color: T.muted, fontSize: 13 }}>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange} sx={selectSx} MenuProps={menuProps}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* ── Audit Score Banner ── */}
      {audit && (
        <Paper sx={{ mb: 3, p: 2, bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <SecurityIcon sx={{ color: T.muted }} />
            <Box flex={1}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <Typography sx={{ fontWeight: 600, color: T.text }}>Security Score: {audit.score}/100</Typography>
                <Chip label={`Risk: ${audit.risk}`} size="small" sx={{ bgcolor: audit.risk.toLowerCase() === 'high' ? '#450a0a' : audit.risk.toLowerCase() === 'medium' ? '#451a03' : '#052e16', color: audit.risk.toLowerCase() === 'high' ? T.red : audit.risk.toLowerCase() === 'medium' ? T.yellow : T.green, fontSize: 11, height: 20 }} />
              </Box>
              <LinearProgress variant="determinate" value={audit.score}
                sx={{ height: 6, borderRadius: 3, maxWidth: 400, bgcolor: T.border, '& .MuiLinearProgress-bar': { bgcolor: audit.score >= 80 ? T.green : audit.score >= 50 ? T.yellow : T.red } }} />
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap">
              {[`${audit.total_namespaces} NS`, `${audit.covered_namespaces} covered`, `CNI: ${audit.cni}`].map(l => (
                <Chip key={l} size="small" label={l} sx={{ bgcolor: T.bg, color: T.muted, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
              ))}
              {audit.uncovered_namespaces > 0 && (
                <Chip size="small" label={`${audit.uncovered_namespaces} uncovered`} sx={{ bgcolor: '#450a0a', color: T.red, fontSize: 11, height: 20 }} />
              )}
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── Summary Cards ── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Policies', value: totalPolicies, accent: T.text },
          { label: 'Full Coverage', value: bothPolicies, accent: T.green, sub: 'Ingress + Egress' },
          { label: 'Ingress Rules', value: ingressPolicies, accent: T.body, sub: `${egressPolicies} egress` },
          { label: 'Issues', value: totalIssues, accent: totalIssues > 0 ? T.red : T.green },
        ].map(({ label, value, accent, sub }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>{label}</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</Typography>
                {sub && <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2, bgcolor: '#1a0a0a', color: T.red, border: `1px solid ${T.red}` }}>{error}</Alert>}

      {/* ── Search ── */}
      <Box display="flex" gap={2} mb={2}>
        <TextField placeholder="Search policies…" variant="outlined" size="small" fullWidth
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.muted, fontSize: 18 }} /></InputAdornment>,
            sx: { color: T.text, fontSize: 13, bgcolor: T.card,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.muted },
            },
          }}
        />
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchAll(selectedClusterId)} sx={{ color: T.muted, border: `1px solid ${T.border}`, borderRadius: 1, '&:hover': { bgcolor: T.hover } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Table ── */}
      <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
        {loading && <LinearProgress sx={{ bgcolor: T.border, '& .MuiLinearProgress-bar': { bgcolor: T.green } }} />}
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#161f30' }}>
              <TableCell sx={headSx}>Status</TableCell>
              <TableCell sx={headSx}>Name</TableCell>
              <TableCell sx={headSx}>Namespace</TableCell>
              <TableCell sx={headSx}>Policy Types</TableCell>
              <TableCell sx={headSx}>Pod Selector</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Ingress</TableCell>
              <TableCell sx={{ ...headSx, textAlign: 'center' }}>Egress</TableCell>
              <TableCell sx={headSx}>Issues</TableCell>
              <TableCell sx={headSx}>Age</TableCell>
              <TableCell sx={headSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} sx={{ ...cellSx, textAlign: 'center', py: 4, color: T.muted }}>
                  {loading ? 'Loading…' : searchTerm ? 'No policies match your search' : 'No network policies found'}
                </TableCell>
              </TableRow>
            ) : filtered.map(pol => {
              const inv   = generateInvestigations(pol);
              const count = inv.filter(i => i.type === 'error' || i.type === 'warning').length;
              return (
                <TableRow key={`${pol.namespace}/${pol.name}`} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: T.hover } }}>
                  <TableCell sx={cellSx}>
                    <Tooltip title={isPolicyCoverage(pol) === 'full' ? 'Full coverage' : isPolicyCoverage(pol) === 'partial' ? 'Partial' : 'No coverage'}>
                      {getStatusIcon(pol)}
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text }}>{pol.name}</Typography>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={pol.namespace} size="small" sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20 }} />
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      {pol.policy_types.includes('Ingress') && <Chip label="Ingress" size="small" sx={{ bgcolor: '#052e16', color: T.green, fontSize: 11, height: 20 }} />}
                      {pol.policy_types.includes('Egress')  && <Chip label="Egress"  size="small" sx={{ bgcolor: '#052e16', color: T.green, fontSize: 11, height: 20 }} />}
                      {pol.policy_types.length === 0        && <Chip label="None"    size="small" sx={{ bgcolor: T.bg, color: T.muted, fontSize: 11, height: 20 }} />}
                    </Box>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {Object.keys(pol.pod_selector).length === 0
                      ? <Chip label="all pods" size="small" sx={{ bgcolor: '#451a03', color: T.yellow, fontSize: 11, height: 20 }} />
                      : Object.entries(pol.pod_selector).slice(0, 2).map(([k, v]) => (
                          <Chip key={k} label={`${k}=${v}`} size="small" sx={{ bgcolor: T.bg, color: T.body, border: `1px solid ${T.border}`, fontSize: 11, height: 20, mr: 0.5 }} />
                        ))}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 12, color: T.body }}>{pol.ingress_rules_count}</Typography>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 12, color: T.body }}>{pol.egress_rules_count}</Typography>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={count === 0 ? 'Healthy' : `${count} issues`} size="small"
                      sx={{ bgcolor: count === 0 ? '#052e16' : '#450a0a', color: count === 0 ? T.green : T.red, border: `1px solid ${count === 0 ? T.green+'44' : T.red+'44'}`, fontSize: 11, height: 20 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: T.muted }}>{pol.age || '-'}</TableCell>
                  <TableCell sx={cellSx}>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small" sx={{ color: T.muted, '&:hover': { color: T.text } }}
                          onClick={() => { setSelectedPolicy(pol); setDetailsOpen(true); setActiveTab(0); }}>
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Policy">
                        <IconButton size="small" sx={{ color: T.red, '&:hover': { bgcolor: '#450a0a' } }}
                          onClick={() => handleDelete(pol)} disabled={actionLoading}>
                          <DeleteIcon fontSize="small" />
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

      {/* ── Audit Findings ── */}
      {audit && audit.findings.length > 0 && (
        <Box mt={4}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.text, mb: 2 }}>
            Audit Findings ({audit.findings.length})
          </Typography>
          <TableContainer component={Paper} sx={{ bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#161f30' }}>
                  <TableCell sx={{ ...headSx, width: 80 }}>Level</TableCell>
                  <TableCell sx={{ ...headSx, width: 180 }}>Check</TableCell>
                  <TableCell sx={headSx}>Resource</TableCell>
                  <TableCell sx={headSx}>Finding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.findings.map((f, i) => (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: T.hover } }}>
                    <TableCell sx={cellSx}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        {f.level === 'PASS' && <CheckCircleIcon sx={{ fontSize: 14, color: T.green }} />}
                        {f.level === 'FAIL' && <ErrorIcon sx={{ fontSize: 14, color: T.red }} />}
                        {f.level === 'WARN' && <WarningIcon sx={{ fontSize: 14, color: T.yellow }} />}
                        {f.level === 'INFO' && <InfoIcon sx={{ fontSize: 14, color: T.muted }} />}
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: f.level === 'FAIL' ? T.red : f.level === 'WARN' ? T.yellow : f.level === 'PASS' ? T.green : T.muted }}>{f.level}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}><Typography sx={{ fontSize: 12, color: T.body }}>{f.check}</Typography></TableCell>
                    <TableCell sx={cellSx}><Typography sx={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>{f.resource}</Typography></TableCell>
                    <TableCell sx={cellSx}><Typography sx={{ fontSize: 12, color: T.body }}>{f.message}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth sx={dlgSx}>
        {selectedPolicy && (
          <>
            <DialogTitle sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontWeight: 600, color: T.text }}>{selectedPolicy.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>{selectedPolicy.namespace}</Typography>
                </Box>
                {getStatusIcon(selectedPolicy)}
              </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ borderBottom: `1px solid ${T.border}`, px: 2, '& .MuiTabs-indicator': { bgcolor: T.green } }}>
                {['Overview', 'Investigations', 'Recommendations', 'Diagnostics', 'Actions'].map((lbl) => (
                  <Tab key={lbl} label={lbl} sx={{ color: T.muted, '&.Mui-selected': { color: T.text }, textTransform: 'none', minHeight: 40 }} />
                ))}
              </Tabs>
              <Box sx={{ p: 3 }}>

              {/* Overview */}
              {activeTab === 0 && (
                <Grid container spacing={2}>
                  {[
                    { label: 'Policy Scope', rows: [
                      ['Types', selectedPolicy.policy_types.join(', ') || 'None'],
                      ['Ingress Rules', selectedPolicy.ingress_rules_count],
                      ['Egress Rules', selectedPolicy.egress_rules_count],
                      ['Pod Selector', Object.keys(selectedPolicy.pod_selector).length === 0 ? 'all pods' : Object.entries(selectedPolicy.pod_selector).map(([k,v]) => `${k}=${v}`).join(', ')],
                    ]},
                    { label: 'Metadata', rows: [
                      ['Age', selectedPolicy.age || '-'],
                      ['Created', fmtTime(selectedPolicy.created_at)],
                      ['Coverage', isPolicyCoverage(selectedPolicy)],
                      ['Default Deny', isDefaultDeny(selectedPolicy) ? 'Yes' : 'No'],
                    ]},
                  ].map(({ label, rows }) => (
                    <Grid item xs={12} md={6} key={label as string}>
                      <Card sx={{ bgcolor: T.bg, border: `1px solid ${T.border}`, borderRadius: 1 }}>
                        <CardContent sx={{ p: 2 }}>
                          <Typography sx={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>{label as string}</Typography>
                          {(rows as [string, unknown][]).map(([k, v]) => (
                            <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: `1px solid ${T.border}` }}>
                              <Typography sx={{ fontSize: 12, color: T.muted }}>{k}</Typography>
                              <Typography sx={{ fontSize: 12, color: T.body }}>{String(v)}</Typography>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Investigations */}
              {activeTab === 1 && (
                <Box>
                  {generateInvestigations(selectedPolicy).map((inv, idx) => (
                    <Box key={idx} sx={{ mb: 1.5, p: 2, borderRadius: 1, border: `1px solid ${T.border}`,
                      bgcolor: inv.type === 'error' ? '#1a0a0a' : inv.type === 'warning' ? '#1a1200' : '#0a1a0a' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {inv.type === 'error'   && <ErrorIcon   sx={{ fontSize: 16, color: T.red }} />}
                        {inv.type === 'warning' && <WarningIcon sx={{ fontSize: 16, color: T.yellow }} />}
                        {inv.type === 'info'    && <InfoIcon    sx={{ fontSize: 16, color: T.green }} />}
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{inv.title}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 12, color: T.body }}>{inv.description}</Typography>
                      {inv.action && <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>→ {inv.action}</Typography>}
                    </Box>
                  ))}
                  {generateInvestigations(selectedPolicy).length === 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${T.green}44`, bgcolor: '#052e16' }}>
                      <Typography sx={{ fontSize: 13, color: T.green }}>No issues — policy is well-configured</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Recommendations */}
              {activeTab === 2 && (
                <Box>
                  {generateRecommendations(selectedPolicy).map((rec, idx) => (
                    <Box key={idx} sx={{ mb: 1.5, p: 2, borderRadius: 1, border: `1px solid ${T.border}`, bgcolor: T.bg }}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Chip label={rec.category} size="small" sx={{ bgcolor: T.border, color: T.text, fontSize: 11, height: 20 }} />
                        <Chip label={rec.priority} size="small" sx={{ bgcolor: rec.priority === 'high' ? '#450a0a' : rec.priority === 'medium' ? '#451a03' : T.border, color: rec.priority === 'high' ? T.red : rec.priority === 'medium' ? T.yellow : T.muted, fontSize: 11, height: 20 }} />
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.text }}>{rec.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.body, mt: 0.5 }}>{rec.description}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.muted, mt: 0.5 }}>Impact: {rec.impact}</Typography>
                      <Typography sx={{ fontSize: 12, color: T.muted }}>→ {rec.action}</Typography>
                    </Box>
                  ))}
                  {generateRecommendations(selectedPolicy).length === 0 && (
                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${T.green}44`, bgcolor: '#052e16' }}>
                      <Typography sx={{ fontSize: 13, color: T.green }}>No recommendations — policy looks optimal</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Diagnostics */}
              {activeTab === 3 && (
                <Box>
                  {[
                    { ok: selectedPolicy.policy_types.includes('Ingress'), label: 'Ingress Control', sub: selectedPolicy.policy_types.includes('Ingress') ? `${selectedPolicy.ingress_rules_count} allow rules` : 'Uncontrolled inbound traffic' },
                    { ok: selectedPolicy.policy_types.includes('Egress'), label: 'Egress Control', sub: selectedPolicy.policy_types.includes('Egress') ? `${selectedPolicy.egress_rules_count} allow rules` : 'Uncontrolled outbound traffic' },
                    { ok: Object.keys(selectedPolicy.pod_selector).length > 0, label: 'Pod Selector', sub: Object.keys(selectedPolicy.pod_selector).length > 0 ? 'Targeted selector' : 'Broad — applies to all pods' },
                    { ok: isDefaultDeny(selectedPolicy), label: 'Default Deny', sub: isDefaultDeny(selectedPolicy) ? 'Default deny detected' : 'No default deny set' },
                  ].map(({ ok, label, sub }) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: `1px solid ${T.border}` }}>
                      {ok ? <CheckCircleIcon sx={{ fontSize: 18, color: T.green }} /> : <WarningIcon sx={{ fontSize: 18, color: T.yellow }} />}
                      <Box>
                        <Typography sx={{ fontSize: 13, color: T.text }}>{label}</Typography>
                        <Typography sx={{ fontSize: 12, color: T.muted }}>{sub}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Actions */}
              {activeTab === 4 && (
                <Box>
                  <Button variant="contained" fullWidth sx={{ mb: 1, bgcolor: T.red, color: '#fff', '&:hover': { bgcolor: '#dc2626' } }}
                    onClick={() => handleDelete(selectedPolicy)} disabled={actionLoading}
                    startIcon={actionLoading ? <CircularProgress size={16} /> : <DeleteIcon />}>
                    Delete Policy
                  </Button>
                  <Typography sx={{ fontSize: 12, color: T.muted }}>
                    Immediately removes traffic enforcement for all matched pods. Ensure a replacement is ready.
                  </Typography>
                </Box>
              )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ borderTop: `1px solid ${T.border}` }}>
              <Button onClick={() => setDetailsOpen(false)} sx={{ color: T.muted, textTransform: 'none' }}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth sx={dlgSx}>
        <DialogTitle sx={{ borderBottom: `1px solid ${T.border}`, color: T.text }}>Confirm Action</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ color: T.body }}>{confirmAction?.label}</Typography>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}` }}>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: T.muted, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: T.red, color: '#fff', '&:hover': { bgcolor: '#dc2626' }, textTransform: 'none' }} onClick={runConfirmed}>Confirm</Button>
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
