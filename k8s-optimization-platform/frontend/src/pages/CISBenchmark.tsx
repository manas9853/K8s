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

interface Section {
  section: string;
  controls: number;
  passed: number;
  failed: number;
  score: number;
}

interface FailedControl {
  control_id: string;
  title: string;
  severity: string;
  description: string;
  remediation: string;
  affected_resources: number;
}

interface CISBenchmarkData {
  overall_score: number;
  grade: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  sections: Section[];
  failed_controls_detail: FailedControl[];
  last_scan: string;
}

const scoreColor = (s: number) => s >= 90 ? '#2e7d32' : s >= 80 ? '#1565c0' : s >= 70 ? '#e65100' : '#c62828';
const sevColor: Record<string, 'error' | 'warning' | 'info'> = { high: 'error', medium: 'warning', low: 'info' };

const CISBenchmarkInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CISBenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/cis-benchmark${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>CIS Kubernetes Benchmark</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>CIS Kubernetes Benchmark compliance status</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%` },
          { label: 'Grade', value: data.grade },
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

      {/* Sections */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Sections</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Section</TableCell>
                  <TableCell align="right">Controls</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.sections || []).map((s) => (
                  <TableRow key={s.section} hover>
                    <TableCell>{s.section}</TableCell>
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

      {/* Failed controls detail */}
      {(data.failed_controls_detail ?? []).length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>Failed Controls</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Control ID</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Remediation</TableCell>
                    <TableCell align="right">Affected Resources</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.failed_controls_detail || []).map((c) => (
                    <TableRow key={c.control_id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.control_id}</TableCell>
                      <TableCell>{c.title}</TableCell>
                      <TableCell><Chip label={c.severity} size="small" color={sevColor[c.severity] ?? 'default'} /></TableCell>
                      <TableCell>{c.description}</TableCell>
                      <TableCell>{c.remediation}</TableCell>
                      <TableCell align="right">{c.affected_resources}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

const CISBenchmark: React.FC = () => (
  <ClusterGuard><CISBenchmarkInner /></ClusterGuard>
);

export default CISBenchmark;
