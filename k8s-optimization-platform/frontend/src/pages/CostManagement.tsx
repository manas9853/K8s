import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, LinearProgress, Paper, Divider, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StorageIcon from '@mui/icons-material/Storage';
import CloudIcon from '@mui/icons-material/Cloud';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const COLORS = ['#3b82d4', '#7c5cd8', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

const fmt = (n: number) => `$${n.toLocaleString()}`;

const CostManagement: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/cost-management${clusterParam}`);
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

  const bs = data.budget_status;
  const budgetPct = bs ? Math.min(Math.round(bs.utilization_percentage), 100) : 0;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <AttachMoneyIcon sx={{ fontSize: 38, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Cost Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Comprehensive cost tracking across {data.cluster_count ?? '—'} cluster(s)
          </Typography>
        </Box>
        <Box ml="auto">
          <Chip
            label={`Trend: ${data.cost_trend ?? 'stable'}`}
            color={data.month_over_month_change > 5 ? 'warning' : 'success'}
            size="small"
          />
        </Box>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={3} mb={3}>
        {[
          { label: 'Monthly Cost',   value: fmt(data.total_monthly_cost),  icon: <AttachMoneyIcon />, color: '#3b82d4' },
          { label: 'Annual Cost',    value: fmt(data.total_annual_cost),   icon: <TrendingUpIcon />,  color: '#7c5cd8' },
          { label: 'MoM Change',     value: `${data.month_over_month_change}%`, icon: <TrendingUpIcon />, color: '#f59e0b' },
          { label: 'Clusters',       value: String(data.cluster_count ?? '—'), icon: <CloudIcon />, color: '#10b981' },
        ].map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Box sx={{ color: card.color }}>{card.icon}</Box>
                  <Typography variant="body2" color="text.secondary">{card.label}</Typography>
                </Box>
                <Typography variant="h5" fontWeight="bold">{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Cost by Resource Type */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost by Resource Type</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.cost_by_resource_type} dataKey="cost" nameKey="type"
                     cx="50%" cy="50%" outerRadius={90}
                     label={({ type, percentage }) => `${type}: ${percentage}%`}>
                  {data.cost_by_resource_type.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Cost by Environment */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost by Environment</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.cost_by_environment}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="environment" />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="cost" fill="#3b82d4" name="Cost" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Budget Status */}
        {bs && (
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Budget Status</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2">Utilization</Typography>
                  <Typography variant="body2" fontWeight="bold">{bs.utilization_percentage}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={budgetPct}
                  color={budgetPct > 95 ? 'error' : budgetPct > 85 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              </Box>
              {[
                ['Monthly Budget',        fmt(bs.monthly_budget)],
                ['Current Spend',         fmt(bs.current_spend)],
                ['Remaining',             fmt(bs.remaining)],
                ['EOM Forecast',          fmt(bs.forecast_end_of_month)],
              ].map(([k, v]) => (
                <Box key={k} display="flex" justifyContent="space-between" py={0.5}>
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight="medium">{v}</Typography>
                </Box>
              ))}
              <Box mt={1}>
                <Chip label={bs.status.replace('_', ' ').toUpperCase()} size="small"
                      color={bs.status === 'warning' ? 'warning' : 'success'} />
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Optimization Opportunities */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Optimization Opportunities</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Opportunity</TableCell>
                    <TableCell align="right">Potential Savings</TableCell>
                    <TableCell>Effort</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.optimization_opportunities?.map((o: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{o.opportunity}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                        {fmt(o.potential_savings)}
                      </TableCell>
                      <TableCell>
                        <Chip label={o.effort} size="small"
                              color={o.effort === 'low' ? 'success' : o.effort === 'medium' ? 'warning' : 'error'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Top Cost Drivers */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Top Cost Drivers by Cluster</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cluster</TableCell>
                <TableCell>Environment</TableCell>
                <TableCell>Region</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell align="right">Monthly Cost</TableCell>
                <TableCell>Trend</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.top_cost_drivers?.map((d: any) => (
                <TableRow key={d.name} hover>
                  <TableCell><Typography variant="body2" fontWeight="medium">{d.name}</Typography></TableCell>
                  <TableCell>
                    <Chip label={d.environment} size="small"
                          color={d.environment === 'production' ? 'error' : d.environment === 'staging' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>{d.region ?? '—'}</TableCell>
                  <TableCell>{d.provider ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(d.cost)}</TableCell>
                  <TableCell>
                    <Chip label={d.trend} size="small" color={d.trend === 'stable' ? 'default' : d.trend === 'increasing' ? 'error' : 'success'} />
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

export default CostManagement;
