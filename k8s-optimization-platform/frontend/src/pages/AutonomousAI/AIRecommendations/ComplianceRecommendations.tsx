import React, { useState, useEffect, useCallback } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box, Typography, Chip, CircularProgress,
  IconButton, Tooltip, Snackbar, Alert, Button, Tabs, Tab, Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import GavelIcon from '@mui/icons-material/Gavel';
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

const FW_COLOR: Record<string, string> = {
  'CIS Benchmark': '#3b82f6',
  'PCI DSS':       '#d29922',
  'ISO 27001':     '#a371f7',
  'GDPR':          '#3fb950',
  'HIPAA':         '#f8927a',
};
const PRIORITY_COLOR: Record<string, string> = {
  high:   '#f85149',
  medium: '#d29922',
  low:    '#3fb950',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Rec {
  id: string;
  priority: string;
  framework: string;
  control: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
  confidence: number;
  affected_resources: number;
  compliance_gap: string;
}
interface CompliancePayload {
  category: string;
  cluster_name: string;
  total_recommendations: number;
  frameworks: Record<string, number>;
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

// ─── Framework score ring ─────────────────────────────────────────────────────
const FwScoreRing: React.FC<{ score: number; label: string; color: string }> = ({ score, label, color }) => {
  const r = 28; const c = 2 * Math.PI * r;
  const fill = c - (c * score) / 100;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={r} fill="none" stroke={DK.border} strokeWidth={5} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={c} strokeDashoffset={fill}
          strokeLinecap="round" transform="rotate(-90 36 36)" />
        <text x={36} y={40} textAnchor="middle" fill={color} fontSize={14} fontWeight={700}>{score}%</text>
      </svg>
      <Typography sx={{ color: DK.muted, fontSize: '0.65rem', textAlign: 'center', maxWidth: 60 }}>{label}</Typography>
    </Box>
  );
};

// ─── Rec card ─────────────────────────────────────────────────────────────────
const RecCard: React.FC<{
  rec: Rec;
  expanded: boolean;
  applying: boolean;
  done: boolean;
  onExpand: () => void;
  onApply: () => void;
}> = ({ rec, expanded, applying, done, onExpand, onApply }) => {
  const color = PRIORITY_COLOR[rec.priority] ?? DK.muted;
  const fwColor = FW_COLOR[rec.framework] ?? '#58a6ff';
  return (
    <Box sx={{
      bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderLeft: `3px solid ${fwColor}`,
      borderRadius: 2, mb: 1.5, opacity: done ? 0.45 : 1, transition: 'opacity 0.3s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer' }} onClick={onExpand}>
        <GavelIcon sx={{ fontSize: 18, color: fwColor, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.3 }}>
            <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.87rem' }}>{rec.title}</Typography>
            <Chip label={rec.control} size="small" sx={{ bgcolor: fwColor + '22', color: fwColor, fontSize: '0.65rem', fontFamily: 'monospace' }} />
            <Chip label={rec.priority.toUpperCase()} size="small"
              sx={{ bgcolor: color + '22', color, fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${color}44` }} />
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
              sx={{ borderColor: fwColor, color: fwColor, textTransform: 'none', fontSize: '0.75rem',
                    '&:hover': { bgcolor: fwColor + '22' } }}>
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
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mb: 1.25 }}>{rec.description}</Typography>
          <Box sx={{ bgcolor: '#1a1230', border: `1px solid ${fwColor}33`, borderRadius: 1, p: 1.25, mb: 1 }}>
            <Typography sx={{ color: fwColor, fontSize: '0.72rem', fontWeight: 600, mb: 0.25 }}>Compliance Gap</Typography>
            <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>{rec.compliance_gap}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip label={`effort: ${rec.effort}`} size="small" sx={{ bgcolor: DK.surface, color: DK.muted, fontSize: '0.65rem', border: `1px solid ${DK.border}` }} />
            <Chip label={`confidence: ${Math.round((rec.confidence || 0) * 100)}%`} size="small" sx={{ bgcolor: DK.surface, color: DK.muted, fontSize: '0.65rem', border: `1px solid ${DK.border}` }} />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ComplianceRecommendations: React.FC = () => {
  const { clusterParam, activeClusterName } = useActiveCluster();
  const [data, setData] = useState<CompliancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/autonomous-ai/recommendations/compliance${clusterParam}`);
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
          issue_type: 'compliance', cpu_request: 0, memory_request_mb: 0 }),
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
  const frameworks = Object.keys(data?.frameworks ?? {});
  const activeFramework = frameworks[tab] ?? '';
  const activeRecs = recs.filter(r => r.framework === activeFramework);
  // Compute a pseudo audit-readiness score per framework: 100 - (violations * 15)
  const fwScore = (fw: string): number => {
    const total = data?.frameworks?.[fw] ?? 0;
    return Math.max(0, Math.min(100, 100 - total * 15));
  };

  return (
    <Box sx={{ bgcolor: DK.bg, minHeight: '100vh', p: 3 }}>
      {/* Audit Readiness Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: DK.text, fontWeight: 700 }}>Compliance Recommendations</Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', mt: 0.25 }}>
            {activeClusterName} — Audit Readiness Report
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{ color: DK.muted }}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && (
        <>
          {/* Framework scorecard banner */}
          {frameworks.length > 0 && (
            <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5, mb: 3 }}>
              <Typography sx={{ color: DK.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, mb: 2 }}>
                Framework Audit Readiness
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {frameworks.map(fw => (
                  <FwScoreRing key={fw} score={fwScore(fw)} label={fw} color={FW_COLOR[fw] ?? '#58a6ff'} />
                ))}
                <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                  <Typography sx={{ color: DK.text, fontSize: '1.25rem', fontWeight: 700 }}>{data.total_recommendations}</Typography>
                  <Typography sx={{ color: DK.muted, fontSize: '0.72rem' }}>total violations</Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Framework tabs */}
          {frameworks.length > 0 && (
            <Box sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, mb: 3 }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)}
                variant="scrollable" scrollButtons="auto"
                sx={{ '& .MuiTab-root': { color: DK.muted, textTransform: 'none', fontWeight: 600, minWidth: 120 },
                      '& .Mui-selected': { color: DK.text },
                      '& .MuiTabs-indicator': { bgcolor: FW_COLOR[activeFramework] ?? '#58a6ff' },
                      borderBottom: `1px solid ${DK.border}` }}>
                {frameworks.map((fw, i) => (
                  <Tab key={fw} label={`${fw} (${data.frameworks[fw] ?? 0})`} />
                ))}
              </Tabs>
            </Box>
          )}

          {/* Active framework recs */}
          {activeRecs.length === 0 ? (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>No violations for {activeFramework}</Typography>
          ) : (
            activeRecs.map(rec => (
              <RecCard key={rec.id} rec={rec}
                expanded={expanded === rec.id}
                applying={applying[rec.id] ?? false}
                done={done[rec.id] ?? false}
                onExpand={() => setExpanded(prev => prev === rec.id ? null : rec.id)}
                onApply={() => handleApply(rec)}
              />
            ))
          )}

          {recs.length === 0 && (
            <Typography sx={{ color: DK.muted, textAlign: 'center', mt: 4 }}>All compliance checks passed</Typography>
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

export default ComplianceRecommendations;
