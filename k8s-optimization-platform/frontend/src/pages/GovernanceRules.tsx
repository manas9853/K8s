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

interface Rule {
  id: string;
  name: string;
  category: string;
  severity: string;
  enabled: boolean;
  violations: number;
  auto_remediate: boolean;
  last_triggered: string;
}

interface GovernanceRulesData {
  total_rules: number;
  enabled_rules: number;
  disabled_rules: number;
  total_violations: number;
  rules: Rule[];
  last_scan: string;
}

const sevColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

const GovernanceRulesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<GovernanceRulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [clusterParam]);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/compliance/governance-rules${clusterParam}`);
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
      <Typography variant="h4" gutterBottom>Governance Rules</Typography>
      <Typography variant="body2" color="text.secondary" paragraph>Governance rules and enforcement</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Rules', value: data.total_rules },
          { label: 'Enabled Rules', value: data.enabled_rules },
          { label: 'Total Violations', value: data.total_violations },
          { label: 'Disabled Rules', value: data.disabled_rules },
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
          <Typography variant="h6" gutterBottom>Rules ({data.total_rules})</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Auto-Remediate</TableCell>
                  <TableCell align="right">Violations</TableCell>
                  <TableCell>Last Triggered</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.rules || []).map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell><Chip label={r.severity} size="small" color={sevColor[r.severity] ?? 'default'} /></TableCell>
                    <TableCell><Chip label={r.enabled ? 'Enabled' : 'Disabled'} size="small" color={r.enabled ? 'success' : 'default'} /></TableCell>
                    <TableCell><Chip label={r.auto_remediate ? 'Yes' : 'No'} size="small" color={r.auto_remediate ? 'primary' : 'default'} /></TableCell>
                    <TableCell align="right" sx={{ color: r.violations > 0 ? '#c62828' : 'inherit', fontWeight: r.violations > 0 ? 700 : 400 }}>
                      {r.violations}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(r.last_triggered).toLocaleString()}</TableCell>
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

const GovernanceRules: React.FC = () => (
  <ClusterGuard><GovernanceRulesInner /></ClusterGuard>
);

export default GovernanceRules;
