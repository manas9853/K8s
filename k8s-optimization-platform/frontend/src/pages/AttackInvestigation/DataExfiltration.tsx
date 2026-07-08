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
import { CloudOff as ExfilIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface ExfilAlert {
  id: string;
  severity: string;
  pod: string;
  namespace: string;
  data_transferred: string;
  destination: string;
  protocol: string;
  detection_time: string;
  suspicious_indicators: string[];
  risk_score: number;
}

interface DataExfiltrationResponse {
  active_alerts: number;
  total_detected: number;
  alerts: ExfilAlert[];
  cluster_name?: string;
  last_updated?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function severityColor(severity?: string) {
  if (severity === 'critical') return '#ef5350';
  if (severity === 'high') return '#ffa726';
  if (severity === 'medium') return '#90caf9';
  return '#a5d6a7';
}

function riskColor(score: number) {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
}

function buildReason(alert: ExfilAlert): string[] {
  const reasons: string[] = [];

  reasons.push(`The backend flagged pod ${alert.pod} in namespace ${alert.namespace} as an exfiltration risk because it is operating with host-network level access.`);

  if (alert.destination === 'host-network (unrestricted)') {
    reasons.push('Traffic destination is reported as host-network (unrestricted), which means the pod can access node interfaces directly instead of staying confined to normal pod networking boundaries.');
  }

  if (alert.data_transferred === 'unknown') {
    reasons.push('The backend currently cannot measure exact bytes transferred for this path, so it reports data volume as unknown. The alert is being driven by exposure posture rather than measured transfer size.');
  }

  if (alert.suspicious_indicators.length > 0) {
    reasons.push(`The pod matched these backend indicators: ${alert.suspicious_indicators.join(' · ')}.`);
  }

  reasons.push(`Risk score is ${alert.risk_score} and severity is ${alert.severity}, so this should be treated as a high-priority containment candidate.`);
  return reasons;
}

const DataExfiltrationInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DataExfiltrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/data-exfiltration${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: DataExfiltrationResponse = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load data exfiltration alerts');
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

  const alerts = useMemo(() => data?.alerts ?? [], [data]);
  const highRiskAlerts = useMemo(() => alerts.filter((alert) => alert.risk_score >= 80).length, [alerts]);
  const uniqueNamespaces = useMemo(() => new Set(alerts.map((alert) => alert.namespace)).size, [alerts]);

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
        <Alert severity="error">Failed to load data exfiltration alerts</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <ExfilIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Data Exfiltration Detection
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real exfiltration-risk alerts for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Active Alerts', value: data.active_alerts, color: data.active_alerts > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Total Detected', value: data.total_detected, color: '#90caf9' },
          { label: 'High Risk Alerts', value: highRiskAlerts, color: highRiskAlerts > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Affected Namespaces', value: uniqueNamespaces, color: uniqueNamespaces > 0 ? '#ffa726' : '#a5d6a7' },
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

      {alerts.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these exfiltration alerts matter
          </Typography>
          <Stack spacing={1.5}>
            {alerts.map((alert) => (
              <Box key={alert.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {alert.pod}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {alert.namespace} · {formatTimestamp(alert.detection_time)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={alert.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                    <Chip label={alert.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: severityColor(alert.severity), fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={`Risk ${alert.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(alert.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(alert).map((reason) => (
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

      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Exfiltration Alerts
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['ID', 'Pod / Namespace', 'Data Transferred', 'Destination', 'Protocol', 'Risk Score', 'Severity', 'Detected', 'Indicators'].map((header) => (
                <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={alert.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245', minWidth: 180 }}>
                  <Typography variant="body2" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{alert.pod}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>{alert.namespace}</Typography>
                </TableCell>
                <TableCell sx={{ color: '#ffa726', borderColor: '#2a3245', fontWeight: 700 }}>{alert.data_transferred}</TableCell>
                <TableCell sx={{ color: '#ef5350', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12, minWidth: 180 }}>{alert.destination}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={alert.protocol} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={String(alert.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor(alert.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={alert.severity} size="small" sx={{ bgcolor: '#2a3245', color: severityColor(alert.severity), fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 150 }}>{formatTimestamp(alert.detection_time)}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245', minWidth: 240 }}>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {alert.suspicious_indicators.map((indicator) => (
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

const DataExfiltration: React.FC = () => (
  <ClusterGuard>
    <DataExfiltrationInner />
  </ClusterGuard>
);

export default DataExfiltration;
