import React, { useEffect } from 'react';
import { SignIn, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

/* ── Design tokens (Enterprise Light — from Design/login) ── */
const C = {
  primary:                '#003d9b',
  primaryContainer:       '#0052cc',
  onPrimary:              '#ffffff',
  surface:                '#f9f9ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer:       '#e8edff',
  onSurface:              '#041b3c',
  onSurfaceVariant:       '#434654',
  outlineVariant:         '#c3c6d6',
  outline:                '#737685',
  secondary:              '#525f75',
};

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
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: `radial-gradient(circle at top left, ${C.surfaceContainer} 0%, ${C.surface} 60%)`,
      fontFamily: "'Hanken Grotesk', -apple-system, 'Segoe UI', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Ambient background: blobs + grid overlay ── */}
      <div style={{
        position: 'fixed', top: '-10%', right: '-5%',
        width: '400px', height: '400px',
        background: 'rgba(0,61,155,0.05)', borderRadius: '50%',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '-10%', left: '-5%',
        width: '300px', height: '300px',
        background: 'rgba(214,227,254,0.10)', borderRadius: '50%',
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03,
        backgroundImage: `linear-gradient(${C.primary} 1px, transparent 1px), linear-gradient(90deg, ${C.primary} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Development Mode badge ── */}
      <div style={{
        position: 'fixed', top: '24px', right: '24px', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '4px',
        background: 'rgba(215,226,255,0.85)', backdropFilter: 'blur(4px)',
        padding: '4px 10px', borderRadius: '3px',
        border: `1px solid ${C.outlineVariant}`,
      }}>
        {/* terminal icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 600, color: C.onSurfaceVariant, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Development Mode
        </span>
      </div>

      {/* ── Main column ── */}
      <main style={{
        width: '100%', maxWidth: '440px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px',
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Logo + product name ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {/* K8s hub icon — deep-blue tile */}
          <div style={{
            width: '48px', height: '48px', background: C.primary,
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Kubernetes-style hub: 6 spokes + centre circle */}
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              {/* spokes at 0°, 60°, 120°, 180°, 240°, 300° */}
              <line x1="15" y1="15" x2="15" y2="4"  stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="15" y1="15" x2="24.5" y2="20.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="15" y1="15" x2="5.5"  y2="20.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="15" y1="15" x2="15" y2="26" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="15" y1="15" x2="24.5" y2="9.5"  stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="15" y1="15" x2="5.5"  y2="9.5"  stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="15" cy="15" r="4" fill="white" />
            </svg>
          </div>
          <h1 style={{
            fontSize: '20px', fontWeight: 600, lineHeight: '28px',
            color: C.primary, margin: 0, letterSpacing: '-0.01em',
          }}>
            K8s Optimization Platform
          </h1>
        </div>

        {/* ── Auth card ── */}
        {/*
          The Clerk <SignIn> widget renders its own internal card shell.
          We style that internal shell to BE our card (white bg, border, shadow, padding)
          and hide Clerk's own header/footer-branding so there is only one card on screen.
        */}
        <div style={{ width: '100%' }}>
          {/* Card heading — rendered by us, above the Clerk widget content */}
          <div style={{
            background: C.surfaceContainerLowest,
            border: `1px solid #DFE1E6`,
            borderBottom: 'none',
            borderRadius: '12px 12px 0 0',
            padding: '28px 32px 20px',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.onSurface, margin: '0 0 4px' }}>Sign in</h2>
            <p style={{ fontSize: '14px', color: C.onSurfaceVariant, margin: 0, lineHeight: '20px' }}>
              to continue to the dashboard
            </p>
          </div>

          {/* Clerk widget — card shell styled to continue the card visually */}
          <SignIn
            routing="path"
            path="/login"
            afterSignInUrl="/"
            appearance={{
              variables: {
                colorPrimary:        C.primaryContainer,
                colorBackground:     C.surfaceContainerLowest,
                colorText:           C.onSurface,
                colorTextSecondary:  C.onSurfaceVariant,
                colorInputBackground:'#ffffff',
                colorInputText:      C.onSurface,
                borderRadius:        '8px',
                fontFamily:          "'Hanken Grotesk', -apple-system, 'Segoe UI', system-ui, sans-serif",
                fontSize:            '14px',
              },
              layout: {
                logoPlacement:          'none' as any,
                socialButtonsVariant:   'blockButton',
                socialButtonsPlacement: 'top',
              },
              elements: {
                /* Make the Clerk card the bottom half of our card */
                rootBox: {
                  width: '100%',
                },
                card: {
                  width: '100%',
                  margin: 0,
                  background:   C.surfaceContainerLowest,
                  border:       '1px solid #DFE1E6',
                  borderTop:    'none',
                  borderRadius: '0 0 12px 12px',
                  boxShadow:    '0px 8px 16px rgba(9,30,66,0.08)',
                  padding:      '0 32px 28px',
                },
                /* Hide Clerk's own title & subtitle — we show ours above */
                header:         { display: 'none' },
                headerTitle:    { display: 'none' },
                headerSubtitle: { display: 'none' },
                /* Google / social button */
                socialButtonsBlockButton: {
                  background:    '#ffffff',
                  color:         C.onSurface,
                  border:        `1px solid ${C.outlineVariant}`,
                  borderRadius:  '8px',
                  fontWeight:    600,
                  height:        '44px',
                  fontSize:      '14px',
                  marginBottom:  '4px',
                },
                socialButtonsBlockButtonText: {
                  fontWeight: 600,
                  fontSize:   '14px',
                },
                /* OR divider */
                dividerRow:  { margin: '4px 0' },
                dividerLine: { background: C.outlineVariant },
                dividerText: {
                  color: C.outline, fontSize: '11px',
                  fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                },
                /* Field label */
                formFieldLabel: {
                  color: C.onSurfaceVariant, fontSize: '12px',
                  fontWeight: 600, letterSpacing: '0.02em',
                },
                /* Text input */
                formFieldInput: {
                  background:   '#ffffff',
                  border:       `1px solid ${C.outlineVariant}`,
                  borderRadius: '8px',
                  color:        C.onSurface,
                  height:       '44px',
                  fontSize:     '14px',
                },
                /* Continue / primary button */
                formButtonPrimary: {
                  background:    C.primaryContainer,
                  borderRadius:  '8px',
                  fontWeight:    600,
                  fontSize:      '14px',
                  height:        '44px',
                  marginTop:     '4px',
                },
                /* "Don't have an account?" footer */
                footer: {
                  background:   'transparent',
                  borderTop:    `1px solid ${C.outlineVariant}`,
                  paddingTop:   '16px',
                  marginTop:    '8px',
                },
                footerAction: { justifyContent: 'center' },
                footerActionLink: { color: C.primary, fontWeight: 600 },
                footerActionText: { color: C.onSurfaceVariant, fontSize: '14px' },
                /* Clerk branding pill */
                footerPages: { display: 'none' },
                /* "Forgot password?" */
                formFieldAction: { color: C.onSurfaceVariant, fontSize: '12px' },
                /* Internal Clerk "Secured by Clerk / Dev mode" box — hide it */
                footer__clerk_branded: { display: 'none' },
              },
            }}
          />
        </div>

        {/* ── Secured by Clerk pill (our version, below the card) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '-16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: C.surfaceContainer,
            padding: '4px 10px', borderRadius: '9999px',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 500, color: C.secondary }}>Secured by Clerk</span>
          </div>
        </div>

        {/* ── Footer links ── */}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', marginTop: '-8px' }}>
          {['Privacy Policy', 'Terms of Service', 'Help Center'].map((label) => (
            <a
              key={label}
              href="#"
              style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em', color: C.outline, textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.outline)}
            >
              {label}
            </a>
          ))}
        </footer>
      </main>
    </div>
  );
};

export default Login;
