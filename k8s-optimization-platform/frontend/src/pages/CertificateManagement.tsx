import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

// ── Dark palette (matches ImageTrust / SecretExposure) ──────────────────────
const T = {
  bg:     colors.background,
  card:   colors.surface,
  deep:   colors.surfaceAlt,
  border: colors.border,
  text:   colors.textPrimary,
  muted:  colors.textSecondary,
  accent: colors.info,
  // status
  valid:        { bg: colors.successBg, text: colors.success, border: colors.successBg },
  expiring_soon:{ bg: colors.warningBg, text: colors.warning, border: colors.warningBg },
  expired:      { bg: colors.dangerBg, text: colors.danger, border: colors.dangerBg },
  // cert types
  ca:      { bg: colors.purpleBg, text: colors.purple, border: colors.purple },
  ingress: { bg: colors.infoBg, text: colors.info, border: colors.info },
  chain:   { bg: colors.successBg, text: colors.success, border: colors.success },
  tls:     { bg: colors.surface, text: colors.textSecondary, border: colors.border },
};

type CertStatus = 'valid' | 'expiring_soon' | 'expired';
type CertSeverity = 'low' | 'high' | 'critical';

interface Certificate {
  name: string;
  namespace: string;
  type: string;
  issuer: string;
  subject: string;
  issued_date: string;
  expiry_date: string;
  days_until_expiry: number;
  age_days: number;
  status: CertStatus;
  severity: CertSeverity;
  auto_renewal: boolean;
  is_referenced: boolean;
  data_keys: string[];
  used_by_services: number;
  recommendation: string;
}

interface CertData {
  cluster_name: string;
  certificate_score: number;
  total_certificates: number;
  valid_certificates: number;
  expiring_soon: number;
  expired_certificates: number;
  certificates: Certificate[];
  recommendation: string;
  last_scan: string;
}

const statusPal = (s: CertStatus) => T[s] ?? T.tls;

const scoreColor = (score: number) =>
  score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.danger;

const typePal = (t: string) => {
  const lower = (t ?? '').toLowerCase();
  if (lower === 'ca') return T.ca;
  if (lower === 'ingress tls') return T.ingress;
  if (lower === 'chain tls') return T.chain;
  return T.tls;
};

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

export default function CertificateManagement() {
  const { clusterParam } = useActiveCluster();
  const [data, setData]       = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterNs, setFilterNs]         = useState('all');
  const [filterType, setFilterType]     = useState('all');

  useEffect(() => {
    let mounted = true;
    const load = (showLoader = false) => {
      if (showLoader) setLoading(true);
      fetch(`${API_BASE_URL}/v1/security/secrets-security/certificates${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error('Failed to load certificate data'); return r.json(); })
        .then(d => { if (mounted) { setData(d); setError(null); setLoading(false); } })
        .catch(e => { if (mounted) { setError(e.message); setLoading(false); } });
    };
    load(true);
    const t = setInterval(() => load(false), 120000);
    return () => { mounted = false; clearInterval(t); };
  }, [clusterParam]);

  const certs: Certificate[] = useMemo(() => data?.certificates ?? [], [data]);

  const namespaces = useMemo(
    () => ['all', ...Array.from(new Set(certs.map(c => c.namespace))).sort()],
    [certs]
  );
  const certTypes = useMemo(
    () => ['all', ...Array.from(new Set(certs.map(c => c.type))).sort()],
    [certs]
  );

  const filtered = useMemo(() => certs.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name?.toLowerCase().includes(q) || c.namespace?.toLowerCase().includes(q) || c.issuer?.toLowerCase().includes(q);
    const matchS = filterStatus === 'all' || c.status === filterStatus;
    const matchN = filterNs === 'all' || c.namespace === filterNs;
    const matchT = filterType === 'all' || c.type === filterType;
    return matchQ && matchS && matchN && matchT;
  }), [certs, search, filterStatus, filterNs, filterType]);

  // Critical/expiring spotlight
  const urgentCerts = useMemo(
    () => certs.filter(c => c.status === 'expired' || c.status === 'expiring_soon'),
    [certs]
  );

  // Issuer breakdown
  const issuerBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    certs.forEach(c => { map[c.issuer] = (map[c.issuer] || 0) + 1; });
    const total = certs.length || 1;
    return Object.entries(map)
      .map(([issuer, cnt]) => ({ issuer, count: cnt, pct: Math.round((cnt / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [certs]);

  if (loading) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: T.muted, fontSize: 15 }}>Loading certificate data…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: colors.danger, fontSize: 15 }}>Error: {error || 'No data'}</div>
    </div>
  );

  const score     = data.certificate_score ?? 0;
  const scoreDeg  = (score / 100) * 251.3;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '24px', fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif', color: T.text, fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔐</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Certificate Management</div>
          <div style={{ color: T.muted, fontSize: 13 }}>TLS certificate inventory, expiry tracking and compliance</div>
        </div>
        <div style={{ marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 14px', fontSize: 12, color: T.muted }}>
          {data.cluster_name ?? 'xforce-devops'} · {data.total_certificates} certs · Last scan {fmtDate(data.last_scan)}
        </div>
      </div>

      {/* ── Score + Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 20 }}>

        {/* Score ring */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke={colors.border} strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={scoreColor(score)} strokeWidth="8"
              strokeDasharray={`${scoreDeg} 251.3`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)" />
            <text x="50" y="46" textAnchor="middle" fill={scoreColor(score)} fontSize="18" fontWeight="700">{Math.round(score)}</text>
            <text x="50" y="62" textAnchor="middle" fill={colors.textSecondary} fontSize="9">Cert Score</text>
          </svg>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {score >= 80 ? '🟢 Good' : score >= 50 ? '🟡 Fair' : '🔴 Poor'}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Certificates', value: data.total_certificates, col: T.accent },
            { label: 'Valid',              value: data.valid_certificates,  col: colors.success },
            { label: 'Expiring Soon',      value: data.expiring_soon,       col: colors.warning },
            { label: 'Expired',            value: data.expired_certificates, col: colors.danger },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.col }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Issuer Breakdown + Urgent Spotlight ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Issuer breakdown */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Issuer Distribution</div>
          {issuerBreakdown.map(r => (
            <div key={r.issuer} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: T.text }}>{r.issuer}</span>
                <div style={{ color: T.muted, fontSize: 12 }}>{r.count} certs · {r.pct}%</div>
              </div>
              <div style={{ height: 5, background: colors.border, borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${r.pct}%`, background: T.accent, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Urgent spotlight */}
        <div style={{ background: T.card, border: `1px solid ${urgentCerts.length > 0 ? T.expired.border : T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>⚠️ Attention Required</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, fontSize: 11,
              background: urgentCerts.length > 0 ? T.expired.bg : T.valid.bg,
              color: urgentCerts.length > 0 ? T.expired.text : T.valid.text,
              border: `1px solid ${urgentCerts.length > 0 ? T.expired.border : T.valid.border}` }}>
              {urgentCerts.length} at risk
            </span>
          </div>
          {urgentCerts.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              ✅ All certificates are valid
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {urgentCerts.slice(0, 12).map((c, i) => {
                const pal = statusPal(c.status);
                return (
                  <div key={i} style={{ padding: '8px 10px', background: T.deep, borderRadius: 8, marginBottom: 6, border: `1px solid ${pal.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}`, whiteSpace: 'nowrap' }}>
                        {c.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: T.muted }}>
                      {c.namespace} · {c.issuer} · {c.days_until_expiry < 0 ? `${Math.abs(c.days_until_expiry)}d ago` : `${c.days_until_expiry}d left`}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: pal.text }}>{c.recommendation}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Status Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {([
          { key: 'valid' as CertStatus, label: 'Valid Certificates', count: data.valid_certificates, icon: '✅',
            desc: 'Certificates within their validity window and not expiring within 30 days.' },
          { key: 'expiring_soon' as CertStatus, label: 'Expiring Soon', count: data.expiring_soon, icon: '⏱️',
            desc: 'Certificates expiring within 30 days. Schedule renewal before service disruption.' },
          { key: 'expired' as CertStatus, label: 'Expired', count: data.expired_certificates, icon: '🚨',
            desc: 'Certificates past their expiry date. Services using them may be failing already.' },
        ]).map(item => {
          const pal = statusPal(item.key);
          return (
            <div key={item.key}
              style={{ background: T.card, border: `1px solid ${pal.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setFilterStatus(filterStatus === item.key ? 'all' : item.key)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: pal.text }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 700, color: pal.text }}>{item.count}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{item.desc}</div>
              {filterStatus === item.key && (
                <div style={{ marginTop: 8, fontSize: 11, color: pal.text }}>▶ Filtering by this status — click to clear</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Recommendation banner if issues ── */}
      {(data.expired_certificates > 0 || data.expiring_soon > 0) && (
        <div style={{ background: colors.dangerBg, border: `1px solid ${T.expired.border}`, borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 600, color: T.expired.text, fontSize: 14 }}>Action Required</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{data.recommendation}</div>
          </div>
        </div>
      )}

      {/* ── Filters + Table ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Certificate Inventory
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: T.muted }}>
              {filtered.length} of {certs.length} certificates
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Search name / namespace / issuer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: T.deep, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }}
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ background: T.deep, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Statuses</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ background: T.deep, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Types</option>
              {certTypes.filter(t => t !== 'all').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterNs} onChange={e => setFilterNs(e.target.value)}
              style={{ background: T.deep, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Namespaces</option>
              {namespaces.filter(n => n !== 'all').map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Name', 'Namespace', 'Type', 'Issuer', 'Issued', 'Expires', 'Days Left', 'Status', 'In Use', 'Auto-Renew', 'Recommendation'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: T.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const sPal = statusPal(c.status);
                const tPal = typePal(c.type);
                const isUrgent = c.status === 'expired' || c.status === 'expiring_soon';
                return (
                  <tr key={i}
                    style={{ borderBottom: `1px solid ${T.border}`, background: c.status === 'expired' ? colors.dangerBg : c.status === 'expiring_soon' ? colors.warningBg : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = colors.surfaceAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = c.status === 'expired' ? colors.dangerBg : c.status === 'expiring_soon' ? colors.warningBg : 'transparent')}>

                    {/* Name */}
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>
                        {c.name}
                      </div>
                    </td>
                    {/* Namespace */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: T.card, color: colors.info, border: `1px solid ${T.border}` }}>
                        {c.namespace}
                      </span>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: tPal.bg, color: tPal.text, border: `1px solid ${tPal.border}` }}>
                        {c.type}
                      </span>
                    </td>
                    {/* Issuer */}
                    <td style={{ padding: '9px 12px', fontSize: 12, color: T.muted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.issuer}>
                      {c.issuer}
                    </td>
                    {/* Issued */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontSize: 12, color: T.muted }}>
                      {fmtDate(c.issued_date)}
                    </td>
                    {/* Expires */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontSize: 12, color: isUrgent ? sPal.text : T.muted }}>
                      {fmtDate(c.expiry_date)}
                    </td>
                    {/* Days left */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: c.days_until_expiry < 0 ? colors.danger : c.days_until_expiry < 30 ? colors.warning : colors.success
                      }}>
                        {c.days_until_expiry < 0 ? `${Math.abs(c.days_until_expiry)}d ago` : `${c.days_until_expiry}d`}
                      </span>
                    </td>
                    {/* Status */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: sPal.bg, color: sPal.text, border: `1px solid ${sPal.border}`, fontWeight: 500 }}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    {/* In use */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: c.is_referenced ? colors.success : colors.danger }}>{c.is_referenced ? '✓' : '✗'}</span>
                    </td>
                    {/* Auto-renew */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: c.auto_renewal ? colors.success : T.muted }}>{c.auto_renewal ? '✓' : '—'}</span>
                    </td>
                    {/* Recommendation */}
                    <td style={{ padding: '9px 12px', maxWidth: 240 }}>
                      <div style={{ fontSize: 12, color: isUrgent ? sPal.text : T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.recommendation}>
                        {c.recommendation}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: T.muted }}>No certificates match the current filters.</div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: T.border, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        Made with IBM Bob
      </div>
    </div>
  );
}
