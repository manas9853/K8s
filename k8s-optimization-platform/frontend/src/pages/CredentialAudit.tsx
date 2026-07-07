import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

// ─── Design tokens (same palette as ImageTrust / SecretExposure) ────────────
const T = {
  bg:      '#0f1724',
  card:    '#1e2433',
  border:  '#2a3245',
  text:    '#e8eaf0',
  muted:   '#8892a4',
  accent:  '#3b82f6',
  high:    { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  medium:  { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  low:     { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
};

const riskPalette = (r: string) => {
  if (r === 'high')   return T.high;
  if (r === 'medium') return T.medium;
  return T.low;
};

const scoreColor = (s: number) => s >= 80 ? '#4ade80' : s >= 50 ? '#f59e0b' : '#f87171';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Credential {
  id:                  string;
  name:                string;
  namespace:           string;
  type:                string;
  created_date:        string;
  last_used:           string;
  days_since_last_use: number;
  access_count:        number;
  risk_level:          'low' | 'medium' | 'high';
  used_by_pods:        number;
  permissions:         string[];
  recommendation:      string;
}

interface CredData {
  audit_score:       number;
  total_credentials: number;
  high_risk:         number;
  medium_risk:       number;
  low_risk:          number;
  credentials:       Credential[];
  audit_findings:    { credential_id: string; finding: string; severity: string; recommendation: string }[];
  recommendations:   string[];
  last_scan:         string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CredentialAudit() {
  const { clusterParam } = useActiveCluster();
  const [data,    setData]    = useState<CredData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [search,      setSearch]      = useState('');
  const [filterRisk,  setFilterRisk]  = useState('all');
  const [filterNs,    setFilterNs]    = useState('all');

  useEffect(() => {
    let mounted = true;
    const load = (showLoader = false) => {
      if (showLoader) setLoading(true);
      fetch(`${API_BASE_URL}/v1/security/secrets-security/credential-audit${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
        .then(d => { if (mounted) { setData(d); setLoading(false); setError(null); } })
        .catch(e => { if (mounted) { setError(e.message); setLoading(false); } });
    };
    load(true);
    const t = setInterval(() => load(false), 120_000);
    return () => { mounted = false; clearInterval(t); };
  }, [clusterParam]);

  const creds: Credential[] = useMemo(() => data?.credentials ?? [], [data]);

  const namespaces = useMemo(
    () => ['all', ...Array.from(new Set(creds.map(c => c.namespace))).sort()],
    [creds]
  );

  const filtered = useMemo(() => creds.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.namespace.toLowerCase().includes(q) || c.type.toLowerCase().includes(q);
    const matchR = filterRisk === 'all' || c.risk_level === filterRisk;
    const matchN = filterNs  === 'all' || c.namespace  === filterNs;
    return matchQ && matchR && matchN;
  }), [creds, search, filterRisk, filterNs]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: T.muted, fontSize: 15 }}>Loading credential audit data…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f87171', fontSize: 15 }}>Error: {error || 'No data available'}</div>
    </div>
  );

  const score        = data.audit_score ?? 0;
  const sc           = scoreColor(score);
  const circumference = 251.3;
  const dash         = (score / 100) * circumference;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '24px', fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif', color: T.text, fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔑</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Credential Audit</div>
          <div style={{ color: T.muted, fontSize: 13 }}>
            Service account token age, risk classification and rotation recommendations
          </div>
        </div>
        <div style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, color: T.muted }}>
          Last scan: {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'} · {data.total_credentials} credentials
        </div>
      </div>

      {/* ── Score + Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 20 }}>

        {/* Score ring */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#2a3245" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={sc} strokeWidth="8"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)" />
            <text x="50" y="46" textAnchor="middle" fill={sc} fontSize="18" fontWeight="700">{Math.round(score)}</text>
            <text x="50" y="62" textAnchor="middle" fill="#8892a4" fontSize="9">Audit Score</text>
          </svg>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {score >= 80 ? '🟢 Good' : score >= 50 ? '🟡 Fair' : '🔴 Poor'}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Credentials', value: data.total_credentials, col: T.accent },
            { label: 'High Risk',          value: data.high_risk,          col: T.high.text,   bg: T.high.bg   },
            { label: 'Medium Risk',        value: data.medium_risk,        col: T.medium.text, bg: T.medium.bg },
            { label: 'Low Risk',           value: data.low_risk,           col: T.low.text,    bg: T.low.bg    },
          ].map(s => (
            <div key={s.label} style={{ background: (s as any).bg ?? T.card, border: `1px solid ${(s as any).bg ? s.col + '50' : T.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.col }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk Breakdown bar ── */}
      {data.total_credentials > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Risk Distribution</div>
          {(['high', 'medium', 'low'] as const).map(r => {
            const count = r === 'high' ? data.high_risk : r === 'medium' ? data.medium_risk : data.low_risk;
            const pct   = Math.round((count / data.total_credentials) * 100);
            const pal   = riskPalette(r);
            return (
              <div key={r} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: 11, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}`, textTransform: 'capitalize' }}>{r}</span>
                  <span style={{ color: T.muted, fontSize: 12 }}>{count} credentials · {pct}%</span>
                </div>
                <div style={{ height: 5, background: '#2a3245', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pal.text, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── High-Risk Spotlight ── */}
      {data.audit_findings.length > 0 && (
        <div style={{ background: T.high.bg, border: `1px solid ${T.high.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.high.text }}>High-Risk Findings</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#1a0a0a', color: T.high.text, border: `1px solid ${T.high.border}` }}>
              {data.audit_findings.length} findings — immediate action required
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {data.audit_findings.slice(0, 10).map((f, i) => (
              <div key={i} style={{ background: '#1a0a0a', border: `1px solid ${T.high.border}40`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.text, fontFamily: 'monospace' }}>{f.credential_id}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{f.finding}</div>
                <div style={{ fontSize: 12, color: T.high.text, marginTop: 4 }}>↳ {f.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {data.recommendations?.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Recommendations</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {data.recommendations.map((rec, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#0d2d1a', border: '1px solid #1a4a2a', borderRadius: 8, padding: '8px 12px' }}>
                <span style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Credential Table ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Credential Inventory
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: T.muted }}>
              {filtered.length} of {creds.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Search name / namespace / type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }}
            />
            <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Risk Levels</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={filterNs} onChange={e => setFilterNs(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Namespaces</option>
              {namespaces.filter(n => n !== 'all').map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Name', 'Namespace', 'Type', 'Days Inactive', 'Used by Pods', 'Access Count', 'Permissions', 'Risk', 'Recommendation'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: T.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: T.muted }}>
                    {creds.length === 0
                      ? '✅ No credentials found — your cluster looks clean.'
                      : 'No credentials match the current filters.'}
                  </td>
                </tr>
              ) : filtered.slice(0, 200).map((c, i) => {
                const pal = riskPalette(c.risk_level);
                const daysColor = c.days_since_last_use > 180 ? T.high.text : c.days_since_last_use > 90 ? T.medium.text : T.low.text;
                return (
                  <tr key={i}
                    style={{ borderBottom: `1px solid ${T.border}`, background: c.risk_level === 'high' ? '#1a0e0e' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a2035')}
                    onMouseLeave={e => (e.currentTarget.style.background = c.risk_level === 'high' ? '#1a0e0e' : 'transparent')}>
                    {/* Name */}
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>
                        {c.name}
                      </div>
                    </td>
                    {/* Namespace */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#1e2433', color: '#60a5fa', border: '1px solid #2a3245' }}>
                        {c.namespace}
                      </span>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontSize: 12, color: T.muted }}>
                      {c.type}
                    </td>
                    {/* Days Inactive */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: daysColor, whiteSpace: 'nowrap' }}>
                      {c.days_since_last_use}d
                    </td>
                    {/* Pods */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: T.text }}>
                      {c.used_by_pods}
                    </td>
                    {/* Access Count */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: T.muted }}>
                      {c.access_count.toLocaleString()}
                    </td>
                    {/* Permissions */}
                    <td style={{ padding: '9px 12px', maxWidth: 180 }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.permissions.slice(0, 3).map(p => {
                          const danger = p === 'admin' || p === 'delete' || p === 'cluster-admin';
                          return (
                            <span key={p} style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, background: danger ? T.medium.bg : '#1e2433', color: danger ? T.medium.text : '#60a5fa', border: `1px solid ${danger ? T.medium.border : '#2a3245'}` }}>
                              {p}
                            </span>
                          );
                        })}
                        {c.permissions.length > 3 && (
                          <span style={{ fontSize: 10, color: T.muted }}>+{c.permissions.length - 3}</span>
                        )}
                      </div>
                    </td>
                    {/* Risk */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 4, fontSize: 11, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}`, fontWeight: 600, textTransform: 'capitalize' }}>
                        {c.risk_level}
                      </span>
                    </td>
                    {/* Recommendation */}
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                      <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.recommendation}>
                        {c.recommendation}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 200 && (
          <div style={{ textAlign: 'center', padding: '12px', color: T.muted, fontSize: 12 }}>
            Showing 200 of {filtered.length} entries. Refine filters to narrow down.
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: T.border, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        Made with IBM Bob
      </div>
    </div>
  );
}
