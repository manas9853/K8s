import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from '@mui/material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface CICDGuardrail {
  name: string;
  enabled: boolean;
  threshold: string;
  violations: number;
  last_violation: string;
}

interface CICDGuardrailsData {
  total_guardrails: number;
  enabled_guardrails: number;
  total_violations: number;
  guardrails: CICDGuardrail[];
  pipelines_monitored: number;
  last_scan: string;
}

const CICDGuardrailsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CICDGuardrailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/cicd-guardrails${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>CI/CD Guardrails</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>CI/CD pipeline guardrails and gates</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Guardrails', value: data.total_guardrails },
          { label: 'Enabled', value: data.enabled_guardrails },
          { label: 'Total Violations', value: data.total_violations },
          { label: 'Pipelines Monitored', value: data.pipelines_monitored },
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
          <Typography variant="h6" gutterBottom>Pipeline Gates</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Gate</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Threshold</TableCell>
                  <TableCell align="right">Violations</TableCell>
                  <TableCell>Last Violation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.guardrails || []).map((g) => (
                  <TableRow key={g.name} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{g.name}</TableCell>
                    <TableCell>
                      <Chip label={g.enabled ? 'Active' : 'Disabled'} size="small" color={g.enabled ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{g.threshold}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: g.violations > 10 ? '#c62828' : g.violations > 0 ? '#e65100' : 'inherit' }}>
                      {g.violations}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(g.last_violation).toLocaleString()}</TableCell>
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

const CICDGuardrails: React.FC = () => (
  <ClusterGuard><CICDGuardrailsInner /></ClusterGuard>
);

export default CICDGuardrails;
