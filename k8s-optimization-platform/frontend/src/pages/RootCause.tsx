import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Accordion, AccordionSummary, AccordionDetails,
  Button, LinearProgress, Snackbar, List, ListItem, Divider, Tooltip,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RootCause {
  category: string;
  description: string;
  impact: string;
  count: number;
  cost_impact: number;
  severity: string;
  recommendation: string;
}

interface WasteBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
  examples: string[];
}

interface TopContributor {
  name: string;
  type: string;
  waste: number;
  reason: string;
  namespace?: string;
}

interface Analysis {
  total_waste: number;
  analysis_date: string;
  root_causes: RootCause[];
  waste_breakdown: WasteBreakdown[];
  top_contributors: TopContributor[];
  recommendations: string[];
}

interface ResourceIssue {
  resource_name: string;
  resource_type: string;
  namespace: string;
  cluster: string;
  issue_type: string;
  root_cause: string;
  current_state: Record<string, string>;
  recommended_action: string;
  estimated_savings: number;
  risk_level: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const DK = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#1c2128',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#8b949e',
};

const SEV: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

const PIE_COLORS = ['#f85149', '#d29922', '#3b82f6', '#3fb950', '#a371f7', '#58a6ff'];

// ─── Small reusable components ────────────────────────────────────────────────

const SevChip: React.FC<{ value: string }> = ({ value }) => {
  const c = SEV[value] ?? DK.muted;
  return (
    <Chip label={value} size="small" sx={{
      bgcolor: `${c}22`, color: c, border: `1px solid ${c}44`,
      fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase',
    }} />
  );
};

const SevIcon: React.FC<{ value: string }> = ({ value }) => {
  const props = { sx: { fontSize: 20, color: SEV[value] ?? DK.muted } };
  if (value === 'critical') return <ErrorOutlineIcon {...props} />;
  if (value === 'high')     return <WarningAmberIcon {...props} />;
  if (value === 'medium')   return <InfoOutlinedIcon {...props} />;
  return <CheckCircleOutlineIcon {...props} />;
};

const KpiCard: React.FC<{ label: string; value: string | number; accent?: string; sub?: string }> =
  ({ label, value, accent, sub }) => (
  <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
    <CardContent sx={{ p: '16px !important' }}>
      <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mb: 0.5 }}>{label}</Typography>
      <Typography sx={{ color: accent ?? DK.text, fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ color: DK.muted, fontSize: '0.72rem', mt: 0.5 }}>{sub}</Typography>}
    </CardContent>
  </Card>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const RootCauseInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [issues, setIssues] = useState<ResourceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixLoading, setFixLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({
    open: false, msg: '', sev: 'success',
  });

  useEffect(() => {
    fetchData();
  }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const [aRes, iRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/root-cause/analysis${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/root-cause/issues${clusterParam}`),
      ]);
      if (aRes.ok) setAnalysis(await aRes.json());
      if (iRes.ok) setIssues(await iRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Fix action — dispatches an autofix command via the agent
  const handleFix = async (issue: ResourceIssue) => {
    const key = issue.resource_name;
    setFixLoading(key);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autofix/apply/${encodeURIComponent(issue.resource_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name: issue.resource_name,
          namespace: issue.namespace,
          issue_type: issue.issue_type,
          recommended_action: issue.recommended_action,
        }),
      });
      if (res.ok) {
        setToast({ open: true, msg: `Fix queued for ${issue.resource_name}`, sev: 'success' });
      } else {
        const body = await res.json().catch(() => ({}));
        setToast({ open: true, msg: body?.detail ?? `Fix failed (HTTP ${res.status})`, sev: 'error' });
      }
    } catch (e: any) {
      setToast({ open: true, msg: e?.message ?? 'Network error', sev: 'error' });
    } finally {
      setFixLoading(null);
    }
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#f85149' }} />
    </Box>
  );

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BugReportIcon sx={{ color: '#f85149', fontSize: 28 }} />
          <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700 }}>
            Root Cause Analysis
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mb: 3 }}>
        Live waste analysis from cluster agent — identify why resources are over-spent and fix them
      </Typography>

      {analysis && (
        <>
          {/* ── KPI Row ─────────────────────────────────────────── */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Total Monthly Waste" value={`$${analysis.total_waste.toLocaleString()}`} accent="#f85149" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Root Cause Categories" value={analysis.root_causes.length} accent="#d29922" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Affected Resources" value={analysis.root_causes.reduce((s, r) => s + r.count, 0)} accent="#3b82f6" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <KpiCard label="Issues Identified" value={issues.length} accent="#a371f7"
                sub={`${issues.filter(i => i.risk_level === 'critical').length} critical`} />
            </Grid>
          </Grid>

          {/* ── Root causes + Waste pie ──────────────────────────── */}
          <Grid container spacing={2} mb={2}>

            {/* Left: accordion per root cause */}
            <Grid item xs={12} md={7}>
              <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
                <CardContent sx={{ p: '16px !important' }}>
                  <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
                    Root Causes — {analysis.root_causes.length} identified
                  </Typography>
                  {analysis.root_causes.map((rc, i) => (
                    <Accordion key={i} disableGutters
                      sx={{
                        bgcolor: DK.surface2, border: `1px solid ${DK.border}`,
                        mb: 1, borderRadius: '6px !important',
                        '&:before': { display: 'none' },
                        '& .MuiAccordionSummary-root': { minHeight: 48 },
                      }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: DK.muted }} />}>
                        <Box display="flex" alignItems="center" gap={1.5} width="100%">
                          <SevIcon value={rc.severity} />
                          <Box flexGrow={1}>
                            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>
                              {rc.category}
                            </Typography>
                            <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                              {rc.count} resources · ${rc.cost_impact.toLocaleString()}/mo
                            </Typography>
                          </Box>
                          <SevChip value={rc.severity} />
                          {rc.cost_impact > 0 && (
                            <Chip label={`$${rc.cost_impact.toLocaleString()}`} size="small"
                              sx={{ bgcolor: '#f8514922', color: '#f85149', border: '1px solid #f8514944', fontWeight: 700, fontSize: '0.7rem' }} />
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ bgcolor: DK.bg, borderTop: `1px solid ${DK.border}`, p: 2 }}>
                        <Typography sx={{ color: DK.muted, fontSize: '0.82rem', mb: 1.5 }}>
                          <strong style={{ color: DK.text }}>Description: </strong>{rc.description}
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.82rem', mb: 1.5 }}>
                          <strong style={{ color: DK.text }}>Impact: </strong>{rc.impact}
                        </Typography>
                        <Box sx={{ bgcolor: '#3fb95011', border: '1px solid #3fb95033', borderRadius: 1.5, p: 1.5 }}>
                          <Typography sx={{ color: '#3fb950', fontSize: '0.82rem' }}>
                            <strong>Recommendation: </strong>{rc.recommendation}
                          </Typography>
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {analysis.root_causes.length === 0 && (
                    <Typography sx={{ color: DK.muted, textAlign: 'center', py: 4, fontSize: '0.85rem' }}>
                      No root causes identified — cluster looks healthy
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Right: pie + bars */}
            <Grid item xs={12} md={5}>
              <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, height: '100%' }}>
                <CardContent sx={{ p: '16px !important' }}>
                  <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
                    Waste Distribution
                  </Typography>
                  {analysis.waste_breakdown.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={analysis.waste_breakdown} dataKey="amount" nameKey="category"
                            cx="50%" cy="50%" outerRadius={75}
                            label={({ percentage }) => `${percentage?.toFixed(0)}%`}
                            labelLine={false}>
                            {analysis.waste_breakdown.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{ background: DK.surface2, border: `1px solid ${DK.border}`, color: DK.text, fontSize: '0.78rem' }}
                            formatter={(v: number) => [`$${v.toLocaleString()}`, 'Waste']} />
                          <Legend wrapperStyle={{ color: DK.muted, fontSize: '0.72rem' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <Divider sx={{ borderColor: DK.border, my: 1.5 }} />
                      {analysis.waste_breakdown.map((wb, i) => (
                        <Box key={i} mb={1.5}>
                          <Box display="flex" justifyContent="space-between" mb={0.5}>
                            <Typography sx={{ color: DK.text, fontSize: '0.78rem', fontWeight: 600 }}>{wb.category}</Typography>
                            <Typography sx={{ color: '#f85149', fontSize: '0.78rem', fontWeight: 700 }}>${wb.amount.toLocaleString()}</Typography>
                          </Box>
                          <LinearProgress variant="determinate" value={Math.min(wb.percentage, 100)}
                            sx={{ height: 5, borderRadius: 3, bgcolor: DK.surface2,
                              '& .MuiLinearProgress-bar': { bgcolor: PIE_COLORS[i % PIE_COLORS.length] } }} />
                          <Typography sx={{ color: DK.muted, fontSize: '0.7rem', mt: 0.25 }}>
                            {wb.count} resources affected
                          </Typography>
                        </Box>
                      ))}
                    </>
                  ) : (
                    <Typography sx={{ color: DK.muted, textAlign: 'center', py: 6, fontSize: '0.85rem' }}>
                      No waste breakdown data
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* ── Top Contributors ─────────────────────────────────── */}
          {analysis.top_contributors.length > 0 && (
            <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
              <CardContent sx={{ p: '16px !important' }}>
                <Typography sx={{ color: DK.text, fontWeight: 600, mb: 1.5 }}>
                  Top Waste Contributors
                </Typography>
                <TableContainer sx={{ '&::-webkit-scrollbar': { height: 5 }, '&::-webkit-scrollbar-thumb': { bgcolor: DK.border, borderRadius: 3 } }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['#','Resource','Namespace','Type','Reason','Est. Waste/mo'].map(h => (
                          <TableCell key={h} sx={{ bgcolor: DK.surface2, color: DK.muted, fontWeight: 700, fontSize: '0.72rem', borderBottom: `1px solid ${DK.border}` }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analysis.top_contributors.map((c, i) => (
                        <TableRow key={i} hover sx={{ '&:hover': { bgcolor: DK.surface2 }, '& td': { borderBottom: `1px solid ${DK.border}22` } }}>
                          <TableCell sx={{ color: DK.muted, fontWeight: 700, fontSize: '0.78rem' }}>#{i + 1}</TableCell>
                          <TableCell sx={{ color: DK.text, fontWeight: 600, fontSize: '0.8rem', fontFamily: 'monospace' }}>{c.name}</TableCell>
                          <TableCell sx={{ color: DK.muted, fontSize: '0.75rem', fontFamily: 'monospace' }}>{c.namespace || '—'}</TableCell>
                          <TableCell><Chip label={c.type} size="small"
                            sx={{ bgcolor: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontSize: '0.68rem' }} /></TableCell>
                          <TableCell sx={{ color: DK.muted, fontSize: '0.78rem' }}>{c.reason}</TableCell>
                          <TableCell sx={{ color: '#f85149', fontWeight: 700, fontSize: '0.8rem' }}>${c.waste.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* ── Action Plan ──────────────────────────────────────── */}
          <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <TrendingDownIcon sx={{ color: '#3fb950', fontSize: 20 }} />
                <Typography sx={{ color: DK.text, fontWeight: 600 }}>Action Plan</Typography>
              </Box>
              <List disablePadding>
                {analysis.recommendations.map((rec, i) => (
                  <React.Fragment key={i}>
                    <ListItem disablePadding sx={{ py: 0.75 }}>
                      <Box display="flex" gap={1.5} alignItems="flex-start">
                        <Chip label={`#${i + 1}`} size="small"
                          sx={{ bgcolor: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontWeight: 700, fontSize: '0.68rem', minWidth: 30 }} />
                        <Typography sx={{ color: DK.muted, fontSize: '0.82rem', pt: 0.25 }}>{rec}</Typography>
                      </Box>
                    </ListItem>
                    {i < analysis.recommendations.length - 1 && <Divider sx={{ borderColor: `${DK.border}66` }} />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Detailed Issues Table ─────────────────────────────────── */}
      <Card sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2 }}>
        <CardContent sx={{ p: '16px !important' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <BuildIcon sx={{ color: '#d29922', fontSize: 20 }} />
            <Typography sx={{ color: DK.text, fontWeight: 600 }}>
              Detailed Issues — {issues.length} resources need attention
            </Typography>
          </Box>
          {issues.map((issue, i) => (
            <Accordion key={i} disableGutters
              sx={{
                bgcolor: DK.surface2, border: `1px solid ${DK.border}`, mb: 1,
                borderRadius: '6px !important', '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': { minHeight: 48 },
              }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: DK.muted }} />}>
                <Box display="flex" alignItems="center" gap={1.5} width="100%">
                  <Box flexGrow={1}>
                    <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {issue.resource_name}
                    </Typography>
                    <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                      {issue.cluster} / {issue.namespace} · {issue.issue_type}
                    </Typography>
                  </Box>
                  {issue.estimated_savings > 0 && (
                    <Chip label={`$${issue.estimated_savings.toFixed(2)}/mo`} size="small"
                      sx={{ bgcolor: '#f8514922', color: '#f85149', border: '1px solid #f8514944', fontWeight: 700, fontSize: '0.68rem' }} />
                  )}
                  <SevChip value={issue.risk_level} />
                  <Button
                    size="small" variant="contained"
                    disabled={fixLoading === issue.resource_name}
                    onClick={(e) => { e.stopPropagation(); handleFix(issue); }}
                    sx={{
                      bgcolor: '#238636', color: '#fff', fontSize: '0.72rem', px: 1.5, py: 0.4,
                      minWidth: 60, textTransform: 'none', fontWeight: 600,
                      '&:hover': { bgcolor: '#2ea043' },
                      '&.Mui-disabled': { bgcolor: '#21262d', color: DK.muted },
                    }}>
                    {fixLoading === issue.resource_name ? '…' : 'Fix'}
                  </Button>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: DK.bg, borderTop: `1px solid ${DK.border}`, p: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Box sx={{ bgcolor: '#d2992211', border: '1px solid #d2992233', borderRadius: 1.5, p: 1.5, mb: 1.5 }}>
                      <Typography sx={{ color: '#d29922', fontSize: '0.82rem' }}>
                        <strong>Root Cause: </strong>{issue.root_cause}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography sx={{ color: DK.muted, fontSize: '0.75rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Current State
                    </Typography>
                    <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, p: 1.5 }}>
                      {Object.entries(issue.current_state).map(([k, v]) => (
                        <Box key={k} display="flex" justifyContent="space-between" mb={0.4}>
                          <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{k}</Typography>
                          <Typography sx={{ color: DK.text, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'monospace' }}>{v}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography sx={{ color: DK.muted, fontSize: '0.75rem', fontWeight: 700, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Recommended Action
                    </Typography>
                    <Box sx={{ bgcolor: '#3fb95011', border: '1px solid #3fb95033', borderRadius: 1.5, p: 1.5 }}>
                      <Typography sx={{ color: '#3fb950', fontSize: '0.82rem' }}>{issue.recommended_action}</Typography>
                    </Box>
                    <Box display="flex" gap={2} mt={1.5}>
                      <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>
                        Est. savings: <span style={{ color: '#f85149', fontWeight: 700 }}>${issue.estimated_savings.toFixed(2)}/mo</span>
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
          {issues.length === 0 && (
            <Typography sx={{ color: DK.muted, textAlign: 'center', py: 5, fontSize: '0.85rem' }}>
              No individual resource issues detected
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: toast.sev === 'success' ? '#238636' : '#b62324', color: '#fff', '& .MuiAlert-icon': { color: '#fff' } }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

const RootCause: React.FC = () => (
  <ClusterGuard><RootCauseInner /></ClusterGuard>
);

export default RootCause;
