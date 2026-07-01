import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent, Divider, LinearProgress
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import NatureIcon from '@mui/icons-material/Nature';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const COLORS = ['#3b82d4', '#7c5cd8', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const fmt = (n: number) => `${Number(n).toLocaleString()} kWh`;

const EnergyConsumption: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/energy-consumption${clusterParam}`);
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

  const te = data.total_energy;
  const ee = data.energy_efficiency;
  const re = data.renewable_energy;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <BoltIcon sx={{ fontSize: 38, mr: 2, color: 'warning.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Energy Consumption</Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor energy usage and efficiency across clusters
          </Typography>
        </Box>
        <Box ml="auto" display="flex" gap={1}>
          <Chip icon={<NatureIcon />} label={`${re?.percentage}% renewable`} color="success" size="small" />
          <Chip label={`PUE: ${ee?.pue}`} color={ee?.pue < 1.4 ? 'success' : 'warning'} size="small" />
        </Box>
      </Box>

      {/* KPI Cards */}
      {te && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Monthly Energy',      value: fmt(te.monthly_kwh),           color: '#f59e0b' },
            { label: 'Daily Average',        value: fmt(te.daily_average_kwh),     color: '#3b82d4' },
            { label: 'YTD Total',            value: fmt(te.ytd_kwh),              color: '#7c5cd8' },
            { label: 'Annual Projection',    value: fmt(te.annual_projection_kwh), color: '#10b981' },
          ].map(c => (
            <Grid item xs={12} sm={6} md={3} key={c.label}>
              <Card>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="body2" color="text.secondary">{c.label}</Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: c.color }}>{c.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={3} mb={3}>
        {/* Energy Trend */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Energy Trend</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.energy_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left"  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" domain={[60, 90]} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left"  type="monotone" dataKey="kwh"        stroke="#f59e0b" strokeWidth={2} name="kWh" />
                <Line yAxisId="right" type="monotone" dataKey="efficiency" stroke="#10b981" strokeWidth={2} name="Efficiency %" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Workload Type Pie */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>By Workload Type</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.energy_by_workload_type} dataKey="kwh" nameKey="type"
                     cx="50%" cy="50%" outerRadius={85}
                     label={({ type, percentage }) => `${type.split('-')[0]}: ${percentage}%`}>
                  {data.energy_by_workload_type?.map((_: any, i: number) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Cluster Energy Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Energy by Cluster</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Environment</TableCell>
                    <TableCell align="right">Monthly kWh</TableCell>
                    <TableCell>Share</TableCell>
                    <TableCell>Efficiency</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.energy_by_cluster?.map((c: any, i: number) => (
                    <TableRow key={c.cluster} hover>
                      <TableCell><Typography variant="body2" fontWeight="medium">{c.cluster}</Typography></TableCell>
                      <TableCell>
                        <Chip label={c.environment} size="small"
                              color={c.environment === 'production' ? 'error' : c.environment === 'staging' ? 'warning' : 'default'} />
                      </TableCell>
                      <TableCell align="right">{Number(c.kwh).toLocaleString()}</TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={c.percentage}
                            color="warning" sx={{ flex: 1, height: 6, borderRadius: 1 }} />
                          <Typography variant="caption">{c.percentage}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={`${c.efficiency_score}/100`} size="small"
                              color={c.efficiency_score >= 80 ? 'success' : c.efficiency_score >= 70 ? 'warning' : 'error'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Efficiency Metrics + Renewable */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Efficiency Metrics</Typography>
            <Divider sx={{ mb: 2 }} />
            {[
              ['PUE',              `${ee?.pue} (target: ${ee?.target_pue})`],
              ['CPU Utilization',  `${ee?.cpu_utilization}%`],
              ['Memory Util.',     `${ee?.memory_utilization}%`],
              ['Overall Score',    `${ee?.overall_efficiency_score}/100`],
            ].map(([k, v]) => (
              <Box key={k} display="flex" justifyContent="space-between" py={0.75} borderBottom="1px solid #e5e7eb">
                <Typography variant="body2" color="text.secondary">{k}</Typography>
                <Typography variant="body2" fontWeight="bold">{v}</Typography>
              </Box>
            ))}
          </Paper>

          {re && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Renewable Energy</Typography>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2">{re.percentage}% renewable</Typography>
                <Typography variant="body2" color="text.secondary">Target: {re.target_percentage}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={re.percentage}
                color={re.percentage >= re.target_percentage ? 'success' : 'warning'}
                sx={{ height: 12, borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {Number(re.kwh).toLocaleString()} kWh from renewables this month
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Optimization Opportunities */}
      {data.optimization_opportunities?.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Optimization Opportunities</Typography>
          {data.optimization_opportunities.map((o: any, i: number) => (
            <Alert key={i} severity={o.impact === 'high' ? 'warning' : 'info'} sx={{ mb: 1 }}>
              <strong>{o.opportunity}</strong> — Save {Number(o.potential_savings_kwh).toLocaleString()} kWh/month
            </Alert>
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default EnergyConsumption;
