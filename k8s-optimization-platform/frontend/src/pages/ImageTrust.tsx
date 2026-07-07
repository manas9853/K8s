import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const T = {
  bg: '#0f1724',
  card: '#1e2433',
  border: '#2a3245',
  text: '#e8eaf0',
  muted: '#8892a4',
  accent: '#3b82f6',
  // trust levels
  private:   { bg: '#0d1f3c', text: '#60a5fa', border: '#1e3a5f' },
  community: { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  unknown:   { bg: '#2d1a2e', text: '#c084fc', border: '#4a2a4a' },
  trusted:   { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
  // severity
  critical:  { bg: '#2d1515', text: '#f87171', border: '#4a2020' },
  high:      { bg: '#2d200a', text: '#f59e0b', border: '#4a3510' },
  medium:    { bg: '#0d1f3c', text: '#60a5fa', border: '#1e3a5f' },
  low:       { bg: '#0d2d1a', text: '#4ade80', border: '#1a4a2a' },
};

const trustPalette = (level: string) => {
  if (level === 'private') return T.private;
  if (level === 'community') return T.community;
  if (level === 'trusted') return T.trusted;
  return T.unknown;
};

const scoreColor = (score: number) => {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#f59e0b';
  return '#f87171';
};

export default function ImageTrust() {
  const { clusterParam } = useActiveCluster();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch]         = useState('');
  const [filterTrust, setFilterTrust] = useState('all');
  const [filterNs, setFilterNs]       = useState('all');
  const [filterReg, setFilterReg]     = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/security/container-security/image-trust${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [clusterParam]);

  const images: any[] = useMemo(() => data?.image_analysis ?? [], [data]);

  const namespaces = useMemo(
    () => ['all', ...Array.from(new Set(images.map((i: any) => i.namespace))).sort()],
    [images]
  );
  const registries = useMemo(
    () => ['all', ...Array.from(new Set(images.map((i: any) => i.registry))).sort()],
    [images]
  );

  const filtered = useMemo(() => images.filter((img: any) => {
    const q = search.toLowerCase();
    const matchQ = !q || img.image?.toLowerCase().includes(q) || img.pod_name?.toLowerCase().includes(q) || img.namespace?.toLowerCase().includes(q);
    const matchT = filterTrust === 'all' || img.trust_level === filterTrust;
    const matchN = filterNs === 'all' || img.namespace === filterNs;
    const matchR = filterReg === 'all' || img.registry === filterReg;
    return matchQ && matchT && matchN && matchR;
  }), [images, search, filterTrust, filterNs, filterReg]);

  // Registry breakdown (from API or derived)
  const registryBreakdown = useMemo(() => {
    if (data?.registry_breakdown?.length) {
      // recalculate percentage against unique image_analysis count
      const total = images.length || 1;
      return data.registry_breakdown.map((r: any) => ({
        ...r,
        image_count: images.filter((i: any) => i.registry === r.registry).length,
        percentage: Math.round(images.filter((i: any) => i.registry === r.registry).length / total * 100),
      })).filter((r: any) => r.image_count > 0)
         .sort((a: any, b: any) => b.image_count - a.image_count);
    }
    const map: Record<string, number> = {};
    images.forEach((i: any) => { map[i.registry] = (map[i.registry] || 0) + 1; });
    return Object.entries(map)
      .map(([registry, cnt]) => ({ registry, image_count: cnt, percentage: Math.round((cnt / images.length) * 100) }))
      .sort((a, b) => b.image_count - a.image_count);
  }, [data, images]);

  // Spotlight: untrusted / unknown images (highest risk)
  const spotlightImages = useMemo(
    () => images.filter((i: any) => i.trust_level === 'untrusted' || i.trust_level === 'unknown'),
    [images]
  );

  if (loading) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: T.muted, fontSize: 15 }}>Loading image trust data…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f87171', fontSize: 15 }}>Error: {error || 'No data'}</div>
    </div>
  );

  const score = data.trust_score ?? 0;
  const totalImgs = data.total_images ?? images.length;
  const privateCount   = data.private_images   ?? images.filter((i: any) => i.trust_level === 'private').length;
  const communityCount = data.community_images  ?? images.filter((i: any) => i.trust_level === 'community').length;
  const untrustedCount = data.untrusted_images  ?? images.filter((i: any) => i.trust_level === 'untrusted').length;
  const unknownCount   = data.unknown_trust      ?? images.filter((i: any) => i.trust_level === 'unknown').length;

  const scoreDeg = (score / 100) * 251;  // arc length for SVG ring (r=40, circumference≈251)

  return (
    <div style={{ background: T.bg, minHeight: '100vh', padding: '24px', fontFamily: '-apple-system,"Segoe UI",system-ui,sans-serif', color: T.text, fontSize: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1e2433', border: '1px solid #2a3245', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔏</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Image Trust & Provenance</div>
          <div style={{ color: T.muted, fontSize: 13 }}>Registry classification, signature verification and provenance tracking</div>
        </div>
        <div style={{ marginLeft: 'auto', background: '#1e2433', border: '1px solid #2a3245', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: T.muted }}>
          {data.cluster_name ?? 'xforce-devops'} · {totalImgs} unique images
        </div>
      </div>

      {/* ── Score + Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 20 }}>

        {/* Score ring */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="110" height="110" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#2a3245" strokeWidth="8" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={scoreColor(score)} strokeWidth="8"
              strokeDasharray={`${(score / 100) * 251.3} 251.3`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)" />
            <text x="50" y="46" textAnchor="middle" fill={scoreColor(score)} fontSize="18" fontWeight="700">{Math.round(score)}</text>
            <text x="50" y="62" textAnchor="middle" fill="#8892a4" fontSize="9">Trust Score</text>
          </svg>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            {score >= 80 ? '🟢 Good' : score >= 60 ? '🟡 Fair' : '🔴 Poor'}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Unique Images', value: totalImgs, col: T.accent },
            { label: 'Private Registry', value: privateCount, col: '#60a5fa' },
            { label: 'Community Images', value: communityCount, col: '#f59e0b' },
            { label: 'Unknown / Untrusted', value: unknownCount + untrustedCount, col: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.col }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Registry Breakdown + Spotlight ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Registry breakdown */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Registry Distribution</div>
          {registryBreakdown.slice(0, 8).map((r: any) => {
            const trust = images.find((i: any) => i.registry === r.registry)?.trust_level ?? 'unknown';
            const pal = trustPalette(trust);
            const pct = Math.min(r.percentage, 100);
            return (
              <div key={r.registry} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: 11, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}` }}>{trust}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: T.text }}>{r.registry}</span>
                  </div>
                  <div style={{ color: T.muted, fontSize: 12 }}>{r.image_count} imgs · {pct}%</div>
                </div>
                <div style={{ height: 5, background: '#2a3245', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pal.text, borderRadius: 3, transition: 'width .3s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Risk spotlight: unknown/untrusted images */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>⚠️ Risk Spotlight</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: T.unknown.bg, color: T.unknown.text, border: `1px solid ${T.unknown.border}` }}>
              {spotlightImages.length} at risk
            </span>
          </div>
          {spotlightImages.length === 0 ? (
            <div style={{ color: T.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              ✅ No untrusted or unknown images
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {spotlightImages.slice(0, 15).map((img: any, i: number) => {
                const pal = trustPalette(img.trust_level);
                return (
                  <div key={i} style={{ padding: '8px 10px', background: '#151f30', borderRadius: 8, marginBottom: 6, border: `1px solid ${pal.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}`, whiteSpace: 'nowrap' }}>{img.trust_level}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.image}>{img.image}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: T.muted }}>
                      {img.namespace} · {img.pod_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Trust Level Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { level: 'private', label: 'Private Registry', count: privateCount, icon: '🔐',
            desc: 'IBM ICR (us.icr.io, icr.io, de.icr.io) and other private registries. Trusted for enterprise use.' },
          { level: 'community', label: 'Community Images', count: communityCount, icon: '🌐',
            desc: 'Public registries like quay.io and docker.io. May carry upstream CVEs. Verify versions.' },
          { level: 'unknown', label: 'Unknown / Untrusted', count: unknownCount + untrustedCount, icon: '❓',
            desc: 'Registries that cannot be classified or lack signature verification. Require review.' },
        ].map(item => {
          const pal = trustPalette(item.level);
          return (
            <div key={item.level} style={{ background: T.card, border: `1px solid ${pal.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setFilterTrust(filterTrust === item.level ? 'all' : item.level)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: pal.text }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 700, color: pal.text }}>{item.count}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{item.desc}</div>
              {filterTrust === item.level && (
                <div style={{ marginTop: 8, fontSize: 11, color: pal.text }}>▶ Filtering by this level — click to clear</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Filters + Table ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Image Analysis
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: T.muted }}>
              {filtered.length} of {images.length} containers
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Search */}
            <input
              placeholder="Search image / pod / namespace…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }}
            />
            {/* Trust filter */}
            <select value={filterTrust} onChange={e => setFilterTrust(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Trust Levels</option>
              <option value="private">Private</option>
              <option value="community">Community</option>
              <option value="unknown">Unknown</option>
              <option value="trusted">Trusted</option>
            </select>
            {/* Registry filter */}
            <select value={filterReg} onChange={e => setFilterReg(e.target.value)}
              style={{ background: '#151f30', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px', color: T.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Registries</option>
              {registries.filter(r => r !== 'all').map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {/* Namespace filter */}
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
                {['Image', 'Pod', 'Namespace', 'Registry', 'Trust Level', 'Signed', 'Digest', 'Latest Tag', 'Recommendation'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: T.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((img: any, i: number) => {
                const pal = trustPalette(img.trust_level);
                const isRisky = img.trust_level === 'unknown' || img.trust_level === 'untrusted';
                return (
                  <tr key={i}
                    style={{ borderBottom: `1px solid ${T.border}`, background: isRisky ? '#151820' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1a2035')}
                    onMouseLeave={e => (e.currentTarget.style.background = isRisky ? '#151820' : 'transparent')}>
                    {/* Image */}
                    <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.image}>
                        {img.image}
                      </div>
                    </td>
                    {/* Pod */}
                    <td style={{ padding: '9px 12px', maxWidth: 180 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.pod_name}>
                        {img.pod_name}
                      </div>
                    </td>
                    {/* Namespace */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#1e2433', color: '#60a5fa', border: '1px solid #2a3245' }}>
                        {img.namespace}
                      </span>
                    </td>
                    {/* Registry */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12, color: T.muted }}>
                      {img.registry}
                    </td>
                    {/* Trust Level */}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: pal.bg, color: pal.text, border: `1px solid ${pal.border}`, fontWeight: 500 }}>
                        {img.trust_level}
                      </span>
                    </td>
                    {/* Signed */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: img.signed ? '#4ade80' : '#f87171' }}>{img.signed ? '✓' : '✗'}</span>
                    </td>
                    {/* Uses Digest */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: img.uses_digest ? '#4ade80' : '#f87171' }}>{img.uses_digest ? '✓' : '✗'}</span>
                    </td>
                    {/* Latest Tag */}
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 14, color: img.uses_latest_tag ? '#f87171' : '#4ade80' }}>
                        {img.uses_latest_tag ? '⚠ yes' : '✓ no'}
                      </span>
                    </td>
                    {/* Recommendation */}
                    <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                      <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.recommendation}>
                        {img.recommendation}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: T.muted }}>No images match the current filters.</div>
        )}
        {filtered.length > 100 && (
          <div style={{ textAlign: 'center', padding: '12px', color: T.muted, fontSize: 12 }}>
            Showing 100 of {filtered.length} entries. Refine filters to narrow down.
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
