import React, { useEffect, useMemo, useState } from 'react';
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
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
};

const AUTOMATION_COLOR: Record<string, string> = {
  'fully-automated': '#a5d6a7',
  'semi-automated': '#ffd54f',
  manual: '#8892a4',
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

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/playbooks${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: IncidentPlaybooksResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load playbooks');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load playbooks</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <PlaybookIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Incident Playbooks
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real remediation playbooks for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Playbooks', value: data.total_playbooks, color: '#90caf9' },
          { label: 'Active Playbooks', value: activePlaybooks.length, color: activePlaybooks.length > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Affected Pods', value: totalAffectedPods, color: totalAffectedPods > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Semi/Fully Automated', value: automatedPlaybooks, color: '#90caf9' },
          { label: 'Critical Severity', value: criticalPlaybooks, color: criticalPlaybooks > 0 ? '#ef5350' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>
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
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these playbooks are active
          </Typography>
          <Stack spacing={1.5}>
            {activePlaybooks.map((playbook) => (
              <Box key={playbook.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                    <Chip label={playbook.id} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {playbook.name}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip label={playbook.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: SEVERITY_COLOR[playbook.severity] || '#8892a4', fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={`${playbook.affected_pods} affected pod${playbook.affected_pods !== 1 ? 's' : ''}`} size="small" sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={playbook.automation_level} size="small" sx={{ bgcolor: '#2a3245', color: AUTOMATION_COLOR[playbook.automation_level] || '#8892a4', fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.75 }}>
                  {buildPlaybookReason(playbook)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
            Available Playbooks
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['ID', 'Name', 'Description', 'Severity', 'Affected Pods', 'Steps', 'Est. Time', 'Automation', 'Status', 'Why it matters'].map((header) => (
                  <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.playbooks.map((playbook) => (
                <TableRow key={playbook.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={playbook.id} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#e8eaf0', fontWeight: 700, borderColor: '#2a3245', minWidth: 220 }}>
                    {playbook.name}
                  </TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 280 }}>
                    {playbook.description}
                  </TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={playbook.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: SEVERITY_COLOR[playbook.severity] || '#8892a4', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>{playbook.affected_pods}</TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>{playbook.steps}</TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245' }}>{playbook.estimated_time}</TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={playbook.automation_level} size="small" sx={{ bgcolor: '#2a3245', color: AUTOMATION_COLOR[playbook.automation_level] || '#8892a4', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={playbook.active ? 'ACTIVE' : 'INACTIVE'} size="small" sx={{ bgcolor: '#2a3245', color: playbook.active ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 11, lineHeight: 1.6, minWidth: 320 }}>
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
