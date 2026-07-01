import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface Requirement {
  req: string;
  controls: number;
  passed: number;
  failed: number;
  score: number;
}

interface PCIDSSData {
  overall_score: number;
  compliance_status: string;
  total_requirements: number;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  requirements: Requirement[];
  last_assessment: string;
  next_assessment: string;
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? '#2e7d32' : s >= 80 ? '#1565c0' : s >= 70 ? '#e65100' : '#c62828';

const PCIDSSComplianceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PCIDSSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/pci-dss${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  const statusOk = data.compliance_status === 'Compliant';

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>PCI DSS Compliance</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Payment Card Industry Data Security Standard compliance</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%` },
          { label: 'Status', value: <Chip label={data.compliance_status} size="small" color={statusOk ? 'success' : 'error'} /> },
          { label: 'Total Controls', value: data.total_controls },
          { label: 'Passed Controls', value: data.passed_controls },
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

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Last Assessment</Typography>
              <Typography variant="h6">{new Date(data.last_assessment).toLocaleDateString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">Next Assessment</Typography>
              <Typography variant="h6">{new Date(data.next_assessment).toLocaleDateString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Requirements ({data.total_requirements} total)</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Requirement</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.requirements || []).map((r) => (
                  <TableRow key={r.req} hover>
                    <TableCell>{r.req}</TableCell>
                    <TableCell align="right">{r.controls}</TableCell>
                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{r.passed}</TableCell>
                    <TableCell align="right" sx={{ color: r.failed > 0 ? '#c62828' : 'inherit', fontWeight: 600 }}>{r.failed}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress variant="determinate" value={r.score}
                          sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: scoreColor(r.score) } }} />
                        <Typography variant="caption" fontWeight={700} color={scoreColor(r.score)}>{r.score}%</Typography>
                      </Box>
                    </TableCell>
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

const PCIDSSCompliance: React.FC = () => (
  <ClusterGuard><PCIDSSComplianceInner /></ClusterGuard>
);

export default PCIDSSCompliance;
