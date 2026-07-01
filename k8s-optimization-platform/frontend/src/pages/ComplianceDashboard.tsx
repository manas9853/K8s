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

interface Issue {
  id: string;
  severity: string;
  framework: string;
  control: string;
  description: string;
  detected_at: string;
  status: string;
}

interface ComplianceDashboardData {
  overall_score: number;
  grade: string;
  frameworks: Record<string, number>;
  categories: Record<string, number>;
  total_issues: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  low_issues: number;
  recent_issues: Issue[];
  resources_scanned: number;
  last_scan: string;
}

const gradeColor = (score: number) =>
  score >= 90 ? '#2e7d32' : score >= 80 ? '#1565c0' : score >= 70 ? '#e65100' : '#c62828';

const sevColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

const statusColor: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning', in_progress: 'info', resolved: 'success',
};

const ComplianceDashboardInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ComplianceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/dashboard${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>Compliance Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Overall compliance status across all frameworks</Typography>

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%` },
          { label: 'Grade', value: data.grade },
          { label: 'Total Issues', value: data.total_issues },
          { label: 'Critical Issues', value: data.critical_issues },
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

      {/* Issue severity summary */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
          <Grid item xs={6} sm={3} key={s}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" textTransform="capitalize">{s}</Typography>
                  <Chip label={(data as any)[`${s}_issues`] ?? 0} size="small" color={sevColor[s]} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Framework scores */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Framework Scores</Typography>
          <Grid container spacing={2}>
            {Object.entries(data.frameworks || {}).map(([fw, score]) => (
              <Grid item xs={12} sm={6} key={fw}>
                <Box mb={1}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">{fw}</Typography>
                    <Typography variant="body2" fontWeight={700} color={gradeColor(score)}>{score}%</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={score}
                    sx={{ height: 8, borderRadius: 4,
                      '& .MuiLinearProgress-bar': { bgcolor: gradeColor(score) }
                    }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Category scores */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Category Scores</Typography>
          <Grid container spacing={2}>
            {Object.entries(data.categories || {}).map(([cat, score]) => (
              <Grid item xs={12} sm={6} key={cat}>
                <Box mb={1}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">{cat}</Typography>
                    <Typography variant="body2" fontWeight={700} color={gradeColor(score)}>{score}%</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={score}
                    sx={{ height: 8, borderRadius: 4,
                      '& .MuiLinearProgress-bar': { bgcolor: gradeColor(score) }
                    }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Recent issues table */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Issues</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Severity</TableCell>
                  <TableCell>Framework</TableCell>
                  <TableCell>Control</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Detected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.recent_issues || []).map((issue) => (
                  <TableRow key={issue.id} hover>
                    <TableCell><Chip label={issue.severity} size="small" color={sevColor[issue.severity] ?? 'default'} /></TableCell>
                    <TableCell>{issue.framework}</TableCell>
                    <TableCell>{issue.control}</TableCell>
                    <TableCell>{issue.description}</TableCell>
                    <TableCell><Chip label={issue.status.replace('_', ' ')} size="small" color={statusColor[issue.status] ?? 'default'} /></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(issue.detected_at).toLocaleString()}</TableCell>
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

const ComplianceDashboard: React.FC = () => (
  <ClusterGuard><ComplianceDashboardInner /></ClusterGuard>
);

export default ComplianceDashboard;
