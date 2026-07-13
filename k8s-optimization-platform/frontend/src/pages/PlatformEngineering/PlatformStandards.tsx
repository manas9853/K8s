import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress, Alert,
} from '@mui/material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Standard {
  name: string;
  category: string;
  compliance: number;
  status: string;
  violations: number;
  lastChecked: string;
}

const PlatformStandards: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/api/v1/platform/policy/standards`, { params: { cluster_id: clusterParam } })
      .then((r) => setData(r.data))
      .catch((e) => setError(axios.isAxiosError(e) ? e.response?.data?.detail ?? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [clusterParam]);

  const avgCompliance = data.length > 0 ? Math.round(data.reduce((s, r) => s + r.compliance, 0) / data.length) : 0;
  const passCount = data.filter((r) => r.status === 'Pass' || r.status === 'Compliant').length;
  const totalViolations = data.reduce((s, r) => s + r.violations, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Platform Standards</Typography>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Standards Checked</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Avg Compliance</Typography><Typography variant="h5">{avgCompliance}%</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Passing / Violations</Typography><Typography variant="h5">{passCount} / {totalViolations}</Typography></CardContent></Card></Grid>
      </Grid>
      {data.length === 0 && !loading && !error && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary" textAlign="center">No platform standards data yet. Configure OPA/Kyverno policy checks in the k8s-agent.</Typography></Paper>
      )}
      {data.length > 0 && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Standard Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Compliance (%)</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Violations</TableCell>
                  <TableCell>Last Checked</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>{row.compliance}%</TableCell>
                    <TableCell><Chip label={row.status} color={row.status === 'Pass' || row.status === 'Compliant' ? 'success' : 'error'} size="small" /></TableCell>
                    <TableCell>{row.violations}</TableCell>
                    <TableCell>{row.lastChecked}</TableCell>
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

export default PlatformStandards;

// Made with Bob
