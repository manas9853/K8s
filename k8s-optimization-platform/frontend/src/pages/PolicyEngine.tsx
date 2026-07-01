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

interface Policy {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  enforcement: string;
  violations: number;
  last_evaluated: string;
  created_at: string;
}

interface PolicyEngineData {
  total_policies: number;
  enabled_policies: number;
  disabled_policies: number;
  total_violations: number;
  policies: Policy[];
  policy_engine_version: string;
  last_sync: string;
}

const enforcementColor: Record<string, 'error' | 'warning' | 'info'> = {
  enforce: 'error', warn: 'warning', audit: 'info',
};

const PolicyEngineInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PolicyEngineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/policy-engine${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>Policy Engine</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Active policies and enforcement status</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Policies', value: data.total_policies },
          { label: 'Enabled Policies', value: data.enabled_policies },
          { label: 'Total Violations', value: data.total_violations },
          { label: 'Engine Version', value: `v${data.policy_engine_version}` },
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
          <Typography variant="h6" gutterBottom>Policies ({data.total_policies})</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Enforcement</TableCell>
                  <TableCell align="right">Violations</TableCell>
                  <TableCell>Last Evaluated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.policies || []).map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                    <TableCell>{p.type}</TableCell>
                    <TableCell>
                      <Chip label={p.enabled ? 'Enabled' : 'Disabled'} size="small" color={p.enabled ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={p.enforcement} size="small" color={enforcementColor[p.enforcement] ?? 'default'} />
                    </TableCell>
                    <TableCell align="right" sx={{ color: p.violations > 0 ? '#c62828' : 'inherit', fontWeight: p.violations > 0 ? 700 : 400 }}>
                      {p.violations}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(p.last_evaluated).toLocaleString()}</TableCell>
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

const PolicyEngine: React.FC = () => (
  <ClusterGuard><PolicyEngineInner /></ClusterGuard>
);

export default PolicyEngine;
