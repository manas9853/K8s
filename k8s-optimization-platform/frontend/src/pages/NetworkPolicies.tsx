import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Alert, Tabs, Tab, Divider, Tooltip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  Warning as WarnIcon,
  Info as InfoIcon,
  Router as CniIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
  PASS: 'success',
  FAIL: 'error',
  WARN: 'warning',
  INFO: 'info',
};

const LEVEL_ICON: Record<string, React.ReactElement> = {
  PASS: <PassIcon fontSize="small" color="success" />,
  FAIL: <FailIcon fontSize="small" color="error" />,
  WARN: <WarnIcon fontSize="small" color="warning" />,
  INFO: <InfoIcon fontSize="small" color="info" />,
};

const RISK_COLOR: Record<string, string> = {
  LOW: '#2e7d32',
  MEDIUM: '#e65100',
  HIGH: '#b71c1c',
};

const RISK_BG: Record<string, string> = {
  LOW: '#e8f5e9',
  MEDIUM: '#fff3e0',
  HIGH: '#ffebee',
};

const CHECKS = [
  'Namespace Coverage',
  'Default Deny',
  'Pod Coverage',
  'Policy Inspection',
  'Sensitive Namespaces',
];

function scoreBarColor(score: number) {
  if (score >= 90) return '#2e7d32';
  if (score >= 70) return '#e65100';
  return '#b71c1c';
}

// ─── Component ───────────────────────────────────────────────────────────────

const NetworkPolicies: React.FC = () => {
  const { clusterParam } = useActiveCluster();

  const [audit, setAudit]       = useState<NetworkPolicyAudit | null>(null);
  const [policies, setPolicies] = useState<NetworkPolicy[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState(0);
  const [filterCheck, setFilterCheck] = useState<string>('All');
  const [filterLevel, setFilterLevel] = useState<string>('All');

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/v1/network/network-policy-audit${clusterParam}`).then(r => {
        if (!r.ok) throw new Error(`Audit API ${r.status}`);
        return r.json();
      }),
      fetch(`${API_BASE_URL}/v1/network/network-policies${clusterParam}`).then(r => {
        if (!r.ok) throw new Error(`Policies API ${r.status}`);
        return r.json();
      }),
    ])
      .then(([auditData, policiesData]) => {
        setAudit(auditData);
        setPolicies(policiesData);
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 120000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error)   return <Alert severity="error">Failed to load data: {error}</Alert>;
  if (!audit)  return null;

  // ── Derived data ──────────────────────────────────────────────────────────
  const failCount = audit.findings.filter(f => f.level === 'FAIL').length;
  const warnCount = audit.findings.filter(f => f.level === 'WARN').length;
  const passCount = audit.findings.filter(f => f.level === 'PASS').length;
  const infoCount = audit.findings.filter(f => f.level === 'INFO').length;

  const filteredFindings = audit.findings.filter(f => {
    const checkOk = filterCheck === 'All' || f.check === filterCheck;
    const levelOk = filterLevel === 'All' || f.level === filterLevel;
    return checkOk && levelOk;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>

      {/* Header */}
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon /> Network Policy Audit
      </Typography>

      {/* ── Score + summary row ─────────────────────────────────────────── */}
      <Grid container spacing={3} sx={{ mb: 3 }}>

        {/* Score card */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', border: `2px solid ${RISK_COLOR[audit.risk]}`, borderRadius: 2 }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Security Score
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 700, color: RISK_COLOR[audit.risk] }}>
                {audit.score}
                <Typography component="span" variant="h5" color="text.secondary">/100</Typography>
              </Typography>
              <Box sx={{
                display: 'inline-block', mt: 1, px: 2, py: 0.5, borderRadius: 2,
                bgcolor: RISK_BG[audit.risk], color: RISK_COLOR[audit.risk], fontWeight: 700,
              }}>
                Risk: {audit.risk}
              </Box>
              <Box sx={{ mt: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={audit.score}
                  sx={{
                    height: 10, borderRadius: 5,
                    bgcolor: '#e0e0e0',
                    '& .MuiLinearProgress-bar': { bgcolor: scoreBarColor(audit.score) },
                  }}
                />
              </Box>
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <CniIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">CNI: {audit.cni}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Namespace coverage */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Namespaces</Typography>
              <Typography variant="h3">{audit.total_namespaces}</Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={`${audit.covered_namespaces} covered`} color="success" />
                {audit.uncovered_namespaces > 0 && (
                  <Chip size="small" label={`${audit.uncovered_namespaces} uncovered`} color="error" />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Findings summary */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Findings</Typography>
              <Typography variant="h3">{audit.findings.length}</Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {failCount > 0 && <Chip size="small" icon={<FailIcon />} label={`${failCount} FAIL`} color="error" />}
                {warnCount > 0 && <Chip size="small" icon={<WarnIcon />} label={`${warnCount} WARN`} color="warning" />}
                {passCount > 0 && <Chip size="small" icon={<PassIcon />} label={`${passCount} PASS`} color="success" />}
                {infoCount > 0 && <Chip size="small" icon={<InfoIcon />} label={`${infoCount} INFO`} color="info" />}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Policy count */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Policies</Typography>
              <Typography variant="h3">{audit.total_policies}</Typography>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={`${policies.filter(p => p.policy_types.includes('Ingress')).length} Ingress`} />
                <Chip size="small" label={`${policies.filter(p => p.policy_types.includes('Egress')).length} Egress`} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Audit Findings" />
        <Tab label="Policy Inventory" />
      </Tabs>

      {/* ── Tab 0: Audit Findings ────────────────────────────────────────── */}
      {tab === 0 && (
        <Card>
          <CardContent>
            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Typography variant="body2" sx={{ alignSelf: 'center', color: 'text.secondary' }}>
                Filter by check:
              </Typography>
              {['All', ...CHECKS].map(c => (
                <Chip
                  key={c}
                  label={c}
                  size="small"
                  onClick={() => setFilterCheck(c)}
                  variant={filterCheck === c ? 'filled' : 'outlined'}
                  color={filterCheck === c ? 'primary' : 'default'}
                />
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <Typography variant="body2" sx={{ alignSelf: 'center', color: 'text.secondary' }}>
                Level:
              </Typography>
              {['All', 'FAIL', 'WARN', 'PASS', 'INFO'].map(l => (
                <Chip
                  key={l}
                  label={l}
                  size="small"
                  onClick={() => setFilterLevel(l)}
                  variant={filterLevel === l ? 'filled' : 'outlined'}
                  color={filterLevel === l ? LEVEL_COLOR[l] ?? 'default' : 'default'}
                />
              ))}
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell width={80}>Level</TableCell>
                    <TableCell width={180}>Check</TableCell>
                    <TableCell>Resource</TableCell>
                    <TableCell>Finding</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredFindings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No findings match the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : filteredFindings.map((f, i) => (
                    <TableRow
                      key={i}
                      sx={{
                        bgcolor:
                          f.level === 'FAIL' ? '#fff5f5' :
                          f.level === 'WARN' ? '#fffde7' :
                          f.level === 'PASS' ? '#f1fff1' : 'inherit',
                      }}
                    >
                      <TableCell>
                        <Tooltip title={f.level}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {LEVEL_ICON[f.level]}
                            <Typography variant="caption" fontWeight={600}>
                              {f.level}
                            </Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{f.check}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {f.resource}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{f.message}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing {filteredFindings.length} of {audit.findings.length} findings
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 1: Policy Inventory ──────────────────────────────────────── */}
      {tab === 1 && (
        <Card>
          <CardContent>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>Name</TableCell>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Policy Types</TableCell>
                    <TableCell>Pod Selector</TableCell>
                    <TableCell align="center">Ingress Rules</TableCell>
                    <TableCell align="center">Egress Rules</TableCell>
                    <TableCell>Age</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {policies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No policies found.
                      </TableCell>
                    </TableRow>
                  ) : policies.map((p, i) => (
                    <TableRow key={i} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {p.namespace}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {p.policy_types.map(t => (
                          <Chip key={t} label={t} size="small" sx={{ mr: 0.5 }}
                            color={t === 'Ingress' ? 'primary' : 'secondary'} variant="outlined" />
                        ))}
                      </TableCell>
                      <TableCell>
                        {Object.keys(p.pod_selector).length === 0
                          ? <Chip label="all pods" size="small" color="warning" variant="outlined" />
                          : Object.entries(p.pod_selector).map(([k, v]) => (
                              <Chip key={k} label={`${k}=${v}`} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                            ))}
                      </TableCell>
                      <TableCell align="center">{p.ingress_rules_count}</TableCell>
                      <TableCell align="center">{p.egress_rules_count}</TableCell>
                      <TableCell>{p.age}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

    </Box>
  );
};

export default NetworkPolicies;
