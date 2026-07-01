/**
 * Scheduled Reports
 * Pulls real scheduled report configs from /api/v1/reports/list.
 * Shows schedule metadata derived from real report history.
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
import { Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ScheduledEntry {
  name: string;
  reportType: string;
  frequency: string;
  lastRun: string;
  nextRun: string;
  format: string;
  status: string;
}

/** Derive a frequency label from report type */
const inferFrequency = (type: string): string => {
  if (type === 'weekly') return 'Weekly';
  if (type === 'monthly') return 'Monthly';
  return 'On Demand';
};

/** Estimate next run based on frequency and last run */
const estimateNextRun = (frequency: string, lastIso: string): string => {
  try {
    const last = new Date(lastIso);
    if (frequency === 'Weekly') last.setDate(last.getDate() + 7);
    else if (frequency === 'Monthly') last.setMonth(last.getMonth() + 1);
    else return '—';
    return last.toLocaleString();
  } catch {
    return '—';
  }
};

const ScheduledReports: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();

  const [schedules, setSchedules] = useState<ScheduledEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clustersLoading) return;
    if (clusters.length === 0) return;
    fetchData();
  }, [clusterParam, clustersLoading, clusters.length]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/reports/list${clusterParam}`);
      if (res.ok) {
        const reports: any[] = await res.json();
        // Build schedule rows from real report history
        const entries: ScheduledEntry[] = reports.map((r) => {
          const freq = inferFrequency(r.type);
          return {
            name: r.title,
            reportType: r.type?.charAt(0).toUpperCase() + r.type?.slice(1) ?? r.type,
            frequency: freq,
            lastRun: r.generated_at ? new Date(r.generated_at).toLocaleString() : '—',
            nextRun: estimateNextRun(freq, r.generated_at),
            format: r.format?.toUpperCase() ?? 'JSON',
            status: r.status === 'available' ? 'Active' : 'Pending',
          };
        });
        setSchedules(entries);
      }
    } finally {
      setLoading(false);
    }
  };

  if (clustersLoading) return <LinearProgress />;
  if (clusters.length === 0) return <NoClusterBanner dataDescription="scheduled report history" />;

  const activeCount = schedules.filter((s) => s.status === 'Active').length;
  const weeklyCount = schedules.filter((s) => s.frequency === 'Weekly').length;
  const monthlyCount = schedules.filter((s) => s.frequency === 'Monthly').length;

  const freqColor = (f: string): 'error' | 'warning' | 'info' | 'default' =>
    f === 'Daily' ? 'error' : f === 'Weekly' ? 'warning' : f === 'Monthly' ? 'info' : 'default';
  const fmtColor = (f: string): 'primary' | 'success' | 'default' =>
    f === 'PDF' ? 'primary' : f === 'EXCEL' ? 'success' : 'default';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Scheduled Reports</Typography>
          <Typography variant="body2" color="text.secondary">
            Report delivery schedule derived from live report history
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => window.location.assign('/reports')}
          >
            New Report
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Active Schedules', value: activeCount },
          { label: 'Weekly Reports', value: weeklyCount },
          { label: 'Monthly Reports', value: monthlyCount },
          { label: 'Total Reports', value: schedules.length },
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
                {['Report Name', 'Type', 'Frequency', 'Last Run', 'Next Run', 'Format', 'Status'].map((h) => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {schedules.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                      No reports generated yet. Go to Executive Reports to create your first report.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {schedules.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.reportType}</TableCell>
                  <TableCell>
                    <Chip label={row.frequency} size="small" variant="outlined" color={freqColor(row.frequency)} />
                  </TableCell>
                  <TableCell>{row.lastRun}</TableCell>
                  <TableCell>{row.nextRun}</TableCell>
                  <TableCell>
                    <Chip label={row.format} size="small" variant="outlined" color={fmtColor(row.format)} />
                  </TableCell>
                  <TableCell>
                    <Chip label={row.status} size="small" color={row.status === 'Active' ? 'success' : 'default'} />
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

export default ScheduledReports;

// Made with Bob
