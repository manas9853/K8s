import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Typography, CircularProgress, Alert, Stack, Tooltip, Collapse } from '@mui/material';
import {
  BugReport as BugIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  Warning as WarnIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Shield as ShieldIcon,
  Refresh as RefreshIcon,
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
  clean:    { fg: '#4ade80', bg: '#0d2d1a' },
  riskColor: (r: string) => {
    if (r === 'critical') return '#f87171';
    if (r === 'high')     return '#f59e0b';
    if (r === 'medium')   return '#60a5fa';
    if (r === 'low')      return '#4ade80';
    return '#4ade80'; // clean
  },
  riskBg: (r: string) => {
    if (r === 'critical') return '#2d1515';
    if (r === 'high')     return '#2d200a';
    if (r === 'medium')   return '#0d1f3c';
    return '#0d2d1a';
  },
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

const SIGNAL_LABEL: Record<string, string> = {
  allow_priv_esc: 'Priv Escalation',
  run_as_root:    'Root UID',
  writable_root:  'Writable FS',
  no_limits:      'No Limits',
  mem_pressure:   'Mem >90%',
};

/* ── Interfaces ─────────────────────────────────────────────────────── */
interface Vuln {
  vuln_id: string; pkg_name: string;
  installed_version: string; fixed_version: string;
  severity: string; title: string; description: string;
  cvss_score: number; has_fix: boolean; primary_url: string;
}
interface ImageResult {
  image: string; image_name: string; image_tag: string;
  registry: string; base_image: string | null;
  risk_level: string; scan_status: string; scan_mode?: string;
  total_vulnerabilities: number; trivy_vulns?: number; signal_vulns?: number;
  critical: number; high: number; medium: number; low: number;
  patchable: number; vulnerabilities: Vuln[];
  pods_using_image: string[]; namespaces: string[];
  signals: string[];
}

/* ── CVSS pill ──────────────────────────────────────────────────────── */
const CVSSPill: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 9 ? '#f87171' : score >= 7 ? '#f59e0b' : score >= 4 ? '#60a5fa' : '#4ade80';
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:0.4,
      px:0.8, py:0.15, borderRadius:0.5, bgcolor:`${color}18`, border:`1px solid ${color}40` }}>
      <Box sx={{ width:6, height:6, borderRadius:'50%', bgcolor:color }} />
      <Typography sx={{ color, fontWeight:700, fontSize:11 }}>{score.toFixed(1)}</Typography>
    </Box>
  );
};

/* ── Risk badge ─────────────────────────────────────────────────────── */
const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => {
  const fg = T.riskColor(risk); const bg = T.riskBg(risk);
  return (
    <Box sx={{ display:'inline-block', px:1, py:0.2, borderRadius:0.5, bgcolor:bg, border:`1px solid ${fg}40` }}>
      <Typography sx={{ color:fg, fontWeight:700, fontSize:10, textTransform:'uppercase' }}>{risk}</Typography>
    </Box>
  );
};

/* ── Vuln table (inside expandable row) ────────────────────────────── */
const VulnTable: React.FC<{ vulns: Vuln[] }> = ({ vulns }) => {
  const sorted = useMemo(() =>
    [...vulns].sort((a,b) => {
      const order: Record<string,number> = {CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
      return (order[a.severity]??4) - (order[b.severity]??4) || b.cvss_score - a.cvss_score;
    }), [vulns]);

  if (!sorted.length) return (
    <Box p={2} display="flex" alignItems="center" gap={1}>
      <ShieldIcon sx={{ color:T.low.fg, fontSize:16 }} />
      <Typography sx={{ color:T.low.fg, fontSize:12 }}>No vulnerabilities detected.</Typography>
    </Box>
  );

  return (
    <Box sx={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${T.border}` }}>
            {['CVE ID','Sev','CVSS','Signal','Title / Fix'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'6px 10px', fontSize:11,
                color:T.muted, fontWeight:600, whiteSpace:'nowrap', background:T.bg }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((v, i) => {
            const fg = T.sevColor(v.severity); const bg = T.sevBg(v.severity);
            return (
              <tr key={i} style={{ borderBottom:`1px solid ${T.border}30`, background: i%2===0 ? T.card : T.bg }}>
                <td style={{ padding:'6px 10px' }}>
                  <a href={v.primary_url} target="_blank" rel="noopener noreferrer"
                    style={{ color:fg, fontWeight:700, fontSize:11, fontFamily:'monospace', textDecoration:'none' }}>
                    {v.vuln_id}
                  </a>
                </td>
                <td style={{ padding:'6px 10px' }}>
                  <Box sx={{ display:'inline-block', px:0.8, py:0.1, borderRadius:0.4, bgcolor:bg, border:`1px solid ${fg}40` }}>
                    <Typography sx={{ color:fg, fontWeight:700, fontSize:10, textTransform:'uppercase' }}>{v.severity}</Typography>
                  </Box>
                </td>
                <td style={{ padding:'6px 10px' }}>
                  {v.cvss_score > 0 ? <CVSSPill score={v.cvss_score} /> : <Typography sx={{ color:T.muted, fontSize:11 }}>—</Typography>}
                </td>
                <td style={{ padding:'6px 10px' }}>
                  <Typography sx={{ color:T.muted, fontSize:11 }}>
                    {SIGNAL_LABEL[v.pkg_name] ?? v.pkg_name}
                  </Typography>
                </td>
                <td style={{ padding:'6px 10px', maxWidth:340 }}>
                  <Tooltip title={v.description} placement="top"
                    componentsProps={{ tooltip:{ sx:{ bgcolor:T.card, color:T.text, border:`1px solid ${T.border}`, fontSize:11, maxWidth:360 } } }}>
                    <Typography sx={{ color:T.text, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:320, cursor:'help' }}>
                      {v.title}
                    </Typography>
                  </Tooltip>
                  {v.fixed_version && (
                    <Typography sx={{ color:T.low.fg, fontSize:10, mt:0.3 }}>
                      Fix: {v.fixed_version}
                    </Typography>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
};

/* ── Expandable image row ───────────────────────────────────────────── */
const ImageRow: React.FC<{ img: ImageResult }> = ({ img }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const fg = T.riskColor(img.risk_level);

  return (
    <>
      {/* Main row */}
      <tr style={{ borderBottom:`1px solid ${T.border}`, cursor:'pointer',
        background: open ? `${fg}08` : 'transparent' }}
        onClick={() => setOpen(o => !o)}>
        {/* Expand chevron */}
        <td style={{ padding:'8px 8px 8px 12px', width:28 }}>
          {open
            ? <ExpandLessIcon sx={{ color:T.muted, fontSize:16 }} />
            : <ExpandMoreIcon sx={{ color:T.muted, fontSize:16 }} />}
        </td>
        {/* Image name */}
        <td style={{ padding:'8px 6px', maxWidth:280 }}>
          <Tooltip title={img.image}
            componentsProps={{ tooltip:{ sx:{ bgcolor:T.card, color:T.text, border:`1px solid ${T.border}`, fontSize:11 } } }}>
            <Typography sx={{ color:T.text, fontSize:12, fontWeight:600, fontFamily:'monospace',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 }}>
              {img.image_name.split('/').pop() ?? img.image_name}
            </Typography>
          </Tooltip>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography sx={{ color:T.muted, fontSize:10, fontFamily:'monospace' }}>{img.image_tag}</Typography>
            {img.scan_mode === 'trivy+signals' && (
              <Box sx={{ px:0.5, py:0.05, borderRadius:0.3, bgcolor:`${T.accent}20`, border:`1px solid ${T.accent}40` }}>
                <Typography sx={{ color:T.accent, fontSize:9, fontWeight:700 }}>TRIVY</Typography>
              </Box>
            )}
          </Box>
        </td>
        {/* Risk */}
        <td style={{ padding:'8px 6px' }}><RiskBadge risk={img.risk_level} /></td>
        {/* Severity counts */}
        <td style={{ padding:'8px 6px', textAlign:'center' }}>
          {img.critical > 0
            ? <Box sx={{ display:'inline-block', px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.critical.bg }}>
                <Typography sx={{ color:T.critical.fg, fontWeight:700, fontSize:12 }}>{img.critical}</Typography>
              </Box>
            : <Typography sx={{ color:T.border, fontSize:12 }}>—</Typography>}
        </td>
        <td style={{ padding:'8px 6px', textAlign:'center' }}>
          {img.high > 0
            ? <Box sx={{ display:'inline-block', px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.high.bg }}>
                <Typography sx={{ color:T.high.fg, fontWeight:700, fontSize:12 }}>{img.high}</Typography>
              </Box>
            : <Typography sx={{ color:T.border, fontSize:12 }}>—</Typography>}
        </td>
        <td style={{ padding:'8px 6px', textAlign:'center' }}>
          {img.medium > 0
            ? <Typography sx={{ color:T.medium.fg, fontSize:12, fontWeight:600 }}>{img.medium}</Typography>
            : <Typography sx={{ color:T.border, fontSize:12 }}>—</Typography>}
        </td>
        <td style={{ padding:'8px 6px', textAlign:'center' }}>
          {img.patchable > 0
            ? <Box sx={{ display:'inline-block', px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.low.bg }}>
                <Typography sx={{ color:T.low.fg, fontSize:12 }}>{img.patchable}</Typography>
              </Box>
            : <Typography sx={{ color:T.border, fontSize:12 }}>—</Typography>}
        </td>
        {/* Signals */}
        <td style={{ padding:'8px 6px' }}>
          <Box display="flex" gap={0.4} flexWrap="wrap">
            {img.signals.slice(0, 3).map(s => (
              <Box key={s} sx={{ px:0.6, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                <Typography sx={{ color:T.muted, fontSize:10 }}>{SIGNAL_LABEL[s] ?? s}</Typography>
              </Box>
            ))}
            {img.signals.length > 3 && (
              <Typography sx={{ color:T.muted, fontSize:10 }}>+{img.signals.length - 3}</Typography>
            )}
          </Box>
        </td>
        {/* Registry */}
        <td style={{ padding:'8px 6px' }}>
          <Typography sx={{ color:T.muted, fontSize:11, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {img.registry}
          </Typography>
        </td>
        {/* Namespaces */}
        <td style={{ padding:'8px 6px' }}>
          <Typography sx={{ color:T.muted, fontSize:11, whiteSpace:'nowrap' }}>
            {img.namespaces.slice(0,2).join(', ')}
            {img.namespaces.length > 2 && ` +${img.namespaces.length - 2}`}
          </Typography>
        </td>
        {/* Pods */}
        <td style={{ padding:'8px 6px', textAlign:'center' }}>
          <Typography sx={{ color:T.muted, fontSize:12 }}>{img.pods_using_image.length}</Typography>
        </td>
      </tr>
      {/* Expanded vuln detail */}
      {open && (
        <tr style={{ background:T.bg }}>
          <td colSpan={11} style={{ padding:0, borderBottom:`1px solid ${T.border}` }}>
            <Box sx={{ borderTop:`1px solid ${T.border}` }}>
              {img.vulnerabilities.length > 0 && (
                <Box p={1} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                  <WarnIcon sx={{ color:fg, fontSize:14 }} />
                  <Typography sx={{ color:fg, fontSize:12, fontWeight:600 }}>
                    {img.total_vulnerabilities} finding{img.total_vulnerabilities !== 1 ? 's' : ''} · {img.patchable} patchable
                  </Typography>
                  {img.scan_mode === 'trivy+signals' && (
                    <Box sx={{ display:'flex', gap:0.5 }}>
                      <Box sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:`${T.accent}18`, border:`1px solid ${T.accent}40` }}>
                        <Typography sx={{ color:T.accent, fontSize:10 }}>Trivy: {img.trivy_vulns ?? 0}</Typography>
                      </Box>
                      <Box sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                        <Typography sx={{ color:T.muted, fontSize:10 }}>Signals: {img.signal_vulns ?? 0}</Typography>
                      </Box>
                    </Box>
                  )}
                  <Box sx={{ ml:'auto', display:'flex', gap:0.5 }}>
                    {img.pods_using_image.slice(0,4).map(p => (
                      <Box key={p} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                        <Typography sx={{ color:T.muted, fontSize:10 }}>{p}</Typography>
                      </Box>
                    ))}
                    {img.pods_using_image.length > 4 && (
                      <Typography sx={{ color:T.muted, fontSize:10 }}>+{img.pods_using_image.length-4} pods</Typography>
                    )}
                  </Box>
                </Box>
              )}
              <VulnTable vulns={img.vulnerabilities} />
            </Box>
          </td>
        </tr>
      )}
    </>
  );
};

/* ── Main page ──────────────────────────────────────────────────────── */
const ImageScanning: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string | null>(null);

  const fetchData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/image-scanning${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { /* keep existing data */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]); // eslint-disable-line

  if (loading) return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center"
      minHeight="60vh" gap={2} sx={{ bgcolor:T.bg }}>
      <CircularProgress size={48} sx={{ color:T.accent }} />
      <Typography sx={{ color:T.muted, fontSize:13 }}>Analysing image security posture…</Typography>
    </Box>
  );
  if (!data) return (
    <Box p={3} sx={{ bgcolor:T.bg, minHeight:'100vh' }}>
      <Alert severity="error" sx={{ bgcolor:T.critical.bg, color:T.critical.fg }}>Failed to load image scanning data</Alert>
    </Box>
  );

  const images: ImageResult[] = data.images ?? data.scan_results ?? [];

  const filtered = images.filter(img => {
    const matchText = !search ||
      img.image.toLowerCase().includes(search.toLowerCase()) ||
      img.image_name.toLowerCase().includes(search.toLowerCase()) ||
      img.namespaces.some(n => n.toLowerCase().includes(search.toLowerCase()));
    const matchRisk = !riskFilter || img.risk_level === riskFilter;
    return matchText && matchRisk;
  });

  const totalHigh   = images.reduce((s,i) => s + (i.high   ?? 0), 0);
  const totalMed    = images.reduce((s,i) => s + (i.medium ?? 0), 0);
  const totalVulns  = images.reduce((s,i) => s + (i.total_vulnerabilities ?? 0), 0);
  const totalPatch  = images.reduce((s,i) => s + (i.patchable ?? 0), 0);

  // Risk band counts
  const bandCounts = images.reduce((acc, img) => {
    acc[img.risk_level] = (acc[img.risk_level] ?? 0) + 1; return acc;
  }, {} as Record<string,number>);

  return (
    <Box sx={{ bgcolor:T.bg, minHeight:'100vh', p:3, color:T.text }}>

      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BugIcon sx={{ fontSize:36, color:T.accent }} />
          <Box>
            <Typography sx={{ fontSize:22, fontWeight:700, color:T.text }}>Image Scanning</Typography>
            <Typography sx={{ fontSize:12, color:T.muted }}>
              {data.scanner === 'trivy+signals' ? `Trivy CVEs (${data.trivy_scanned ?? 0} images) + signal analysis` : 'Signal-based analysis'} · {images.length} images · {data.scanned} assessed ·
              last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : '—'}
            </Typography>
          </Box>
        </Box>
        <Box onClick={() => fetchData(true)}
          sx={{ display:'flex', alignItems:'center', gap:0.5, px:1.5, py:0.6, borderRadius:1,
            bgcolor:T.card, border:`1px solid ${T.border}`, cursor:'pointer', '&:hover':{ border:`1px solid ${T.accent}` } }}>
          <RefreshIcon sx={{ color:T.muted, fontSize:16,
            animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          <Typography sx={{ color:T.muted, fontSize:12 }}>Refresh</Typography>
        </Box>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:1.5, mb:3 }}>
        {([
          { label:'Total Images',   count: images.length,              fg:T.accent,       bg:T.card },
          { label:'High Risk',      count: data.high_images ?? 0,      fg:T.high.fg,      bg:T.high.bg },
          { label:'Medium Risk',    count: bandCounts['medium'] ?? 0,  fg:T.medium.fg,    bg:T.medium.bg },
          { label:'Clean',          count: data.clean_images ?? 0,     fg:T.low.fg,       bg:T.low.bg },
          { label:'Total Findings', count: totalVulns,                 fg:'#a78bfa',      bg:'#1a1030' },
          { label:'Patchable',      count: totalPatch,                 fg:'#34d399',      bg:'#0d2d1a' },
        ] as Array<{label:string;count:number;fg:string;bg:string}>).map(({ label, count, fg, bg }) => (
          <Box key={label} sx={{ bgcolor:bg, border:`1px solid ${fg}30`, borderRadius:2, p:1.5 }}>
            <Typography sx={{ fontSize:10, color:fg, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Typography>
            <Typography sx={{ fontSize:28, fontWeight:800, color:fg, lineHeight:1.1, mt:0.3 }}>{count}</Typography>
          </Box>
        ))}
      </Box>

      {/* High-risk spotlight */}
      {(data.high_images ?? 0) > 0 && (
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.high.fg}40`, borderRadius:2, p:2.5, mb:3 }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <WarnIcon sx={{ color:T.high.fg, fontSize:18 }} />
            <Typography sx={{ fontSize:13, fontWeight:700, color:T.high.fg }}>High Risk Images</Typography>
            <Box sx={{ px:0.8, py:0.15, borderRadius:0.5, bgcolor:T.high.bg }}>
              <Typography sx={{ color:T.high.fg, fontWeight:700, fontSize:12 }}>{data.high_images}</Typography>
            </Box>
            <Typography sx={{ fontSize:11, color:T.muted, ml:'auto' }}>
              Click any row to expand findings
            </Typography>
          </Box>
          <Stack spacing={1}>
            {images.filter(i => i.risk_level === 'high').slice(0,5).map((img,idx) => (
              <Box key={idx} sx={{ p:1.5, borderRadius:1.5, bgcolor:T.bg, border:`1px solid ${T.border}`,
                display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:1, flexWrap:'wrap' }}>
                <Box flex={1}>
                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography sx={{ color:T.high.fg, fontWeight:700, fontSize:12, fontFamily:'monospace' }}>
                      {img.image_name.split('/').pop()}:{img.image_tag}
                    </Typography>
                    <RiskBadge risk={img.risk_level} />
                    <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:`${T.accent}18` }}>
                      <Typography sx={{ color:T.accent, fontSize:11 }}>{img.namespaces[0]}</Typography>
                    </Box>
                  </Box>
                  <Box display="flex" gap={0.5} mt={0.6} flexWrap="wrap">
                    {img.signals.map(s => (
                      <Box key={s} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.high.bg, border:`1px solid ${T.high.fg}30` }}>
                        <Typography sx={{ color:T.high.fg, fontSize:10 }}>{SIGNAL_LABEL[s] ?? s}</Typography>
                      </Box>
                    ))}
                    <Typography sx={{ color:T.muted, fontSize:10, alignSelf:'center' }}>
                      {img.pods_using_image.length} pod{img.pods_using_image.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Box>
                <Box onClick={() => navigate('/patch-recommendations')}
                  sx={{ px:1.5, py:0.5, borderRadius:1, bgcolor:`${T.high.fg}18`, border:`1px solid ${T.high.fg}50`,
                    cursor:'pointer', '&:hover':{ bgcolor:`${T.high.fg}28` }, flexShrink:0 }}>
                  <Typography sx={{ color:T.high.fg, fontSize:11, fontWeight:700 }}>View Patches</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Filter bar */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:2, mb:2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <Box sx={{ display:'flex', alignItems:'center', gap:1, px:1.5, py:0.6, borderRadius:1,
            bgcolor:T.bg, border:`1px solid ${T.border}`, minWidth:260 }}>
            <SearchIcon sx={{ color:T.muted, fontSize:16 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search image, namespace…"
              style={{ background:'none', border:'none', outline:'none', color:T.text,
                fontSize:13, width:'100%', fontFamily:'inherit' }} />
          </Box>
          <Box display="flex" gap={0.8} flexWrap="wrap">
            {([null,'high','medium','low','clean'] as Array<string|null>).map(r => {
              const fg = r ? T.riskColor(r) : T.muted;
              const active = riskFilter === r;
              return (
                <Box key={r ?? 'all'} onClick={() => setRiskFilter(r)}
                  sx={{ px:1.5, py:0.4, borderRadius:1, cursor:'pointer',
                    bgcolor: active ? `${fg}20` : T.bg, border:`1px solid ${active ? fg : T.border}`,
                    '&:hover':{ border:`1px solid ${fg}` } }}>
                  <Typography sx={{ color:fg, fontSize:12, fontWeight:active ? 700 : 400, textTransform:'capitalize' }}>
                    {r ?? 'All'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Typography sx={{ fontSize:12, color:T.muted, ml:'auto' }}>
            {filtered.length} / {images.length} images · click row to expand
          </Typography>
        </Box>
      </Box>

      {/* Main table */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, overflow:'hidden' }}>
        <Box sx={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                <th style={{ width:28 }} />
                {['Image','Risk','Crit','High','Med','Patchable','Signals','Registry','Namespaces','Pods'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'10px 6px', fontSize:11,
                    color:T.muted, fontWeight:600, whiteSpace:'nowrap', background:T.bg }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding:'24px 16px' }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <CheckIcon sx={{ color:T.low.fg }} />
                      <Typography sx={{ color:T.low.fg, fontSize:13 }}>No images match the current filter.</Typography>
                    </Box>
                  </td>
                </tr>
              ) : (
                filtered.map((img, i) => <ImageRow key={i} img={img} />)
              )}
            </tbody>
          </table>
        </Box>
      </Box>

      {/* Footer */}
      <Box mt={1.5} display="flex" justifyContent="space-between" alignItems="center">
        <Typography sx={{ fontSize:11, color:T.muted }}>
          Scanner: {data.scanner ?? 'signal-analysis'} ·
          {totalVulns} total findings · {totalPatch} patchable ·
          {totalHigh} high · {totalMed} medium
        </Typography>
        <Typography sx={{ fontSize:11, color:T.muted }}>
          xforce-devops · {new Date(data.last_scan).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default ImageScanning;
// Made with Bob
