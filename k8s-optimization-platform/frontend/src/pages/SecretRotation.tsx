import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

// ── Design tokens (matches ImageTrust.tsx palette) ────────────────────────────
const T = {
  bg:     '#0f1724',
  card:   '#1e2433',
  border: '#2a3245',
  text:   '#e8eaf0',
  muted:  '#8892a4',
  accent: '#3b82f6',
  // status
  overdue:       { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  needs_rotation:{ bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  rotated:       { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
  // severity
  high:   { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  medium: { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  low:    { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
};

const statusPal = (s: string) =>
  s === 'overdue' ? T.overdue : s === 'needs_rotation' ? T.needs_rotation : T.rotated;

const sevPal = (s: string) =>
  s === 'high' ? T.high : s === 'medium' ? T.medium : T.low;

const scoreColor = (n: number) => (n >= 80 ? '#4ade80' : n >= 50 ? '#f59e0b' : '#f87171');

interface SecretStatus {
  secret_name:     string;
  namespace:       string;
  type:            string;
  key_count:       number;
  is_referenced:   boolean;
  age_days:        number;
  last_rotated:    string;
  status:          'rotated' | 'needs_rotation' | 'overdue';
  severity:        'low' | 'medium' | 'high';
  rotation_policy: string;
  used_by_pods:    number;
  recommendation:  string;
}

interface RotationData {
  rotation_score:   number;
  total_secrets:    number;
  rotated_secrets:  number;
  needs_rotation:   number;
  overdue_rotation: number;
  secrets_status:   SecretStatus[];
  rotation_policy:  string;
  last_scan:        string;
}

export default function SecretRotation() {
  const { clusterParam } = useActiveCluster();
  const [data, setData]       = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterNs, setFilterNs]   = useState('all');
  const [filterSev, setFilterSev] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/security/secrets-security/rotation${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [clusterParam]);

  const secrets: SecretStatus[] = useMemo(() => data?.secrets_status ?? [], [data]);

  const namespaces = useMemo(
    () => ['all', ...Array.from(new Set(secrets.map(s => s.namespace))).sort()],
    [secrets]
  );

  const filtered = useMemo(() => secrets.filter(s => {
    const q = search.toLowerCase();
    const mQ = !q || s.secret_name.toLowerCase().includes(q) || s.namespace.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
    const mSt = filterStatus === 'all' || s.status === filterStatus;
    const mNs = filterNs === 'all' || s.namespace === filterNs;
    const mSv = filterSev === 'all' || s.severity === filterSev;
    return mQ && mSt && mNs && mSv;
  }), [secrets, search, filterStatus, filterNs, filterSev]);

  // Overdue spotlight: worst offenders
  const overdueList = useMemo(
    () => secrets.filter(s => s.status === 'overdue').slice(0, 6),
    [secrets]
  );

  // Namespace breakdown
  const nsBreakdown = useMemo(() => {
    const m: Record<string, { overdue: number; needs: number; ok: number }> = {};
    secrets.forEach(s => {
      if (!m[s.namespace]) m[s.namespace] = { overdue: 0, needs: 0, ok: 0 };
      if (s.status === 'overdue') m[s.namespace].overdue++;
      else if (s.status === 'needs_rotation') m[s.namespace].needs++;
      else m[s.namespace].ok++;
    });
    return Object.entries(m)
      .map(([ns, c]) => ({ ns, ...c, total: c.overdue + c.needs + c.ok }))
      .sort((a, b) => b.overdue - a.overdue || b.needs - a.needs || b.total - a.total);
  }, [secrets]);

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: T.muted, fontSize: 15 }}>Loading secret rotation data…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f87171', fontSize: 15 }}>Error: {error || 'No data'}</div>
    </div>
  );

  const score = data.rotation_score ?? 0;
  const col   = scoreColor(score);

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '24px', fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif', color: T.text, fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔄</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Secret Rotation</div>
          <div style={{ color: T.muted, fontSize: 13 }}>
            Rotation status for all cluster secrets · {data.total_secrets} secrets scanned
          </div>
        </div>
        <div style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, color: T.muted }}>
          Last scan: {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
        </div>
      </div>

      {/* ── Score + Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 20 }}>

        {/* Score ring */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#2a3245" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={col} strokeWidth="8"
              strokeDasharray={`${(score / 100) * 251.3} 251.3`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)" />
            <text x="50" y="46" textAnchor="middle" fill={col} fontSize="18" fontWeight="700">{Math.round(score)}</text>
            <text x="50" y="62" textAnchor="middle" fill="#8892a4" fontSize="9">Rotation Score</text>
          </svg>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {score >= 80 ? '🟢 Good' : score >= 50 ? '🟡 Fair' : '🔴 Poor'}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4, textAlign: 'center' }}>
            Policy: {data.rotation_policy}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Secrets',    value: data.total_secrets,    col: T.accent },
            { label: 'Up to Date',       value: data.rotated_secrets,  col: '#4ade80' },
            { label: 'Needs Rotation',   value: data.needs_rotation,   col: '#f59e0b' },
            { label: 'Overdue',          value: data.overdue_rotation, col: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.col }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Overdue Spotlight + Namespace Breakdown ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Overdue spotlight */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>🚨 Overdue Secrets</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, fontSize: 11,
              background: T.overdue.bg, color: T.overdue.text, border: `1px solid ${T.overdue.border}` }}>
              {data.overdue_rotation} overdue
            </span>
          </div>
          {overdueList.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              ✅ No overdue secrets
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {overdueList.map((s, i) => (
                <div key={i} style={{ padding: '8px 10px', background: '#151f30', borderRadius: 8, marginBottom: 6, border: `1px solid ${T.overdue.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={s.secret_name}>
                      {s.secret_name}
                    </span>
                    <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, background: T.overdue.bg, color: T.overdue.text, border: `1px solid ${T.overdue.border}`, whiteSpace: 'nowrap' }}>
                      {s.age_days}d old
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: T.muted }}>
                    {s.namespace} · {s.type} · {s.key_count} key{s.key_count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Namespace breakdown */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Namespace Breakdown</div>
          {nsBreakdown.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No data</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {nsBreakdown.slice(0, 12).map((row) => {
                const pctOk = Math.round((row.ok / Math.max(row.total, 1)) * 100);
                return (
                  <div key={row.ns} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                      <span style={{ fontFamily: 'monospace', color: T.text }}>{row.ns}</span>
                      <span style={{ color: T.muted }}>{row.total} secrets</span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {row.overdue > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: T.overdue.bg, color: T.overdue.text, border: `1px solid ${T.overdue.border}` }}>{row.overdue} overdue</span>
                      )}
                      {row.needs > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: T.needs_rotation.bg, color: T.needs_rotation.text, border: `1px solid ${T.needs_rotation.border}` }}>{row.needs} due</span>
                      )}
                      {row.ok > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: T.rotated.bg, color: T.rotated.text, border: `1px solid ${T.rotated.border}` }}>{row.ok} ok</span>
                      )}
                    </div>
                    <div style={{ height: 4, background: '#2a3245', borderRadius: 2, marginTop: 4 }}>
                      <div style={{ height: '100%', width: `${pctOk}%`, background: '#4ade80', borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Status summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { status: 'rotated',        icon: '✅', label: 'Up to Date',     count: data.rotated_secrets,  desc: 'Secrets rotated within the last 90 days. No action required.' },
          { status: 'needs_rotation', icon: '⏰', label: 'Needs Rotation', count: data.needs_rotation,   desc: 'Secrets between 90–180 days old. Schedule rotation soon.' },
          { status: 'overdue',        icon: '🚨', label: 'Overdue',        count: data.overdue_rotation, desc: 'Secrets older than 180 days. Rotate immediately.' },
        ].map(item => {
          const pal = statusPal(item.status);
          return (
            <div key={item.status}
              style={{ background: T.card, border: `1px solid ${pal.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setFilterStatus(filterStatus === item.status ? 'all' : item.status)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: pal.text }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 700, color: pal.text }}>{item.count}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{item.desc}</div>
              {filterStatus === item.status && (
                <div style={{ marginTop: 8, fontSize: 11, color: pal.text }}>▶ Filtering — click to clear</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Filters + Table ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Secret Rotation Status
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: T.muted }}>
              {filtered.length} of {secrets.length} secrets
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Search name / namespace / type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 12px', color: T.text, fontSize: 13, width: 220, outline: 'none' }}
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Statuses</option>
              <option value="overdue">Overdue</option>
              <option value="needs_rotation">Needs Rotation</option>
              <option value="rotated">Up to Date</option>
            </select>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Severities</option>
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

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Secret Name', 'Namespace', 'Type', 'Keys', 'Age (days)', 'Last Rotated', 'Status', 'Severity', 'Referenced', 'Used by Pods', 'Recommendation'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: T.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((s, i) => {
                const sp  = statusPal(s.status);
                const svp = sevPal(s.severity);
                const ageCol = s.age_days > 180 ? '#f87171' : s.age_days > 90 ? '#f59e0b' : T.text;
                return (
                  <tr key={i}
                    style={{ borderBottom: `1px solid ${T.border}`, background: s.status === 'overdue' ? '#180f0f' : s.status === 'needs_rotation' ? '#15100a' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a2035')}
                    onMouseLeave={e => (e.currentTarget.style.background = s.status === 'overdue' ? '#180f0f' : s.status === 'needs_rotation' ? '#15100a' : 'transparent')}>
                    {/* Secret Name */}
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.secret_name}>
                        {s.secret_name}
                      </div>
                    </td>
                    {/* Namespace */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#1e2433', color: '#60a5fa', border: '1px solid #2a3245' }}>
                        {s.namespace}
                      </span>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: T.muted }}>
                      {s.type?.replace('kubernetes.io/', 'k8s/')}
                    </td>
                    {/* Keys */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: T.muted }}>{s.key_count ?? '—'}</td>
                    {/* Age */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: ageCol }}>{s.age_days}</td>
                    {/* Last Rotated */}
                    <td style={{ padding: '9px 12px', fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>
                      {s.last_rotated ? new Date(s.last_rotated).toLocaleDateString() : '—'}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: sp.bg, color: sp.text, border: `1px solid ${sp.border}`, fontWeight: 500 }}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                    {/* Severity */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: svp.bg, color: svp.text, border: `1px solid ${svp.border}`, fontWeight: 500 }}>
                        {s.severity}
                      </span>
                    </td>
                    {/* Referenced */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: s.is_referenced ? '#4ade80' : '#f87171' }}>
                        {s.is_referenced ? '✓' : '✗'}
                      </span>
                    </td>
                    {/* Pods */}
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: T.muted }}>{s.used_by_pods}</td>
                    {/* Recommendation */}
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                      <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.recommendation}>
                        {s.recommendation}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: T.muted }}>
            {secrets.length === 0
              ? '🔍 No secrets found. Make sure the in-cluster agent is running and has sent data.'
              : 'No secrets match the current filters.'}
          </div>
        )}
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
