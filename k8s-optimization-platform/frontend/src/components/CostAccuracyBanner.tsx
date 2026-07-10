import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import VerifiedIcon from '@mui/icons-material/Verified';
import { useNavigate } from 'react-router-dom';
import { useCloudDiscovery } from '../hooks/useCloudDiscovery';

const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};

interface Props {
  clusterName: string | null;
}

/**
 * CostAccuracyBanner — shown on all 7 FinOps cost pages.
 * Phase 1 (no billing connected): amber banner with "Connect Cloud Account" CTA.
 * Phase 2 (billing connected):    small green badge — no banner.
 * Carbon / Energy / Sustainability pages: do NOT use this component (physics-based).
 */
const CostAccuracyBanner: React.FC<Props> = ({ clusterName }) => {
  const discovery = useCloudDiscovery(clusterName);
  const navigate  = useNavigate();

  // Still loading — render nothing to avoid flash
  if (discovery.loading) return null;

  // Phase 2 connected — green badge only, no amber banner
  if (discovery.connected) {
    const ago = discovery.lastSync
      ? (() => {
          const diff = Math.floor((Date.now() - new Date(discovery.lastSync).getTime()) / 60000);
          return diff < 2 ? 'just now' : `${diff}m ago`;
        })()
      : '—';
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        bgcolor: '#3fb95011', border: '1px solid #3fb95033',
        borderRadius: 1.5, px: 2, py: 1, mb: 2,
      }}>
        <VerifiedIcon sx={{ color: '#3fb950', fontSize: 16 }} />
        <Typography sx={{ color: '#3fb950', fontSize: '0.78rem', fontWeight: 600 }}>
          Invoice-Accurate · {discovery.provider} · Synced {ago}
        </Typography>
      </Box>
    );
  }

  // Phase 1 — amber banner
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 2, flexWrap: 'wrap',
      bgcolor: '#d2992211', border: '1px solid #d2992244',
      borderRadius: 1.5, px: 2, py: 1.25, mb: 2,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <CloudSyncIcon sx={{ color: '#d29922', fontSize: 18, mt: '1px', flexShrink: 0 }} />
        <Box>
          <Typography sx={{ color: '#d29922', fontSize: '0.8rem', fontWeight: 700 }}>
            Showing estimated costs
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.73rem', mt: 0.25 }}>
            Calculated from node specs using public on-demand rates.
            Connect your cloud account for invoice-accurate data including
            Enterprise Agreement &amp; partner discounts.
          </Typography>
        </Box>
      </Box>
      <Button
        size="small"
        variant="outlined"
        onClick={() => navigate('/settings/cloud-discovery')}
        sx={{
          borderColor: '#d29922', color: '#d29922', fontSize: '0.73rem',
          textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          '&:hover': { bgcolor: '#d2992222', borderColor: '#d29922' },
        }}
      >
        Connect Cloud Account →
      </Button>
    </Box>
  );
};

export default CostAccuracyBanner;

// Made with Bob
