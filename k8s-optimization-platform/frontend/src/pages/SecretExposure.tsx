import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  ArrowForward as ArrowIcon,
  Error as ErrorIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RotateIcon,
  VpnKey as KeyIcon,
} from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';
import { colors } from '../theme/colors';

interface SecretExposureItem {
  id: string;
  pod_name: string;
  container_name: string;
  namespace: string;
  severity: string;
  secret_type: string;
  exposure_type: string;
  env_var_count: number;
  detected_at: string;
  value_preview?: string;
  recommendation: string;
  remediation_steps?: string[];
}

interface SecretExposureResponse {
  exposure_score: number;
  total_exposures: number;
  critical_exposures: number;
  high_exposures: number;
  medium_exposures: number;
  exposed_secrets: SecretExposureItem[];
  exposure_by_type?: Record<string, number>;
  containers_scanned: number;
  recommendation?: string;
  last_scan?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.success,
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildWhyExposed(secret: SecretExposureItem) {
  const reasons: string[] = [];

  if ((secret.exposure_type || '').toLowerCase() === 'environment_variable') {
    reasons.push('Sensitive values are being injected through environment variables instead of a Kubernetes Secret reference.');
  }

  if (secret.env_var_count > 20) {
    reasons.push(`${secret.env_var_count} environment variables were found in this container, which is above the backend threshold for likely secret sprawl.`);
  } else if (secret.env_var_count > 10) {
    reasons.push(`${secret.env_var_count} environment variables were found in a secret-heavy service image, which the backend flags as likely credential exposure.`);
  }

  if (secret.secret_type) {
    reasons.push(`The detected secret category is ${secret.secret_type}, which suggests application credentials are present in runtime configuration.`);
  }

  reasons.push(secret.recommendation);
  return reasons;
}

const ExposureRow: React.FC<{ secret: SecretExposureItem }> = ({ secret }) => {
  const [open, setOpen] = useState(false);
  const severity = (secret.severity || 'low').toLowerCase();
  const reasons = useMemo(() => buildWhyExposed(secret), [secret]);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
        <TableCell sx={{ fontWeight: 600, fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
          {secret.pod_name || 'N/A'}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
          {secret.container_name || 'N/A'}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
          {secret.namespace || 'N/A'}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip
            label={severity.toUpperCase()}
            size="small"
            sx={{ bgcolor: colors.border, color: SEV_COLOR[severity] || colors.textPrimary, fontWeight: 'bold', fontSize: 10 }}
          />
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
          {secret.secret_type || 'N/A'}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textSecondary, borderColor: colors.border }}>
          {secret.exposure_type || 'N/A'}
        </TableCell>
        <TableCell sx={{ fontSize: 12, color: colors.textPrimary, borderColor: colors.border }}>
          {secret.env_var_count ?? 'N/A'}
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: colors.textSecondary, borderColor: colors.border, whiteSpace: 'nowrap' }}>
          {formatTimestamp(secret.detected_at)}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <IconButton
            size="small"
            onClick={() => setOpen((value) => !value)}
            sx={{ color: colors.info }}
            aria-label="Show exposure details"
          >
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={9} sx={{ p: 0, borderColor: open ? colors.border : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.warning, mb: 1.5 }}>
                Why this workload is flagged
              </Typography>
              <Stack spacing={1}>
                {reasons.map((reason) => (
                  <Box key={reason} display="flex" gap={1} alignItems="flex-start">
                    <Typography variant="body2" sx={{ color: colors.danger, fontSize: 13, lineHeight: 1.2, mt: 0.15 }}>
                      •
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                      {reason}
                    </Typography>
                  </Box>
                ))}
              </Stack>

              {secret.value_preview && (
                <Box mt={2} sx={{ p: 1.5, borderRadius: 1, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block' }}>
                    Value Preview
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textPrimary, mt: 0.5, fontFamily: 'monospace' }}>
                    {secret.value_preview}
                  </Typography>
                </Box>
              )}

              {secret.remediation_steps && secret.remediation_steps.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Remediation Steps
                  </Typography>
                  <Stack spacing={0.75}>
                    {secret.remediation_steps.map((step) => (
                      <Typography key={step} variant="body2" sx={{ color: colors.success, fontSize: 13 }}>
                        • {step}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const SecretExposureInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<SecretExposureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/security/secrets-security/exposure${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: SecretExposureResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load secret exposure data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 120000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [clusterParam]);

  const secrets = useMemo(() => (Array.isArray(data?.exposed_secrets) ? data!.exposed_secrets : []), [data]);
  const highOrCritical = useMemo(
    () => secrets.filter((secret) => ['critical', 'high'].includes((secret.severity || '').toLowerCase())),
    [secrets],
  );
  const topExposureType = useMemo(() => {
    const entries = Object.entries(data?.exposure_by_type || {});
    return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  }, [data]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}><Alert severity="error">Failed to load secret exposure data</Alert></Box>;

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <KeyIcon sx={{ fontSize: 36, color: colors.info }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Secret Exposure
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Real cluster scan for exposed runtime secrets · Last scan {formatTimestamp(data.last_scan)}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Exposure Score', value: data.exposure_score, color: colors.info },
          { label: 'Total Exposures', value: data.total_exposures, color: colors.danger },
          { label: 'High Severity', value: data.high_exposures + data.critical_exposures, color: colors.warning },
          { label: 'Containers Scanned', value: data.containers_scanned, color: colors.success },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>
                  {item.value ?? 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {highOrCritical.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: `1px solid ${colors.border}`, bgcolor: colors.surface }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <ErrorIcon sx={{ color: colors.danger }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Why these exposures matter
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, ml: 'auto' }}>
              Primary exposure type: {topExposureType}
            </Typography>
          </Box>
          <Stack spacing={1.5}>
            {highOrCritical.slice(0, 4).map((secret) => {
              const reasons = buildWhyExposed(secret);

              return (
                <Box
                  key={secret.id}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    bgcolor: colors.surfaceAlt,
                    border: `1px solid ${colors.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {secret.pod_name} / {secret.container_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.textMuted, mt: 0.5, lineHeight: 1.7 }}>
                      {reasons.slice(0, 2).join(' ')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {secret.namespace} · {secret.secret_type} · detected {formatTimestamp(secret.detected_at)}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<RotateIcon />}
                    onClick={() => navigate('/security/secrets-security/secret-rotation')}
                    sx={{ fontSize: 11, bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}
                  >
                    Rotate Secrets
                  </Button>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2} display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              All Exposed Secrets ({secrets.length})
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Expand a row to see the real detection reason, backend recommendation, and remediation steps generated from the live scan.
            </Typography>
          </Box>
          <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/security/secrets-security/secret-rotation')} sx={{ color: colors.info }}>
            Rotation Schedule
          </Button>
        </Box>

        {secrets.length === 0 ? (
          <Box p={3}>
            <Paper elevation={0} sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', p: 6, border: `1px solid ${colors.border}`, borderRadius: 2, bgcolor: colors.surfaceAlt }}>
              <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ color: colors.textPrimary }}>
                No secret exposure issues found
              </Typography>
              <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.7 }}>
                {data.recommendation || 'The latest cluster scan did not find any workloads with likely secret exposure patterns.'}
              </Typography>
            </Paper>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Pod', 'Container', 'Namespace', 'Severity', 'Secret Type', 'Exposure Type', 'Env Vars', 'Detected At', 'Why Exposed'].map((header) => (
                    <TableCell key={header} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.surfaceAlt, whiteSpace: 'nowrap' }}>
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {secrets.slice(0, 50).map((secret) => <ExposureRow key={secret.id} secret={secret} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const SecretExposure: React.FC = () => (
  <ClusterGuard>
    <SecretExposureInner />
  </ClusterGuard>
);

export default SecretExposure;
