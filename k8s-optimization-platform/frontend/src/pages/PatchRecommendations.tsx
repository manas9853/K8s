import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Typography, CircularProgress, Alert, Stack, Tooltip, Collapse } from '@mui/material';
import {
  Build as PatchIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckIcon,
  Warning as WarnIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

/* ── Design tokens ─────────────────────────────────────────────────── */
const T = {
  bg:      '#0f1724',
  card:    '#1e2433',
  border:  '#2a3245',
  text:    '#e8eaf0',
  muted:   '#8892a4',
  accent:  '#3b82d4',
  critical: { fg: '#f87171', bg: '#2d1515' },
  high:     { fg: '#f59e0b', bg: '#2d200a' },
  medium:   { fg: '#60a5fa', bg: '#0d1f3c' },
  low:      { fg: '#4ade80', bg: '#0d2d1a' },
  sevColor: (s: string) => {
    const sl = s.toLowerCase();
    if (sl === 'critical') return '#f87171';
    if (sl === 'high')     return '#f59e0b';
    if (sl === 'medium')   return '#60a5fa';
    return '#4ade80';
  },
  sevBg: (s: string) => {
    const sl = s.toLowerCase();
    if (sl === 'critical') return '#2d1515';
    if (sl === 'high')     return '#2d200a';
    if (sl === 'medium')   return '#0d1f3c';
    return '#0d2d1a';
  },
};

const PRIORITY_COLOR = ['', T.critical.fg, T.high.fg, T.medium.fg, T.low.fg];

interface PatchRec {
  id: string;
  title: string;
  severity: string;
  image: string;
  image_name: string;
  image_tag: string;
  registry: string;
  affected_resources: string[];
  namespaces: string[];
  current_version: string;
  recommended_version: string;
  cve_ids: string[];
  risk_level: string;
  estimated_downtime: string;
  patch_priority: number;
  automated_patch_available: boolean;
  trivy_critical: number;
  trivy_high: number;
  trivy_medium: number;
  trivy_low: number;
  signal_count: number;
  total_findings: number;
  remediation_steps: string[];
  scan_mode: string;
}

interface PatchData {
  recommendations: PatchRec[];
  total_recommendations: number;
  critical_patches: number;
  high_patches: number;
  medium_patches: number;
  low_patches: number;
  automated_patches_available: number;
  last_updated: string;
  scanner: string;
}

/* ── Priority badge ─────────────────────────────────────────────────── */
const PriorityBadge: React.FC<{ priority: number }> = ({ priority }) => {
  const fg = PRIORITY_COLOR[priority] ?? T.muted;
  const labels = ['', 'P1 CRITICAL', 'P2 HIGH', 'P3 MEDIUM', 'P4 LOW'];
  return (
    <Box sx={{ display:'inline-block', px:1, py:0.2, borderRadius:0.5,
      bgcolor:`${fg}18`, border:`1px solid ${fg}40` }}>
      <Typography sx={{ color:fg, fontWeight:700, fontSize:10 }}>{labels[priority] ?? `P${priority}`}</Typography>
    </Box>
  );
};

/* ── Expandable patch card ──────────────────────────────────────────── */
const PatchCard: React.FC<{ rec: PatchRec; index: number }> = ({ rec, index }) => {
  const [open, setOpen] = useState(index < 3); // top 3 open by default
  const fg = T.sevColor(rec.severity);
  const shortName = rec.image_name.split('/').pop() ?? rec.image_name;
  const isTrivy = rec.scan_mode === 'trivy+signals';

  return (
    <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2,
      '&:hover':{ border:`1px solid ${fg}40` } }}>
      {/* Header row — always visible */}
      <Box sx={{ p:2, cursor:'pointer', display:'flex', alignItems:'flex-start',
        justifyContent:'space-between', gap:1 }}
        onClick={() => setOpen(o => !o)}>
        <Box flex={1}>
          {/* Title row */}
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
            <PriorityBadge priority={rec.patch_priority} />
            <Typography sx={{ color:fg, fontWeight:700, fontSize:14, fontFamily:'monospace' }}>
              {shortName}
            </Typography>
            <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
              <Typography sx={{ color:T.muted, fontSize:11, fontFamily:'monospace' }}>{rec.image_tag}</Typography>
            </Box>
            {isTrivy && (
              <Box sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:`${T.accent}20`, border:`1px solid ${T.accent}40` }}>
                <Typography sx={{ color:T.accent, fontSize:9, fontWeight:700 }}>TRIVY</Typography>
              </Box>
            )}
            <Box sx={{ px:0.8, py:0.15, borderRadius:0.4, bgcolor:T.sevBg(rec.severity), border:`1px solid ${fg}40` }}>
              <Typography sx={{ color:fg, fontWeight:700, fontSize:10, textTransform:'uppercase' }}>{rec.severity}</Typography>
            </Box>
          </Box>
          {/* Stats row */}
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <Typography sx={{ fontSize:12, color:T.muted }}>
              {rec.total_findings} findings
            </Typography>
            {rec.trivy_critical > 0 && (
              <Box sx={{ display:'flex', gap:0.3, alignItems:'center' }}>
                <Box sx={{ width:6, height:6, borderRadius:'50%', bgcolor:T.critical.fg }} />
                <Typography sx={{ fontSize:12, color:T.critical.fg, fontWeight:700 }}>{rec.trivy_critical} critical</Typography>
              </Box>
            )}
            {rec.trivy_high > 0 && (
              <Box sx={{ display:'flex', gap:0.3, alignItems:'center' }}>
                <Box sx={{ width:6, height:6, borderRadius:'50%', bgcolor:T.high.fg }} />
                <Typography sx={{ fontSize:12, color:T.high.fg }}>{rec.trivy_high} high</Typography>
              </Box>
            )}
            {rec.trivy_medium > 0 && (
              <Typography sx={{ fontSize:12, color:T.medium.fg }}>{rec.trivy_medium} medium</Typography>
            )}
            {rec.signal_count > 0 && (
              <Typography sx={{ fontSize:12, color:T.muted }}>{rec.signal_count} config signals</Typography>
            )}
            <Typography sx={{ fontSize:12, color:T.muted }}>· {rec.estimated_downtime} downtime</Typography>
            <Typography sx={{ fontSize:12, color:T.muted }}>
              · {rec.namespaces.slice(0,2).join(', ')}{rec.namespaces.length > 2 ? ` +${rec.namespaces.length-2}` : ''}
            </Typography>
          </Box>
        </Box>
        {/* Expand chevron */}
        <Box sx={{ color:T.muted, flexShrink:0, mt:0.3 }}>
          {open ? <ExpandLessIcon sx={{ fontSize:18 }} /> : <ExpandMoreIcon sx={{ fontSize:18 }} />}
        </Box>
      </Box>

      {/* Expanded detail */}
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ px:2, pb:2, borderTop:`1px solid ${T.border}` }}>
          <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', md:'1fr 1fr 1fr' }, gap:2, mt:2 }}>

            {/* Version update */}
            <Box>
              <Typography sx={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:0.5, mb:1 }}>Version Update</Typography>
              <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                <Box sx={{ px:1, py:0.3, borderRadius:0.5, bgcolor:T.critical.bg, border:`1px solid ${T.critical.fg}40` }}>
                  <Typography sx={{ color:T.critical.fg, fontSize:12, fontFamily:'monospace' }}>
                    {rec.current_version}
                  </Typography>
                </Box>
                <Typography sx={{ color:T.muted, fontSize:12 }}>→</Typography>
                <Box sx={{ px:1, py:0.3, borderRadius:0.5, bgcolor:T.low.bg, border:`1px solid ${T.low.fg}40` }}>
                  <Typography sx={{ color:T.low.fg, fontSize:12, fontFamily:'monospace' }}>
                    {rec.recommended_version}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize:11, color:T.muted, mt:1 }}>
                Registry: {rec.registry}
              </Typography>
              <Typography sx={{ fontSize:11, color:T.muted }}>
                Downtime: {rec.estimated_downtime}
              </Typography>
              {rec.automated_patch_available && (
                <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                  <CheckIcon sx={{ color:T.low.fg, fontSize:14 }} />
                  <Typography sx={{ color:T.low.fg, fontSize:11 }}>Automated patch available</Typography>
                </Box>
              )}
            </Box>

            {/* CVE IDs */}
            <Box>
              <Typography sx={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:0.5, mb:1 }}>
                Top CVEs ({rec.cve_ids.length})
              </Typography>
              <Stack spacing={0.4}>
                {rec.cve_ids.slice(0, 6).map(cid => (
                  <Box key={cid} sx={{ px:0.8, py:0.2, borderRadius:0.4, bgcolor:`${fg}15`, display:'inline-block' }}>
                    <Typography sx={{ color:fg, fontSize:11, fontFamily:'monospace' }}>{cid}</Typography>
                  </Box>
                ))}
                {rec.cve_ids.length > 6 && (
                  <Typography sx={{ color:T.muted, fontSize:11 }}>+{rec.cve_ids.length-6} more CVEs</Typography>
                )}
              </Stack>
            </Box>

            {/* Affected pods */}
            <Box>
              <Typography sx={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:0.5, mb:1 }}>
                Affected Pods ({rec.affected_resources.length})
              </Typography>
              <Stack spacing={0.3}>
                {rec.affected_resources.slice(0, 6).map(r => (
                  <Box key={r} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border, display:'inline-block' }}>
                    <Typography sx={{ color:T.muted, fontSize:10, fontFamily:'monospace' }}>{r}</Typography>
                  </Box>
                ))}
                {rec.affected_resources.length > 6 && (
                  <Typography sx={{ color:T.muted, fontSize:11 }}>+{rec.affected_resources.length-6} more</Typography>
                )}
              </Stack>
            </Box>
          </Box>

          {/* Remediation steps */}
          <Box mt={2}>
            <Typography sx={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:0.5, mb:1 }}>
              Remediation Steps
            </Typography>
            <Stack spacing={0.5}>
              {rec.remediation_steps.map((step, si) => (
                <Box key={si} display="flex" gap={1} alignItems="flex-start">
                  <Box sx={{ minWidth:18, height:18, borderRadius:'50%', bgcolor:`${T.accent}20`,
                    border:`1px solid ${T.accent}40`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, mt:0.1 }}>
                    <Typography sx={{ color:T.accent, fontSize:9, fontWeight:700 }}>{si+1}</Typography>
                  </Box>
                  <Typography sx={{ color:T.text, fontSize:12, lineHeight:1.5 }}>{step}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

/* ── Main page ──────────────────────────────────────────────────────── */
const PatchRecommendations: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await window.fetch(`${API_BASE_URL}/v1/security/patch-recommendations${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to fetch patch recommendations');
      } finally { setLoading(false); }
    };
    fetch();
  }, [clusterParam]); // eslint-disable-line

  if (loading) return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center"
      minHeight="60vh" gap={2} sx={{ bgcolor:T.bg }}>
      <CircularProgress size={48} sx={{ color:T.accent }} />
      <Typography sx={{ color:T.muted, fontSize:13 }}>Building patch recommendations…</Typography>
    </Box>
  );
  if (error || !data) return (
    <Box p={3} sx={{ bgcolor:T.bg, minHeight:'100vh' }}>
      <Alert severity="error" sx={{ bgcolor:T.critical.bg, color:T.critical.fg }}>{error || 'No data'}</Alert>
    </Box>
  );

  const recs = data.recommendations || [];
  const filtered = recs.filter(r => {
    const matchText = !search ||
      r.image.toLowerCase().includes(search.toLowerCase()) ||
      r.image_name.toLowerCase().includes(search.toLowerCase()) ||
      r.cve_ids.some(c => c.toLowerCase().includes(search.toLowerCase())) ||
      r.namespaces.some(n => n.toLowerCase().includes(search.toLowerCase()));
    const matchSev = !sevFilter || r.severity === sevFilter;
    return matchText && matchSev;
  });

  return (
    <Box sx={{ bgcolor:T.bg, minHeight:'100vh', p:3, color:T.text }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <PatchIcon sx={{ fontSize:36, color:T.accent }} />
        <Box>
          <Typography sx={{ fontSize:22, fontWeight:700, color:T.text }}>Patch Recommendations</Typography>
          <Typography sx={{ fontSize:12, color:T.muted }}>
            {data.scanner === 'trivy+signals' ? 'Trivy CVEs + signal analysis' : 'Signal analysis'} ·
            {' '}{recs.length} images need patching ·
            {' '}{data.automated_patches_available} automated ·
            {' '}updated {new Date(data.last_updated).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:1.5, mb:3 }}>
        {([
          { label:'Total',     count: data.total_recommendations,      fg:T.accent,       bg:T.card },
          { label:'Critical',  count: data.critical_patches,           fg:T.critical.fg,  bg:T.critical.bg },
          { label:'High',      count: data.high_patches,               fg:T.high.fg,      bg:T.high.bg },
          { label:'Medium',    count: data.medium_patches,             fg:T.medium.fg,    bg:T.medium.bg },
          { label:'Automated', count: data.automated_patches_available, fg:'#34d399',     bg:'#0d2d1a' },
        ] as Array<{label:string;count:number;fg:string;bg:string}>).map(({ label, count, fg, bg }) => (
          <Box key={label} sx={{ bgcolor:bg, border:`1px solid ${fg}30`, borderRadius:2, p:2, cursor:'pointer',
            '&:hover':{ border:`1px solid ${fg}` } }}
            onClick={() => label !== 'Total' && label !== 'Automated'
              ? setSevFilter(sevFilter === label.toLowerCase() ? null : label.toLowerCase())
              : setSevFilter(null)}>
            <Typography sx={{ fontSize:10, color:fg, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Typography>
            <Typography sx={{ fontSize:32, fontWeight:800, color:fg, lineHeight:1.1, mt:0.3 }}>{count}</Typography>
          </Box>
        ))}
      </Box>

      {/* Filter bar */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:2, mb:3 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <Box sx={{ display:'flex', alignItems:'center', gap:1, px:1.5, py:0.6, borderRadius:1,
            bgcolor:T.bg, border:`1px solid ${T.border}`, minWidth:280 }}>
            <SearchIcon sx={{ color:T.muted, fontSize:16 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search image, CVE, namespace…"
              style={{ background:'none', border:'none', outline:'none', color:T.text,
                fontSize:13, width:'100%', fontFamily:'inherit' }} />
          </Box>
          <Box display="flex" gap={0.8} flexWrap="wrap">
            {([null,'critical','high','medium','low'] as Array<string|null>).map(s => {
              const fg = s ? T.sevColor(s) : T.muted;
              const active = sevFilter === s;
              return (
                <Box key={s ?? 'all'} onClick={() => setSevFilter(s)}
                  sx={{ px:1.5, py:0.4, borderRadius:1, cursor:'pointer',
                    bgcolor: active ? `${fg}20` : T.bg, border:`1px solid ${active ? fg : T.border}`,
                    '&:hover':{ border:`1px solid ${fg}` } }}>
                  <Typography sx={{ color:fg, fontSize:12, fontWeight:active ? 700 : 400, textTransform:'capitalize' }}>
                    {s ?? 'All'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Typography sx={{ fontSize:12, color:T.muted, ml:'auto' }}>
            {filtered.length} / {recs.length} recommendations · click card to expand
          </Typography>
        </Box>
      </Box>

      {/* Recommendation cards */}
      {filtered.length === 0 ? (
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:3,
          display:'flex', alignItems:'center', gap:1 }}>
          <CheckIcon sx={{ color:T.low.fg }} />
          <Typography sx={{ color:T.low.fg, fontSize:13 }}>No recommendations match the filter.</Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((rec, i) => <PatchCard key={rec.id} rec={rec} index={i} />)}
        </Stack>
      )}

      {/* Footer */}
      <Box mt={2} display="flex" justifyContent="space-between">
        <Typography sx={{ fontSize:11, color:T.muted }}>
          Scanner: {data.scanner ?? 'trivy+signals'} ·
          {data.total_recommendations} images · {data.automated_patches_available} automated patches
        </Typography>
        <Typography sx={{ fontSize:11, color:T.muted }}>
          xforce-devops · {new Date(data.last_updated).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default PatchRecommendations;
// Made with Bob
