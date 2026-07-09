/**
 * Onboarding — two paths after Clerk sign-up:
 *  A) Create a new organisation  → auto-approved as admin → cluster onboarding
 *  B) Join an existing org        → pending until that org's admin approves
 */
import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const C = {
  bg:             '#050d1a',
  bgCard:         '#0b1628',
  bgSurface:      '#0f1e35',
  borderDim:      '#1a2e4a',
  border:         '#1e3a5f',
  cyan:           '#00d4ff',
  cyanGlow:       'rgba(0,212,255,0.15)',
  cyanGlowStrong: 'rgba(0,212,255,0.25)',
  green:          '#39ff14',
  primary:        '#2563eb',
  textPrimary:    '#e2f0ff',
  textSecondary:  '#7ca5cc',
  textMuted:      '#3d6080',
  errorRed:       '#ff4d6a',
};

const API_BASE = process.env.REACT_APP_API_URL || '';

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org';
}

type Mode = 'choose' | 'create' | 'join';

const HexGrid: React.FC = () => (
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="ob-hex" x="0" y="0" width="40" height="46" patternUnits="userSpaceOnUse">
        <polygon points="20,2 38,12 38,34 20,44 2,34 2,12"
          fill="none" stroke={C.borderDim} strokeWidth="0.5" opacity="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#ob-hex)" />
  </svg>
);

const Onboarding: React.FC = () => {
  const { user: clerkUser, isLoaded } = useUser();
  const navigate = useNavigate();

  const [mode, setMode]           = useState<Mode>('choose');
  const [orgName, setOrgName]     = useState('');
  const [joinOrgId, setJoinOrgId] = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  /* ── CREATE new org ─────────────────────────────────────────── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) { setError('Organisation name is required.'); return; }
    if (!clerkUser)       { setError('User session not available.'); return; }
    setBusy(true); setError(null);

    const org_id = slugify(orgName);
    try {
      await axios.post(`${API_BASE}/api/v1/users/register`, {
        clerk_user_id:   clerkUser.id,
        username:        clerkUser.username ?? clerkUser.id,
        email:           clerkUser.primaryEmailAddress?.emailAddress ?? '',
        full_name:       clerkUser.fullName ?? '',
        requested_role:  'admin',
        requested_teams: [],
        org_id,
      });
      // Org founder → auto-approved admin → go straight to cluster onboarding
      navigate('/cluster-onboarding', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Registration failed.');
      setBusy(false);
    }
  };

  /* ── JOIN existing org ──────────────────────────────────────── */
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinOrgId.trim()) { setError('Organisation ID is required.'); return; }
    if (!clerkUser)         { setError('User session not available.'); return; }
    setBusy(true); setError(null);

    const org_id = slugify(joinOrgId);
    try {
      // Check org exists first
      const check = await axios.get(`${API_BASE}/api/v1/users/org/${org_id}/exists`);
      if (!check.data.exists) {
        setError(`Organisation "${org_id}" does not exist. Create it instead.`);
        setBusy(false);
        return;
      }
      await axios.post(`${API_BASE}/api/v1/users/register`, {
        clerk_user_id:   clerkUser.id,
        username:        clerkUser.username ?? clerkUser.id,
        email:           clerkUser.primaryEmailAddress?.emailAddress ?? '',
        full_name:       clerkUser.fullName ?? '',
        requested_role:  'viewer',
        requested_teams: [],
        org_id,
      });
      // Pending approval → ProtectedRoute will show PendingApproval screen
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Registration failed.');
      setBusy(false);
    }
  };

  if (!isLoaded) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: C.bg }}>
        <div style={{ width:'32px', height:'32px', border:`2px solid ${C.borderDim}`, borderTopColor: C.cyan,
          borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  const inputStyle = (focus?: boolean, err?: boolean): React.CSSProperties => ({
    width:'100%', height:'44px', boxSizing:'border-box',
    background:'rgba(0,0,0,0.4)',
    border:`1px solid ${focus ? C.cyan : (err ? C.errorRed : C.border)}`,
    borderRadius:'8px', padding:'0 14px',
    color: C.textPrimary, fontSize:'14px',
    fontFamily:"'JetBrains Mono',monospace",
    outline:'none',
    transition:'border-color 0.2s, box-shadow 0.2s',
  });

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background: C.bg, fontFamily:"-apple-system,'Segoe UI',system-ui,sans-serif",
      position:'relative', overflow:'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes spin-ob { to { transform:rotate(360deg); } }
        .ob-btn:hover:not(:disabled) { background:linear-gradient(135deg,#1d4ed8,#2563eb) !important; border-color:${C.cyan} !important; }
        .ob-btn:disabled { opacity:0.6; cursor:not-allowed; }
        .ob-choice:hover { border-color:${C.cyan} !important; background:rgba(0,212,255,0.05) !important; }
        .ob-input:focus { border-color:${C.cyan} !important; box-shadow:0 0 0 2px ${C.cyanGlow} !important; background:#071525 !important; }
      `}</style>

      <div style={{ position:'fixed', inset:0, opacity:0.2, pointerEvents:'none' }}><HexGrid /></div>
      <div style={{ position:'fixed', top:'-100px', right:'-100px', width:'500px', height:'500px',
        background:`radial-gradient(circle,rgba(37,99,235,0.1) 0%,transparent 70%)`, pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'460px', position:'relative', zIndex:1, padding:'24px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'24px' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:'64px', height:'64px',
            background:`linear-gradient(135deg,${C.bgSurface},#0d2040)`,
            border:`1.5px solid ${C.cyan}`, borderRadius:'16px', marginBottom:'16px',
            boxShadow:`0 0 32px ${C.cyanGlowStrong},inset 0 1px 0 rgba(0,212,255,0.1)`,
          }}>
            <svg width="36" height="36" viewBox="0 0 30 30" fill="none">
              {Array.from({length:7},(_,k) => {
                const a = (2*Math.PI*k)/7 - Math.PI/2;
                return <line key={k} x1={15+5*Math.cos(a)} y1={15+5*Math.sin(a)} x2={15+12*Math.cos(a)} y2={15+12*Math.sin(a)} stroke={C.cyan} strokeWidth="2.2" strokeLinecap="round" />;
              })}
              <circle cx="15" cy="15" r="4.5" fill={C.cyan} />
            </svg>
          </div>
          <h1 style={{ margin:'0 0 4px', fontSize:'22px', fontWeight:700, letterSpacing:'-0.02em', color:C.textPrimary }}>
            K8s Optimization Platform
          </h1>
          <p style={{ margin:0, fontSize:'12px', color:C.textMuted, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em' }}>
            STEP 2 OF 2 — SET UP YOUR ORGANISATION
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:`linear-gradient(160deg,${C.bgCard} 0%,rgba(7,16,34,0.95) 100%)`,
          border:`1px solid ${C.borderDim}`, borderRadius:'16px', padding:'28px',
          boxShadow:`0 0 0 1px rgba(0,212,255,0.05),0 24px 48px rgba(0,0,0,0.5)`,
          position:'relative', overflow:'hidden',
        }}>
          <div style={{ position:'absolute', top:0, left:'20%', right:'20%', height:'1px',
            background:`linear-gradient(90deg,transparent,${C.cyan},transparent)`, opacity:0.5 }} />

          {/* User greeting */}
          {clerkUser && (
            <div style={{
              display:'flex', alignItems:'center', gap:'10px',
              background:'rgba(0,212,255,0.04)', border:`1px solid ${C.borderDim}`,
              borderRadius:'8px', padding:'10px 14px', marginBottom:'20px',
            }}>
              <div style={{
                width:'32px', height:'32px', borderRadius:'50%',
                background:`linear-gradient(135deg,#1e3a5f,#0f1e35)`,
                border:`1px solid ${C.border}`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <span style={{ fontSize:'13px', fontWeight:700, color:C.cyan }}>
                  {(clerkUser.fullName?.[0] ?? clerkUser.primaryEmailAddress?.emailAddress?.[0] ?? '?').toUpperCase()}
                </span>
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:C.textPrimary }}>
                  {clerkUser.fullName || clerkUser.primaryEmailAddress?.emailAddress}
                </div>
                <div style={{ fontSize:'11px', color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>
                  {clerkUser.primaryEmailAddress?.emailAddress}
                </div>
              </div>
            </div>
          )}

          {/* ── CHOOSE mode ──────────────────────────── */}
          {mode === 'choose' && (
            <>
              <h2 style={{ margin:'0 0 6px', fontSize:'17px', fontWeight:600, color:C.textPrimary }}>
                How do you want to get started?
              </h2>
              <p style={{ margin:'0 0 20px', fontSize:'13px', color:C.textSecondary, lineHeight:1.5 }}>
                Create a new organisation and onboard your cluster, or join an existing one.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <button className="ob-choice" onClick={() => setMode('create')} style={{
                  background:'rgba(0,0,0,0.3)', border:`1px solid ${C.border}`, borderRadius:'10px',
                  padding:'16px 18px', textAlign:'left', cursor:'pointer', color:C.textPrimary,
                  transition:'all 0.15s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
                    <span style={{ fontSize:'20px' }}>🏗️</span>
                    <span style={{ fontWeight:700, fontSize:'15px' }}>Create a new organisation</span>
                  </div>
                  <p style={{ margin:0, fontSize:'12px', color:C.textSecondary, paddingLeft:'30px' }}>
                    You'll be set as admin and can onboard your cluster right away.
                  </p>
                </button>
                <button className="ob-choice" onClick={() => setMode('join')} style={{
                  background:'rgba(0,0,0,0.3)', border:`1px solid ${C.border}`, borderRadius:'10px',
                  padding:'16px 18px', textAlign:'left', cursor:'pointer', color:C.textPrimary,
                  transition:'all 0.15s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
                    <span style={{ fontSize:'20px' }}>🤝</span>
                    <span style={{ fontWeight:700, fontSize:'15px' }}>Join an existing organisation</span>
                  </div>
                  <p style={{ margin:0, fontSize:'12px', color:C.textSecondary, paddingLeft:'30px' }}>
                    Enter the org ID — the admin of that org will approve your request.
                  </p>
                </button>
              </div>
            </>
          )}

          {/* ── CREATE mode ──────────────────────────── */}
          {mode === 'create' && (
            <>
              <button onClick={() => { setMode('choose'); setError(null); }} style={{
                background:'none', border:'none', color:C.textMuted, cursor:'pointer',
                fontSize:'12px', padding:'0 0 14px', fontFamily:"'JetBrains Mono',monospace",
              }}>← Back</button>
              <h2 style={{ margin:'0 0 6px', fontSize:'17px', fontWeight:600, color:C.textPrimary }}>Create your organisation</h2>
              <p style={{ margin:'0 0 20px', fontSize:'13px', color:C.textSecondary, lineHeight:1.5 }}>
                You'll be auto-approved as admin. Share your org ID with teammates so they can join.
              </p>
              <form onSubmit={handleCreate} autoComplete="off">
                <div style={{ marginBottom:'16px' }}>
                  <label style={{ display:'block', marginBottom:'6px', fontSize:'11px', fontWeight:600,
                    color:C.textSecondary, letterSpacing:'0.06em', textTransform:'uppercase',
                    fontFamily:"'JetBrains Mono',monospace" }}>Organisation name</label>
                  <input className="ob-input" type="text" value={orgName}
                    onChange={e => { setOrgName(e.target.value); setError(null); }}
                    placeholder="e.g. Acme Corp" autoFocus style={inputStyle(false, !!error)} />
                  {orgName.trim() && (
                    <div style={{ marginTop:'6px', fontSize:'11px', color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>
                      org_id: <span style={{ color:C.cyan }}>{slugify(orgName)}</span>
                      <span style={{ color:C.textMuted }}> — share this with teammates</span>
                    </div>
                  )}
                </div>
                {error && <div style={{ marginBottom:'14px', padding:'10px 14px', background:'rgba(255,77,106,0.08)',
                  border:`1px solid rgba(255,77,106,0.25)`, borderRadius:'8px', fontSize:'12px', color:C.errorRed,
                  fontFamily:"'JetBrains Mono',monospace" }}>{error}</div>}
                <button type="submit" className="ob-btn" disabled={busy || !orgName.trim()} style={{
                  width:'100%', height:'44px', background:'linear-gradient(135deg,#1e40af,#1d4ed8)',
                  border:`1px solid rgba(0,212,255,0.3)`, borderRadius:'8px',
                  color:C.textPrimary, fontWeight:700, fontSize:'14px', letterSpacing:'0.04em',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                  fontFamily:"'JetBrains Mono',monospace", transition:'all 0.2s',
                }}>
                  {busy ? <><span style={{ width:'16px', height:'16px', border:`2px solid rgba(255,255,255,0.3)`,
                    borderTopColor:'#fff', borderRadius:'50%', animation:'spin-ob 0.7s linear infinite',
                    display:'inline-block' }} />Setting up...</> : '🚀 Create org & go to cluster onboarding'}
                </button>
              </form>
            </>
          )}

          {/* ── JOIN mode ────────────────────────────── */}
          {mode === 'join' && (
            <>
              <button onClick={() => { setMode('choose'); setError(null); }} style={{
                background:'none', border:'none', color:C.textMuted, cursor:'pointer',
                fontSize:'12px', padding:'0 0 14px', fontFamily:"'JetBrains Mono',monospace",
              }}>← Back</button>
              <h2 style={{ margin:'0 0 6px', fontSize:'17px', fontWeight:600, color:C.textPrimary }}>Join an organisation</h2>
              <p style={{ margin:'0 0 20px', fontSize:'13px', color:C.textSecondary, lineHeight:1.5 }}>
                Enter the org ID your admin shared. Your request will be sent to them for approval.
              </p>
              <form onSubmit={handleJoin} autoComplete="off">
                <div style={{ marginBottom:'16px' }}>
                  <label style={{ display:'block', marginBottom:'6px', fontSize:'11px', fontWeight:600,
                    color:C.textSecondary, letterSpacing:'0.06em', textTransform:'uppercase',
                    fontFamily:"'JetBrains Mono',monospace" }}>Organisation ID</label>
                  <input className="ob-input" type="text" value={joinOrgId}
                    onChange={e => { setJoinOrgId(e.target.value); setError(null); }}
                    placeholder="e.g. acme-corp" autoFocus style={inputStyle(false, !!error)} />
                  <div style={{ marginTop:'6px', fontSize:'11px', color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>
                    Ask your organisation admin for their org ID
                  </div>
                </div>
                {error && <div style={{ marginBottom:'14px', padding:'10px 14px', background:'rgba(255,77,106,0.08)',
                  border:`1px solid rgba(255,77,106,0.25)`, borderRadius:'8px', fontSize:'12px', color:C.errorRed,
                  fontFamily:"'JetBrains Mono',monospace" }}>{error}</div>}
                <button type="submit" className="ob-btn" disabled={busy || !joinOrgId.trim()} style={{
                  width:'100%', height:'44px', background:'linear-gradient(135deg,#1e40af,#1d4ed8)',
                  border:`1px solid rgba(0,212,255,0.3)`, borderRadius:'8px',
                  color:C.textPrimary, fontWeight:700, fontSize:'14px', letterSpacing:'0.04em',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                  fontFamily:"'JetBrains Mono',monospace", transition:'all 0.2s',
                }}>
                  {busy ? <><span style={{ width:'16px', height:'16px', border:`2px solid rgba(255,255,255,0.3)`,
                    borderTopColor:'#fff', borderRadius:'50%', animation:'spin-ob 0.7s linear infinite',
                    display:'inline-block' }} />Sending request...</> : '🤝 Send join request'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;

// Made with Bob
