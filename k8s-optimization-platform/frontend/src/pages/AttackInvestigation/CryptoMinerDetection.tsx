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
import { Memory as MinerIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface MinerEntry {
  id: string;
  pod: string;
  namespace: string;
  node_ip: string;
  miner_type: string;
  cpu_usage: number | null;
  detection_time: string;
  suspicious_indicators: string[];
  risk_score: number;
}

interface CryptoMinerResponse {
  active_miners: number;
  total_detected: number;
  miners: MinerEntry[];
  note?: string;
  cluster_name?: string;
  last_updated?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function riskColor(score: number) {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
}

function buildReason(miner: MinerEntry): string[] {
  const reasons: string[] = [];

  reasons.push(
    `Pod ${miner.pod} in namespace ${miner.namespace} was identified as a potential crypto-mining risk. ` +
    `The backend classifies it based on container privilege signals, not measured mining activity.`
  );

  if (miner.suspicious_indicators.includes('Privileged container (full host access)')) {
    reasons.push(
      'The container runs in privileged mode, giving it full access to the host kernel. ' +
      'Crypto miners require full CPU access and often use privileged containers to bypass resource limits.'
    );
  }

  if (miner.suspicious_indicators.includes('Root execution enabled')) {
    reasons.push(
      'Processes inside this container execute as root. Combined with privileged mode, ' +
      'a bad actor can install and run mining binaries (xmrig, nbminer, etc.) without restriction.'
    );
  }

  if (miner.suspicious_indicators.includes('Can execute arbitrary processes on node')) {
    reasons.push(
      'This container can spawn arbitrary processes on the underlying node, making it possible ' +
      'to run a miner outside the container\'s own cgroup limits and escape resource quotas.'
    );
  }

  if (miner.node_ip && miner.node_ip !== 'unknown') {
    reasons.push(`The workload is running on node ${miner.node_ip}, which is the actual compute resource being at risk.`);
  }

  reasons.push(
    `Backend risk score is ${miner.risk_score}. Note: runtime CPU telemetry for this pod is not currently ` +
    `available from the cluster agent, so cpu_usage shows null.`
  );

  return reasons;
}

const CryptoMinerDetectionInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CryptoMinerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/crypto-miner-detection${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: CryptoMinerResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load crypto miner detections');
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

  const miners = useMemo(() => data?.miners ?? [], [data]);
  const uniqueNamespaces = useMemo(() => new Set(miners.map((m) => m.namespace)).size, [miners]);
  const uniqueNodes = useMemo(() => new Set(miners.map((m) => m.node_ip).filter(Boolean)).size, [miners]);

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
        <Alert severity="error">Failed to load crypto miner detections</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <MinerIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Crypto Miner Detection
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real miner-risk signals for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Active Miner Alerts', value: data.active_miners, color: data.active_miners > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Total High-Risk Pods', value: data.total_detected, color: '#90caf9' },
          { label: 'Affected Namespaces', value: uniqueNamespaces, color: uniqueNamespaces > 0 ? '#ffa726' : '#a5d6a7' },
          { label: 'Affected Nodes', value: uniqueNodes, color: uniqueNodes > 0 ? '#ffa726' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Backend note banner */}
      {data.note && (
        <Box sx={{ p: 2, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', borderRadius: 1, borderLeft: '4px solid #ffa726' }}>
          <Typography variant="body2" sx={{ color: '#c8d0dc' }}>
            ⚠ {data.note}
          </Typography>
        </Box>
      )}

      {/* Why these matter */}
      {miners.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these pods are miner-risk candidates
          </Typography>
          <Stack spacing={1.5}>
            {miners.map((miner) => (
              <Box key={miner.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {miner.pod}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {miner.namespace} · {miner.node_ip} · {formatTimestamp(miner.detection_time)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <Chip label={miner.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                    <Chip label={miner.miner_type} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10 }} />
                    <Chip label={`Risk ${miner.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(miner.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(miner).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Full table */}
      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Detected Miner Candidates
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['ID', 'Pod / Namespace', 'Node IP', 'Type', 'CPU Usage', 'Risk Score', 'Detected', 'Indicators'].map((header) => (
                <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {miners.map((miner) => (
              <TableRow key={miner.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={miner.id} size="small" sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245', minWidth: 180 }}>
                  <Typography variant="body2" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{miner.pod}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>{miner.namespace}</Typography>
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>{miner.node_ip}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={miner.miner_type} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip
                    label={miner.cpu_usage !== null ? `${miner.cpu_usage}%` : 'N/A'}
                    size="small"
                    sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }}
                  />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={String(miner.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(miner.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 150 }}>{formatTimestamp(miner.detection_time)}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245', minWidth: 260 }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {miner.suspicious_indicators.map((indicator) => (
                      <Chip key={indicator} label={indicator} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10, height: 20 }} />
                    ))}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

const CryptoMinerDetection: React.FC = () => (
  <ClusterGuard>
    <CryptoMinerDetectionInner />
  </ClusterGuard>
);

export default CryptoMinerDetection;
