/**
 * CicdConnectForm
 * ───────────────
 * Shared connect form for the 3 CI/CD Platform Engineering pages
 * (GitHubActions, GitLabCI, JenkinsIntegration) — same backend flow
 * (api/cicd_integrations.py), different field set per provider, so one
 * component beats tripling near-identical UI across 3 pages.
 */
import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { useActiveCluster } from '../hooks/useActiveCluster';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export type CicdProvider = 'GitHub Actions' | 'GitLab CI' | 'Jenkins';

interface Props {
  provider: CicdProvider;
  onConnected: () => void;
}

const FIELD_META: Record<CicdProvider, {
  projectLabel: string; projectPlaceholder: string;
  needsBaseUrl: boolean; baseUrlPlaceholder: string;
  needsUsername: boolean;
  tokenLabel: string; tokenPlaceholder: string; tokenHelp: string;
}> = {
  'GitHub Actions': {
    projectLabel: 'Repository', projectPlaceholder: 'owner/repo',
    needsBaseUrl: false, baseUrlPlaceholder: '',
    needsUsername: false,
    tokenLabel: 'Personal Access Token', tokenPlaceholder: 'ghp_xxxxxxxxxxxx',
    tokenHelp: 'Fine-grained PAT with read-only Actions + Contents access on this repo only',
  },
  'GitLab CI': {
    projectLabel: 'Project', projectPlaceholder: 'group/project or numeric project ID',
    needsBaseUrl: true, baseUrlPlaceholder: 'https://gitlab.com (leave blank for gitlab.com)',
    needsUsername: false,
    tokenLabel: 'Private Token', tokenPlaceholder: 'glpat-xxxxxxxxxxxx',
    tokenHelp: 'Project access token with read_api scope only',
  },
  'Jenkins': {
    projectLabel: 'Job filter', projectPlaceholder: '(unused — all jobs Jenkins returns)',
    needsBaseUrl: true, baseUrlPlaceholder: 'https://jenkins.internal.example.com',
    needsUsername: true,
    tokenLabel: 'API Token', tokenPlaceholder: 'jenkins API token (not your password)',
    tokenHelp: 'Generate under your Jenkins user → Configure → API Token',
  },
};

const CicdConnectForm: React.FC<Props> = ({ provider, onConnected }) => {
  const { activeClusterId } = useActiveCluster();
  const meta = FIELD_META[provider];

  const [token, setToken] = useState('');
  const [projectRef, setProjectRef] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!token && (provider === 'Jenkins' || !!projectRef)
    && (!meta.needsBaseUrl || provider !== 'Jenkins' || !!baseUrl)
    && (!meta.needsUsername || !!username);

  const handleConnect = async () => {
    if (!activeClusterId || activeClusterId === 'all' || !ready) return;
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/cicd/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_name: activeClusterId,
          provider,
          token,
          project_ref: projectRef,
          base_url: baseUrl || null,
          username: username || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      onConnected();
    } catch (e: any) {
      setError(e?.message ?? 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Connect {provider}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Read-only access only — see the exact scope needed below each field.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {provider !== 'Jenkins' && (
          <TextField
            label={meta.projectLabel}
            value={projectRef}
            onChange={(e) => setProjectRef(e.target.value)}
            placeholder={meta.projectPlaceholder}
            fullWidth size="small"
          />
        )}
        {meta.needsBaseUrl && (
          <TextField
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={meta.baseUrlPlaceholder}
            fullWidth size="small"
          />
        )}
        {meta.needsUsername && (
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth size="small"
          />
        )}
        <TextField
          label={meta.tokenLabel}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={meta.tokenPlaceholder}
          helperText={meta.tokenHelp}
          fullWidth size="small"
        />
      </Box>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <Button
        variant="contained"
        fullWidth
        sx={{ mt: 3 }}
        disabled={!ready || connecting}
        startIcon={connecting ? <CircularProgress size={16} /> : null}
        onClick={handleConnect}
      >
        {connecting ? 'Connecting…' : `Connect ${provider}`}
      </Button>
    </Paper>
  );
};

export default CicdConnectForm;
