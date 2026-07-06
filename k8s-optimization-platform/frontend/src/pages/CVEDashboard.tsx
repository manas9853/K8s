import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Typography, CircularProgress, Alert, Stack, Tooltip } from '@mui/material';
import {
  BugReport as BugIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Shield as ShieldIcon,
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
    if (s === 'critical') return '#f87171';
    if (s === 'high')     return '#f59e0b';
    if (s === 'medium')   return '#60a5fa';
    return '#4ade80';
  },
  sevBg: (s: string) => {
    if (s === 'critical') return '#2d1515';
    if (s === 'high')     return '#2d200a';
    if (s === 'medium')   return '#0d1f3c';
    return '#0d2d1a';
  },
};

/* ── Signal labels ──────────────────────────────────────────────────── */
const SIGNAL_META: Record<string, { label: string; icon: string }> = {
  writable_root:  { label: 'Writable Root FS',    icon: '🗂' },
  no_limits:      { label: 'No Resource Limits',  icon: '⚡' },
  mem_pressure:   { label: 'Memory Pressure >90%', icon: '🔥' },
  stale_secret:   { label: 'Stale Secrets',        icon: '🔑' },
  run_as_root:    { label: 'Running as Root',      icon: '👑' },
  allow_priv_esc: { label: 'Priv Escalation',      icon: '🚨' },
  risk_high:      { label: 'High Risk Pod',        icon: '🛑' },
  risk_medium:    { label: 'Medium Risk Pod',      icon: '⚠️' },
};

/* ── Interfaces ─────────────────────────────────────────────────────── */
interface CVEItem {
  cve_id: string; severity: string; cvss_score: number;
  title: string; description: string;
  affected_images: string[]; affected_pods: string[];
  namespace: string; namespaces?: string[];
  cluster: string; published_date: string;
  patch_available: boolean; remediation?: string;
  signal?: string;
}
interface NsSummary {
  namespace: string; critical: number; high: number; medium: number; low: number; total: number;
}
interface SigSummary { signal: string; count: number; }
interface CVEDashboardData {
  cves: CVEItem[];
  total_cves: number; critical_cves: number; high_cves: number;
  medium_cves: number; low_cves: number; patchable_cves: number; unpatchable_cves: number;
  last_scan: string;
  summary_by_namespace: NsSummary[];
  summary_by_signal: SigSummary[];
}

/* ── CVSS score pill ────────────────────────────────────────────────── */
const CVSSPill: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 9 ? '#f87171' : score >= 7 ? '#f59e0b' : score >= 4 ? '#60a5fa' : '#4ade80';
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:0.4,
      px:0.8, py:0.1, borderRadius:0.5, bgcolor:`${color}18`, border:`1px solid ${color}40` }}>
      <Box sx={{ width:7, height:7, borderRadius:'50%', bgcolor: color }} />
      <Typography sx={{ color, fontWeight:700, fontSize:12 }}>{score?.toFixed(1)}</Typography>
    </Box>
  );
};

/* ── Severity chip ──────────────────────────────────────────────────── */
const SevChip: React.FC<{ sev: string }> = ({ sev }) => {
  const fg = T.sevColor(sev); const bg = T.sevBg(sev);
  return (
    <Box sx={{ display:'inline-block', px:1, py:0.15, borderRadius:0.5, bgcolor:bg, border:`1px solid ${fg}40` }}>
      <Typography sx={{ color:fg, fontWeight:700, fontSize:11, textTransform:'uppercase' }}>{sev}</Typography>
    </Box>
  );
};

/* ── Main component ─────────────────────────────────────────────────── */
const CVEDashboard: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<CVEDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<string | null>(null);
  const [sigFilter, setSigFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 300_000);
    return () => clearInterval(i);
  }, [clusterParam]); // eslint-disable-line

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/cve-dashboard${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch CVE data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: T.bg }}>
      <CircularProgress size={48} sx={{ color: T.accent }} />
    </Box>
  );
  if (error || !data) return (
    <Box p={3} sx={{ bgcolor: T.bg, minHeight: '100vh' }}>
      <Alert severity="error" sx={{ bgcolor: T.critical.bg, color: T.critical.fg }}>{error || 'No data'}</Alert>
    </Box>
  );

  const filtered = data.cves.filter(c => {
    const matchText = !search ||
      c.cve_id.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.namespace.toLowerCase().includes(search.toLowerCase());
    const matchSev = !sevFilter || c.severity === sevFilter;
    const matchSig = !sigFilter || c.signal === sigFilter;
    return matchText && matchSev && matchSig;
  });

  const patchPct = data.total_cves > 0 ? Math.round((data.patchable_cves / data.total_cves) * 100) : 0;

  /* highlight highest-severity open findings */
  const topFindings = [...data.cves]
    .filter(c => c.severity === 'high' || c.severity === 'critical')
    .slice(0, 4);

  return (
    <Box sx={{ bgcolor: T.bg, minHeight: '100vh', p: 3, color: T.text }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <BugIcon sx={{ fontSize: 36, color: T.accent }} />
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.text }}>CVE Dashboard</Typography>
          <Typography sx={{ fontSize: 12, color: T.muted }}>
            Last scan: {new Date(data.last_scan).toLocaleString()} · xforce-devops
          </Typography>
        </Box>
      </Box>

      {/* Stat cards row */}
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:1.5, mb:3 }}>
        {([
          { label:'Critical', count: data.critical_cves,  sub:'Immediate action',   ...T.critical, key:'critical' },
          { label:'High',     count: data.high_cves,       sub:'Patch this week',    ...T.high,     key:'high' },
          { label:'Medium',   count: data.medium_cves,     sub:'Plan remediation',   ...T.medium,   key:'medium' },
          { label:'Low',      count: data.low_cves,        sub:'Monitor',            ...T.low,      key:'low' },
          { label:'Patchable',count: data.patchable_cves,  sub:`${patchPct}% of total`, fg:'#a78bfa', bg:'#1a1030', key:null },
        ] as Array<{label:string;count:number;sub:string;fg:string;bg:string;key:string|null}>).map(({ label, count, sub, fg, bg, key }) => (
          <Box key={label}
            onClick={() => setSevFilter(sevFilter === key ? null : key)}
            sx={{ bgcolor: sevFilter === key ? `${fg}25` : T.card,
              border:`1px solid ${sevFilter===key ? fg : T.border}`,
              borderRadius:2, p:2, cursor:'pointer',
              '&:hover':{ border:`1px solid ${fg}`, opacity:0.9 } }}>
            <Typography sx={{ fontSize:11, color:fg, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Typography>
            <Typography sx={{ fontSize:32, fontWeight:800, color:fg, lineHeight:1.1, mt:0.3 }}>{count}</Typography>
            <Typography sx={{ fontSize:11, color:T.muted, mt:0.3 }}>{sub}</Typography>
          </Box>
        ))}
      </Box>

      {/* Two column: signal breakdown + namespace heat */}
      <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', md:'1fr 1fr' }, gap:2, mb:3 }}>

        {/* Signal breakdown */}
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:2.5 }}>
          <Typography sx={{ fontSize:13, fontWeight:700, color:T.text, mb:0.4 }}>Findings by Signal</Typography>
          <Typography sx={{ fontSize:11, color:T.muted, mb:2 }}>Click a signal to filter the CVE table</Typography>
          <Stack spacing={1.2}>
            {data.summary_by_signal.map(({ signal, count }) => {
              const meta = SIGNAL_META[signal] || { label: signal, icon: '●' };
              const pct  = data.total_cves > 0 ? (count / data.total_cves) * 100 : 0;
              const active = sigFilter === signal;
              return (
                <Box key={signal} onClick={() => setSigFilter(active ? null : signal)}
                  sx={{ display:'flex', alignItems:'center', gap:1.5, cursor:'pointer',
                    p:1, borderRadius:1,
                    bgcolor: active ? `${T.accent}18` : 'transparent',
                    border: active ? `1px solid ${T.accent}50` : '1px solid transparent',
                    '&:hover':{ bgcolor:`${T.accent}10` } }}>
                  <Typography sx={{ fontSize:16, minWidth:22 }}>{meta.icon}</Typography>
                  <Box flex={1}>
                    <Typography sx={{ fontSize:12, color:T.text, fontWeight:600 }}>{meta.label}</Typography>
                    <Box sx={{ mt:0.4, height:5, borderRadius:3, bgcolor:T.border, overflow:'hidden' }}>
                      <Box sx={{ width:`${pct}%`, height:'100%', borderRadius:3, bgcolor:T.accent }} />
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize:13, fontWeight:700, color:T.accent, minWidth:24, textAlign:'right' }}>{count}</Typography>
                </Box>
              );
            })}
          </Stack>
        </Box>

        {/* Namespace heat */}
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:2.5 }}>
          <Typography sx={{ fontSize:13, fontWeight:700, color:T.text, mb:0.4 }}>Findings by Namespace</Typography>
          <Typography sx={{ fontSize:11, color:T.muted, mb:2 }}>Top affected namespaces</Typography>
          <Stack spacing={1}>
            {data.summary_by_namespace.slice(0, 10).map(({ namespace, critical, high, medium, low, total }) => (
              <Box key={namespace} sx={{ display:'flex', alignItems:'center', gap:1 }}>
                <Typography sx={{ fontSize:12, color:T.text, minWidth:160, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {namespace}
                </Typography>
                <Box flex={1} sx={{ display:'flex', gap:0.4, flexWrap:'wrap' }}>
                  {critical > 0 && <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.critical.bg, border:`1px solid ${T.critical.fg}40` }}>
                    <Typography sx={{ color:T.critical.fg, fontSize:11, fontWeight:700 }}>C:{critical}</Typography>
                  </Box>}
                  {high > 0 && <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.high.bg, border:`1px solid ${T.high.fg}40` }}>
                    <Typography sx={{ color:T.high.fg, fontSize:11, fontWeight:700 }}>H:{high}</Typography>
                  </Box>}
                  {medium > 0 && <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.medium.bg, border:`1px solid ${T.medium.fg}40` }}>
                    <Typography sx={{ color:T.medium.fg, fontSize:11, fontWeight:700 }}>M:{medium}</Typography>
                  </Box>}
                  {low > 0 && <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.low.bg, border:`1px solid ${T.low.fg}40` }}>
                    <Typography sx={{ color:T.low.fg, fontSize:11, fontWeight:700 }}>L:{low}</Typography>
                  </Box>}
                </Box>
                <Typography sx={{ fontSize:12, color:T.muted, minWidth:28, textAlign:'right' }}>{total}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      {/* High priority spotlight */}
      {topFindings.length > 0 && (
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.high.fg}40`, borderRadius:2, p:2.5, mb:3 }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <WarningIcon sx={{ color: T.high.fg, fontSize: 20 }} />
            <Typography sx={{ fontSize:14, fontWeight:700, color: T.high.fg }}>High Priority Findings</Typography>
            <Typography sx={{ fontSize:11, color:T.muted, ml:'auto' }}>Highest CVSS · widest blast radius</Typography>
          </Box>
          <Stack spacing={1.2}>
            {topFindings.map((cve) => {
              const fg = T.sevColor(cve.severity);
              const podCount = cve.affected_pods?.length ?? 0;
              return (
                <Box key={`${cve.cve_id}-${cve.namespace}`}
                  sx={{ p:1.5, borderRadius:1.5, bgcolor:T.bg, border:`1px solid ${T.border}` }}>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography sx={{ color:fg, fontWeight:700, fontSize:13 }}>{cve.cve_id}</Typography>
                        <CVSSPill score={cve.cvss_score} />
                        <SevChip sev={cve.severity} />
                        <Box sx={{ px:0.8, py:0.1, borderRadius:0.5, bgcolor:`${T.accent}18`, border:`1px solid ${T.accent}40` }}>
                          <Typography sx={{ color:T.accent, fontSize:11 }}>{cve.namespace}</Typography>
                        </Box>
                        <Box sx={{ px:0.8, py:0.1, borderRadius:0.5, bgcolor: podCount > 5 ? T.critical.bg : T.high.bg }}>
                          <Typography sx={{ color: podCount > 5 ? T.critical.fg : T.high.fg, fontSize:11 }}>
                            {podCount} pod{podCount !== 1 ? 's' : ''} affected
                          </Typography>
                        </Box>
                      </Box>
                      <Typography sx={{ color:T.muted, fontSize:12, mt:0.4 }}>{cve.title}</Typography>
                    </Box>
                    {cve.patch_available && (
                      <Box onClick={() => navigate('/patch-recommendations')}
                        sx={{ px:1.5, py:0.5, borderRadius:1, bgcolor:`${T.high.fg}18`, border:`1px solid ${T.high.fg}50`,
                          cursor:'pointer', '&:hover':{ bgcolor:`${T.high.fg}28` } }}>
                        <Typography sx={{ color:T.high.fg, fontSize:11, fontWeight:700 }}>Patch Now</Typography>
                      </Box>
                    )}
                  </Box>
                  {/* Affected pods */}
                  <Box display="flex" flexWrap="wrap" gap={0.4} mt={0.8}>
                    {cve.affected_pods.slice(0, 5).map(p => (
                      <Box key={p} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                        <Typography sx={{ color:T.muted, fontSize:10 }}>{p}</Typography>
                      </Box>
                    ))}
                    {cve.affected_pods.length > 5 && (
                      <Box sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                        <Typography sx={{ color:T.muted, fontSize:10 }}>+{cve.affected_pods.length - 5} more</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* Search + filters */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, p:2, mb:2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          {/* Search input */}
          <Box sx={{ display:'flex', alignItems:'center', gap:1, px:1.5, py:0.6, borderRadius:1,
            bgcolor:T.bg, border:`1px solid ${T.border}`, minWidth:240 }}>
            <SearchIcon sx={{ color:T.muted, fontSize:16 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search CVE ID, title, namespace…"
              style={{ background:'none', border:'none', outline:'none', color:T.text,
                fontSize:13, width:'100%', fontFamily:'inherit' }} />
          </Box>
          {/* Severity filter buttons */}
          <Box display="flex" gap={0.8} flexWrap="wrap">
            {([null,'critical','high','medium','low'] as Array<string|null>).map(s => {
              const fg = s ? T.sevColor(s) : T.muted;
              const active = sevFilter === s;
              return (
                <Box key={s ?? 'all'} onClick={() => setSevFilter(s)}
                  sx={{ px:1.5, py:0.4, borderRadius:1, cursor:'pointer',
                    bgcolor: active ? `${fg}20` : T.bg,
                    border:`1px solid ${active ? fg : T.border}`,
                    '&:hover':{ border:`1px solid ${fg}` } }}>
                  <Typography sx={{ color:fg, fontSize:12, fontWeight:active ? 700 : 400, textTransform:'capitalize' }}>
                    {s ?? 'All'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          {/* Active signal filter chip */}
          {sigFilter && (
            <Box onClick={() => setSigFilter(null)}
              sx={{ px:1.5, py:0.4, borderRadius:1, cursor:'pointer',
                bgcolor:`${T.accent}18`, border:`1px solid ${T.accent}50`,
                display:'flex', alignItems:'center', gap:0.5 }}>
              <Typography sx={{ color:T.accent, fontSize:12 }}>
                Signal: {SIGNAL_META[sigFilter]?.label ?? sigFilter}
              </Typography>
              <Typography sx={{ color:T.accent, fontSize:14, lineHeight:1 }}>×</Typography>
            </Box>
          )}
          <Typography sx={{ fontSize:12, color:T.muted, ml:'auto' }}>
            {filtered.length} / {data.total_cves} CVEs
          </Typography>
        </Box>
      </Box>

      {/* CVE Table */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <Box p={3} display="flex" alignItems="center" gap={1}>
            <ShieldIcon sx={{ color:T.low.fg }} />
            <Typography sx={{ color:T.low.fg, fontSize:13 }}>No CVEs match the current filter.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                  {['CVE ID','Severity','CVSS','Title','Signal','Affected Pods','Namespace','Patch'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontSize:11,
                      color:T.muted, fontWeight:600, whiteSpace:'nowrap', background:T.bg }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((cve, i) => {
                  const fg = T.sevColor(cve.severity);
                  const sigMeta = SIGNAL_META[cve.signal ?? ''];
                  return (
                    <tr key={`${cve.cve_id}-${cve.namespace}-${i}`}
                      style={{ borderBottom:`1px solid ${T.border}`, background: i % 2 === 0 ? T.card : T.bg }}>
                      <td style={{ padding:'8px 12px' }}>
                        <Typography sx={{ color:fg, fontWeight:700, fontSize:12, fontFamily:'monospace' }}>
                          {cve.cve_id}
                        </Typography>
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <SevChip sev={cve.severity} />
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <CVSSPill score={cve.cvss_score} />
                      </td>
                      <td style={{ padding:'8px 12px', maxWidth:300 }}>
                        <Tooltip title={cve.description} placement="top"
                          componentsProps={{ tooltip:{ sx:{ bgcolor:T.card, color:T.text, border:`1px solid ${T.border}`, fontSize:11, maxWidth:340 } } }}>
                          <Typography sx={{ color:T.text, fontSize:12, overflow:'hidden',
                            textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:280, cursor:'help' }}>
                            {cve.title}
                          </Typography>
                        </Tooltip>
                      </td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        {sigMeta ? (
                          <Typography sx={{ color:T.muted, fontSize:12 }}>
                            {sigMeta.label}
                          </Typography>
                        ) : (
                          <Typography sx={{ color:T.muted, fontSize:12 }}>{cve.signal ?? '—'}</Typography>
                        )}
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                          <Box sx={{ px:0.8, py:0.1, borderRadius:0.4,
                            bgcolor: (cve.affected_pods?.length ?? 0) > 3 ? T.high.bg : T.border }}>
                            <Typography sx={{ color: (cve.affected_pods?.length ?? 0) > 3 ? T.high.fg : T.muted, fontSize:12, fontWeight:700 }}>
                              {cve.affected_pods?.length ?? 0}
                            </Typography>
                          </Box>
                        </Box>
                      </td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        <Typography sx={{ color:T.accent, fontSize:12 }}>{cve.namespace}</Typography>
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        {cve.patch_available ? (
                          <Tooltip title={cve.remediation}
                            componentsProps={{ tooltip:{ sx:{ bgcolor:T.card, color:T.text, border:`1px solid ${T.border}`, fontSize:11, maxWidth:300 } } }}>
                            <Box sx={{ display:'inline-flex', cursor:'help' }}>
                              <CheckCircleIcon sx={{ color:T.low.fg, fontSize:18 }} />
                            </Box>
                          </Tooltip>
                        ) : (
                          <CancelIcon sx={{ color:T.critical.fg, fontSize:18 }} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default CVEDashboard;
// Made with Bob
