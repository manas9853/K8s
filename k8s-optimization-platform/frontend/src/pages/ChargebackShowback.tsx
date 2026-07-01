import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Divider, Card, CardContent
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const fmt = (n: number) => `$${n.toLocaleString()}`;

const ChargebackShowback: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/chargeback-showback${clusterParam}`);
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

  const charges: any[] = data.team_charges ?? [];
  const chartData = charges.map((t: any) => ({
    team: t.team.split(' ')[0],
    Compute: t.breakdown.compute,
    Storage: t.breakdown.storage,
    Network: t.breakdown.network,
    Other: t.breakdown.other,
  }));

  const overBudget = charges.filter((t: any) => t.status === 'over_budget');
  const underBudget = charges.filter((t: any) => t.status === 'under_budget');

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <ReceiptIcon sx={{ fontSize: 38, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Chargeback / Showback</Typography>
          <Typography variant="body2" color="text.secondary">
            Billing period: <strong>{data.billing_period}</strong> · {data.cluster_count} cluster(s) · Next billing: {data.next_billing_date}
          </Typography>
        </Box>
        <Box ml="auto" display="flex" gap={1}>
          <Chip label={`Total: ${fmt(data.total_charges)}`} color="primary" />
          <Chip label={`${overBudget.length} over budget`} color="error" size="small" />
          <Chip label={`${underBudget.length} under budget`} color="success" size="small" />
        </Box>
      </Box>

      {/* Summary KPIs */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Charges', value: fmt(data.total_charges), color: '#3b82d4' },
          { label: 'Over Budget Teams', value: String(overBudget.length), color: '#ef4444' },
          { label: 'Under Budget Teams', value: String(underBudget.length), color: '#10b981' },
          { label: 'Billing Frequency', value: data.billing_frequency, color: '#7c5cd8' },
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

      <Grid container spacing={3} mb={3}>
        {/* Stacked Bar */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost Breakdown by Team</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="team" />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Compute" stackId="a" fill="#3b82d4" />
                <Bar dataKey="Storage" stackId="a" fill="#7c5cd8" />
                <Bar dataKey="Network" stackId="a" fill="#10b981" />
                <Bar dataKey="Other"   stackId="a" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Allocation Rules */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Cost Allocation Rules</Typography>
            <Divider sx={{ mb: 2 }} />
            {data.cost_allocation_rules?.map((r: any, i: number) => (
              <Box key={i} mb={2}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2">{r.rule}</Typography>
                  <Typography variant="body2" fontWeight="bold">{r.coverage}%</Typography>
                </Box>
                <Box sx={{ bgcolor: '#e5e7eb', borderRadius: 1, height: 8 }}>
                  <Box sx={{ bgcolor: '#3b82d4', width: `${r.coverage}%`, height: 8, borderRadius: 1 }} />
                </Box>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      {/* Team Charges Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Team Charges Detail</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell align="right">Compute</TableCell>
                <TableCell align="right">Storage</TableCell>
                <TableCell align="right">Network</TableCell>
                <TableCell align="right">Total Charge</TableCell>
                <TableCell align="right">Budget</TableCell>
                <TableCell align="right">Variance</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {charges.map((t: any) => (
                <TableRow key={t.team} hover>
                  <TableCell><Typography variant="body2" fontWeight="medium">{t.team}</Typography></TableCell>
                  <TableCell align="right">{fmt(t.breakdown.compute)}</TableCell>
                  <TableCell align="right">{fmt(t.breakdown.storage)}</TableCell>
                  <TableCell align="right">{fmt(t.breakdown.network)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(t.total_charge)}</TableCell>
                  <TableCell align="right">{fmt(t.budget)}</TableCell>
                  <TableCell align="right">
                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                      {t.variance > 0
                        ? <TrendingUpIcon fontSize="small" color="error" />
                        : <TrendingDownIcon fontSize="small" color="success" />}
                      <Typography variant="body2"
                        sx={{ color: t.variance > 0 ? 'error.main' : 'success.main', fontWeight: 'bold' }}>
                        {t.variance > 0 ? '+' : ''}{fmt(t.variance)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={t.status === 'over_budget' ? 'Over Budget' : 'Under Budget'}
                          size="small" color={t.status === 'over_budget' ? 'error' : 'success'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Insights */}
      {data.showback_insights?.length > 0 && (
        <Box mt={3}>
          {data.showback_insights.map((ins: any, i: number) => (
            <Alert key={i} severity="warning" sx={{ mb: 1 }}>
              <strong>{ins.team}:</strong> {ins.insight} — <em>{ins.recommendation}</em>
            </Alert>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ChargebackShowback;
