import React, { useState, useEffect, useMemo } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, MenuItem, Select,
  FormControl, InputLabel, SelectChangeEvent
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Anomaly {
  id: string;
  type: string;
  severity: string;
  resource: string;
  namespace: string;
  detected_at: string;
  deviation_percent: number;
  baseline_value: number;
  current_value: number;
  confidence: number;
  status: string;
  description: string;
}

interface AnomalyDetectionData {
  total_anomalies: number;
  critical_anomalies: number;
  high_anomalies: number;
  medium_anomalies: number;
  low_anomalies: number;
  anomalies: Anomaly[];
  detection_accuracy: number;
  false_positive_rate: number;
  last_scan: string;
}

const sevColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};
const statusColor: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  investigating: 'warning', resolved: 'success', open: 'error',
};

const AnomalyDetectionInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AnomalyDetectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/intelligence/anomaly-detection${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!data?.anomalies) return [];
    return data.anomalies.filter((a) =>
      (severityFilter === 'all' || a.severity === severityFilter) &&
      (statusFilter === 'all' || a.status === statusFilter)
    );
  }, [data, severityFilter, statusFilter]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Anomaly Detection</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Detect anomalies in cluster behavior and resource usage</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Anomalies', value: data.total_anomalies },
          { label: 'Critical', value: data.critical_anomalies },
          { label: 'High Priority', value: data.high_anomalies },
          { label: 'Detection Accuracy', value: `${data.detection_accuracy}%` },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" variant="caption">{k.label}</Typography>
                <Typography variant="h5" fontWeight={700}>{k.value ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Severity breakdown */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
          <Grid item xs={6} sm={3} key={s}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" textTransform="capitalize">{s}</Typography>
                  <Chip label={(data as any)[`${s}_anomalies`] ?? 0} size="small" color={sevColor[s]} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Model stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">False Positive Rate</Typography>
              <Typography variant="h6" fontWeight={700}>{data.false_positive_rate}%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Severity</InputLabel>
                <Select value={severityFilter} label="Severity" onChange={(e: SelectChangeEvent) => setSeverityFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="investigating">Investigating</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Anomalies ({filtered.length} of {data.total_anomalies})</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell align="right">Deviation</TableCell>
                  <TableCell align="right">Baseline</TableCell>
                  <TableCell align="right">Current</TableCell>
                  <TableCell align="right">Confidence</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Detected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{a.type}</TableCell>
                    <TableCell><Chip label={a.severity} size="small" color={sevColor[a.severity] ?? 'default'} /></TableCell>
                    <TableCell>{a.resource}</TableCell>
                    <TableCell>{a.namespace}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#c62828' }}>+{a.deviation_percent}%</TableCell>
                    <TableCell align="right">{a.baseline_value}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{a.current_value}</TableCell>
                    <TableCell align="right">{a.confidence}%</TableCell>
                    <TableCell><Chip label={a.status} size="small" color={statusColor[a.status] ?? 'default'} /></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{new Date(a.detected_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const AnomalyDetection: React.FC = () => (
  <ClusterGuard><AnomalyDetectionInner /></ClusterGuard>
);

export default AnomalyDetection;
