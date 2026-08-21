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
import { PlayArrow as PlaybookIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';
import { colors } from '../../theme/colors';

interface IncidentPlaybook {
  id: string;
  name: string;
  description: string;
  severity: string;
  affected_pods: number;
  steps: number;
  estimated_time: string;
  automation_level: string;
  active: boolean;
}

interface IncidentPlaybooksResponse {
  total_playbooks: number;
  playbooks: IncidentPlaybook[];
  cluster_name?: string;
  last_updated?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.success,
};

const AUTOMATION_COLOR: Record<string, string> = {
  'fully-automated': colors.success,
  'semi-automated': colors.warning,
  manual: colors.textSecondary,
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildPlaybookReason(playbook: IncidentPlaybook): string {
  if (playbook.id === 'PB-001') {
    return `${playbook.affected_pods} pod${playbook.affected_pods !== 1 ? 's are' : ' is'} currently flagged with privileged containers. This matters because privileged containers can access host devices and kernel-level capabilities, so this playbook is active whenever that count is above zero.`;
  }

  if (playbook.id === 'PB-002') {
    return `${playbook.affected_pods} pod${playbook.affected_pods !== 1 ? 's are' : ' is'} using host namespaces according to the threat context. That reduces isolation and gives workloads direct visibility into node networking or processes, which is why this remediation is recommended.`;
  }

  if (playbook.id === 'PB-003') {
    return `${playbook.affected_pods} pod${playbook.affected_pods !== 1 ? 's are' : ' is'} running with root-related indicators. Enforcing non-root execution lowers the chance that a container compromise turns into privilege escalation on the node.`;
  }

  if (playbook.id === 'PB-004') {
    return `${playbook.description}. The backend keeps this playbook active because shared default service accounts expand blast radius if any one workload is compromised.`;
  }

  return `${playbook.affected_pods} affected pod${playbook.affected_pods !== 1 ? 's' : ''} currently map to this playbook.`;
}

const IncidentPlaybooksInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<IncidentPlaybooksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/playbooks${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: IncidentPlaybooksResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playbooks');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activePlaybooks = useMemo(
    () => data?.playbooks.filter((playbook) => playbook.active) ?? [],
    [data],
  );
  const criticalPlaybooks = useMemo(
    () => data?.playbooks.filter((playbook) => playbook.severity === 'critical').length ?? 0,
    [data],
  );
  const totalAffectedPods = useMemo(
    () => data?.playbooks.reduce((sum, playbook) => sum + playbook.affected_pods, 0) ?? 0,
    [data],
  );
  const automatedPlaybooks = useMemo(
    () => data?.playbooks.filter((playbook) => playbook.automation_level !== 'manual').length ?? 0,
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
        <Alert severity="error">Failed to load playbooks</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <PlaybookIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Incident Playbooks
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real remediation playbooks for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Playbooks', value: data.total_playbooks, color: colors.info },
          { label: 'Active Playbooks', value: activePlaybooks.length, color: activePlaybooks.length > 0 ? colors.danger : colors.success },
          { label: 'Affected Pods', value: totalAffectedPods, color: totalAffectedPods > 0 ? colors.danger : colors.success },
          { label: 'Semi/Fully Automated', value: automatedPlaybooks, color: colors.info },
          { label: 'Critical Severity', value: criticalPlaybooks, color: criticalPlaybooks > 0 ? colors.danger : colors.success },
        ].map((item) => (
          <Grid item xs={6} md key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}`, height: '100%' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                  {item.label}
                </Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {activePlaybooks.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Why these playbooks are active
          </Typography>
          <Stack spacing={1.5}>
            {activePlaybooks.map((playbook) => (
              <Box key={playbook.id} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                    <Chip label={playbook.id} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontWeight: 'bold', fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {playbook.name}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip label={playbook.severity.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: SEVERITY_COLOR[playbook.severity] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={`${playbook.affected_pods} affected pod${playbook.affected_pods !== 1 ? 's' : ''}`} size="small" sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={playbook.automation_level} size="small" sx={{ bgcolor: colors.border, color: AUTOMATION_COLOR[playbook.automation_level] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.75 }}>
                  {buildPlaybookReason(playbook)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
            Available Playbooks
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['ID', 'Name', 'Description', 'Severity', 'Affected Pods', 'Steps', 'Est. Time', 'Automation', 'Status', 'Why it matters'].map((header) => (
                  <TableCell key={header} sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.playbooks.map((playbook) => (
                <TableRow key={playbook.id} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}>
                  <TableCell sx={{ borderColor: colors.border }}>
                    <Chip label={playbook.id} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: colors.textPrimary, fontWeight: 700, borderColor: colors.border, minWidth: 220 }}>
                    {playbook.name}
                  </TableCell>
                  <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 280 }}>
                    {playbook.description}
                  </TableCell>
                  <TableCell sx={{ borderColor: colors.border }}>
                    <Chip label={playbook.severity.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: SEVERITY_COLOR[playbook.severity] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ borderColor: colors.border }}>{playbook.affected_pods}</TableCell>
                  <TableCell sx={{ borderColor: colors.border }}>{playbook.steps}</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border }}>{playbook.estimated_time}</TableCell>
                  <TableCell sx={{ borderColor: colors.border }}>
                    <Chip label={playbook.automation_level} size="small" sx={{ bgcolor: colors.border, color: AUTOMATION_COLOR[playbook.automation_level] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ borderColor: colors.border }}>
                    <Chip label={playbook.active ? 'ACTIVE' : 'INACTIVE'} size="small" sx={{ bgcolor: colors.border, color: playbook.active ? colors.danger : colors.success, fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 11, lineHeight: 1.6, minWidth: 320 }}>
                    {buildPlaybookReason(playbook)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
};

const IncidentPlaybooks: React.FC = () => (
  <ClusterGuard>
    <IncidentPlaybooksInner />
  </ClusterGuard>
);

export default IncidentPlaybooks;
