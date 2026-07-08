import React, { useEffect, useRef } from 'react';
import { SignIn, useAuth } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';

/* ── Design tokens — Dark K8s terminal theme ── */
const C = {
  /* Backgrounds */
  bg:              '#050d1a',
  bgPanel:         '#071022',
  bgCard:          '#0b1628',
  bgSurface:       '#0f1e35',
  /* Borders */
  borderDim:       '#1a2e4a',
  border:          '#1e3a5f',
  borderBright:    '#2a5080',
  /* Accent — cyan / teal */
  cyan:            '#00d4ff',
  cyanDim:         '#00a8cc',
  cyanGlow:        'rgba(0,212,255,0.15)',
  cyanGlowStrong:  'rgba(0,212,255,0.25)',
  /* Accent — lime / green for "running" pods */
  green:           '#39ff14',
  greenDim:        '#22cc00',
  greenGlow:       'rgba(57,255,20,0.12)',
  /* Primary action */
  primary:         '#2563eb',
  primaryHover:    '#1d4ed8',
  /* Text */
  textPrimary:     '#e2f0ff',
  textSecondary:   '#7ca5cc',
  textMuted:       '#3d6080',
  textDim:         '#1e3a5f',
};

/* ── Small reusable chip ── */
const Chip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '10px 16px',
    background: 'rgba(0,0,0,0.3)',
    border: `1px solid ${C.borderDim}`,
    borderRadius: '8px',
    minWidth: '80px',
  }}>
    <span style={{ fontSize: '18px', fontWeight: 700, color, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", letterSpacing: '-0.02em' }}>{value}</span>
    <span style={{ fontSize: '10px', color: C.textMuted, marginTop: '2px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
  </div>
);

/* ── Animated hex grid background (pure SVG, no canvas) ── */
const HexGrid: React.FC = () => {
  const hexPoints = (cx: number, cy: number, r: number) => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    }).join(' ');
  };

  const hexes: { cx: number; cy: number; opacity: number; fill: boolean }[] = [];
  const r = 28;
  const cols = 14;
  const rows = 10;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * r * 1.732 + (row % 2 === 1 ? r * 0.866 : 0) + r;
      const cy = row * r * 1.5 + r;
      const opacity = 0.04 + Math.random() * 0.06;
      const fill = Math.random() > 0.88;
      hexes.push({ cx, cy, opacity, fill });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${14 * 28 * 1.732 + 28} ${10 * 28 * 1.5 + 28}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      preserveAspectRatio="xMidYMid slice"
    >
      {hexes.map((h, i) => (
        <polygon
          key={i}
          points={hexPoints(h.cx, h.cy, r - 2)}
          fill={h.fill ? C.cyan : 'none'}
          fillOpacity={h.fill ? 0.03 : 0}
          stroke={C.cyan}
          strokeOpacity={h.opacity}
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
};

/* ── K8s network topology SVG (left panel decoration) ── */
const K8sTopology: React.FC = () => {
  const nodes = [
    { x: 220, y: 120, type: 'control', label: 'control-plane', r: 22 },
    { x: 100, y: 240, type: 'worker', label: 'node-01', r: 16 },
    { x: 220, y: 280, type: 'worker', label: 'node-02', r: 16 },
    { x: 340, y: 240, type: 'worker', label: 'node-03', r: 16 },
    { x: 80,  y: 360, type: 'pod', label: 'api-svc', r: 10 },
    { x: 160, y: 380, type: 'pod', label: 'auth', r: 10 },
    { x: 220, y: 400, type: 'pod', label: 'db', r: 10 },
    { x: 290, y: 370, type: 'pod', label: 'cache', r: 10 },
    { x: 360, y: 360, type: 'pod', label: 'worker', r: 10 },
  ];

  const edges = [
    [0,1],[0,2],[0,3],
    [1,4],[1,5],[2,6],[3,7],[3,8],
    [4,5],[7,8],
  ];

  const colorFor = (type: string) => {
    if (type === 'control') return C.cyan;
    if (type === 'worker') return C.cyanDim;
    return C.green;
  };

  return (
    <svg viewBox="0 0 440 460" style={{ width: '100%', maxWidth: '340px', opacity: 0.7 }} fill="none">
      {/* Edges */}
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke={C.borderBright} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
        />
      ))}

      {/* Node glows */}
      {nodes.map((n, i) => (
        <circle key={`glow-${i}`}
          cx={n.x} cy={n.y} r={n.r + 8}
          fill={colorFor(n.type)}
          opacity="0.08"
        />
      ))}

      {/* Node circles */}
      {nodes.map((n, i) => (
        <g key={`node-${i}`}>
          <circle cx={n.x} cy={n.y} r={n.r}
            fill={C.bgSurface}
            stroke={colorFor(n.type)}
            strokeWidth={n.type === 'control' ? 2 : 1.5}
          />
          {n.type === 'control' && (
            /* K8s wheel in control plane */
            <g>
              {Array.from({ length: 7 }, (_, k) => {
                const angle = (2 * Math.PI * k) / 7 - Math.PI / 2;
                return (
                  <line key={k}
                    x1={n.x + 5 * Math.cos(angle)} y1={n.y + 5 * Math.sin(angle)}
                    x2={n.x + (n.r - 4) * Math.cos(angle)} y2={n.y + (n.r - 4) * Math.sin(angle)}
                    stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round"
                  />
                );
              })}
              <circle cx={n.x} cy={n.y} r="4" fill={C.cyan} />
            </g>
          )}
          {n.type === 'worker' && (
            <rect x={n.x - 5} y={n.y - 5} width="10" height="10" rx="2"
              fill={C.cyanDim} opacity="0.7"
            />
          )}
          {n.type === 'pod' && (
            <circle cx={n.x} cy={n.y} r="4" fill={C.green} opacity="0.9" />
          )}
          {/* Label */}
          <text x={n.x} y={n.y + n.r + 12}
            textAnchor="middle" fill={C.textSecondary}
            fontSize={n.type === 'control' ? 9 : 8}
            fontFamily="'JetBrains Mono','Fira Code',monospace"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* Namespace ring */}
      <ellipse cx="220" cy="310" rx="170" ry="115"
        stroke={C.borderDim} strokeWidth="1" strokeDasharray="6 4" fill="none" opacity="0.4"
      />
      <text x="390" y="230" fill={C.textMuted} fontSize="9" fontFamily="'JetBrains Mono','Fira Code',monospace" opacity="0.7">
        namespace: prod
      </text>
    </svg>
  );
};

/* ── Terminal-style blinking cursor line ── */
const TerminalLine: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => (
  <div style={{
    fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
    fontSize: '11px',
    color: C.textSecondary,
    lineHeight: '1.6',
    opacity: 0.8,
    animationDelay: `${delay}s`,
  }}>
    <span style={{ color: C.green, marginRight: '6px' }}>$</span>
    {text}
  </div>
);

const Login: React.FC = () => {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) navigate('/', { replace: true });
  }, [isSignedIn, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: C.bg,
      fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── CSS keyframes injected into head ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        @keyframes pulse-node {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes scan-line {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.4; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes flicker {
          0%, 95%, 100% { opacity: 1; }
          96% { opacity: 0.8; }
          97% { opacity: 0.95; }
        }
        @keyframes data-flow {
          0% { stroke-dashoffset: 20; }
          100% { stroke-dashoffset: 0; }
        }
        .k8s-login-input:focus {
          outline: none !important;
          border-color: ${C.cyan} !important;
          box-shadow: 0 0 0 2px ${C.cyanGlow}, 0 0 12px ${C.cyanGlowStrong} !important;
          background: #0a1830 !important;
        }
        .k8s-login-btn:hover {
          background: ${C.cyanDim} !important;
          box-shadow: 0 0 20px ${C.cyanGlowStrong} !important;
        }

        /* ══════════════════════════════════════════════════
           CLERK WIDGET — full chrome reset
           The goal: Clerk's card is invisible; only form
           elements are visible, contained in OUR card.
        ══════════════════════════════════════════════════ */

        /* Root / card wrappers — zero out all spacing & bg */
        .cl-rootBox,
        .cl-signIn-root,
        .cl-cardBox {
          width: 100% !important;
          max-width: 100% !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .cl-card {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
        }

        /* Clerk header — hidden, we render our own */
        .cl-header,
        .cl-headerTitle,
        .cl-headerSubtitle { display: none !important; }

        /* ── Clerk footer: "Secured by Clerk" + "Development mode" ──
           Use max-height + overflow clip as a belt-and-suspenders
           approach alongside display:none, because Clerk JS can
           re-show elements that were hidden via display:none.      */
        .cl-footer,
        .cl-footer *,
        .cl-footerPages,
        .cl-footerPages *,
        .cl-internal-b3fm6y,
        .cl-powered-by-clerk,
        .cl-devModeNotice,
        .cl-devModeWarning,
        [class*="devMode"],
        [class*="DevMode"],
        .cl-footerPages__signIn,
        .cl-footerPages__signUp {
          display: none !important;
          max-height: 0 !important;
          overflow: hidden !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
        }

        /* "Last used" badge — absolutely positioned, must be hidden */
        .cl-badge,
        [class*="badge"],
        .cl-providerIcon__lastUsed { display: none !important; }

        /* Transparent bg on all form containers */
        .cl-main,
        .cl-form,
        .cl-formFields,
        .cl-formBody,
        .cl-formFieldRow { background: transparent !important; }

        /* Google / social button */
        .cl-socialButtonsBlockButton {
          background: rgba(255,255,255,0.04) !important;
          border: 1px solid ${C.border} !important;
          border-radius: 8px !important;
          color: ${C.textPrimary} !important;
          height: 44px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          width: 100% !important;
          position: relative !important;
          overflow: hidden !important;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s !important;
        }
        .cl-socialButtonsBlockButton:hover {
          border-color: ${C.cyan} !important;
          background: rgba(0,212,255,0.06) !important;
          box-shadow: 0 0 12px rgba(0,212,255,0.15) !important;
        }
        .cl-socialButtonsBlockButtonText {
          font-weight: 600 !important;
          color: ${C.textPrimary} !important;
        }

        /* OR divider */
        .cl-dividerRow { margin: 8px 0 !important; }
        .cl-dividerLine { background: ${C.borderDim} !important; }
        .cl-dividerText {
          color: ${C.textMuted} !important;
          font-size: 10px !important;
          letter-spacing: 0.12em !important;
          text-transform: uppercase !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* Field label */
        .cl-formFieldLabel {
          color: ${C.textSecondary} !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.06em !important;
          text-transform: uppercase !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* Input */
        .cl-formFieldInput {
          background: rgba(0,0,0,0.4) !important;
          border: 1px solid ${C.border} !important;
          border-radius: 8px !important;
          color: ${C.textPrimary} !important;
          height: 44px !important;
          font-size: 14px !important;
          font-family: 'JetBrains Mono', monospace !important;
          width: 100% !important;
          box-sizing: border-box !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }
        .cl-formFieldInput:focus {
          border-color: ${C.cyan} !important;
          box-shadow: 0 0 0 2px ${C.cyanGlow}, 0 0 12px ${C.cyanGlowStrong} !important;
          background: #071525 !important;
          outline: none !important;
        }
        .cl-formFieldInputGroup { width: 100% !important; }

        /* Primary / Continue button */
        .cl-formButtonPrimary {
          background: linear-gradient(135deg, #1e40af, #1d4ed8) !important;
          border: 1px solid rgba(0,212,255,0.3) !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          font-size: 14px !important;
          height: 44px !important;
          width: 100% !important;
          letter-spacing: 0.04em !important;
          box-shadow: 0 0 20px rgba(37,99,235,0.3) !important;
          transition: all 0.2s !important;
          font-family: 'JetBrains Mono', monospace !important;
          margin-top: 4px !important;
        }
        .cl-formButtonPrimary:hover {
          background: linear-gradient(135deg, #1d4ed8, #2563eb) !important;
          box-shadow: 0 0 28px rgba(37,99,235,0.5), 0 0 12px ${C.cyanGlowStrong} !important;
          border-color: ${C.cyan} !important;
        }

        /* Forgot password link */
        .cl-formFieldAction {
          color: ${C.textMuted} !important;
          font-size: 11px !important;
          font-family: 'JetBrains Mono', monospace !important;
        }

        /* OTP input */
        .cl-otpCodeFieldInput {
          background: rgba(0,0,0,0.4) !important;
          border: 1px solid ${C.border} !important;
          color: ${C.cyan} !important;
          font-family: 'JetBrains Mono', monospace !important;
          font-size: 20px !important;
        }
      `}</style>

      {/* ── Scan line ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '2px',
        background: `linear-gradient(90deg, transparent 0%, ${C.cyan} 50%, transparent 100%)`,
        opacity: 0,
        animation: 'scan-line 8s linear infinite',
        pointerEvents: 'none', zIndex: 100,
      }} />

      {/* ── LEFT PANEL — topology & stats ── */}
      <div style={{
        display: 'none',
        flex: '1',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 48px',
        background: C.bgPanel,
        borderRight: `1px solid ${C.borderDim}`,
        position: 'relative',
        overflow: 'hidden',
      }} className="k8s-left-panel">

        {/* hex grid bg */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
          <HexGrid />
        </div>

        {/* corner glow */}
        <div style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '400px', height: '400px',
          background: `radial-gradient(circle, ${C.cyanGlow} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Brand */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
            <div style={{
              width: '40px', height: '40px',
              background: `linear-gradient(135deg, #0f1e35, #1a3a5c)`,
              border: `1px solid ${C.cyan}`,
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 16px ${C.cyanGlowStrong}`,
            }}>
              <svg width="22" height="22" viewBox="0 0 30 30" fill="none">
                {Array.from({ length: 7 }, (_, k) => {
                  const angle = (2 * Math.PI * k) / 7 - Math.PI / 2;
                  return (
                    <line key={k}
                      x1={15 + 5 * Math.cos(angle)} y1={15 + 5 * Math.sin(angle)}
                      x2={15 + 12 * Math.cos(angle)} y2={15 + 12 * Math.sin(angle)}
                      stroke={C.cyan} strokeWidth="2.2" strokeLinecap="round"
                    />
                  );
                })}
                <circle cx="15" cy="15" r="4" fill={C.cyan} />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.01em' }}>
                K8s Optimization
              </div>
              <div style={{ fontSize: '11px', color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
                PLATFORM v2.4.1
              </div>
            </div>
          </div>

          {/* Topology diagram */}
          <div style={{ marginBottom: '32px' }}>
            <K8sTopology />
          </div>

          {/* Live cluster stats */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Chip label="Nodes" value="24" color={C.cyan} />
            <Chip label="Pods" value="847" color={C.green} />
            <Chip label="Health" value="99%" color={C.green} />
            <Chip label="Savings" value="$12k" color={C.cyan} />
          </div>
        </div>

        {/* Terminal log */}
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'rgba(0,0,0,0.5)',
          border: `1px solid ${C.borderDim}`,
          borderRadius: '8px',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }} />
            <span style={{ marginLeft: '8px', fontSize: '10px', color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
              kubectl logs — platform
            </span>
          </div>
          <TerminalLine text="kubectl get nodes --all-namespaces" />
          <TerminalLine text="cluster health: OPTIMAL ✓" delay={0.3} />
          <TerminalLine text="optimization savings: $12,430/mo" delay={0.6} />
          <TerminalLine text="security score: 94/100 ✓" delay={0.9} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: C.green }}>$</span>
            <span style={{ display: 'inline-block', width: '8px', height: '13px', background: C.green, animation: 'blink 1s step-end infinite', verticalAlign: 'middle' }} />
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — auth form ── */}
      <div style={{
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        position: 'relative',
        overflow: 'auto',
        minHeight: '100vh',
      }}>

        {/* bg hex grid faint */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.3 }}>
          <HexGrid />
        </div>

        {/* glow top-right */}
        <div style={{
          position: 'absolute', top: '-100px', right: '-100px',
          width: '500px', height: '500px',
          background: `radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        {/* glow bottom-left */}
        <div style={{
          position: 'absolute', bottom: '-100px', left: '-100px',
          width: '400px', height: '400px',
          background: `radial-gradient(circle, ${C.cyanGlow} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Dev mode badge */}
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 50,
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(0,212,255,0.08)',
          backdropFilter: 'blur(8px)',
          padding: '5px 12px', borderRadius: '4px',
          border: `1px solid rgba(0,212,255,0.25)`,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span style={{ fontSize: '10px', fontWeight: 700, color: C.cyan, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace" }}>
            Dev Mode
          </span>
        </div>

        {/* Main content */}
        <div style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}>

          {/* Logo + title */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '64px', height: '64px',
              background: `linear-gradient(135deg, ${C.bgSurface}, #0d2040)`,
              border: `1.5px solid ${C.cyan}`,
              borderRadius: '16px',
              marginBottom: '16px',
              boxShadow: `0 0 32px ${C.cyanGlowStrong}, inset 0 1px 0 rgba(0,212,255,0.1)`,
            }}>
              <svg width="36" height="36" viewBox="0 0 30 30" fill="none">
                {Array.from({ length: 7 }, (_, k) => {
                  const angle = (2 * Math.PI * k) / 7 - Math.PI / 2;
                  return (
                    <line key={k}
                      x1={15 + 5 * Math.cos(angle)} y1={15 + 5 * Math.sin(angle)}
                      x2={15 + 12 * Math.cos(angle)} y2={15 + 12 * Math.sin(angle)}
                      stroke={C.cyan} strokeWidth="2.2" strokeLinecap="round"
                    />
                  );
                })}
                <circle cx="15" cy="15" r="4.5" fill={C.cyan} />
                <circle cx="15" cy="15" r="4.5" fill="none" stroke={C.cyan} strokeWidth="0.5" opacity="0.5" />
              </svg>
            </div>

            <h1 style={{
              margin: '0 0 4px',
              fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em',
              color: C.textPrimary,
              fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
            }}>
              K8s Optimization Platform
            </h1>
            <p style={{
              margin: 0,
              fontSize: '12px', color: C.textMuted,
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: '0.06em',
            }}>
              CLUSTER INTELLIGENCE &amp; SECURITY
            </p>
          </div>

          {/* Auth card — wraps heading + Clerk form + our footer */}
          <div style={{
            background: `linear-gradient(160deg, ${C.bgCard} 0%, rgba(7,16,34,0.95) 100%)`,
            border: `1px solid ${C.borderDim}`,
            borderRadius: '16px',
            padding: '28px 28px 24px',
            backdropFilter: 'blur(20px)',
            boxShadow: `0 0 0 1px rgba(0,212,255,0.05), 0 24px 48px rgba(0,0,0,0.5), 0 0 80px rgba(0,212,255,0.04)`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Card top cyan glow line */}
            <div style={{
              position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
              background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
              opacity: 0.5,
            }} />

            {/* Card heading */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2 style={{
                margin: '0 0 4px', fontSize: '17px', fontWeight: 600,
                color: C.textPrimary, letterSpacing: '-0.01em',
              }}>
                Authenticate
              </h2>
              <p style={{
                margin: 0, fontSize: '12px',
                color: C.textMuted,
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: '0.05em',
              }}>
                Access your cluster dashboard
              </p>
            </div>

            {/* Clerk SignIn widget — form only, all chrome stripped via elements + global CSS */}
            <SignIn
              routing="virtual"
              signUpUrl="/sign-up"
              forceRedirectUrl="/"
              appearance={{
                variables: {
                  colorPrimary:         '#2563eb',
                  colorBackground:      'transparent',
                  colorText:            C.textPrimary,
                  colorTextSecondary:   C.textSecondary,
                  colorInputBackground: 'rgba(0,0,0,0.35)',
                  colorInputText:       C.textPrimary,
                  borderRadius:         '8px',
                  fontFamily:           "-apple-system, 'Segoe UI', system-ui, sans-serif",
                  fontSize:             '14px',
                },
                layout: {
                  logoPlacement:          'none' as any,
                  socialButtonsVariant:   'blockButton',
                  socialButtonsPlacement: 'top',
                },
                elements: {
                  /* ── wrappers: invisible, full-width passthrough ── */
                  rootBox:    { width: '100%', maxWidth: '100%' },
                  cardBox:    { width: '100%', maxWidth: '100%', background: 'transparent', border: 'none', boxShadow: 'none', padding: '0', margin: '0' },
                  card:       { width: '100%', maxWidth: '100%', background: 'transparent', border: 'none', boxShadow: 'none', padding: '0', margin: '0' },
                  /* ── clerk chrome: hidden ── */
                  header:          { display: 'none' },
                  headerTitle:     { display: 'none' },
                  headerSubtitle:  { display: 'none' },
                  footer:          { display: 'none' },
                  footerPages:     { display: 'none' },
                  footerAction:    { display: 'none' },
                  badge:           { display: 'none' },
                  /* ── form containers: transparent ── */
                  main:     { background: 'transparent', width: '100%' },
                  form:     { background: 'transparent', width: '100%' },
                  formBody: { background: 'transparent', width: '100%' },
                  /* ── Google button ── */
                  socialButtonsBlockButton: {
                    background:   'rgba(255,255,255,0.04)',
                    color:        C.textPrimary,
                    border:       `1px solid ${C.border}`,
                    borderRadius: '8px',
                    fontWeight:   600,
                    height:       '44px',
                    fontSize:     '14px',
                    width:        '100%',
                    overflow:     'hidden',
                  },
                  socialButtonsBlockButtonText: { fontWeight: 600, color: C.textPrimary, fontSize: '14px' },
                  /* ── OR divider ── */
                  dividerRow:  { margin: '8px 0' },
                  dividerLine: { background: C.borderDim },
                  dividerText: { color: C.textMuted, fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' },
                  /* ── email field ── */
                  formFieldLabel: { color: C.textSecondary, fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
                  formFieldInput: {
                    background:   'rgba(0,0,0,0.35)',
                    border:       `1px solid ${C.border}`,
                    borderRadius: '8px',
                    color:        C.textPrimary,
                    height:       '44px',
                    fontSize:     '14px',
                    width:        '100%',
                    boxSizing:    'border-box' as const,
                  },
                  /* ── Continue button ── */
                  formButtonPrimary: {
                    background:    'linear-gradient(135deg, #1e40af, #1d4ed8)',
                    border:        `1px solid rgba(0,212,255,0.3)`,
                    borderRadius:  '8px',
                    fontWeight:    700,
                    fontSize:      '14px',
                    height:        '44px',
                    width:         '100%',
                    letterSpacing: '0.04em',
                    boxShadow:     '0 0 20px rgba(37,99,235,0.3)',
                    marginTop:     '4px',
                  },
                  formFieldAction: { color: C.textMuted, fontSize: '11px' },
                },
              }}
            />

            {/* ── Our own footer: sign-up link + secured badge ── */}
            <div style={{
              borderTop: `1px solid ${C.borderDim}`,
              marginTop: '20px',
              paddingTop: '16px',
              textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.textSecondary }}>
                Don't have an account?{' '}
                <Link
                  to="/sign-up"
                  style={{ color: C.cyan, fontWeight: 700, textDecoration: 'none', fontFamily: "'JetBrains Mono',monospace" }}
                >
                  Sign up
                </Link>
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: 'rgba(0,212,255,0.05)',
                border: `1px solid rgba(0,212,255,0.12)`,
                padding: '4px 12px', borderRadius: '9999px',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 600, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
                  SECURED BY CLERK
                </span>
              </div>
            </div>
          </div>

          {/* Footer links */}
          <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
            {['Privacy Policy', 'Terms of Service', 'Help Center'].map((label) => (
              <a
                key={label}
                href="#"
                style={{ fontSize: '11px', fontWeight: 500, color: C.textMuted, textDecoration: 'none', letterSpacing: '0.02em', transition: 'color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.cyan)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
              >
                {label}
              </a>
            ))}
          </footer>
        </div>
      </div>

      {/* ── Responsive: show left panel on wide screens ── */}
      <style>{`
        @media (min-width: 900px) {
          .k8s-left-panel { display: flex !important; max-width: 480px; }
        }
      `}</style>
    </div>
  );
};

export default Login;
