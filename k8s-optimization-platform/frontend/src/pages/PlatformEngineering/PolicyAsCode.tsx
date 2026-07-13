import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PolicyViolation {
  policy: string;
  kind: string;
  resource: string;
  namespace: string;
  severity: string;
  message: string;
  detectedAt: string;
}

const PolicyAsCode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PolicyViolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/policy/code`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const criticalCount = data.filter((r) => r.severity === 'Critical').length;
  const highCount = data.filter((r) => r.severity === 'High').length;
  const policyCount = new Set(data.map((r) => r.policy)).size;

  const severityColor = (s: string): 'error' | 'warning' | 'info' | 'default' => {
    if (s === 'Critical') return 'error';
    if (s === 'High') return 'warning';
    if (s === 'Medium') return 'info';
    return 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Policy as Code (OPA / Kyverno)</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Violations</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Critical / High</Typography><Typography variant="h5">{criticalCount} / {highCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Policies Violated</Typography><Typography variant="h5">{policyCount}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No policy violations found — cluster is fully compliant, or policy engine is not yet configured.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Policy</TableCell>
                  <TableCell>Kind</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Detected At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.policy}</TableCell>
                    <TableCell>{row.kind}</TableCell>
                    <TableCell>{row.resource}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell><Chip label={row.severity} color={severityColor(row.severity)} size="small" /></TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{row.message}</TableCell>
                    <TableCell>{row.detectedAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default PolicyAsCode;

// Made with Bob
