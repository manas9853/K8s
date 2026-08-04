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
import { NetworkCheck as NetworkIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';
import { colors } from '../../theme/colors';

interface NetworkSummary {
  total_connections: number;
  host_network: boolean;
  suspicious: number;
}

interface NetworkConnection {
  timestamp: string;
  protocol: string;
  source: string;
  destination: string;
  bytes_sent: number;
  bytes_received: number;
  duration: string;
  risk: string;
  reason: string;
}

interface NetworkEvidenceResponse {
  pod_name: string;
  namespace: string;
  network_summary: NetworkSummary;
  connections: NetworkConnection[];
  cluster_name?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function riskColor(risk?: string) {
  if (risk === 'critical') return colors.danger;
  if (risk === 'high') return colors.warning;
  if (risk === 'medium') return colors.info;
  return colors.success;
}

function buildReason(connection: NetworkConnection, podName: string, namespace: string, hostNetwork: boolean): string[] {
  const reasons: string[] = [];

  reasons.push(`This connection was observed for pod ${podName} in namespace ${namespace}. Network evidence is currently derived from the suspicious pod selected by the backend.`);

  if (hostNetwork) {
    reasons.push('This pod is using the host network namespace. That means it can bypass normal pod-to-pod network isolation and access node-level interfaces directly.');
  }

  if (connection.destination === 'all-cluster-nodes') {
    reasons.push('The destination is all cluster nodes, which indicates node-wide visibility or reach rather than a normal service-to-service connection.');
  }

  if (connection.duration === 'ongoing') {
    reasons.push('The connection is still active, so the exposure remains present and should be investigated in real time.');
  }

  if (connection.reason) {
    reasons.push(`The backend marked this connection suspicious for this reason: ${connection.reason}.`);
  }

  reasons.push(`The backend assigned ${connection.risk} risk to this connection based on the current pod networking posture.`);
  return reasons;
}

const NetworkEvidenceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<NetworkEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/network-evidence${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: NetworkEvidenceResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load network evidence');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const summary = data?.network_summary;
  const connections = useMemo(() => data?.connections ?? [], [data]);
  const activeConnections = useMemo(() => connections.filter((connection) => connection.duration === 'ongoing').length, [connections]);
  const riskyConnections = useMemo(() => connections.filter((connection) => connection.risk === 'high' || connection.risk === 'critical').length, [connections]);

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

  if (!data || !summary) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load network evidence</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <NetworkIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Network Evidence
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real network evidence for {data.pod_name} in {data.cluster_name || 'cluster'}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Connections', value: String(summary.total_connections ?? 0), color: colors.info },
          { label: 'Suspicious Connections', value: String(summary.suspicious ?? 0), color: (summary.suspicious ?? 0) > 0 ? colors.danger : colors.success },
          { label: 'Active Connections', value: String(activeConnections), color: activeConnections > 0 ? colors.warning : colors.success },
          { label: 'High Risk Connections', value: String(riskyConnections), color: riskyConnections > 0 ? colors.danger : colors.success },
          { label: 'Host Network', value: summary.host_network ? 'true' : 'false', color: summary.host_network ? colors.danger : colors.success },
        ].map((item) => (
          <Grid item xs={12} sm={6} md key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h5" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {connections.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Why this network evidence matters
          </Typography>
          <Stack spacing={1.5}>
            {connections.map((connection, index) => (
              <Box key={`${connection.timestamp}-${connection.source}-${index}`} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary, fontFamily: 'monospace' }}>
                      {connection.source} → {connection.destination}
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                      {connection.protocol} · {formatTimestamp(connection.timestamp)}
                    </Typography>
                  </Box>
                  <Chip label={connection.risk.toUpperCase()} size="small" sx={{ bgcolor: colors.border, color: riskColor(connection.risk), fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(connection, data.pod_name, data.namespace, summary.host_network).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 2.5, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 2 }}>
          Network Connections
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Timestamp', 'Protocol', 'Source', 'Destination', 'Bytes Sent', 'Bytes Received', 'Duration', 'Risk', 'Reason'].map((header) => (
                <TableCell key={header} sx={{ color: colors.textSecondary, fontWeight: 700, bgcolor: colors.surfaceAlt, borderColor: colors.border, fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {connections.map((connection, index) => (
              <TableRow key={`${connection.timestamp}-${connection.source}-${index}`} hover sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 145 }}>{formatTimestamp(connection.timestamp)}</TableCell>
                <TableCell sx={{ borderColor: colors.border }}><Chip label={connection.protocol} size="small" sx={{ bgcolor: colors.border, color: colors.info, fontWeight: 'bold', fontSize: 10 }} /></TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12, minWidth: 180 }}>{connection.source}</TableCell>
                <TableCell sx={{ color: colors.danger, borderColor: colors.border, fontFamily: 'monospace', fontSize: 12, minWidth: 180, fontWeight: 700 }}>{connection.destination}</TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontSize: 12 }}>{((connection.bytes_sent ?? 0) / 1024).toFixed(1)} KB</TableCell>
                <TableCell sx={{ color: colors.textPrimary, borderColor: colors.border, fontSize: 12 }}>{((connection.bytes_received ?? 0) / 1024).toFixed(1)} KB</TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12 }}>{connection.duration}</TableCell>
                <TableCell sx={{ borderColor: colors.border }}><Chip label={connection.risk} size="small" sx={{ bgcolor: colors.border, color: riskColor(connection.risk), fontWeight: 'bold', fontSize: 10 }} /></TableCell>
                <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontSize: 12, minWidth: 260 }}>{connection.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

const NetworkEvidence: React.FC = () => (
  <ClusterGuard>
    <NetworkEvidenceInner />
  </ClusterGuard>
);

export default NetworkEvidence;
