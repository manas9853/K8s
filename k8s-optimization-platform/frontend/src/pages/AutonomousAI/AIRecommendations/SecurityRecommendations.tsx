import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149',
  high:     '#d29922',
  medium:   '#3b82f6',
  low:      '#3fb950',
};

// MITRE ATT&CK technique tags derived from rec title keywords
function mitreTag(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes('privileged'))      return 'T1611 · Escape to Host';
  if (t.includes('root'))            return 'T1548 · Abuse Elevation';
  if (t.includes('host network') || t.includes('host namespace')) return 'T1205 · Traffic Signaling';
  if (t.includes('escalation'))      return 'T1068 · Exploitation for Privilege';
  if (t.includes('filesystem') || t.includes('root filesystem')) return 'T1565 · Data Manipulation';
  if (t.includes('service account')) return 'T1552 · Unsecured Credentials';
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rec {
  id: string;
  priority: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
  confidence: number;
  affected_resources: number;
  cve_ids?: string[];
  compliance_impact?: string[];
}
interface SecPayload {
  category: string;
  cluster_name: string;
  total_recommendations: number;
  critical: number;
  high: number;
  medium: number;
  recommendations: Rec[];
}

// ─── Agent poll helper ────────────────────────────────────────────────────────
async function pollCommand(cmdId: number): Promise<{ ok: boolean; errMsg?: string }> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const res = await fetch(`${API_BASE_URL}/agents/commands/${cmdId}`).catch(() => null);
    if (!res) continue;
    const s = await res.json().catch(() => ({}));
    if (s.status === 'done') return { ok: true };
    if (s.status === 'failed') {
      const err = s.result?.error ?? 'Command failed';
      const k8s = err.match(/"message":"([^"]+)"/);
      return { ok: false, errMsg: k8s ? k8s[1] : err.slice(0, 120) };
    }
  }
  return { ok: false, errMsg: `Timed out — check Command Center (cmd #${cmdId})` };
}

// ─── Sev badge ────────────────────────────────────────────────────────────────
const SevBadge: React.FC<{ label: string; count: number; accent: string }> = ({ label, count, accent }) => (
  <Box sx={{ bgcolor: accent + '18', border: `1px solid ${accent}44`, borderRadius: 1.5, px: 1.5, py: 1, minWidth: 80, textAlign: 'center' }}>
    <Typography sx={{ color: accent, fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>{count}</Typography>
    <Typography sx={{ color: accent, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
  </Box>
);

// ─── Rec card ─────────────────────────────────────────────────────────────────
const RecCard: React.FC<{
  rec: Rec;
  expanded: boolean;
  applying: boolean;
  done: boolean;
  onExpand: () => void;
  onApply: () => void;
}> = ({ rec, expanded, applying, done, onExpand, onApply }) => {
  const color = SEV_COLOR[rec.priority] ?? DK.muted;
  const mitre = mitreTag(rec.title);
  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderLeft: `3px solid ${color}`,
      borderRadius: 2, mb: 1.5, opacity: done ? 0.45 : 1, transition: 'opacity 0.3s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer' }} onClick={onExpand}>
        <SecurityIcon sx={{ fontSize: 18, color, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.3 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{rec.title}</Typography>
            <Chip label={rec.priority.toUpperCase()} size="small"
              sx={{ bgcolor: color + '22', color, fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${color}44` }} />
            {mitre && (
              <Chip label={mitre} size="small" icon={<BugReportIcon sx={{ fontSize: '10px !important', color: `${color} !important` }} />}
                sx={{ bgcolor: color + '18', color, fontSize: '0.65rem', border: `1px solid ${color}33` }} />
            )}
          </Box>
          <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>{rec.affected_resources} affected resource{rec.affected_resources !== 1 ? 's' : ''}</Typography>
        </Box>
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          {done ? (
            <Chip icon={<CheckCircleOutlineIcon />} label="Applied" size="small"
              sx={{ bgcolor: '#0d1117', color: '#3fb950', border: '1px solid #3fb950', fontSize: '0.68rem' }} />
          ) : (
            <Button size="small" variant="outlined"
              startIcon={applying ? <CircularProgress size={12} /> : <PlayArrowIcon />}
              disabled={applying} onClick={e => { e.stopPropagation(); onApply(); }}
              sx={{ borderColor: color, color, textTransform: 'none', fontSize: '0.75rem',
                    '&:hover': { bgcolor: color + '22' } }}>
              {applying ? 'Fixing…' : 'Apply Fix'}
            </Button>
          )}
          <IconButton size="small" sx={{ color: DK.muted }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ borderTop: `1px solid ${DK.border}`, p: 2, bgcolor: DK.surface2, borderRadius: '0 0 8px 8px' }}>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mb: 1.5 }}>{rec.description}</Typography>
          {/* "What an attacker could do" text */}
          <Box sx={{ bgcolor: '#2d0b0b', border: `1px solid #f8514933`, borderRadius: 1, p: 1.5, mb: 1.5 }}>
            <Typography sx={{ color: '#f8947a', fontSize: '0.72rem', fontWeight: 600, mb: 0.5 }}>⚠ Attack vector</Typography>
            <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>
              {rec.priority === 'critical'
                ? 'An attacker with this access can escape container isolation and execute code on the host node, affecting all pods on that node.'
                : rec.priority === 'high'
                ? 'An attacker can leverage this misconfiguration to escalate privileges or pivot to other namespaces.'
                : 'This misconfiguration reduces the security boundary and may assist attackers in lateral movement.'}
            </Typography>
          </Box>
          {/* Compliance tags */}
          {rec.compliance_impact && rec.compliance_impact.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {rec.compliance_impact.map(c => (
                <Chip key={c} label={c} size="small" sx={{ bgcolor: DK.surface, color: DK.muted, fontSize: '0.65rem', border: `1px solid ${DK.border}` }} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const SecurityRecommendations: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<SecPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/recommendations/security${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async (rec: Rec) => {
    setApplying(p => ({ ...p, [rec.id]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/root-cause/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: rec.title, namespace: 'default',
          issue_type: 'security', cpu_request: 0, memory_request_mb: 0 }),
      });
      const body = await res.json();
      const cmdId = body.command_id;
      if (!cmdId) throw new Error('No command_id');
      const result = await pollCommand(cmdId);
      if (result.ok) {
        setDone(p => ({ ...p, [rec.id]: true }));
        setToast({ msg: `Applied — ${rec.title}`, sev: 'success' });
      } else {
        setToast({ msg: result.errMsg ?? 'Failed', sev: 'error' });
      }
    } catch (e: any) {
      setToast({ msg: e.message ?? 'Failed', sev: 'error' });
    } finally {
      setApplying(p => ({ ...p, [rec.id]: false }));
    }
  };

  const recs = data?.recommendations ?? [];
  const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const grouped = (['critical', 'high', 'medium', 'low'] as const).map(sev => ({
    sev, items: recs.filter(r => r.priority === sev),
  })).filter(g => g.items.length > 0);

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Security Recommendations</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>{activeClusterName} — MITRE ATT&CK mapped</Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted }}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* Severity badges */}
          <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, mb: 3 }}>
            <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, mb: 2 }}>Security Summary</Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <SevBadge label="Critical" count={data.critical} accent="#f85149" />
              <SevBadge label="High" count={data.high} accent="#d29922" />
              <SevBadge label="Medium" count={data.medium} accent="#3b82f6" />
              <Box sx={{ ml: 'auto' }}>
                <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{data.total_recommendations} total recommendations</Typography>
              </Box>
            </Box>
          </Box>

          {/* Grouped by severity */}
          {grouped.map(({ sev, items }) => (
            <Box key={sev} sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SEV_COLOR[sev] }} />
                <Typography sx={{ color: SEV_COLOR[sev], fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{sev}</Typography>
                <Chip label={items.length} size="small" sx={{ bgcolor: SEV_COLOR[sev] + '22', color: SEV_COLOR[sev], fontSize: '0.68rem', height: 18 }} />
              </Box>
              {items.map(rec => (
                <RecCard key={rec.id} rec={rec}
                  expanded={expanded === rec.id}
                  applying={applying[rec.id] ?? false}
                  done={done[rec.id] ?? false}
                  onExpand={() => setExpanded(prev => prev === rec.id ? null : rec.id)}
                  onApply={() => handleApply(rec)}
                />
              ))}
            </Box>
          ))}

          {recs.length === 0 && (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No security issues found — cluster is hardened</Typography>
          )}
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.sev ?? 'info'} sx={{ width: '100%' }}>{toast?.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default SecurityRecommendations;
