import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Button,
  Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { API_BASE_URL } from '../../../config/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg:       '#0d1117',
  surface:  '#161b22',
  surface2: '#1c2128',
  border:   '#30363d',
  text:     '#e6edf3',
  muted:    '#8b949e',
};

const SEV: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface SecurityIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  affected_resources: string[];
  remediation: string;
  cve_ids: string[];
}

interface SecurityPayload {
  summary: {
    total_issues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    security_score: number;
    total_pods: number;
    total_containers: number;
    cluster_name: string;
  };
  issues: SecurityIssue[];
  compliance_status: Record<string, string>;
}

// ─── SVG circular score ring ──────────────────────────────────────────────────
const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r   = 54;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#3fb950' : pct >= 60 ? '#d29922' : '#f85149';

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="136" height="136" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx="68" cy="68" r={r} fill="none" stroke={DK.surface2} strokeWidth="10" />
        {/* Fill */}
        <circle
          cx="68" cy="68" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography sx={{ color, fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>{Math.round(pct)}</Typography>
        <Typography sx={{ color: DK.muted, fontSize: '0.68rem', mt: 0.25 }}>/ 100</Typography>
      </Box>
    </Box>
  );
};

// ─── Severity group badge ─────────────────────────────────────────────────────
const SevBadge: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: `${color}0f`, border: `1px solid ${color}33`, borderRadius: 2, px: 2, py: 1.25, minWidth: 72 }}>
    <Typography sx={{ color, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{count}</Typography>
    <Typography sx={{ color, fontSize: '0.68rem', fontWeight: 600, mt: 0.25, textTransform: 'uppercase' }}>{label}</Typography>
  </Box>
);

// ─── Compliance chip ──────────────────────────────────────────────────────────
const ComplianceChip: React.FC<{ label: string; status: string }> = ({ label, status }) => {
  const isOk    = status === 'Compliant';
  const isWarn  = status === 'Partial' || status === 'Needs Review';
  const color   = isOk ? '#3fb950' : isWarn ? '#d29922' : '#f85149';
  return (
    <Chip
      label={`${label}: ${status}`}
      size="small"
      sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontWeight: 600, fontSize: '0.72rem' }}
    />
  );
};

// ─── Issue card ───────────────────────────────────────────────────────────────
const IssueCard: React.FC<{
  issue: SecurityIssue;
  applying: boolean;
  fixed: boolean;
  onApply: (issue: SecurityIssue) => void;
}> = ({ issue, applying, fixed, onApply }) => {
  const [expanded, setExpanded] = useState(false);
  const color = SEV[issue.severity] ?? DK.muted;

  return (
    <Box
      sx={{
        bgcolor: DK.surface,
        border: `1px solid ${DK.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 2,
        overflow: 'hidden',
        opacity: fixed ? 0.5 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* Summary row */}
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: DK.surface2 } }}
      >
        {/* Sev icon */}
        {issue.severity === 'critical' && <ErrorOutlineIcon sx={{ fontSize: 18, color, flexShrink: 0 }} />}
        {issue.severity === 'high'     && <WarningAmberIcon sx={{ fontSize: 18, color, flexShrink: 0 }} />}
        {issue.severity === 'medium'   && <InfoOutlinedIcon  sx={{ fontSize: 18, color, flexShrink: 0 }} />}
        {issue.severity === 'low'      && <InfoOutlinedIcon  sx={{ fontSize: 18, color, flexShrink: 0 }} />}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>{issue.title}</Typography>
            <Chip label={issue.severity.toUpperCase()} size="small" sx={{ bgcolor: `${color}1a`, color, border: `1px solid ${color}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
            <Chip label={issue.category} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.65rem', height: 20 }} />
            {issue.affected_resources.length > 0 && (
              <Chip label={`${issue.affected_resources.length} resource${issue.affected_resources.length !== 1 ? 's' : ''}`} size="small" sx={{ bgcolor: DK.surface2, color: DK.muted, fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.4 }} noWrap>{issue.description}</Typography>
        </Box>

        {/* Apply button */}
        <Tooltip title={fixed ? 'Already fixed' : 'Apply fix via agent'}>
          <span>
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); onApply(issue); }}
              disabled={applying || fixed}
              sx={{
                bgcolor: fixed ? 'transparent' : '#238636',
                color: fixed ? '#3fb950' : '#fff',
                borderRadius: 1.5,
                width: 32,
                height: 32,
                flexShrink: 0,
                '&:hover': { bgcolor: fixed ? 'transparent' : '#2ea043' },
                '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted },
              }}
            >
              {fixed
                ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                : applying
                ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                : <PlayArrowIcon sx={{ fontSize: 16 }} />
              }
            </IconButton>
          </span>
        </Tooltip>

        {expanded
          ? <ExpandMoreIcon  sx={{ fontSize: 18, color: DK.muted, flexShrink: 0 }} />
          : <ChevronRightIcon sx={{ fontSize: 18, color: DK.muted, flexShrink: 0 }} />
        }
      </Box>

      {/* Expanded detail */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: `1px solid ${DK.border}`, px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>

          {/* CVE badges */}
          {issue.cve_ids.length > 0 && (
            <Box>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>CVE IDs</Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {issue.cve_ids.map(cve => (
                  <Chip key={cve} label={cve} size="small" icon={<BugReportIcon sx={{ fontSize: '14px !important', color: '#f85149 !important' }} />}
                    sx={{ bgcolor: '#f851491a', color: '#f85149', border: '1px solid #f8514944', fontSize: '0.68rem' }} />
                ))}
              </Box>
            </Box>
          )}

          {/* Affected resources */}
          <Box>
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Affected Resources</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {issue.affected_resources.map((r, i) => (
                <Chip key={i} label={r} size="small" variant="outlined" sx={{ borderColor: DK.border, color: DK.muted, fontSize: '0.72rem' }} />
              ))}
            </Box>
          </Box>

          {/* Remediation */}
          <Box>
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Remediation</Typography>
            <Box sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, px: 1.5, py: 1 }}>
              <Typography sx={{ color: DK.text, fontSize: '0.83rem', lineHeight: 1.6 }}>{issue.remediation}</Typography>
            </Box>
          </Box>

        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const SecurityAdvisor: React.FC = () => {
  const { activeClusterName, clusterParam } = useActiveCluster();
  const [payload, setPayload]       = useState<SecurityPayload | null>(null);
  const [loading, setLoading]       = useState(true);
  const [applying, setApplying]     = useState<string | null>(null);
  const [fixedIds, setFixedIds]     = useState<Set<string>>(new Set());
  const [toast, setToast]           = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({ open: false, msg: '', sev: 'info' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/autonomous-ai/copilot/security-advisor${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPayload(await res.json());
    } catch (e: any) {
      setToast({ open: true, msg: e.message ?? 'Failed to load', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Apply one fix via root-cause endpoint ──────────────────────────────────
  const applyFix = async (issue: SecurityIssue) => {
    const resourceName = issue.affected_resources[0] ?? issue.id;
    setApplying(issue.id);
    setToast({ open: true, msg: '⏳ Fix queued — waiting for agent…', sev: 'info' });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name:     resourceName,
          namespace:         'default',
          issue_type:        issue.severity === 'critical' ? 'privileged_container' : 'security_misconfiguration',
          cpu_request:       0,
          memory_request_mb: 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ open: true, msg: body?.detail ?? `Fix failed (HTTP ${res.status})`, sev: 'error' });
        return;
      }
      const cmdId = body.command_id;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
        if (!poll) continue;
        const status = await poll.json().catch(() => ({}));
        if (status.status === 'done') {
          setFixedIds(prev => new Set(prev).add(issue.id));
          setToast({ open: true, msg: `✅ Fixed: ${issue.title}`, sev: 'success' });
          return;
        }
        if (status.status === 'failed') {
          const err = status.result?.error ?? 'Command failed';
          const k8s = err.match(/"message":"([^"]+)"/);
          setToast({ open: true, msg: `❌ ${k8s ? k8s[1] : err.slice(0, 120)}`, sev: 'error' });
          return;
        }
      }
      setToast({ open: true, msg: `⏱ Timed out — check Command Center (cmd #${cmdId})`, sev: 'error' });
    } catch (e: any) {
      setToast({ open: true, msg: e?.message ?? 'Network error', sev: 'error' });
    } finally {
      setApplying(null);
    }
  };

  // ── Fix All Critical ───────────────────────────────────────────────────────
  const fixAllCritical = async () => {
    if (!payload) return;
    const criticals = payload.issues.filter(i => i.severity === 'critical' && !fixedIds.has(i.id));
    for (const issue of criticals) {
      await applyFix(issue);
    }
  };

  if (loading) return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <CircularProgress sx={{ color: '#f85149' }} />
    </Box>
  );

  const issues   = payload?.issues ?? [];
  const summary  = payload?.summary;
  const score    = summary?.security_score ?? 0;
  const scoreColor = score >= 80 ? '#3fb950' : score >= 60 ? '#d29922' : '#f85149';
  const criticalIssues = issues.filter(i => i.severity === 'critical' && !fixedIds.has(i.id));

  // Group issues by severity order
  const grouped: Record<string, SecurityIssue[]> = {};
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const group = issues.filter(i => i.severity === sev);
    if (group.length > 0) grouped[sev] = group;
  }

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>Security Advisor</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.83rem', mt: 0.25 }}>
            AI-powered security analysis for{' '}
            <span style={{ color: '#58a6ff' }}>{activeClusterName}</span>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {criticalIssues.length > 0 && (
            <Button
              variant="contained"
              size="small"
              startIcon={applying ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <ErrorOutlineIcon />}
              disabled={applying !== null}
              onClick={fixAllCritical}
              sx={{ bgcolor: '#da3633', '&:hover': { bgcolor: '#f85149' }, '&.Mui-disabled': { bgcolor: DK.surface2, color: DK.muted }, fontWeight: 600, fontSize: '0.8rem' }}
            >
              Fix All Critical ({criticalIssues.length})
            </Button>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchData} sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Score + breakdown row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>

        {/* Score ring card */}
        <Grid item xs={12} sm={4} md={3}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <ScoreRing score={score} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.88rem' }}>Security Score</Typography>
              <Typography sx={{ color: scoreColor, fontSize: '0.78rem' }}>
                {score >= 80 ? 'Good posture' : score >= 60 ? 'Needs attention' : 'At risk'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <ShieldOutlinedIcon sx={{ fontSize: 14, color: DK.muted }} />
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>
                {summary?.total_pods ?? 0} pods · {summary?.total_containers ?? 0} containers
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Severity counts + compliance */}
        <Grid item xs={12} sm={8} md={9}>
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* Severity badges row */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <SevBadge label="Critical" count={summary?.critical ?? 0} color={SEV.critical} />
              <SevBadge label="High"     count={summary?.high     ?? 0} color={SEV.high}     />
              <SevBadge label="Medium"   count={summary?.medium   ?? 0} color={SEV.medium}   />
              <SevBadge label="Low"      count={summary?.low      ?? 0} color={SEV.low}      />
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 2, px: 2, py: 1.25, minWidth: 72 }}>
                <Typography sx={{ color: DK.text, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{summary?.total_issues ?? 0}</Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.68rem', fontWeight: 600, mt: 0.25 }}>TOTAL</Typography>
              </Box>
            </Box>

            {/* Compliance chips */}
            <Box>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>Compliance Status</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Object.entries(payload?.compliance_status ?? {}).map(([key, val]) => (
                  <ComplianceChip key={key} label={key.replace(/_/g, ' ').toUpperCase()} status={val} />
                ))}
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Issues grouped by severity */}
      {Object.entries(grouped).map(([sev, group]) => (
        <Box key={sev} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SEV[sev] }} />
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize' }}>
              {sev}
            </Typography>
            <Chip label={group.length} size="small" sx={{ bgcolor: `${SEV[sev]}1a`, color: SEV[sev], border: `1px solid ${SEV[sev]}44`, fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {group.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                applying={applying === issue.id}
                fixed={fixedIds.has(issue.id)}
                onApply={applyFix}
              />
            ))}
          </Box>
        </Box>
      ))}

      {issues.length === 0 && (
        <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 4, textAlign: 'center' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 40, color: '#3fb950', mb: 1 }} />
          <Typography sx={{ color: DK.muted }}>No security issues detected — cluster is clean</Typography>
        </Box>
      )}

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.sev} onClose={() => setToast(t => ({ ...t, open: false }))}
          sx={{ bgcolor: DK.surface, color: DK.text, border: `1px solid ${DK.border}` }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SecurityAdvisor;

// Made with Bob
