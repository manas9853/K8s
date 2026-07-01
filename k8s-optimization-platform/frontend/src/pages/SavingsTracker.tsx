import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Card, CardContent, Divider
} from '@mui/material';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const fmt = (n: number) => `$${n.toLocaleString()}`;
const pct = (realized: number, total: number) =>
  total > 0 ? Math.round((realized / total) * 100) : 0;

const SavingsTracker: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return null;

  const ts = data.total_savings;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <TrendingDownIcon sx={{ fontSize: 38, mr: 2, color: 'success.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Savings Tracker</Typography>
          <Typography variant="body2" color="text.secondary">
            Track realized and potential savings from optimization efforts
          </Typography>
        </Box>
        <Box ml="auto">
          <Chip label={`${data.optimization_rate}% optimization rate`} color="success" />
        </Box>
      </Box>

      {/* KPI Cards */}
      {ts && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Monthly Realized',   value: fmt(ts.monthly_realized),    color: '#10b981' },
            { label: 'Monthly Potential',  value: fmt(ts.monthly_potential),   color: '#3b82d4' },
            { label: 'YTD Realized',       value: fmt(ts.ytd_realized),        color: '#7c5cd8' },
            { label: 'Annual Projection',  value: fmt(ts.annual_projection),   color: '#f59e0b' },
          ].map(c => (
            <Grid item xs={12} sm={6} md={3} key={c.label}>
              <Card>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="body2" color="text.secondary">{c.label}</Typography>
                  <Typography variant="h5" fontWeight="bold" sx={{ color: c.color }}>{c.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={3} mb={3}>
        {/* Savings Timeline */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings Timeline</Typography>
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={data.savings_timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Area type="monotone" dataKey="potential" stroke="#3b82d4" fill="#bfdbfe" name="Potential" />
                <Area type="monotone" dataKey="realized"  stroke="#10b981" fill="#bbf7d0" name="Realized"  />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Top Initiatives */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Top Initiatives</Typography>
            <Divider sx={{ mb: 2 }} />
            {data.top_savings_initiatives?.map((ini: any, i: number) => (
              <Box key={i} mb={2.5}>
                <Box display="flex" alignItems="flex-start" gap={1} mb={0.5}>
                  <CheckCircleIcon fontSize="small" sx={{ color: 'success.main', mt: 0.3 }} />
                  <Box flex={1}>
                    <Typography variant="body2" fontWeight="medium">{ini.initiative}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Since {ini.implementation_date} · ROI: {ini.roi}%
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="success.main" fontWeight="bold" ml={3}>
                  {fmt(ini.realized_savings)} saved
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Category Breakdown */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Category</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Realized</TableCell>
                    <TableCell align="right">Remaining Potential</TableCell>
                    <TableCell>Completion</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.savings_by_category?.map((c: any) => (
                    <TableRow key={c.category} hover>
                      <TableCell>{c.category}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>{fmt(c.realized)}</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>{fmt(c.potential)}</TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={c.completion_rate}
                            color={c.completion_rate > 50 ? 'success' : 'warning'}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }} />
                          <Typography variant="caption">{c.completion_rate}%</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Team Savings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Team</Typography>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.savings_by_team} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="team" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="realized"  fill="#10b981" name="Realized" />
                <Bar dataKey="potential" fill="#3b82d4" name="Potential" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SavingsTracker;
