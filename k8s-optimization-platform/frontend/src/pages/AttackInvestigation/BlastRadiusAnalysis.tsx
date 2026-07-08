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
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface BlastResource {
  type: string;
  name: string;
  namespace: string;
  impact_level: string;
  exposure_type: string;
}

interface BlastRadiusData {
  incident_id: string;
  impact_summary: {
    total_affected_resources: number;
    affected_namespaces: number;
    affected_pods: number;
    data_exposure_risk: string;
  };
  affected_resources: BlastResource[];
  network_exposure: {
    host_network_pods: number;
    privileged_pods: number;
  };
  cluster_name?: string;
}

interface ActiveThreat {
  name: string;
  severity: string;
  status: string;
  affected_pods: string[];
  affected_namespaces: string[];
  indicators: string[];
  auto_response: string;
}

interface ActiveThreatsResponse {
  threats: ActiveThreat[];
}

const IMPACT_COLOR: Record<string, string> = {
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
};

function getIncidentId(index: number) {
  return `INC-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`;
}

function buildBlastReason(blastRadius: BlastRadiusData, threat?: ActiveThreat) {
  const reasons: string[] = [];

  if (threat?.affected_pods.length) {
    reasons.push(`${threat.affected_pods.length} pod${threat.affected_pods.length > 1 ? 's are' : ' is'} directly tied to this incident, so compromise can spread through the workloads already flagged by the backend.`);
  }

  if (threat?.affected_namespaces.length) {
    reasons.push(`${threat.affected_namespaces.length} namespace${threat.affected_namespaces.length > 1 ? 's are' : ' is'} in scope, which expands the operational impact beyond a single workload boundary.`);
  }

  if (blastRadius.network_exposure.host_network_pods > 0) {
    reasons.push(`${blastRadius.network_exposure.host_network_pods} suspicious pod${blastRadius.network_exposure.host_network_pods > 1 ? 's have' : ' has'} host network access, increasing the chance of lateral movement across nodes and namespaces.`);
  }

  if (blastRadius.network_exposure.privileged_pods > 0) {
    reasons.push(`${blastRadius.network_exposure.privileged_pods} suspicious pod${blastRadius.network_exposure.privileged_pods > 1 ? 's are' : ' is'} privileged, which raises the chance of host-level impact and broader compromise.`);
  }

  if (threat?.indicators.length) {
    reasons.push(`Underlying threat evidence: ${threat.indicators.slice(0, 2).join(' · ')}.`);
  }

  if (threat?.auto_response) {
    reasons.push(`Recommended containment: ${threat.auto_response}`);
  }

  return reasons;
}

const BlastRadiusAnalysisInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [threats, setThreats] = useState<ActiveThreat[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchThreats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/active-threats${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: ActiveThreatsResponse = await response.json();
        if (!mounted) return;
        const items = Array.isArray(result.threats) ? result.threats : [];
        setThreats(items);
        setIncidentId(items.length > 0 ? getIncidentId(0) : '');
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load incidents');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchThreats();
    return () => {
      mounted = false;
    };
  }, [clusterParam]);

  useEffect(() => {
    if (!incidentId) {
      setBlastRadius(null);
      return;
    }

    let mounted = true;

    const fetchBlastRadius = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/blast-radius/${incidentId}${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: BlastRadiusData = await response.json();
        if (!mounted) return;
        setBlastRadius(data);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch blast radius data');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchBlastRadius();
    return () => {
      mounted = false;
    };
  }, [incidentId, clusterParam]);

  const incidentOptions = useMemo(
    () => threats.map((threat, index) => ({ value: getIncidentId(index), label: `${getIncidentId(index)} · ${threat.name}`, threat })),
    [threats],
  );

  const selectedThreat = useMemo(
    () => incidentOptions.find((option) => option.value === incidentId)?.threat,
    [incidentId, incidentOptions],
  );

  const blastReasons = useMemo(
    () => (blastRadius ? buildBlastReason(blastRadius, selectedThreat) : []),
    [blastRadius, selectedThreat],
  );

  if (loading && !blastRadius) {
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

  if (!blastRadius || incidentOptions.length === 0) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Paper sx={{ p: 4, bgcolor: '#1e2433', border: '1px solid #2a3245', maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            No blast radius data available
          </Typography>
          <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.7 }}>
            This page uses real incident ids derived from the live active threats feed. No threat-backed incidents were available for the selected cluster.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <WarningIcon sx={{ fontSize: 32, color: '#ef5350' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Blast Radius Analysis
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real impact scope for {blastRadius.cluster_name || 'cluster'} · {blastRadius.incident_id}
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1.5} flexWrap="wrap">
          <TextField
            select
            label="Incident"
            value={incidentId}
            onChange={(event) => setIncidentId(event.target.value)}
            size="small"
            SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: '#1e2433', color: '#e8eaf0' } } } }}
            InputLabelProps={{ sx: { color: '#8892a4' } }}
            sx={{
              minWidth: 320,
              '& .MuiOutlinedInput-root': {
                color: '#e8eaf0',
                bgcolor: '#1e2433',
                '& fieldset': { borderColor: '#2a3245' },
                '&:hover fieldset': { borderColor: '#90caf9' },
              },
            }}
          >
            {incidentOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
            Live Data
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Affected Resources', value: blastRadius.impact_summary.total_affected_resources, color: '#ef5350' },
          { label: 'Namespaces', value: blastRadius.impact_summary.affected_namespaces, color: '#90caf9' },
          { label: 'Pods', value: blastRadius.impact_summary.affected_pods, color: '#ffa726' },
          { label: 'Data Risk', value: blastRadius.impact_summary.data_exposure_risk, color: '#ef5350' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
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

      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <SecurityIcon sx={{ color: '#ffa726' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Why this blast radius is high
          </Typography>
        </Box>
        <Stack spacing={1}>
          {blastReasons.map((reason) => (
            <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
              • {reason}
            </Typography>
          ))}
        </Stack>
      </Paper>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
              Network Exposure
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Host network pods: <Box component="span" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{blastRadius.network_exposure.host_network_pods}</Box>
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Privileged pods: <Box component="span" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{blastRadius.network_exposure.privileged_pods}</Box>
              </Typography>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
              Threat Context
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Threat: <Box component="span" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{selectedThreat?.name || 'N/A'}</Box>
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Severity: <Box component="span" sx={{ color: IMPACT_COLOR[(selectedThreat?.severity || '').toLowerCase()] || '#e8eaf0', fontWeight: 700 }}>{selectedThreat?.severity?.toUpperCase() || 'N/A'}</Box>
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>
                Status: <Box component="span" sx={{ color: '#90caf9', fontWeight: 700 }}>{selectedThreat?.status?.toUpperCase() || 'N/A'}</Box>
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Affected Resources ({blastRadius.affected_resources.length})
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Type', 'Name', 'Namespace', 'Impact Level', 'Exposure Type'].map((heading) => (
                  <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245' }}>
                    {heading}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {blastRadius.affected_resources.map((resource, index) => (
                <TableRow key={`${resource.type}-${resource.name}-${index}`} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={resource.type} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontWeight: 600 }}>{resource.name}</TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245' }}>{resource.namespace}</TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={resource.impact_level.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: IMPACT_COLOR[(resource.impact_level || '').toLowerCase()] || '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245' }}>{resource.exposure_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

const BlastRadiusAnalysis: React.FC = () => (
  <ClusterGuard>
    <BlastRadiusAnalysisInner />
  </ClusterGuard>
);

export default BlastRadiusAnalysis;
