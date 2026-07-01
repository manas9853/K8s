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

interface Safeguard {
  safeguard: string;
  controls: number;
  passed: number;
  failed: number;
  score: number;
}

interface HIPAAData {
  overall_score: number;
  compliance_status: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  safeguards: Safeguard[];
  phi_protected: boolean;
  encryption_enabled: boolean;
  audit_logging_enabled: boolean;
  last_risk_assessment: string;
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? '#2e7d32' : s >= 80 ? '#1565c0' : s >= 70 ? '#e65100' : '#c62828';

const HIPAAComplianceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<HIPAAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/hipaa${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>HIPAA Compliance</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Health Insurance Portability and Accountability Act compliance</Typography>

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

      {/* Status flags */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'PHI Protected', value: data.phi_protected },
          { label: 'Encryption Enabled', value: data.encryption_enabled },
          { label: 'Audit Logging', value: data.audit_logging_enabled },
          { label: 'Last Risk Assessment', value: null, date: data.last_risk_assessment },
        ].map((item) => (
          <Grid item xs={6} sm={3} key={item.label}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Box>
                  {item.date
                    ? <Typography variant="body2" fontWeight={600}>{new Date(item.date).toLocaleDateString()}</Typography>
                    : <Chip label={item.value ? 'Yes' : 'No'} size="small" color={item.value ? 'success' : 'error'} />
                  }
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Safeguards</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Safeguard</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.safeguards || []).map((s) => (
                  <TableRow key={s.safeguard} hover>
                    <TableCell>{s.safeguard}</TableCell>
                    <TableCell align="right">{s.controls}</TableCell>
                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{s.passed}</TableCell>
                    <TableCell align="right" sx={{ color: s.failed > 0 ? '#c62828' : 'inherit', fontWeight: 600 }}>{s.failed}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress variant="determinate" value={s.score}
                          sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: scoreColor(s.score) } }} />
                        <Typography variant="caption" fontWeight={700} color={scoreColor(s.score)}>{s.score}%</Typography>
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

const HIPAACompliance: React.FC = () => (
  <ClusterGuard><HIPAAComplianceInner /></ClusterGuard>
);

export default HIPAACompliance;
