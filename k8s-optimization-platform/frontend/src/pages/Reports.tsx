/**
 * Reports — Executive Reports hub
 * Pulls real data from /api/v1/reports/* and cluster/cost APIs.
 * Shows NoClusterBanner when no cluster is attached.
 */
import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import { useCluster } from '../contexts/ClusterContext';
import NoClusterBanner from '../components/NoClusterBanner';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Button, IconButton, LinearProgress, List, ListItem,
  ListItemText, Chip, Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ReportMeta {
  report_id: string;
  title: string;
  type: string;
  format: string;
  generated_at: string;
  size_mb: number;
  download_url: string;
  status: string;
}

interface ReportSummary {
  total_reports: number;
  reports_this_week: number;
  reports_this_month: number;
  total_savings_tracked: number;
  last_generated: string;
}

const Reports: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchData();
  }, [clusterParam, clustersLoading, clusters.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/reports/list${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/reports/summary${clusterParam}`),
      ]);

      if (listRes.ok) setReports(await listRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch (err) {
      console.error('Reports fetch failed:', err);
      // BUG-F09: network errors are now logged; no error state here because Reports shows empty-state gracefully
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      await fetch(`${API_BASE_URL}/v1/reports/generate/${type}${clusterParam ? clusterParam + '&format=json' : '?format=json'}`, {
        method: 'POST',
      });
      await fetchData();
    } finally {
      setGenerating(null);
    }
  };

  const handleDownload = (report: ReportMeta) => {
    window.open(report.download_url, '_blank');
  };

  if (clustersLoading) return <LinearProgress />;
  if (clusters.length === 0) return <NoClusterBanner dataDescription="executive report data" />;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Executive Reports</Typography>
          <Typography variant="body2" color="text.secondary">
            AI-generated reports from live cluster data
          </Typography>
        </Box>
        <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* KPI summary cards */}
      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[
            { label: 'Total Reports', value: summary.total_reports },
            { label: 'This Week', value: summary.reports_this_week },
            { label: 'This Month', value: summary.reports_this_month },
            { label: 'Savings Tracked', value: `$${Number(summary.total_savings_tracked).toLocaleString()}` },
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

      {/* Generate buttons */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { type: 'weekly', label: 'Weekly Report', desc: 'Comprehensive weekly optimization summary' },
          { type: 'monthly', label: 'Monthly Report', desc: 'Detailed monthly performance analysis' },
          { type: 'executive', label: 'Executive Summary', desc: 'High-level insights for leadership' },
        ].map(({ type, label, desc }) => (
          <Grid item xs={12} md={4} key={type}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>{label}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{desc}</Typography>
                <Button
                  variant="contained"
                  startIcon={<DescriptionIcon />}
                  onClick={() => handleGenerate(type)}
                  disabled={generating === type}
                  fullWidth
                >
                  {generating === type ? 'Generating…' : `Generate ${label.split(' ')[0]}`}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Generated reports list */}
      {reports.length > 0 && (
        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Generated Reports</Typography>
            <Divider sx={{ mb: 1 }} />
            <List disablePadding>
              {reports.map((report) => (
                <ListItem
                  key={report.report_id}
                  divider
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={report.type.toUpperCase()} size="small" color="primary" variant="outlined" />
                      <Button
                        startIcon={<DownloadIcon />}
                        size="small"
                        variant="outlined"
                        onClick={() => handleDownload(report)}
                      >
                        Download
                      </Button>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={report.title}
                    secondary={`Generated: ${new Date(report.generated_at).toLocaleString()} · ${report.format?.toUpperCase() ?? 'JSON'} · ${report.size_mb} MB`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </Paper>
      )}

      {reports.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No reports generated yet. Use the buttons above to generate your first report.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default Reports;

// Made with Bob
