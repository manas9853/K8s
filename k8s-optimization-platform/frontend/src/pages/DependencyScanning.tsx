import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Typography, CircularProgress, Alert, Stack, Tooltip } from '@mui/material';
import {
  AccountTree as DepIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  OpenInNew as ExtIcon,
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

const PKG_TYPE_LABEL: Record<string, string> = {
  'gobinary':       'Go binary',
  'gomodule':       'Go module',
  'jar':            'Java JAR',
  'node-pkg':       'Node.js',
  'pipenv':         'Python',
  'pip':            'Python pip',
  'npm':            'npm',
  'yarn':           'Yarn',
  'gem':            'Ruby gem',
  'os-pkgs':        'OS package',
  'debian':         'Debian',
  'alpine':         'Alpine',
  'container-config': 'Config',
  '':               'Library',
};

interface Dep {
  package_name: string;
  current_version: string;
  vulnerable_version: string;
  fixed_version: string;
  severity: string;
  cvss_score: number;
  cve_ids: string[];
  affected_images: string[];
  affected_pods: string[];
  affected_namespaces: string[];
  description: string;
  title: string;
  remediation: string;
  primary_url: string;
  pkg_type: string;
  source: string;
}

interface DepData {
  dependencies: Dep[];
  total_vulnerabilities: number;
  critical_vulnerabilities: number;
  high_vulnerabilities: number;
  medium_vulnerabilities: number;
  low_vulnerabilities: number;
  patchable_vulnerabilities: number;
  trivy_packages: number;
  signal_findings: number;
  last_scan: string;
  scanner: string;
}

/* ── CVSS pill ──────────────────────────────────────────────────────── */
const CVSSPill: React.FC<{ score: number }> = ({ score }) => {
  if (!score) return <Typography sx={{ color:T.muted, fontSize:11 }}>—</Typography>;
  const color = score >= 9 ? '#f87171' : score >= 7 ? '#f59e0b' : score >= 4 ? '#60a5fa' : '#4ade80';
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:0.4,
      px:0.8, py:0.1, borderRadius:0.5, bgcolor:`${color}18`, border:`1px solid ${color}40` }}>
      <Box sx={{ width:6, height:6, borderRadius:'50%', bgcolor:color }} />
      <Typography sx={{ color, fontWeight:700, fontSize:11 }}>{score.toFixed(1)}</Typography>
    </Box>
  );
};

/* ── Source badge ───────────────────────────────────────────────────── */
const SourceBadge: React.FC<{ source: string }> = ({ source }) => {
  const isTrivy = source === 'trivy';
  return (
    <Box sx={{ display:'inline-block', px:0.7, py:0.1, borderRadius:0.4,
      bgcolor: isTrivy ? `${T.accent}20` : T.border,
      border: isTrivy ? `1px solid ${T.accent}40` : `1px solid ${T.border}` }}>
      <Typography sx={{ color: isTrivy ? T.accent : T.muted, fontSize:9, fontWeight:700 }}>
        {isTrivy ? 'TRIVY' : 'SIGNAL'}
      </Typography>
    </Box>
  );
};

const DependencyScanning: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<string | null>(null);
  const [srcFilter, setSrcFilter] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await window.fetch(`${API_BASE_URL}/v1/security/dependency-scanning${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to fetch dependency data');
      } finally { setLoading(false); }
    };
    fetch();
  }, [clusterParam]); // eslint-disable-line

  if (loading) return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center"
      minHeight="60vh" gap={2} sx={{ bgcolor:T.bg }}>
      <CircularProgress size={48} sx={{ color:T.accent }} />
      <Typography sx={{ color:T.muted, fontSize:13 }}>Scanning dependencies across cluster images…</Typography>
      <Typography sx={{ color:T.muted, fontSize:11 }}>Trivy scanning public images (cached after first run)</Typography>
    </Box>
  );
  if (error || !data) return (
    <Box p={3} sx={{ bgcolor:T.bg, minHeight:'100vh' }}>
      <Alert severity="error" sx={{ bgcolor:T.critical.bg, color:T.critical.fg }}>{error || 'No data'}</Alert>
    </Box>
  );

  const deps = data.dependencies || [];
  const filtered = deps.filter(d => {
    const matchText = !search ||
      d.package_name.toLowerCase().includes(search.toLowerCase()) ||
      d.cve_ids.some(c => c.toLowerCase().includes(search.toLowerCase())) ||
      d.affected_images.some(i => i.toLowerCase().includes(search.toLowerCase()));
    const matchSev = !sevFilter || d.severity.toLowerCase() === sevFilter;
    const matchSrc = !srcFilter || d.source === srcFilter;
    return matchText && matchSev && matchSrc;
  });

  const patchPct = deps.length > 0 ? Math.round((data.patchable_vulnerabilities / deps.length) * 100) : 0;

  // top packages by severity for spotlight
  const critHighDeps = deps.filter(d => d.severity === 'critical' || d.severity === 'high').slice(0, 5);

  return (
    <Box sx={{ bgcolor:T.bg, minHeight:'100vh', p:3, color:T.text }}>

      {/* Header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <DepIcon sx={{ fontSize:36, color:T.accent }} />
        <Box>
          <Typography sx={{ fontSize:22, fontWeight:700, color:T.text }}>Dependency Scanning</Typography>
          <Typography sx={{ fontSize:12, color:T.muted }}>
            {data.scanner === 'trivy+signals'
              ? `Trivy package-level CVEs + signal analysis · ${data.trivy_packages ?? 0} trivy findings · ${data.signal_findings ?? 0} config findings`
              : 'Signal-based dependency analysis'}
            {' · '}{new Date(data.last_scan).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:1.5, mb:3 }}>
        {([
          { label:'Total',      count: data.total_vulnerabilities,     fg:T.accent,       bg:T.card },
          { label:'Critical',   count: data.critical_vulnerabilities,  fg:T.critical.fg,  bg:T.critical.bg },
          { label:'High',       count: data.high_vulnerabilities,      fg:T.high.fg,      bg:T.high.bg },
          { label:'Medium',     count: data.medium_vulnerabilities,    fg:T.medium.fg,    bg:T.medium.bg },
          { label:'Low',        count: data.low_vulnerabilities,       fg:T.low.fg,       bg:T.low.bg },
          { label:'Patchable',  count: data.patchable_vulnerabilities, fg:'#34d399',      bg:'#0d2d1a' },
        ] as Array<{label:string;count:number;fg:string;bg:string}>).map(({ label, count, fg, bg }) => (
          <Box key={label} sx={{ bgcolor:bg, border:`1px solid ${fg}30`, borderRadius:2, p:1.5 }}>
            <Typography sx={{ fontSize:10, color:fg, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</Typography>
            <Typography sx={{ fontSize:28, fontWeight:800, color:fg, lineHeight:1.1, mt:0.3 }}>{count}</Typography>
            {label === 'Patchable' && (
              <Typography sx={{ fontSize:10, color:T.muted }}>{patchPct}% of total</Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Critical / high spotlight */}
      {critHighDeps.length > 0 && (
        <Box sx={{ bgcolor:T.card, border:`1px solid ${T.high.fg}40`, borderRadius:2, p:2.5, mb:3 }}>
          <Typography sx={{ fontSize:13, fontWeight:700, color:T.high.fg, mb:2 }}>
            Critical & High Severity Packages
          </Typography>
          <Stack spacing={1.2}>
            {critHighDeps.map((d, i) => {
              const fg = T.sevColor(d.severity);
              return (
                <Box key={i} sx={{ p:1.5, borderRadius:1.5, bgcolor:T.bg, border:`1px solid ${T.border}` }}>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} flexWrap="wrap">
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography sx={{ color:fg, fontWeight:700, fontSize:13, fontFamily:'monospace' }}>
                          {d.package_name}
                        </Typography>
                        <Box sx={{ px:0.8, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                          <Typography sx={{ color:T.muted, fontSize:11, fontFamily:'monospace' }}>
                            {d.current_version}
                          </Typography>
                        </Box>
                        <CVSSPill score={d.cvss_score} />
                        <Box sx={{ px:0.8, py:0.15, borderRadius:0.4, bgcolor:T.sevBg(d.severity), border:`1px solid ${fg}40` }}>
                          <Typography sx={{ color:fg, fontWeight:700, fontSize:10, textTransform:'uppercase' }}>{d.severity}</Typography>
                        </Box>
                        <SourceBadge source={d.source} />
                      </Box>
                      <Typography sx={{ color:T.muted, fontSize:12, mt:0.4 }}>{d.title || d.description}</Typography>
                      {d.fixed_version && (
                        <Typography sx={{ color:T.low.fg, fontSize:11, mt:0.3 }}>
                          Fix → {d.fixed_version}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      {d.cve_ids.slice(0,3).map(cid => (
                        <Box key={cid} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:`${fg}15`, mb:0.3 }}>
                          <Typography sx={{ color:fg, fontSize:10, fontFamily:'monospace' }}>{cid}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  <Box display="flex" gap={0.5} mt={0.8} flexWrap="wrap">
                    {d.affected_images.slice(0,3).map(img => (
                      <Box key={img} sx={{ px:0.7, py:0.1, borderRadius:0.4, bgcolor:T.border }}>
                        <Typography sx={{ color:T.muted, fontSize:10 }}>{img.split('/').pop()}</Typography>
                      </Box>
                    ))}
                    {d.affected_images.length > 3 && (
                      <Typography sx={{ color:T.muted, fontSize:10, alignSelf:'center' }}>
                        +{d.affected_images.length-3} images
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
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
              placeholder="Search package, CVE, image…"
              style={{ background:'none', border:'none', outline:'none', color:T.text,
                fontSize:13, width:'100%', fontFamily:'inherit' }} />
          </Box>
          {/* Severity filters */}
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
          {/* Source filters */}
          <Box display="flex" gap={0.8}>
            {([null,'trivy','signal'] as Array<string|null>).map(s => {
              const active = srcFilter === s;
              const fg = s === 'trivy' ? T.accent : s === 'signal' ? T.muted : T.muted;
              return (
                <Box key={s ?? 'all-src'} onClick={() => setSrcFilter(s)}
                  sx={{ px:1.2, py:0.4, borderRadius:1, cursor:'pointer',
                    bgcolor: active ? `${fg}20` : T.bg, border:`1px solid ${active ? fg : T.border}`,
                    '&:hover':{ border:`1px solid ${fg}` } }}>
                  <Typography sx={{ color:fg, fontSize:11, textTransform:'uppercase', fontWeight:active ? 700 : 400 }}>
                    {s ?? 'All sources'}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Typography sx={{ fontSize:12, color:T.muted, ml:'auto' }}>
            {filtered.length} / {deps.length} packages
          </Typography>
        </Box>
      </Box>

      {/* Table */}
      <Box sx={{ bgcolor:T.card, border:`1px solid ${T.border}`, borderRadius:2, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <Box p={3} display="flex" alignItems="center" gap={1}>
            <CheckIcon sx={{ color:T.low.fg }} />
            <Typography sx={{ color:T.low.fg, fontSize:13 }}>No dependencies match the filter.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                  {['Package','Type','Version','Fix','Severity','CVSS','CVE IDs','Affected Images','Src'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'10px 10px', fontSize:11,
                      color:T.muted, fontWeight:600, whiteSpace:'nowrap', background:T.bg }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0,200).map((d, i) => {
                  const fg = T.sevColor(d.severity);
                  const bg = T.sevBg(d.severity);
                  return (
                    <tr key={i} style={{ borderBottom:`1px solid ${T.border}30`,
                      background: i%2===0 ? T.card : T.bg }}>
                      <td style={{ padding:'8px 10px', maxWidth:200 }}>
                        <Tooltip title={d.description || d.title} placement="top"
                          componentsProps={{ tooltip:{ sx:{ bgcolor:T.card, color:T.text, border:`1px solid ${T.border}`, fontSize:11, maxWidth:340 } } }}>
                          <Typography sx={{ color:T.text, fontWeight:600, fontSize:12, fontFamily:'monospace',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180, cursor:'help' }}>
                            {d.package_name}
                          </Typography>
                        </Tooltip>
                      </td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                        <Typography sx={{ color:T.muted, fontSize:11 }}>
                          {PKG_TYPE_LABEL[d.pkg_type] ?? d.pkg_type ?? '—'}
                        </Typography>
                      </td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                        <Typography sx={{ color:T.muted, fontSize:11, fontFamily:'monospace' }}>
                          {d.current_version}
                        </Typography>
                      </td>
                      <td style={{ padding:'8px 10px', maxWidth:160 }}>
                        {d.fixed_version ? (
                          <Typography sx={{ color:T.low.fg, fontSize:11, fontFamily:'monospace',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:150 }}>
                            {d.fixed_version}
                          </Typography>
                        ) : (
                          <Typography sx={{ color:T.muted, fontSize:11 }}>no fix yet</Typography>
                        )}
                      </td>
                      <td style={{ padding:'8px 10px' }}>
                        <Box sx={{ display:'inline-block', px:0.8, py:0.15, borderRadius:0.5, bgcolor:bg, border:`1px solid ${fg}40` }}>
                          <Typography sx={{ color:fg, fontWeight:700, fontSize:10, textTransform:'uppercase' }}>{d.severity}</Typography>
                        </Box>
                      </td>
                      <td style={{ padding:'8px 10px' }}>
                        <CVSSPill score={d.cvss_score} />
                      </td>
                      <td style={{ padding:'8px 10px', maxWidth:200 }}>
                        <Box display="flex" gap={0.4} flexWrap="wrap">
                          {d.cve_ids.slice(0,2).map(cid => (
                            <Box key={cid} sx={{ px:0.6, py:0.1, borderRadius:0.4, bgcolor:`${fg}15` }}>
                              <Typography sx={{ color:fg, fontSize:10, fontFamily:'monospace' }}>{cid}</Typography>
                            </Box>
                          ))}
                          {d.cve_ids.length > 2 && (
                            <Typography sx={{ color:T.muted, fontSize:10 }}>+{d.cve_ids.length-2}</Typography>
                          )}
                        </Box>
                      </td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                        <Typography sx={{ color:T.muted, fontSize:11 }}>
                          {d.affected_images.length} image{d.affected_images.length !== 1 ? 's' : ''}
                          {d.affected_namespaces.length > 0 && (
                            <span style={{ color:T.border }}> · </span>
                          )}
                          {d.affected_namespaces.slice(0,2).join(', ')}
                        </Typography>
                      </td>
                      <td style={{ padding:'8px 10px' }}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <SourceBadge source={d.source} />
                          {d.primary_url && (
                            <a href={d.primary_url} target="_blank" rel="noopener noreferrer"
                              style={{ color:T.muted, display:'flex' }}>
                              <ExtIcon sx={{ fontSize:13 }} />
                            </a>
                          )}
                        </Box>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box mt={1.5} display="flex" justifyContent="space-between">
        <Typography sx={{ fontSize:11, color:T.muted }}>
          Scanner: {data.scanner ?? 'trivy+signals'} ·
          {data.trivy_packages ?? 0} trivy packages · {data.signal_findings ?? 0} config signals ·
          {data.patchable_vulnerabilities} patchable
        </Typography>
        <Typography sx={{ fontSize:11, color:T.muted }}>
          xforce-devops · {new Date(data.last_scan).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default DependencyScanning;
// Made with Bob
