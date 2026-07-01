import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import { useCluster } from '../contexts/ClusterContext';
import type { ClusterInfo } from '../contexts/ClusterContext';

/* ── Design tokens — matches Login dark K8s theme ── */
const C = {
  bg:             '#050d1a',
  bgPanel:        '#071022',
  bgCard:         '#0b1628',
  bgSurface:      '#0f1e35',
  borderDim:      '#1a2e4a',
  border:         '#1e3a5f',
  borderBright:   '#2a5080',
  cyan:           '#00d4ff',
  cyanDim:        '#00a8cc',
  cyanGlow:       'rgba(0,212,255,0.15)',
  cyanGlowStrong: 'rgba(0,212,255,0.25)',
  green:          '#39ff14',
  greenDim:       '#22cc00',
  greenGlow:      'rgba(57,255,20,0.12)',
  amber:          '#f59e0b',
  amberGlow:      'rgba(245,158,11,0.15)',
  red:            '#ef4444',
  redGlow:        'rgba(239,68,68,0.15)',
  primary:        '#2563eb',
  textPrimary:    '#e2f0ff',
  textSecondary:  '#7ca5cc',
  textMuted:      '#3d6080',
};

/* ── Hex grid background (identical to Login) ── */
const HexGrid: React.FC = () => {
  const hexPoints = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');

  const hexes: { cx: number; cy: number; opacity: number; fill: boolean }[] = [];
  const r = 28; const cols = 22; const rows = 14;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * r * 1.732 + (row % 2 === 1 ? r * 0.866 : 0) + r;
      const cy = row * r * 1.5 + r;
      hexes.push({ cx, cy, opacity: 0.03 + Math.random() * 0.05, fill: Math.random() > 0.92 });
    }
  }

  return (
    <svg viewBox={`0 0 ${cols * r * 1.732 + r} ${rows * r * 1.5 + r}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      preserveAspectRatio="xMidYMid slice">
      {hexes.map((h, i) => (
        <polygon key={i}
          points={hexPoints(h.cx, h.cy, r - 2)}
          fill={h.fill ? C.cyan : 'none'}
          fillOpacity={h.fill ? 0.025 : 0}
          stroke={C.cyan} strokeOpacity={h.opacity} strokeWidth="0.7"
        />
      ))}
    </svg>
  );
};

/* ── K8s wheel icon ── */
const K8sWheel: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = C.cyan }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" fill="none">
    {Array.from({ length: 7 }, (_, k) => {
      const a = (2 * Math.PI * k) / 7 - Math.PI / 2;
      return <line key={k}
        x1={15 + 5 * Math.cos(a)} y1={15 + 5 * Math.sin(a)}
        x2={15 + 12 * Math.cos(a)} y2={15 + 12 * Math.sin(a)}
        stroke={color} strokeWidth="2" strokeLinecap="round" />;
    })}
    <circle cx="15" cy="15" r="4" fill={color} />
  </svg>
);

/* ── Mini topology inside cluster card ── */
const MiniTopology: React.FC<{ nodes: number; status: string }> = ({ nodes, status }) => {
  const color = status === 'healthy' ? C.green : status === 'warning' ? C.amber : C.red;
  const capped = Math.min(nodes, 6);
  const cx = 60; const cy = 40;
  const workerPositions = Array.from({ length: capped }, (_, i) => {
    const a = (2 * Math.PI * i) / capped - Math.PI / 2;
    return { x: cx + 28 * Math.cos(a), y: cy + 28 * Math.sin(a) };
  });

  return (
    <svg viewBox="0 0 120 80" width="120" height="80" fill="none" style={{ opacity: 0.8 }}>
      {workerPositions.map((w, i) => (
        <line key={i} x1={cx} y1={cy} x2={w.x} y2={w.y}
          stroke={C.borderBright} strokeWidth="0.8" strokeDasharray="2,2" opacity="0.5" />
      ))}
      {workerPositions.map((w, i) => (
        <g key={i}>
          <circle cx={w.x} cy={w.y} r="7" fill={C.bgSurface} stroke={C.cyanDim} strokeWidth="1" />
          <rect x={w.x - 3} y={w.y - 3} width="6" height="6" rx="1" fill={C.cyanDim} opacity="0.7" />
        </g>
      ))}
      {nodes > 6 && (
        <text x="110" y="75" fill={C.textMuted} fontSize="7" fontFamily="'JetBrains Mono',monospace">+{nodes - 6}</text>
      )}
      {/* Control plane */}
      <circle cx={cx} cy={cy} r="12" fill={C.bgSurface} stroke={color} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r="14" fill={color} fillOpacity="0.06" />
      <K8sWheel size={14} color={color} />
      <g transform={`translate(${cx - 7}, ${cy - 7})`}><K8sWheel size={14} color={color} /></g>
    </svg>
  );
};

/* ── Status dot ── */
const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'healthy' ? C.green : status === 'warning' ? C.amber : C.red;
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color,
      boxShadow: `0 0 6px ${color}`, marginRight: 6 }} />
  );
};

/* ── Provider badge ── */
const ProviderBadge: React.FC<{ provider: string }> = ({ provider }) => {
  const label = provider.toUpperCase();
  const color = provider.toLowerCase().includes('gke') ? C.cyan
    : provider.toLowerCase().includes('eks') ? C.amber
    : provider.toLowerCase().includes('aks') ? C.primary
    : C.textSecondary;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      color, border: `1px solid ${color}`, borderRadius: 3,
      padding: '1px 5px', fontFamily: "'JetBrains Mono',monospace",
      opacity: 0.85,
    }}>{label}</span>
  );
};

/* ── Env badge ── */
const EnvBadge: React.FC<{ env: string }> = ({ env }) => {
  const color = env === 'production' ? C.red : env === 'staging' ? C.amber : C.cyanDim;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      color, border: `1px solid ${color}`, borderRadius: 3,
      padding: '1px 5px', fontFamily: "'JetBrains Mono',monospace",
      background: `${color}11`,
    }}>{env.toUpperCase()}</span>
  );
};

/* ── Stat cell ── */
const Stat: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    <span style={{ fontSize: 18, fontWeight: 700, color: color || C.textPrimary,
      fontFamily: "'JetBrains Mono','Fira Code',monospace", letterSpacing: '-0.02em' }}>
      {value}
    </span>
    <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {label}
    </span>
  </div>
);

/* ── Health score ring ── */
const HealthRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 20; const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 90 ? C.green : score >= 70 ? C.amber : C.red;
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke={C.borderDim} strokeWidth="3" />
        <circle cx="26" cy="26" r={r} fill="none"
          stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 7, color: C.textMuted, letterSpacing: '0.04em' }}>SCORE</span>
      </div>
    </div>
  );
};

/* ── Usage bar ── */
const UsageBar: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const pct = parseInt(value) || 0;
  const color = pct > 85 ? C.red : pct > 65 ? C.amber : C.cyan;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace" }}>{label}</span>
        <span style={{ fontSize: 10, color, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 3, background: C.borderDim, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          borderRadius: 2, boxShadow: `0 0 6px ${color}`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
};

/* ── Cluster card ── */
const ClusterCard: React.FC<{
  cluster: ClusterInfo;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ cluster, isActive, onSelect, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const statusColor = cluster.status === 'healthy' ? C.green : cluster.status === 'warning' ? C.amber : C.red;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: isActive
          ? `linear-gradient(145deg, #0e1f3a 0%, #091628 100%)`
          : `linear-gradient(145deg, ${C.bgCard} 0%, #080f20 100%)`,
        border: `1px solid ${isActive ? C.cyan : hovered ? C.borderBright : C.borderDim}`,
        borderRadius: 12,
        padding: '20px',
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: isActive
          ? `0 0 0 1px ${C.cyanGlow}, 0 8px 32px rgba(0,0,0,0.4), 0 0 32px ${C.cyanGlow}`
          : hovered
            ? `0 8px 32px rgba(0,0,0,0.4), 0 0 16px rgba(0,212,255,0.08)`
            : '0 4px 16px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>

      {/* Top accent line when active */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
          background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
        }} />
      )}

      {/* Status stripe on left edge */}
      <div style={{
        position: 'absolute', top: 16, bottom: 16, left: 0, width: 3,
        background: statusColor, borderRadius: '0 2px 2px 0',
        boxShadow: `0 0 8px ${statusColor}`,
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingLeft: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <StatusDot status={cluster.status} />
            <span style={{
              fontSize: 14, fontWeight: 700, color: C.textPrimary,
              fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif",
              letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{cluster.name}</span>
            {isActive && (
              <span style={{
                fontSize: 8, fontWeight: 700, color: C.cyan, letterSpacing: '0.1em',
                border: `1px solid ${C.cyan}`, borderRadius: 2, padding: '1px 4px',
                fontFamily: "'JetBrains Mono',monospace", background: C.cyanGlow,
              }}>ACTIVE</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <EnvBadge env={cluster.environment} />
            <ProviderBadge provider={cluster.provider} />
            <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>
              {cluster.region} · v{cluster.version}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <HealthRing score={cluster.health_score} />
        </div>
      </div>

      {/* Topology + stats */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: 10, marginBottom: 14 }}>
        <MiniTopology nodes={cluster.nodes} status={cluster.status} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 16px' }}>
          <Stat label="Nodes" value={cluster.nodes} color={C.cyan} />
          <Stat label="Pods" value={cluster.pods} color={C.green} />
          <Stat label="Namespaces" value={cluster.namespaces} color={C.cyanDim} />
          <Stat label="Monthly Cost" value={`$${cluster.monthly_cost.toLocaleString()}`} />
          <Stat label="Potential Save" value={`$${cluster.potential_savings.toLocaleString()}`} color={C.green} />
          <Stat label="Status" value={cluster.status.toUpperCase()} color={statusColor} />
        </div>
      </div>

      {/* CPU / Memory bars */}
      <div style={{ paddingLeft: 10, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <UsageBar label="CPU" value={cluster.cpu_usage} />
        <UsageBar label="Memory" value={cluster.memory_usage} />
      </div>

      {/* Footer: last updated + delete */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingLeft: 10, paddingTop: 10,
        borderTop: `1px solid ${C.borderDim}`,
      }}>
        <span style={{
          fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em',
        }}>
          Updated {new Date(cluster.last_updated).toLocaleTimeString()}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'none', border: `1px solid ${C.borderDim}`, borderRadius: 4,
            padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            color: C.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.borderDim; e.currentTarget.style.color = C.textMuted; }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
          </svg>
          REMOVE
        </button>
      </div>
    </div>
  );
};

/* ── Summary card ── */
const SummaryCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: React.ReactNode }> =
  ({ label, value, sub, color, icon }) => (
    <div style={{
      background: `linear-gradient(145deg, ${C.bgCard}, #080f20)`,
      border: `1px solid ${C.borderDim}`,
      borderRadius: 10, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace" }}>
          {label}
        </span>
        {icon}
      </div>
      <span style={{ fontSize: 24, fontWeight: 700, color: color || C.textPrimary, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '-0.03em' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: C.textSecondary }}>{sub}</span>}
    </div>
  );

/* ════════════════════════════════════════════════════ */
/* ── MAIN PAGE COMPONENT ─────────────────────────── */
/* ════════════════════════════════════════════════════ */
const Clusters: React.FC = () => {
  const { clusters, loading, error, refreshClusters, deleteCluster, activeClusterId, selectCluster } = useCluster();
  const [deleteTarget, setDeleteTarget] = useState<ClusterInfo | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [refreshSpin, setRefreshSpin] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteInProgress(true);
    try {
      const result = await deleteCluster(deleteTarget.id);
      setToast({
        open: true,
        message: result.success
          ? `Cluster "${deleteTarget.name}" removed from all dashboards.`
          : `Failed to remove: ${result.error}`,
        severity: result.success ? 'success' : 'error',
      });
    } finally {
      setDeleteInProgress(false);
      setDeleteTarget(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await refreshClusters();
    setRefreshSpin(false);
  };

  const totalNodes = clusters.reduce((s, c) => s + c.nodes, 0);
  const totalPods = clusters.reduce((s, c) => s + c.pods, 0);
  const totalCost = clusters.reduce((s, c) => s + c.monthly_cost, 0);
  const totalSavings = clusters.reduce((s, c) => s + c.potential_savings, 0);
  const avgHealth = clusters.length ? Math.round(clusters.reduce((s, c) => s + c.health_score, 0) / clusters.length) : 0;
  const healthyClusters = clusters.filter(c => c.status === 'healthy').length;

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── CSS keyframes ── */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>

      {/* Hex grid bg */}
      <div style={{ position: 'fixed', inset: 0, opacity: 0.25, pointerEvents: 'none' }}>
        <HexGrid />
      </div>

      {/* Corner glows */}
      <div style={{
        position: 'fixed', top: -120, left: -120, width: 500, height: 500,
        background: `radial-gradient(circle, ${C.cyanGlow} 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -100, right: -100, width: 400, height: 400,
        background: `radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* ── Page content ── */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Logo icon */}
            <div style={{
              width: 44, height: 44,
              background: `linear-gradient(135deg, ${C.bgSurface}, #0d2040)`,
              border: `1.5px solid ${C.cyan}`,
              borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${C.cyanGlowStrong}`,
              flexShrink: 0,
            }}>
              <K8sWheel size={24} color={C.cyan} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.02em' }}>
                Multi-Cluster Dashboard
              </h1>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.08em', marginTop: 2 }}>
                UNIFIED KUBERNETES FLEET VIEW
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Live indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(57,255,20,0.06)', border: `1px solid rgba(57,255,20,0.2)`,
              borderRadius: 4, padding: '4px 10px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green,
                boxShadow: `0 0 6px ${C.green}`, animation: 'pulse-dot 2s ease-in-out infinite', display: 'inline-block' }} />
              <span style={{ fontSize: 9, color: C.green, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em', fontWeight: 700 }}>
                LIVE
              </span>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              style={{
                background: 'rgba(0,212,255,0.05)', border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '6px 14px', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                color: C.textSecondary, fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: '0.06em', opacity: loading ? 0.5 : 1,
                transition: 'border-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.color = C.cyan; }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round"
                style={{ animation: refreshSpin ? 'spin 0.8s linear infinite' : 'none' }}>
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              REFRESH
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`,
            borderRadius: 8, padding: '10px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: 12, color: C.red, fontFamily: "'JetBrains Mono',monospace" }}>
              {error} — showing cached data
            </span>
          </div>
        )}

        {/* ── Summary strip ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28,
        }}
          className="clusters-summary-grid"
        >
          <SummaryCard label="Clusters" value={clusters.length}
            sub={`${healthyClusters} healthy`} color={C.cyan}
            icon={<K8sWheel size={14} color={C.cyan} />} />
          <SummaryCard label="Total Nodes" value={totalNodes} color={C.textPrimary}
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>} />
          <SummaryCard label="Total Pods" value={totalPods} color={C.green}
            sub="across all clusters"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>} />
          <SummaryCard label="Avg Health" value={`${avgHealth}/100`}
            color={avgHealth >= 90 ? C.green : avgHealth >= 70 ? C.amber : C.red} />
          <SummaryCard label="Monthly Cost" value={`$${totalCost.toLocaleString()}`} color={C.textPrimary} />
          <SummaryCard label="Potential Savings" value={`$${totalSavings.toLocaleString()}`} color={C.green}
            sub="optimization available"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>} />
        </div>

        {/* ── Loading state ── */}
        {loading && clusters.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
            <div style={{
              width: 52, height: 52,
              border: `2px solid ${C.borderDim}`, borderTopColor: C.cyan,
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em' }}>
              CONNECTING TO CLUSTER FLEET…
            </span>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && clusters.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            background: `linear-gradient(145deg, ${C.bgCard}, #080f20)`,
            border: `1px solid ${C.borderDim}`, borderRadius: 12,
          }}>
            <K8sWheel size={48} color={C.borderBright} />
            <div style={{ fontSize: 15, color: C.textSecondary, marginTop: 16, fontWeight: 600 }}>
              No clusters registered
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono',monospace" }}>
              kubectl apply -f cluster-onboarding.yaml
            </div>
          </div>
        )}

        {/* ── Cluster grid ── */}
        {clusters.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 16,
          }}>
            {clusters.map(cluster => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                isActive={activeClusterId === cluster.id}
                onSelect={() => selectCluster(cluster.id)}
                onDelete={() => setDeleteTarget(cluster)}
              />
            ))}
          </div>
        )}

        {/* ── Terminal footer ── */}
        <div style={{
          marginTop: 32, padding: '12px 16px',
          background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.borderDim}`,
          borderRadius: 8, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f' }} />
            <span style={{ marginLeft: 8, fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
              kubectl get clusters --all-namespaces
            </span>
          </div>
          {[
            { label: 'clusters', value: clusters.length, color: C.cyan },
            { label: 'nodes', value: totalNodes, color: C.textSecondary },
            { label: 'pods', value: totalPods, color: C.green },
            { label: 'health', value: `${avgHealth}%`, color: avgHealth >= 80 ? C.green : C.amber },
          ].map(s => (
            <span key={s.label} style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: C.textMuted }}>
              <span style={{ color: s.color, fontWeight: 700 }}>{s.value}</span>{' '}{s.label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: C.green }}>$</span>
            <span style={{ display: 'inline-block', width: 7, height: 12, background: C.green,
              animation: 'pulse-dot 1s step-end infinite', verticalAlign: 'middle' }} />
          </span>
        </div>
      </div>

      {/* ── Responsive grid ── */}
      <style>{`
        @media (max-width: 900px) {
          .clusters-summary-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .clusters-summary-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth
        PaperProps={{ style: { background: C.bgCard, border: `1px solid ${C.borderBright}`, borderRadius: 12 } }}>
        <DialogTitle style={{ color: C.red, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, letterSpacing: '0.04em' }}>
          REMOVE CLUSTER — {deleteTarget?.name}
        </DialogTitle>
        <DialogContent>
          <DialogContentText style={{ color: C.textSecondary, fontSize: 13 }}>
            This will permanently remove <strong style={{ color: C.textPrimary }}>{deleteTarget?.name}</strong> from
            the platform and purge all associated data from every dashboard.
          </DialogContentText>
          <div style={{
            marginTop: 16, padding: '12px 14px',
            background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.25)`,
            borderRadius: 8, fontSize: 12, color: '#fca5a5', fontFamily: "'JetBrains Mono',monospace",
            lineHeight: 1.7,
          }}>
            {['All pods, workloads & node data', 'Cost and savings metrics',
              'Security and compliance findings', 'Network & storage data',
              'Simulation engine state'].map(line => (
              <div key={line} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: C.red }}>✗</span> {line}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>
            {deleteTarget?.environment} · {deleteTarget?.region} · {deleteTarget?.nodes} nodes · {deleteTarget?.pods} pods
          </div>
        </DialogContent>
        <DialogActions style={{ padding: '8px 20px 16px' }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteInProgress}
            style={{ color: C.textSecondary, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
            CANCEL
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} disabled={deleteInProgress}
            startIcon={deleteInProgress ? <CircularProgress size={14} color="inherit" /> : undefined}
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: '0.06em' }}>
            {deleteInProgress ? 'REMOVING…' : 'CONFIRM REMOVE'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ── */}
      <Snackbar open={toast.open} autoHideDuration={5000}
        onClose={() => setToast(p => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast(p => ({ ...p, open: false }))}
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Clusters;

// Made with Bob
