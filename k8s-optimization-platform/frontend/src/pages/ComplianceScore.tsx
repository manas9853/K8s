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

interface FrameworkScore {
  framework: string;
  score: number;
  grade: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  compliance_rate: number;
  last_assessment: string;
}

interface ComplianceScoreData {
  overall_score: number;
  overall_grade: string;
  framework_scores: FrameworkScore[];
  trend: string;
  last_scan: string;
}

const gradeColor = (score: number) =>
  score >= 90 ? '#2e7d32' : score >= 80 ? '#1565c0' : score >= 70 ? '#e65100' : '#c62828';

const gradeChipColor = (grade: string): 'success' | 'primary' | 'warning' | 'error' =>
  grade === 'A' ? 'success' : grade === 'B' ? 'primary' : grade === 'C' ? 'warning' : 'error';

const ComplianceScoreInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ComplianceScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/score${clusterParam}`);
      if (!r.ok) throw new Error('Failed to fetch data');
      setData(await r.json()); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); }
    finally { setLoading(false); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3}><Alert severity="info">No data available</Alert></Box>;

  const frameworks = data.framework_scores ?? [];

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>Compliance Score</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Detailed compliance scoring by framework</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Overall Score', value: `${data.overall_score}%` },
          { label: 'Overall Grade', value: data.overall_grade },
          { label: 'Trend', value: data.trend },
          { label: 'Frameworks', value: frameworks.length },
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

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>Framework Breakdown</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Framework</TableCell>
                  <TableCell>Score</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Progress</TableCell>
                  <TableCell>Grade</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Passed</TableCell>
                  <TableCell align="right">Failed</TableCell>
                  <TableCell>Last Assessment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {frameworks.map((fw) => (
                  <TableRow key={fw.framework} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{fw.framework}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700} color={gradeColor(fw.score)}>
                        {fw.score}%
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <LinearProgress variant="determinate" value={fw.score}
                        sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: gradeColor(fw.score) } }} />
                    </TableCell>
                    <TableCell><Chip label={fw.grade} size="small" color={gradeChipColor(fw.grade)} /></TableCell>
                    <TableCell align="right">{fw.total_controls}</TableCell>
                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{fw.passed_controls}</TableCell>
                    <TableCell align="right" sx={{ color: fw.failed_controls > 0 ? '#c62828' : 'inherit', fontWeight: 600 }}>{fw.failed_controls}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(fw.last_assessment).toLocaleDateString()}</TableCell>
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

const ComplianceScore: React.FC = () => (
  <ClusterGuard><ComplianceScoreInner /></ClusterGuard>
);

export default ComplianceScore;
