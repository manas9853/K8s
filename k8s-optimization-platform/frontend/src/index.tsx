import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import { store } from './store';

const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing REACT_APP_CLERK_PUBLISHABLE_KEY in .env.local');
}

/**
 * K8s Optimization Platform — Dark Terminal Theme
 * Mirrors the Login page design language:
 *   bg       #050d1a  (deepest navy)
 *   surface  #0b1628  (card bg)
 *   border   #1e3a5f
 *   cyan     #00d4ff  (primary accent)
 *   green    #39ff14  (success / healthy)
 */
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default:  '#050d1a',
      paper:    '#0b1628',
    },
    primary: {
      main:         '#00d4ff',
      light:        '#33ddff',
      dark:         '#00a8cc',
      contrastText: '#050d1a',
    },
    secondary: {
      main:         '#2563eb',
      light:        '#3b82f6',
      dark:         '#1d4ed8',
      contrastText: '#ffffff',
    },
    success: {
      main:  '#39ff14',
      light: '#66ff4d',
      dark:  '#22cc00',
    },
    warning: {
      main:  '#f59e0b',
      light: '#fbbf24',
      dark:  '#d97706',
    },
    error: {
      main:  '#ef4444',
      light: '#f87171',
      dark:  '#dc2626',
    },
    info: {
      main: '#00d4ff',
    },
    divider: '#1e3a5f',
    text: {
      primary:   '#e2f0ff',
      secondary: '#7ca5cc',
      disabled:  '#3d6080',
    },
    action: {
      hover:           'rgba(0,212,255,0.06)',
      selected:        'rgba(0,212,255,0.12)',
      disabledBackground: 'rgba(0,0,0,0.3)',
    },
  },

  typography: {
    fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
    h1: { fontWeight: 700, letterSpacing: '-0.03em', color: '#e2f0ff' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em', color: '#e2f0ff' },
    h3: { fontWeight: 600, letterSpacing: '-0.02em', color: '#e2f0ff' },
    h4: { fontWeight: 600, letterSpacing: '-0.01em', color: '#e2f0ff' },
    h5: { fontWeight: 600, color: '#e2f0ff' },
    h6: { fontWeight: 600, color: '#e2f0ff' },
    body1: { color: '#e2f0ff' },
    body2: { color: '#7ca5cc' },
    caption: { color: '#3d6080', fontFamily: "'JetBrains Mono','Courier New',monospace", fontSize: '0.7rem' },
    overline: {
      fontFamily: "'JetBrains Mono','Courier New',monospace",
      letterSpacing: '0.1em',
      color: '#3d6080',
    },
  },

  shape: {
    borderRadius: 8,
  },

  components: {
    /* ── CssBaseline: paint the whole page dark ── */
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': {
          background: '#050d1a',
          minHeight: '100vh',
        },
        '*::-webkit-scrollbar': {
          width: '6px',
          height: '6px',
        },
        '*::-webkit-scrollbar-track': {
          background: '#050d1a',
        },
        '*::-webkit-scrollbar-thumb': {
          background: '#1e3a5f',
          borderRadius: '3px',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: '#2a5080',
        },
      },
    },

    /* ── AppBar ── */
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(90deg, #071022 0%, #0a1830 100%)',
          borderBottom: '1px solid #1e3a5f',
          boxShadow: '0 1px 0 #1e3a5f, 0 4px 16px rgba(0,0,0,0.5)',
        },
      },
    },

    /* ── Drawer ── */
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: '#071022',
          borderRight: '1px solid #1a2e4a',
          backgroundImage: 'none',
        },
      },
    },

    /* ── Card / Paper ── */
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(145deg, #0b1628, #080f20)',
          border: '1px solid #1a2e4a',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: '#0b1628',
          border: '1px solid #1a2e4a',
        },
        elevation0: { boxShadow: 'none' },
        elevation1: { boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
        elevation2: { boxShadow: '0 4px 16px rgba(0,0,0,0.4)' },
        elevation4: { boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
        elevation8: { boxShadow: '0 12px 32px rgba(0,0,0,0.5)' },
      },
    },

    /* ── ListItemButton — sidebar items ── */
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          margin: '1px 6px',
          transition: 'background 0.15s, color 0.15s',
          '&:hover': {
            background: 'rgba(0,212,255,0.06)',
            '& .MuiListItemIcon-root': { color: '#00d4ff' },
            '& .MuiListItemText-primary': { color: '#e2f0ff' },
          },
          '&.Mui-selected': {
            background: 'rgba(0,212,255,0.12)',
            borderLeft: '2px solid #00d4ff',
            paddingLeft: 'calc(var(--padding-left, 16px) - 2px)',
            '& .MuiListItemIcon-root': { color: '#00d4ff' },
            '& .MuiListItemText-primary': {
              color: '#00d4ff',
              fontWeight: 700,
            },
            '&:hover': {
              background: 'rgba(0,212,255,0.16)',
            },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#3d6080',
          minWidth: 36,
          transition: 'color 0.15s',
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          color: '#7ca5cc',
          transition: 'color 0.15s',
        },
      },
    },

    /* ── Buttons ── */
    MuiButton: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          letterSpacing: '0.04em',
          fontWeight: 600,
          textTransform: 'none',
          borderRadius: '6px',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #0e40af, #1d4ed8)',
          border: '1px solid rgba(0,212,255,0.3)',
          boxShadow: '0 0 16px rgba(37,99,235,0.25)',
          color: '#e2f0ff',
          '&:hover': {
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            boxShadow: '0 0 24px rgba(37,99,235,0.4)',
          },
        },
        outlinedPrimary: {
          borderColor: 'rgba(0,212,255,0.4)',
          color: '#00d4ff',
          '&:hover': {
            borderColor: '#00d4ff',
            background: 'rgba(0,212,255,0.06)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#7ca5cc',
          borderRadius: '6px',
          '&:hover': {
            background: 'rgba(0,212,255,0.08)',
            color: '#00d4ff',
          },
        },
      },
    },

    /* ── Chip ── */
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          fontSize: '0.7rem',
          letterSpacing: '0.05em',
          height: 22,
          borderRadius: '4px',
        },
        colorSuccess: {
          background: 'rgba(57,255,20,0.12)',
          color: '#39ff14',
          border: '1px solid rgba(57,255,20,0.3)',
        },
        colorWarning: {
          background: 'rgba(245,158,11,0.12)',
          color: '#f59e0b',
          border: '1px solid rgba(245,158,11,0.3)',
        },
        colorError: {
          background: 'rgba(239,68,68,0.12)',
          color: '#ef4444',
          border: '1px solid rgba(239,68,68,0.3)',
        },
        colorInfo: {
          background: 'rgba(0,212,255,0.12)',
          color: '#00d4ff',
          border: '1px solid rgba(0,212,255,0.3)',
        },
        colorPrimary: {
          background: 'rgba(0,212,255,0.12)',
          color: '#00d4ff',
          border: '1px solid rgba(0,212,255,0.3)',
        },
      },
    },

    /* ── Table ── */
    MuiTableHead: {
      styleOverrides: {
        root: {
          background: '#071022',
          '& .MuiTableCell-root': {
            color: '#3d6080',
            fontFamily: "'JetBrains Mono','Courier New',monospace",
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            borderBottom: '1px solid #1e3a5f',
            fontWeight: 700,
          },
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background 0.1s',
            '&:hover': {
              background: 'rgba(0,212,255,0.04)',
            },
          },
          '& .MuiTableCell-root': {
            borderBottom: '1px solid #1a2e4a',
            color: '#7ca5cc',
            fontSize: '0.8rem',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          background: '#0b1628',
          border: '1px solid #1a2e4a',
          borderRadius: '8px',
        },
      },
    },

    /* ── Form inputs ── */
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: 'rgba(0,0,0,0.3)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#1e3a5f',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2a5080',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00d4ff',
            boxShadow: '0 0 0 2px rgba(0,212,255,0.1)',
          },
        },
        input: { color: '#e2f0ff' },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#3d6080',
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          fontSize: '0.75rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          '&.Mui-focused': { color: '#00d4ff' },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: { color: '#3d6080' },
      },
    },

    /* ── Menu / Dropdown ── */
    MuiMenu: {
      styleOverrides: {
        paper: {
          background: '#0b1628',
          border: '1px solid #1e3a5f',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: '#7ca5cc',
          fontSize: '0.85rem',
          '&:hover': {
            background: 'rgba(0,212,255,0.08)',
            color: '#e2f0ff',
          },
          '&.Mui-selected': {
            background: 'rgba(0,212,255,0.12)',
            color: '#00d4ff',
          },
        },
      },
    },

    /* ── Tooltip ── */
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: '#0b1628',
          border: '1px solid #1e3a5f',
          color: '#e2f0ff',
          fontSize: '0.75rem',
          fontFamily: "'JetBrains Mono','Courier New',monospace",
        },
        arrow: { color: '#1e3a5f' },
      },
    },

    /* ── Alert ── */
    MuiAlert: {
      styleOverrides: {
        root: {
          border: '1px solid',
          borderRadius: '8px',
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          fontSize: '0.8rem',
        },
        standardSuccess: {
          background: 'rgba(57,255,20,0.06)',
          borderColor: 'rgba(57,255,20,0.25)',
          color: '#39ff14',
        },
        standardWarning: {
          background: 'rgba(245,158,11,0.06)',
          borderColor: 'rgba(245,158,11,0.25)',
          color: '#f59e0b',
        },
        standardError: {
          background: 'rgba(239,68,68,0.06)',
          borderColor: 'rgba(239,68,68,0.25)',
          color: '#ef4444',
        },
        standardInfo: {
          background: 'rgba(0,212,255,0.06)',
          borderColor: 'rgba(0,212,255,0.25)',
          color: '#00d4ff',
        },
      },
    },

    /* ── Tabs ── */
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          letterSpacing: '0.06em',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          color: '#3d6080',
          '&.Mui-selected': { color: '#00d4ff' },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { background: '#00d4ff', height: '2px' },
        root: { borderBottom: '1px solid #1a2e4a' },
      },
    },

    /* ── Linear progress ── */
    MuiLinearProgress: {
      styleOverrides: {
        root: { background: '#1a2e4a', borderRadius: '2px', height: 4 },
        bar: { borderRadius: '2px' },
      },
    },

    /* ── Dialog ── */
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#0b1628',
          border: '1px solid #2a5080',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          letterSpacing: '0.04em',
          fontSize: '0.9rem',
          textTransform: 'uppercase',
          color: '#e2f0ff',
          borderBottom: '1px solid #1a2e4a',
        },
      },
    },

    /* ── Divider ── */
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: '#1a2e4a' },
      },
    },

    /* ── Badge ── */
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          fontSize: '0.6rem',
          fontWeight: 700,
        },
      },
    },

    /* ── CircularProgress ── */
    MuiCircularProgress: {
      styleOverrides: {
        colorPrimary: { color: '#00d4ff' },
      },
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/login"
    >
      <Provider store={store}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    </ClerkProvider>
  </React.StrictMode>
);

// Made with Bob
