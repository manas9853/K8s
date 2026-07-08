import React, { useEffect } from 'react';
import { SignUp as ClerkSignUp, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

/* ── Design tokens — same dark K8s terminal theme as Login ── */
const C = {
  bg:              '#050d1a',
  bgCard:          '#0b1628',
  bgSurface:       '#0f1e35',
  borderDim:       '#1a2e4a',
  border:          '#1e3a5f',
  cyan:            '#00d4ff',
  cyanGlow:        'rgba(0,212,255,0.15)',
  cyanGlowStrong:  'rgba(0,212,255,0.25)',
  primary:         '#2563eb',
  textPrimary:     '#e2f0ff',
  textSecondary:   '#7ca5cc',
  textMuted:       '#3d6080',
};

const HexGrid: React.FC = () => (
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="su-hex" x="0" y="0" width="40" height="46" patternUnits="userSpaceOnUse">
        <polygon points="20,2 38,12 38,34 20,44 2,34 2,12"
          fill="none" stroke={C.borderDim} strokeWidth="0.5" opacity="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#su-hex)" />
  </svg>
);

const SignUpPage: React.FC = () => {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If already signed in (returning user) skip straight to app
    if (isSignedIn) navigate('/', { replace: true });
  }, [isSignedIn, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.bg,
      fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ── CSS keyframes + Clerk chrome overrides ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        @keyframes scan-line-su {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.4; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(100vh); opacity: 0; }
        }

        .cl-rootBox, .cl-signUp-root, .cl-cardBox {
          width: 100% !important; max-width: 100% !important;
          background: transparent !important; border: none !important;
          box-shadow: none !important; padding: 0 !important; margin: 0 !important;
        }
        .cl-card {
          background: transparent !important; border: none !important;
          box-shadow: none !important; padding: 0 !important; margin: 0 !important;
          width: 100% !important;
        }
        .cl-header, .cl-headerTitle, .cl-headerSubtitle { display: none !important; }
        .cl-footer, .cl-footer *, .cl-footerPages, .cl-footerPages *,
        .cl-internal-b3fm6y, .cl-powered-by-clerk, .cl-devModeNotice, .cl-devModeWarning,
        [class*="devMode"], [class*="DevMode"],
        .cl-footerPages__signIn, .cl-footerPages__signUp {
          display: none !important; max-height: 0 !important;
          overflow: hidden !important; padding: 0 !important;
          margin: 0 !important; border: none !important;
        }
        .cl-badge, [class*="badge"], .cl-providerIcon__lastUsed { display: none !important; }
        .cl-main, .cl-form, .cl-formFields, .cl-formBody, .cl-formFieldRow {
          background: transparent !important;
        }
        .cl-socialButtonsBlockButton {
          background: rgba(255,255,255,0.04) !important;
          border: 1px solid ${C.border} !important;
          border-radius: 8px !important; color: ${C.textPrimary} !important;
          height: 44px !important; font-weight: 600 !important;
          font-size: 14px !important; width: 100% !important;
        }
        .cl-socialButtonsBlockButton:hover {
          border-color: ${C.cyan} !important;
          background: rgba(0,212,255,0.06) !important;
          box-shadow: 0 0 12px rgba(0,212,255,0.15) !important;
        }
        .cl-socialButtonsBlockButtonText { font-weight: 600 !important; color: ${C.textPrimary} !important; }
        .cl-dividerRow { margin: 8px 0 !important; }
        .cl-dividerLine { background: ${C.borderDim} !important; }
        .cl-dividerText {
          color: ${C.textMuted} !important; font-size: 10px !important;
          letter-spacing: 0.12em !important; text-transform: uppercase !important;
          font-family: 'JetBrains Mono', monospace !important;
        }
        .cl-formFieldLabel {
          color: ${C.textSecondary} !important; font-size: 11px !important;
          font-weight: 600 !important; letter-spacing: 0.06em !important;
          text-transform: uppercase !important; font-family: 'JetBrains Mono', monospace !important;
        }
        .cl-formFieldInput {
          background: rgba(0,0,0,0.4) !important; border: 1px solid ${C.border} !important;
          border-radius: 8px !important; color: ${C.textPrimary} !important;
          height: 44px !important; font-size: 14px !important;
          font-family: 'JetBrains Mono', monospace !important;
          width: 100% !important; box-sizing: border-box !important;
        }
        .cl-formFieldInput:focus {
          border-color: ${C.cyan} !important;
          box-shadow: 0 0 0 2px ${C.cyanGlow}, 0 0 12px ${C.cyanGlowStrong} !important;
          background: #071525 !important; outline: none !important;
        }
        .cl-formFieldInputGroup { width: 100% !important; }
        .cl-formButtonPrimary {
          background: linear-gradient(135deg, #1e40af, #1d4ed8) !important;
          border: 1px solid rgba(0,212,255,0.3) !important; border-radius: 8px !important;
          font-weight: 700 !important; font-size: 14px !important;
          height: 44px !important; width: 100% !important;
          letter-spacing: 0.04em !important; box-shadow: 0 0 20px rgba(37,99,235,0.3) !important;
          transition: all 0.2s !important; font-family: 'JetBrains Mono', monospace !important;
          margin-top: 4px !important;
        }
        .cl-formButtonPrimary:hover {
          background: linear-gradient(135deg, #1d4ed8, #2563eb) !important;
          box-shadow: 0 0 28px rgba(37,99,235,0.5) !important; border-color: ${C.cyan} !important;
        }
        .cl-otpCodeFieldInput {
          background: rgba(0,0,0,0.4) !important; border: 1px solid ${C.border} !important;
          color: ${C.cyan} !important; font-family: 'JetBrains Mono', monospace !important;
          font-size: 20px !important;
        }
      `}</style>

      {/* Scan line */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '2px',
        background: `linear-gradient(90deg, transparent 0%, ${C.cyan} 50%, transparent 100%)`,
        opacity: 0, animation: 'scan-line-su 8s linear infinite',
        pointerEvents: 'none', zIndex: 100,
      }} />

      {/* Hex bg */}
      <div style={{ position: 'fixed', inset: 0, opacity: 0.2, pointerEvents: 'none' }}>
        <HexGrid />
      </div>

      {/* Glow orbs */}
      <div style={{ position: 'fixed', top: '-100px', right: '-100px', width: '500px', height: '500px',
        background: `radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-100px', left: '-100px', width: '400px', height: '400px',
        background: `radial-gradient(circle, ${C.cyanGlow} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      {/* Main card */}
      <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 1, padding: '24px' }}>

        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px',
            background: `linear-gradient(135deg, ${C.bgSurface}, #0d2040)`,
            border: `1.5px solid ${C.cyan}`, borderRadius: '16px', marginBottom: '16px',
            boxShadow: `0 0 32px ${C.cyanGlowStrong}, inset 0 1px 0 rgba(0,212,255,0.1)`,
          }}>
            <svg width="36" height="36" viewBox="0 0 30 30" fill="none">
              {Array.from({ length: 7 }, (_, k) => {
                const angle = (2 * Math.PI * k) / 7 - Math.PI / 2;
                return <line key={k}
                  x1={15 + 5 * Math.cos(angle)} y1={15 + 5 * Math.sin(angle)}
                  x2={15 + 12 * Math.cos(angle)} y2={15 + 12 * Math.sin(angle)}
                  stroke={C.cyan} strokeWidth="2.2" strokeLinecap="round" />;
              })}
              <circle cx="15" cy="15" r="4.5" fill={C.cyan} />
            </svg>
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', color: C.textPrimary }}>
            K8s Optimization Platform
          </h1>
          <p style={{ margin: 0, fontSize: '12px', color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
            CREATE YOUR ACCOUNT
          </p>
        </div>

        {/* Auth card */}
        <div style={{
          background: `linear-gradient(160deg, ${C.bgCard} 0%, rgba(7,16,34,0.95) 100%)`,
          border: `1px solid ${C.borderDim}`, borderRadius: '16px', padding: '28px 28px 24px',
          backdropFilter: 'blur(20px)',
          boxShadow: `0 0 0 1px rgba(0,212,255,0.05), 0 24px 48px rgba(0,0,0,0.5), 0 0 80px rgba(0,212,255,0.04)`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Top glow line */}
          <div style={{
            position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
            background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`, opacity: 0.5,
          }} />

          {/* Card heading */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 600, color: C.textPrimary, letterSpacing: '-0.01em' }}>
              Create account
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.05em' }}>
              You'll set up your organization next
            </p>
          </div>

          {/* Clerk SignUp widget */}
          <ClerkSignUp
            routing="virtual"
            signInUrl="/login"
            forceRedirectUrl="/onboarding"
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
                rootBox:    { width: '100%', maxWidth: '100%' },
                cardBox:    { width: '100%', maxWidth: '100%', background: 'transparent', border: 'none', boxShadow: 'none', padding: '0', margin: '0' },
                card:       { width: '100%', maxWidth: '100%', background: 'transparent', border: 'none', boxShadow: 'none', padding: '0', margin: '0' },
                header:         { display: 'none' },
                headerTitle:    { display: 'none' },
                headerSubtitle: { display: 'none' },
                footer:         { display: 'none' },
                footerPages:    { display: 'none' },
                footerAction:   { display: 'none' },
                badge:          { display: 'none' },
                main:     { background: 'transparent', width: '100%' },
                form:     { background: 'transparent', width: '100%' },
                formBody: { background: 'transparent', width: '100%' },
                socialButtonsBlockButton: {
                  background: 'rgba(255,255,255,0.04)', color: C.textPrimary,
                  border: `1px solid ${C.border}`, borderRadius: '8px',
                  fontWeight: 600, height: '44px', fontSize: '14px', width: '100%',
                },
                socialButtonsBlockButtonText: { fontWeight: 600, color: C.textPrimary, fontSize: '14px' },
                dividerRow:  { margin: '8px 0' },
                dividerLine: { background: C.borderDim },
                dividerText: { color: C.textMuted, fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' },
                formFieldLabel: { color: C.textSecondary, fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
                formFieldInput: {
                  background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`,
                  borderRadius: '8px', color: C.textPrimary, height: '44px',
                  fontSize: '14px', width: '100%', boxSizing: 'border-box' as const,
                },
                formButtonPrimary: {
                  background: 'linear-gradient(135deg, #1e40af, #1d4ed8)',
                  border: `1px solid rgba(0,212,255,0.3)`, borderRadius: '8px',
                  fontWeight: 700, fontSize: '14px', height: '44px', width: '100%',
                  letterSpacing: '0.04em', boxShadow: '0 0 20px rgba(37,99,235,0.3)', marginTop: '4px',
                },
              },
            }}
          />

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${C.borderDim}`, marginTop: '20px', paddingTop: '16px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.textSecondary }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: C.cyan, fontWeight: 700, textDecoration: 'none', fontFamily: "'JetBrains Mono',monospace" }}>
                Sign in
              </a>
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'rgba(0,212,255,0.05)', border: `1px solid rgba(0,212,255,0.12)`,
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
      </div>
    </div>
  );
};

export default SignUpPage;

// Made with Bob
