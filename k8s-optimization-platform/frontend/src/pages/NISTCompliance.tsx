import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface NISTFunction {
  function: string;
  categories: number;
  controls: number;
  passed: number;
  failed: number;
  score: number;
}

interface NISTData {
  overall_score: number;
  maturity_level: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  functions: NISTFunction[];
  framework_version: string;
  last_assessment: string;
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? '#2e7d32' : s >= 80 ? '#1565c0' : s >= 70 ? '#e65100' : '#c62828';

const funcColor: Record<string, string> = {
  Identify: '#1565c0',
  Protect: '#2e7d32',
  Detect: '#e65100',
  Respond: '#6a1b9a',
  Recover: '#00838f',
};

const NISTComplianceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<NISTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/nist${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>NIST Cybersecurity Framework</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>NIST Cybersecurity Framework v{data.framework_version} compliance</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%` },
          { label: 'Maturity Level', value: data.maturity_level },
          { label: 'Total Controls', value: data.total_controls },
          { label: 'Passed Controls', value: data.passed_controls },
        ].map((k) => (
          <Grid item xs={6} sm={3} key={k.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary" variant="caption">{k.label}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontSize: k.label === 'Maturity Level' ? '0.95rem' : undefined }}>{k.value ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Function scorecard */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(data.functions || []).map((fn) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={fn.function}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: funcColor[fn.function] ?? '#333', mb: 1 }}>
                  {fn.function}
                </Typography>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="caption" color="text.secondary">{fn.passed}/{fn.controls} controls</Typography>
                  <Typography variant="caption" fontWeight={700} color={scoreColor(fn.score)}>{fn.score}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={fn.score}
                  sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: funcColor[fn.function] ?? scoreColor(fn.score) } }} />
                <Typography variant="caption" color="text.secondary">{fn.categories} categories</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Function Details</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Function</TableCell>
                  <TableCell align="right">Categories</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.functions || []).map((fn) => (
                  <TableRow key={fn.function} hover>
                    <TableCell sx={{ fontWeight: 700, color: funcColor[fn.function] }}>{fn.function}</TableCell>
                    <TableCell align="right">{fn.categories}</TableCell>
                    <TableCell align="right">{fn.controls}</TableCell>
                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{fn.passed}</TableCell>
                    <TableCell align="right" sx={{ color: fn.failed > 0 ? '#c62828' : 'inherit', fontWeight: 600 }}>{fn.failed}</TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress variant="determinate" value={fn.score}
                          sx={{ flex: 1, height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: scoreColor(fn.score) } }} />
                        <Typography variant="caption" fontWeight={700} color={scoreColor(fn.score)}>{fn.score}%</Typography>
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

const NISTCompliance: React.FC = () => (
  <ClusterGuard><NISTComplianceInner /></ClusterGuard>
);

export default NISTCompliance;
