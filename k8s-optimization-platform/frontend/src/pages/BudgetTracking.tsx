import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Card, CardContent, Divider
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const fmt = (n: number) => `$${n.toLocaleString()}`;

const statusColor = (s: string) =>
  s === 'at_risk' ? 'error' : s === 'on_track' ? 'success' : 'warning';

const BudgetTracking: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/budget-tracking${clusterParam}`);
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

  const ob = data.overall_budget;
  const forecast = data.forecast;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <AccountBalanceWalletIcon sx={{ fontSize: 38, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Budget Tracking</Typography>
          <Typography variant="body2" color="text.secondary">
            Track budgets and forecast spending across clusters and teams
          </Typography>
        </Box>
        <Box ml="auto">
          <Chip label={`YTD Status: ${ob?.status?.replace('_', ' ')}`}
                color={ob?.status === 'on_track' ? 'success' : 'warning'} />
        </Box>
      </Box>

      {/* Overall KPIs */}
      {ob && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Annual Budget',    value: fmt(ob.annual_budget)  },
            { label: 'Monthly Budget',   value: fmt(ob.monthly_budget) },
            { label: 'YTD Actual',       value: fmt(ob.ytd_actual)     },
            { label: 'YTD Variance',     value: fmt(ob.ytd_variance)   },
          ].map(c => (
            <Grid item xs={12} sm={6} md={3} key={c.label}>
              <Card>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="body2" color="text.secondary">{c.label}</Typography>
                  <Typography variant="h5" fontWeight="bold">{c.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={3} mb={3}>
        {/* Monthly Tracking Chart */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Monthly Budget vs Actual</Typography>
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={data.monthly_tracking}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Line type="monotone" dataKey="budget" stroke="#3b82d4" strokeWidth={2} name="Budget" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} name="Actual" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Forecast */}
        {forecast && (
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>Forecast</Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                ['End of Month',    fmt(forecast.end_of_month)],
                ['End of Quarter',  fmt(forecast.end_of_quarter)],
                ['End of Year',     fmt(forecast.end_of_year)],
                ['Confidence',      `${forecast.confidence}%`],
              ].map(([k, v]) => (
                <Box key={k} display="flex" justifyContent="space-between" py={1} borderBottom="1px solid #e5e7eb">
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight="bold">{v}</Typography>
                </Box>
              ))}
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Team Budgets */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Team Budget Utilization</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell align="right">Monthly Budget</TableCell>
                <TableCell align="right">Current Spend</TableCell>
                <TableCell align="right">Remaining</TableCell>
                <TableCell>Utilization</TableCell>
                <TableCell align="right">Forecast</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.team_budgets?.map((t: any) => (
                <TableRow key={t.team} hover>
                  <TableCell><Typography variant="body2" fontWeight="medium">{t.team}</Typography></TableCell>
                  <TableCell align="right">{fmt(t.monthly_budget)}</TableCell>
                  <TableCell align="right">{fmt(t.current_spend)}</TableCell>
                  <TableCell align="right"
                    sx={{ color: t.remaining < 0 ? 'error.main' : 'success.main', fontWeight: 'bold' }}>
                    {fmt(t.remaining)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LinearProgress variant="determinate" value={Math.min(t.utilization, 100)}
                        color={t.utilization > 97 ? 'error' : t.utilization > 90 ? 'warning' : 'success'}
                        sx={{ flex: 1, height: 8, borderRadius: 1 }} />
                      <Typography variant="caption">{t.utilization}%</Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{fmt(t.forecast)}</TableCell>
                  <TableCell>
                    <Chip label={t.status.replace('_', ' ')} size="small" color={statusColor(t.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Alerts */}
      {data.budget_alerts?.map((a: any, i: number) => (
        <Alert key={i} severity={a.severity as any} sx={{ mb: 1 }}>
          <strong>{a.team}:</strong> {a.message}
          {a.action_required !== 'None' && <> — <em>{a.action_required}</em></>}
        </Alert>
      ))}
    </Box>
  );
};

export default BudgetTracking;
