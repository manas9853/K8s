/**
 * Security Reports
 * Pulls real data from /api/v1/security/score and /api/v1/security/alerts.
 * Shows NoClusterBanner when no cluster is attached.
 */
import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterBanner from '../components/NoClusterBanner';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, IconButton, LinearProgress,
} from '@mui/material';
import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SecurityScoreData {
  overall_score: number;
  grade: string;
  vulnerability_score: number;
  compliance_score: number;
  configuration_score: number;
  network_security_score: number;
  rbac_score: number;
  total_vulnerabilities: number;
  critical_vulnerabilities: number;
  high_vulnerabilities: number;
  medium_vulnerabilities: number;
}

interface SecurityAlert {
  id: string;
  severity: string;
  title: string;
  description: string;
  affected_resource: string;
  namespace: string;
  cluster: string;
  detected_at: string;
  status: string;
  remediation?: string;
}

const SecurityReports: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [score, setScore] = useState<SecurityScoreData | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchData();
  }, [clusterParam, clustersLoading, clusters.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [scoreRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/security/score${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/security/alerts${clusterParam}`),
      ]);

      if (scoreRes.ok) setScore(await scoreRes.json());
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(Array.isArray(data) ? data : data.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const header = ['ID', 'Severity', 'Title', 'Affected Resource', 'Namespace', 'Cluster', 'Detected At', 'Status'];
    const csv = [header, ...alerts.map(a => [a.id, a.severity, a.title, a.affected_resource, a.namespace, a.cluster, a.detected_at, a.status])].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (clustersLoading) return <LinearProgress />;
  if (clusters.length === 0) return <NoClusterBanner dataDescription="security scan and vulnerability data" />;

  const sevColor = (s: string): 'error' | 'warning' | 'info' | 'default' =>
    s === 'critical' ? 'error' : s === 'high' ? 'warning' : s === 'medium' ? 'info' : 'default';
  const statusColor = (s: string) => s === 'resolved' ? 'success' : s === 'open' ? 'error' : 'warning';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Security Reports</Typography>
          <Typography variant="body2" color="text.secondary">Live security posture from connected clusters</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>Export CSV</Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Security Score KPIs */}
      {score && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[
            { label: 'Overall Security Score', value: `${score.overall_score}/100 (${score.grade})` },
            { label: 'Total Vulnerabilities', value: score.total_vulnerabilities },
            { label: 'Critical Issues', value: score.critical_vulnerabilities },
            { label: 'High Issues', value: score.high_vulnerabilities },
          ].map((kpi) => (
            <Grid item xs={12} sm={6} md={3} key={kpi.label}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>{kpi.label}</Typography>
                  <Typography variant="h5">{kpi.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Component scores */}
      {score && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Vulnerability Score', value: score.vulnerability_score },
            { label: 'Compliance Score', value: score.compliance_score },
            { label: 'Configuration Score', value: score.configuration_score },
            { label: 'Network Security', value: score.network_security_score },
            { label: 'RBAC Score', value: score.rbac_score },
          ].map((s) => (
            <Grid item xs={6} sm={4} md={2} key={s.label}>
              <Card variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
                  <Chip
                    label={`${s.value}/100`}
                    size="small"
                    color={s.value >= 80 ? 'success' : s.value >= 60 ? 'warning' : 'error'}
                    sx={{ mt: 0.5 }}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Alert table */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">Security Alerts ({alerts.length})</Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Severity', 'Title', 'Affected Resource', 'Namespace', 'Cluster', 'Detected At', 'Status'].map((h) => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>No security alerts found</Typography>
                  </TableCell>
                </TableRow>
              )}
              {alerts.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>
                    <Chip label={a.severity} size="small" color={sevColor(a.severity)} />
                  </TableCell>
                  <TableCell>{a.title}</TableCell>
                  <TableCell>{a.affected_resource}</TableCell>
                  <TableCell>{a.namespace}</TableCell>
                  <TableCell>{a.cluster}</TableCell>
                  <TableCell>{new Date(a.detected_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip label={a.status} size="small" color={statusColor(a.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default SecurityReports;

// Made with Bob
