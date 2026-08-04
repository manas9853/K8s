import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';
import { colors } from '../../theme/colors';

interface PlaybookStep {
  step: number;
  title: string;
  description: string;
  actions: string[];
  automated: boolean;
  estimated_time: string;
}

interface PlaybookExecutionResponse {
  id: string;
  name: string;
  severity: string;
  steps: PlaybookStep[];
  cluster_name?: string;
  last_updated?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
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

function buildStepReason(playbookId: string, step: PlaybookStep): string {
  if (playbookId === 'PB-001') {
    if (step.step === 1) {
      return 'This step matters because the backend only builds this execution flow for the privileged container remediation playbook. The first job is to identify every privileged workload before changes are made.';
    }

    if (step.step === 2) {
      return 'This step preserves the current manifests before remediation. Backups are necessary so teams can compare the original privileged configuration against the fixed version.';
    }

    if (step.step === 3) {
      return 'This is the actual risk-reduction step. Removing privileged mode and disabling privilege escalation is the point where host-level attack surface is reduced.';
    }

    if (step.step === 4) {
      return 'Applying the updated manifests verifies the remediation is operational, not just planned. The cluster must accept the new spec and restart healthy workloads.';
    }

    if (step.step === 5) {
      return 'The backend closes the loop with a verification step so the team can confirm no privileged containers remain after rollout.';
    }
  }

  return `${step.title} is part of the backend-provided execution sequence for this playbook.`;
}

const PlaybookExecutionInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PlaybookExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/playbook-execution${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: PlaybookExecutionResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const automatedSteps = useMemo(
    () => data?.steps.filter((step) => step.automated).length ?? 0,
    [data],
  );
  const manualSteps = useMemo(
    () => data?.steps.filter((step) => !step.automated).length ?? 0,
    [data],
  );
  const totalActions = useMemo(
    () => data?.steps.reduce((sum, step) => sum + step.actions.length, 0) ?? 0,
    [data],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to fetch playbook execution data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SecurityIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Playbook Execution
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real execution plan for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Playbook ID', value: data.id, color: colors.info },
          { label: 'Total Steps', value: data.steps.length, color: colors.info },
          { label: 'Automated Steps', value: automatedSteps, color: automatedSteps > 0 ? colors.success : colors.textSecondary },
          { label: 'Manual Steps', value: manualSteps, color: manualSteps > 0 ? colors.warning : colors.textSecondary },
          { label: 'Total Actions', value: totalActions, color: colors.info },
        ].map((item) => (
          <Grid item xs={6} md key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, height: '100%' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color, wordBreak: 'break-word' }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" mb={1.5}>
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              {data.name}
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              Backend execution data currently resolves to this playbook sequence from the real detail endpoint.
            </Typography>
          </Box>
          <Chip label={data.severity.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: SEVERITY_COLOR[data.severity] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
        </Box>
        <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.75 }}>
          This page is using the real execution steps returned by the backend. Each step below includes the backend description, the exact actions array, whether the step is automated, and why the step matters in the remediation flow.
        </Typography>
      </Paper>

      <Stack spacing={1.5} mb={3}>
        {data.steps.map((step) => (
          <Paper key={step.step} sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
            <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" mb={1.5}>
              <Box>
                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
                  <Chip label={`Step ${step.step}`} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontWeight: 'bold', fontSize: 10 }} />
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                    {step.title}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                  {step.description}
                </Typography>
              </Box>
              <Box display="flex" gap={1} flexWrap="wrap" alignItems="flex-start">
                <Chip label={step.automated ? 'AUTOMATED' : 'MANUAL'} size="small" sx={{ bgcolor: colors.border, color: step.automated ? colors.success : colors.warning, fontWeight: 'bold', fontSize: 10 }} />
                <Chip label={step.estimated_time} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
              </Box>
            </Box>

            <Typography variant="caption" sx={{ color: colors.textSecondary, display: 'block', mb: 1 }}>
              Why this step matters
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.75, mb: 2 }}>
              {buildStepReason(data.id, step)}
            </Typography>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12, width: 80 }}>
                    Action #
                  </TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12 }}>
                    Backend Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {step.actions.map((action, index) => (
                  <TableRow key={`${step.step}-${index}`} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}>
                    <TableCell sx={{ color: colors.info, borderColor: colors.border, fontWeight: 700 }}>
                      {index + 1}
                    </TableCell>
                    <TableCell sx={{ color: colors.textMuted, borderColor: colors.border, fontSize: 12 }}>
                      {action}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

const PlaybookExecution: React.FC = () => (
  <ClusterGuard>
    <PlaybookExecutionInner />
  </ClusterGuard>
);

export default PlaybookExecution;
