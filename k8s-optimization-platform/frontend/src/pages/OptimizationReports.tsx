/**
 * Optimization Reports
 * Pulls real data from /api/v1/recommendations and /api/v1/cost-savings/overview.
 * Groups recommendations by namespace and shows cluster-level savings.
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

interface NamespaceRow {
  namespace: string;
  cluster: string;
  podCount: number;
  recommendations: number;
  potentialSavings: number;
  highPriority: number;
}

const OptimizationReports: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [rows, setRows] = useState<NamespaceRow[]>([]);
  const [totalRecs, setTotalRecs] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [totalApplied, setTotalApplied] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchData();
  }, [clusterParam, clustersLoading, clusters.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recRes, savingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/recommendations${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`),
      ]);

      let recs: any[] = [];
      let savingsData: any = {};

      if (recRes.ok) {
        const raw = await recRes.json();
        recs = Array.isArray(raw) ? raw : raw.recommendations ?? [];
      }
      if (savingsRes.ok) savingsData = await savingsRes.json();

      // Group recommendations by namespace
      const nsMap: Record<string, NamespaceRow> = {};
      for (const rec of recs) {
        const ns = rec.namespace ?? 'default';
        const cluster = rec.cluster_id ?? rec.cluster ?? clusters[0]?.name ?? '—';
        if (!nsMap[ns]) {
          nsMap[ns] = { namespace: ns, cluster, podCount: 0, recommendations: 0, potentialSavings: 0, highPriority: 0 };
        }
        nsMap[ns].recommendations += 1;
        nsMap[ns].podCount += 1;
        const savings = rec.estimated_savings?.cost_saved ?? rec.monthly_savings ?? 0;
        nsMap[ns].potentialSavings += savings;
        if (rec.priority === 'high' || rec.recommendation_confidence >= 0.8) {
          nsMap[ns].highPriority += 1;
        }
      }

      const rowList = Object.values(nsMap).sort((a, b) => b.potentialSavings - a.potentialSavings);
      setRows(rowList);
      setTotalRecs(recs.length);
      setTotalSavings(
        rowList.reduce((s, r) => s + r.potentialSavings, 0) ||
        (savingsData.monthly_savings ?? savingsData.total_potential_savings ?? 0)
      );
      setTotalApplied(
        recs.filter((r: any) => r.recommendation_status === 'applied' || r.status === 'applied').length
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const header = ['Namespace', 'Cluster', 'Pods Analysed', 'Recommendations', 'Potential Savings ($)', 'High Priority'];
    const csv = [header, ...rows.map(r => [r.namespace, r.cluster, r.podCount, r.recommendations, r.potentialSavings.toFixed(2), r.highPriority])].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimization-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (clustersLoading) return <LinearProgress />;
  if (clusters.length === 0) return <NoClusterBanner dataDescription="optimization recommendation data" />;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Optimization Reports</Typography>
          <Typography variant="body2" color="text.secondary">Live rightsizing recommendations from cluster analysis</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>Export CSV</Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Namespaces Analysed', value: rows.length },
          { label: 'Total Recommendations', value: totalRecs },
          { label: 'Potential Monthly Savings', value: `$${Math.round(totalSavings).toLocaleString()}` },
          { label: 'Applied Fixes', value: totalApplied },
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

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Namespace', 'Cluster', 'Pods Analysed', 'Recommendations', 'Potential Savings', 'High Priority'].map((h) => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>No recommendations found yet</Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell><strong>{row.namespace}</strong></TableCell>
                  <TableCell>
                    <Chip label={row.cluster} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{row.podCount}</TableCell>
                  <TableCell>
                    <Chip label={row.recommendations} size="small" color="primary" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.potentialSavings > 0 ? `$${Math.round(row.potentialSavings).toLocaleString()}` : '—'}
                      size="small"
                      color="success"
                    />
                  </TableCell>
                  <TableCell>
                    {row.highPriority > 0
                      ? <Chip label={row.highPriority} size="small" color="warning" />
                      : <Chip label="0" size="small" color="default" />}
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

export default OptimizationReports;

// Made with Bob
