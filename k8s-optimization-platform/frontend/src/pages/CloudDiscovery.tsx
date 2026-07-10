import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  TextField, Button, IconButton, Divider, Stepper, Step, StepLabel,
  Tooltip,
} from '@mui/material';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import VerifiedIcon from '@mui/icons-material/Verified';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

// ── Design tokens ──────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';
const PURPLE = '#a371f7';

// ── Provider metadata ──────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'IBM Cloud',
    label: 'IBM Cloud',
    logo: '🔵',
    placeholder_key: 'ibmcloud_api_key_xxxxxxxxxxxxxxxx',
    placeholder_account: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    placeholder_tag: 'xforce-devops',
    setup_cmd: 'ibmcloud iam api-key-create k8s-billing-reader --access-group BillingReadOnly',
    permissions: ['billing.usage.read', 'billing.invoice.read'],
    scope: 'Kubernetes worker nodes, PVCs, load balancers only',
    note: 'IBM IKS Standard tier — needs read-only billing scope',
  },
  {
    id: 'AWS',
    label: 'AWS',
    logo: '🟡',
    placeholder_key: 'AKIAIOSFODNN7EXAMPLE',
    placeholder_account: '123456789012',
    placeholder_tag: 'eks-cluster-name',
    setup_cmd: '# Attach AWSBillingReadOnlyAccess policy to an IAM user',
    permissions: ['ce:GetCostAndUsage', 'ce:GetDimensionValues'],
    scope: 'EKS costs filtered by cluster tag',
    note: 'AWS Cost Explorer read-only. No EC2/S3/RDS access.',
  },
  {
    id: 'GCP',
    label: 'GCP',
    logo: '🔴',
    placeholder_key: '{"type":"service_account","project_id":"..."}',
    placeholder_account: 'my-gcp-project-id',
    placeholder_tag: 'gke-cluster-name',
    setup_cmd: 'gcloud iam service-accounts create k8s-billing-reader --display-name "K8s Billing Reader"',
    permissions: ['bigquery.tables.getData', 'bigquery.jobs.create'],
    scope: 'GKE service costs filtered by cluster label',
    note: 'BigQuery billing export — read-only. No Compute/Storage access.',
  },
  {
    id: 'Azure',
    label: 'Azure',
    logo: '🔷',
    placeholder_key: 'client_secret_xxxxxxxxxxxxxxxx',
    placeholder_account: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    placeholder_tag: 'aks-cluster-name',
    setup_cmd: "az role assignment create --role 'Cost Management Reader' --assignee <service-principal>",
    permissions: ['Cost Management Reader'],
    scope: 'AKS resource group costs only',
    note: 'Azure Cost Management Reader role — read-only. No VM/Storage access.',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
const card = (accent = DK.border) => ({
  bgcolor: DK.surface, border: `1px solid ${accent}`,
  borderRadius: 2, p: 2.5,
});

interface DiscoveryStatus {
  cluster_name: string;
  connected: boolean;
  provider: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_ok: boolean;
  last_error: string | null;
  accuracy: string;
}

// ── Main component ─────────────────────────────────────────────────────────────
const CloudDiscovery: React.FC = () => {
  const { activeClusterId, activeClusterName, clusterParam } = useActiveCluster();

  // Current connection state
  const [status,       setStatus]       = useState<DiscoveryStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Connect form state
  const [provider,    setProvider]    = useState('IBM Cloud');
  const [apiKey,      setApiKey]      = useState('');
  const [accountId,   setAccountId]   = useState('');
  const [clusterTag,  setClusterTag]  = useState('');
  const [step,        setStep]        = useState(0);   // 0=pick provider 1=enter creds 2=done
  const [validating,  setValidating]  = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [showKey,     setShowKey]     = useState(false);

  const provMeta = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  // ── Fetch status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!activeClusterId || activeClusterId === 'all') {
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const r = await fetch(`${API_BASE_URL}/v1/discovery/status?cluster=${activeClusterId}`);
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
    finally { setLoadingStatus(false); }
  }, [activeClusterId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Pre-fill cluster tag from active cluster
  useEffect(() => {
    if (activeClusterId && activeClusterId !== 'all' && !clusterTag) {
      setClusterTag(activeClusterId);
    }
  }, [activeClusterId, clusterTag]);

  // ── Validate credentials ────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!apiKey || !accountId) { setFormError('API Key and Account ID are required'); return; }
    setValidating(true);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/v1/discovery/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey, account_id: accountId }),
      });
      const d = await r.json();
      if (!r.ok || !d.valid) {
        setFormError(d.error ?? d.detail ?? 'Validation failed');
      } else {
        setStep(2);
      }
    } catch (e: any) {
      setFormError(e?.message ?? 'Network error');
    } finally {
      setValidating(false);
    }
  };

  // ── Connect ─────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!activeClusterId || activeClusterId === 'all') return;
    if (!apiKey || !accountId || !clusterTag) { setFormError('All fields required'); return; }
    setConnecting(true);
    setFormError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/v1/discovery/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_name: activeClusterId,
          provider,
          api_key: apiKey,
          account_id: accountId,
          cluster_tag: clusterTag,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      await fetchStatus();
      setStep(0);
      setApiKey('');
    } catch (e: any) {
      setFormError(e?.message ?? 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // ── Sync ────────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!activeClusterId || activeClusterId === 'all') return;
    setSyncing(true);
    try {
      await fetch(`${API_BASE_URL}/v1/discovery/sync?cluster=${activeClusterId}`, { method: 'POST' });
      await fetchStatus();
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  };

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!activeClusterId || activeClusterId === 'all') return;
    if (!window.confirm(`Disconnect cloud billing from ${activeClusterName}? Cost pages will revert to estimates.`)) return;
    setDisconnecting(true);
    try {
      await fetch(`${API_BASE_URL}/v1/discovery/disconnect?cluster=${activeClusterId}`, { method: 'DELETE' });
      setStatus(null);
      await fetchStatus();
    } catch { /* ignore */ }
    finally { setDisconnecting(false); }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(provMeta.setup_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── No cluster selected ─────────────────────────────────────────────────────
  if (!activeClusterId || activeClusterId === 'all') {
    return (
      <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>
        <Alert severity="info" sx={{ bgcolor: `${ACCENT}11`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
          Select a specific cluster from the dropdown to manage cloud billing integration.
        </Alert>
      </Box>
    );
  }

  const isConnected = status?.connected === true;
  const syncAgo = status?.last_sync_at
    ? (() => {
        const diff = Math.floor((Date.now() - new Date(status.last_sync_at).getTime()) / 60000);
        return diff < 2 ? 'just now' : diff < 60 ? `${diff}m ago` : `${Math.floor(diff / 60)}h ago`;
      })()
    : null;

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <CloudSyncIcon sx={{ color: ACCENT, fontSize: 32 }} />
          <Box>
            <Typography variant="h4" sx={{ color: DK.text, fontWeight: 700, lineHeight: 1.2 }}>
              Cloud Billing Integration
            </Typography>
            <Typography sx={{ color: DK.muted, fontSize: '0.8rem', mt: 0.25 }}>
              Connect your cloud account to unlock invoice-accurate cost data · {activeClusterName}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={fetchStatus} sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* ── Current status card ─────────────────────────────────────────────── */}
      {loadingStatus ? (
        <Box sx={{ ...card(), mb: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={18} sx={{ color: ACCENT }} />
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem' }}>Checking connection status…</Typography>
        </Box>
      ) : isConnected ? (
        /* ── CONNECTED STATE ── */
        <Paper sx={{ ...card(GREEN), mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <VerifiedIcon sx={{ color: GREEN, fontSize: 28 }} />
              <Box>
                <Typography sx={{ color: GREEN, fontWeight: 700, fontSize: '1rem' }}>
                  Invoice-Accurate · {status?.provider}
                </Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mt: 0.25 }}>
                  All FinOps cost pages now show real invoice data
                  {syncAgo && ` · Last synced ${syncAgo}`}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={syncing ? <CircularProgress size={14} sx={{ color: GREEN }} /> : <RefreshIcon />}
                onClick={handleSync}
                disabled={syncing}
                sx={{ borderColor: GREEN, color: GREEN, fontSize: '0.73rem', textTransform: 'none',
                      '&:hover': { bgcolor: '#3fb95011' } }}
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LinkOffIcon />}
                onClick={handleDisconnect}
                disabled={disconnecting}
                sx={{ borderColor: RED, color: RED, fontSize: '0.73rem', textTransform: 'none',
                      '&:hover': { bgcolor: `${RED}11` } }}
              >
                Disconnect
              </Button>
            </Box>
          </Box>
          <Divider sx={{ borderColor: DK.border, my: 2 }} />
          <Grid container spacing={2}>
            {[
              ['Provider',    status?.provider ?? '—'],
              ['Account ID',  status?.cluster_name ?? '—'],
              ['Status',      status?.status ?? '—'],
              ['Last Sync',   syncAgo ?? 'Never'],
              ['Accuracy',    'Invoice-Accurate ✓'],
            ].map(([k, v]) => (
              <Grid item xs={6} sm={4} md={2.4} key={k}>
                <Typography sx={{ color: DK.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>{k}</Typography>
                <Typography sx={{ color: DK.text, fontSize: '0.85rem', fontWeight: 600 }}>{v}</Typography>
              </Grid>
            ))}
          </Grid>
          {status?.last_error && (
            <Alert severity="warning" sx={{ mt: 2, bgcolor: `${AMBER}11`, color: AMBER, border: `1px solid ${AMBER}33`, fontSize: '0.78rem' }}>
              Last sync warning: {status.last_error}
            </Alert>
          )}
        </Paper>
      ) : (
        /* ── DISCONNECTED STATE ── */
        <Paper sx={{ ...card(AMBER), mb: 3 }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <CloudSyncIcon sx={{ color: AMBER, fontSize: 24 }} />
            <Box>
              <Typography sx={{ color: AMBER, fontWeight: 700, fontSize: '0.9rem' }}>
                Not connected · Showing estimated costs
              </Typography>
              <Typography sx={{ color: DK.muted, fontSize: '0.75rem', mt: 0.25 }}>
                Connect your {activeClusterName} cloud account below to unlock invoice-accurate billing data
                including Enterprise Agreement &amp; partner discounts.
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ── What you unlock ─────────────────────────────────────────────────── */}
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
        What you unlock with Phase 2
      </Typography>
      <Grid container spacing={1.5} mb={3}>
        {[
          { icon: '💰', title: 'Invoice-Accurate Costs', desc: 'Real line-item spend from your cloud bill — not estimates' },
          { icon: '🎁', title: 'Discounts Applied',     desc: 'Enterprise Agreements, committed-use, spot discounts reflected' },
          { icon: '📊', title: '12-Month History',      desc: 'Full cost history from your first invoice, no gaps' },
          { icon: '🔒', title: 'Read-Only Access',      desc: 'Billing read scope only — we never touch your compute resources' },
        ].map(({ icon, title, desc }) => (
          <Grid item xs={12} sm={6} md={3} key={title}>
            <Paper sx={{ ...card(), height: '100%' }}>
              <Typography sx={{ fontSize: '1.4rem', mb: 0.75 }}>{icon}</Typography>
              <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '0.85rem', mb: 0.5 }}>{title}</Typography>
              <Typography sx={{ color: DK.muted, fontSize: '0.75rem', lineHeight: 1.5 }}>{desc}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* ── Connect form ────────────────────────────────────────────────────── */}
      {!isConnected && (
        <>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
            Connect Cloud Account
          </Typography>

          <Grid container spacing={2.5}>
            {/* Left: form */}
            <Grid item xs={12} md={7}>
              <Paper sx={{ ...card(), p: 3 }}>
                <Stepper
                  activeStep={step}
                  alternativeLabel
                  sx={{
                    mb: 3,
                    '& .MuiStepLabel-label': { color: DK.muted, fontSize: '0.75rem' },
                    '& .MuiStepLabel-label.Mui-active': { color: ACCENT },
                    '& .MuiStepLabel-label.Mui-completed': { color: GREEN },
                    '& .MuiStepIcon-root': { color: DK.border },
                    '& .MuiStepIcon-root.Mui-active': { color: ACCENT },
                    '& .MuiStepIcon-root.Mui-completed': { color: GREEN },
                  }}
                >
                  {['Choose provider', 'Enter credentials', 'Validate & connect'].map(l => (
                    <Step key={l}><StepLabel>{l}</StepLabel></Step>
                  ))}
                </Stepper>

                {/* Step 0 — provider picker */}
                {step === 0 && (
                  <Box>
                    <Typography sx={{ color: DK.muted, fontSize: '0.78rem', mb: 2 }}>
                      Choose your Kubernetes cloud provider:
                    </Typography>
                    <Grid container spacing={1.5} mb={3}>
                      {PROVIDERS.map(p => (
                        <Grid item xs={6} key={p.id}>
                          <Paper
                            onClick={() => setProvider(p.id)}
                            sx={{
                              p: 1.75, cursor: 'pointer', textAlign: 'center',
                              bgcolor: provider === p.id ? `${ACCENT}15` : DK.surface2,
                              border: `1px solid ${provider === p.id ? ACCENT : DK.border}`,
                              borderRadius: 1.5,
                              '&:hover': { borderColor: ACCENT, bgcolor: `${ACCENT}08` },
                              transition: 'all 0.15s',
                            }}
                          >
                            <Typography sx={{ fontSize: '1.5rem', mb: 0.5 }}>{p.logo}</Typography>
                            <Typography sx={{ color: provider === p.id ? ACCENT : DK.text, fontSize: '0.82rem', fontWeight: 600 }}>
                              {p.label}
                            </Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>

                    {/* Security note */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: `${ACCENT}0a`, border: `1px solid ${ACCENT}22`, borderRadius: 1.5, p: 1.5, mb: 2 }}>
                      <LockOutlinedIcon sx={{ color: ACCENT, fontSize: 16, mt: '1px', flexShrink: 0 }} />
                      <Box>
                        <Typography sx={{ color: ACCENT, fontSize: '0.75rem', fontWeight: 700, mb: 0.25 }}>
                          Security: Read-only billing scope only
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.72rem', lineHeight: 1.5 }}>
                          {provMeta.scope}. {provMeta.note}.
                          API keys are encrypted (AES-256-GCM) at rest and never returned in API responses.
                        </Typography>
                      </Box>
                    </Box>

                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => setStep(1)}
                      sx={{ bgcolor: ACCENT, color: '#0d1117', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: '#79c0ff' } }}
                    >
                      Continue with {provMeta.label} →
                    </Button>
                  </Box>
                )}

                {/* Step 1 — credentials */}
                {step === 1 && (
                  <Box>
                    <Typography sx={{ color: DK.text, fontWeight: 600, fontSize: '0.9rem', mb: 2 }}>
                      {provMeta.logo} {provMeta.label} Credentials
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="API Key / Secret"
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); setFormError(null); }}
                        placeholder={provMeta.placeholder_key}
                        fullWidth
                        size="small"
                        InputProps={{
                          endAdornment: (
                            <Button size="small" onClick={() => setShowKey(v => !v)}
                              sx={{ color: DK.muted, fontSize: '0.65rem', minWidth: 'unset', textTransform: 'none' }}>
                              {showKey ? 'Hide' : 'Show'}
                            </Button>
                          ),
                        }}
                        sx={fieldSx}
                      />
                      <TextField
                        label="Account / Project ID"
                        value={accountId}
                        onChange={e => { setAccountId(e.target.value); setFormError(null); }}
                        placeholder={provMeta.placeholder_account}
                        fullWidth size="small" sx={fieldSx}
                      />
                      <TextField
                        label="Cluster Tag (how your cluster appears in billing)"
                        value={clusterTag}
                        onChange={e => { setClusterTag(e.target.value); setFormError(null); }}
                        placeholder={provMeta.placeholder_tag}
                        fullWidth size="small" sx={fieldSx}
                        helperText={<span style={{ color: DK.muted, fontSize: '0.7rem' }}>Usually the cluster name or ID used as a billing tag</span>}
                      />
                    </Box>

                    {formError && (
                      <Alert severity="error" sx={{ mt: 2, bgcolor: `${RED}11`, color: RED, border: `1px solid ${RED}33`, fontSize: '0.78rem' }}>
                        {formError}
                      </Alert>
                    )}

                    <Box display="flex" gap={1.5} mt={3}>
                      <Button
                        variant="outlined"
                        onClick={() => { setStep(0); setFormError(null); }}
                        sx={{ borderColor: DK.border, color: DK.muted, textTransform: 'none', flex: 1 }}
                      >
                        ← Back
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleValidate}
                        disabled={validating || !apiKey || !accountId}
                        startIcon={validating ? <CircularProgress size={14} sx={{ color: ACCENT }} /> : null}
                        sx={{ borderColor: ACCENT, color: ACCENT, textTransform: 'none', flex: 1, '&:hover': { bgcolor: `${ACCENT}11` } }}
                      >
                        {validating ? 'Testing…' : 'Test Connection'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Step 2 — confirm & connect */}
                {step === 2 && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                      <CheckCircleOutlineIcon sx={{ color: GREEN, fontSize: 28 }} />
                      <Box>
                        <Typography sx={{ color: GREEN, fontWeight: 700, fontSize: '0.9rem' }}>
                          Credentials validated ✓
                        </Typography>
                        <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>
                          Billing API access confirmed for {provMeta.label}
                        </Typography>
                      </Box>
                    </Box>

                    <Paper sx={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 1.5, p: 2, mb: 2.5 }}>
                      {[
                        ['Provider',     provMeta.label],
                        ['Account ID',   accountId],
                        ['Cluster Tag',  clusterTag],
                        ['Scope',        provMeta.scope],
                        ['Encryption',   'AES-256-GCM at rest'],
                      ].map(([k, v]) => (
                        <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: `1px solid ${DK.border}` }}>
                          <Typography sx={{ color: DK.muted, fontSize: '0.78rem' }}>{k}</Typography>
                          <Typography sx={{ color: DK.text, fontSize: '0.78rem', fontWeight: 600, maxWidth: '55%', textAlign: 'right', wordBreak: 'break-all' }}>{v}</Typography>
                        </Box>
                      ))}
                    </Paper>

                    {formError && (
                      <Alert severity="error" sx={{ mb: 2, bgcolor: `${RED}11`, color: RED, border: `1px solid ${RED}33`, fontSize: '0.78rem' }}>
                        {formError}
                      </Alert>
                    )}

                    <Box display="flex" gap={1.5}>
                      <Button
                        variant="outlined"
                        onClick={() => { setStep(1); setFormError(null); }}
                        sx={{ borderColor: DK.border, color: DK.muted, textTransform: 'none', flex: 1 }}
                      >
                        ← Back
                      </Button>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleConnect}
                        disabled={connecting}
                        startIcon={connecting ? <CircularProgress size={14} sx={{ color: '#0d1117' }} /> : <CloudSyncIcon />}
                        sx={{ bgcolor: ACCENT, color: '#0d1117', fontWeight: 700, textTransform: 'none', flex: 2, '&:hover': { bgcolor: '#79c0ff' } }}
                      >
                        {connecting ? 'Connecting & syncing…' : 'Connect & Start Syncing'}
                      </Button>
                    </Box>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Right: setup guide */}
            <Grid item xs={12} md={5}>
              <Paper sx={{ ...card(), p: 3 }}>
                <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '0.85rem', mb: 2 }}>
                  {provMeta.logo} Setup Guide — {provMeta.label}
                </Typography>

                {/* Required permissions */}
                <Typography sx={{ color: DK.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                  Required permissions
                </Typography>
                <Box mb={2}>
                  {provMeta.permissions.map(p => (
                    <Chip
                      key={p}
                      label={p}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5, bgcolor: `${ACCENT}15`, color: ACCENT, border: `1px solid ${ACCENT}33`, fontSize: '0.68rem' }}
                    />
                  ))}
                </Box>

                {/* Create API key command */}
                <Typography sx={{ color: DK.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                  Create API key (run in your terminal)
                </Typography>
                <Box sx={{ position: 'relative', bgcolor: DK.bg, border: `1px solid ${DK.border}`, borderRadius: 1.5, p: 1.5, mb: 2 }}>
                  <Typography sx={{ color: GREEN, fontFamily: 'monospace', fontSize: '0.72rem', lineHeight: 1.6, pr: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {provMeta.setup_cmd}
                  </Typography>
                  <Tooltip title={copied ? 'Copied!' : 'Copy command'}>
                    <IconButton
                      size="small"
                      onClick={copyCmd}
                      sx={{ position: 'absolute', top: 6, right: 6, color: copied ? GREEN : DK.muted, '&:hover': { color: ACCENT } }}
                    >
                      {copied ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Scope */}
                <Box sx={{ display: 'flex', gap: 1, bgcolor: `${GREEN}0a`, border: `1px solid ${GREEN}22`, borderRadius: 1.5, p: 1.5, mb: 2 }}>
                  <InfoOutlinedIcon sx={{ color: GREEN, fontSize: 15, mt: '2px', flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ color: GREEN, fontSize: '0.72rem', fontWeight: 700, mb: 0.25 }}>What we access</Typography>
                    <Typography sx={{ color: DK.muted, fontSize: '0.7rem', lineHeight: 1.5 }}>{provMeta.scope}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, bgcolor: `${RED}08`, border: `1px solid ${RED}22`, borderRadius: 1.5, p: 1.5 }}>
                  <ErrorOutlineIcon sx={{ color: RED, fontSize: 15, mt: '2px', flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ color: RED, fontSize: '0.72rem', fontWeight: 700, mb: 0.25 }}>What we never touch</Typography>
                    <Typography sx={{ color: DK.muted, fontSize: '0.7rem', lineHeight: 1.5 }}>
                      {PROVIDERS.find(p => p.id === provider)
                        ? 'Compute instances, databases, object storage, Lambda/Functions, IAM write operations — nothing outside billing read scope.'
                        : '—'}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

// ── TextField shared styles ────────────────────────────────────────────────────
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: DK.bg, color: DK.text, fontSize: '0.85rem',
    '& fieldset': { borderColor: DK.border },
    '&:hover fieldset': { borderColor: ACCENT },
    '&.Mui-focused fieldset': { borderColor: ACCENT },
  },
  '& .MuiInputLabel-root': { color: DK.muted, fontSize: '0.82rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: ACCENT },
};

export default CloudDiscovery;

// Made with Bob
