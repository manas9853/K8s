import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress, Alert,
  Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, LinearProgress, Divider
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const COLORS = ['#3b82d4', '#7c5cd8', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];
const fmt = (n: number) => `$${n.toLocaleString()}`;

const CostAllocation: React.FC = () => {
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
      const response = await fetch(`${API_BASE_URL}/v1/finops/cost-allocation${clusterParam}`);
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

  const teams: any[] = data.allocation_by_team ?? [];
  const namespaces: any[] = data.allocation_by_namespace ?? [];
  const labels: any[] = data.allocation_by_label ?? [];
  const totalCost = teams.reduce((s: number, t: any) => s + t.total_cost, 0);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={3}>
        <AccountBalanceIcon sx={{ fontSize: 38, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Cost Allocation</Typography>
          <Typography variant="body2" color="text.secondary">
            Cost allocation across teams, namespaces, and resource labels
          </Typography>
        </Box>
        <Box ml="auto" display="flex" gap={1}>
          <Chip label={`Accuracy: ${data.allocation_accuracy}%`} color="success" size="small" />
          <Chip label={`Unallocated: ${fmt(data.unallocated_costs?.amount ?? 0)}`} color="warning" size="small" />
        </Box>
      </Box>

      <Grid container spacing={3} mb={3}>
        {/* Team Allocation Pie */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost by Team</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={teams} dataKey="total_cost" nameKey="team"
                     cx="50%" cy="50%" outerRadius={90}
                     label={({ team, percentage }) => `${team.split(' ')[0]}: ${percentage}%`}>
                  {teams.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Team Allocation Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Team Breakdown</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">Monthly Cost</TableCell>
                    <TableCell>Share</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teams.map((t: any, i: number) => (
                    <TableRow key={t.team} hover>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS[i % COLORS.length] }} />
                          <Typography variant="body2" fontWeight="medium">{t.team}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(t.total_cost)}</TableCell>
                      <TableCell sx={{ minWidth: 140 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={t.percentage}
                            sx={{ flex: 1, height: 6, borderRadius: 1 }}
                            color={i === 0 ? 'primary' : i === 1 ? 'secondary' : 'success'} />
                          <Typography variant="caption">{t.percentage}%</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} mb={3}>
        {/* Label Allocation */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost by Label</Typography>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={labels} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="cost" fill="#3b82d4" name="Cost" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Namespace Allocation */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Namespace Allocation</Typography>
            <TableContainer sx={{ maxHeight: 280 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Cluster</TableCell>
                    <TableCell align="right">Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {namespaces.slice(0, 12).map((ns: any, i: number) => (
                    <TableRow key={i} hover>
                      <TableCell>{ns.namespace}</TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{ns.cluster}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(ns.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Unallocated banner */}
      {data.unallocated_costs && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <strong>Unallocated Costs: {fmt(data.unallocated_costs.amount)}</strong> ({data.unallocated_costs.percentage}%) —{' '}
          {data.unallocated_costs.reason}
        </Alert>
      )}
    </Box>
  );
};

export default CostAllocation;
