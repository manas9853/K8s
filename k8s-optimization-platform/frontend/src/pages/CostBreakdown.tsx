import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, LinearProgress,
  CircularProgress, Alert, IconButton
} from '@mui/material';
import { Refresh, Category } from '@mui/icons-material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { API_BASE_URL } from '../config/api';

interface CostBreakdownItem { category: string; current_cost: number; optimized_cost: number; savings: number; savings_percent: number; }
interface SavingsByEntity { name: string; current_cost: number; optimized_cost: number; savings: number; savings_percent: number; }
interface CostData {
  current_monthly_cost: number; optimized_monthly_cost: number; monthly_savings: number; savings_percent: number;
  cost_breakdown: CostBreakdownItem[];
  savings_by_namespace: SavingsByEntity[];
  savings_by_cluster: SavingsByEntity[];
  savings_by_application: SavingsByEntity[];
}

const COLORS = ['#f87171', '#4ade80'];
const fmt    = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK   = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

const CostBreakdown: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const r = await fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to fetch'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  if (error)   return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return null;

  const pieData = data.cost_breakdown.map(b => ({ name: b.category, value: Math.max(b.current_cost, 0) }));
  const tooltipStyle = { backgroundColor: '#1e2433', border: '1px solid #2a3245', color: '#e8eaf0' };

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700 }}>Cost Breakdown Analysis</Typography>
          <Typography variant="body2" sx={{ color: '#8b95a9', mt: 0.5 }}>Detailed cost analysis by category, namespace, and resource type</Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: '#4ade80' }}><Refresh /></IconButton>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #f8717122' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', fontSize: 11, mb: 1 }}>Total Current Cost</Typography>
              <Typography variant="h4" sx={{ color: '#f87171', fontWeight: 700 }}>{fmt(data.current_monthly_cost)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>Monthly baseline</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #4ade8022' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', fontSize: 11, mb: 1 }}>Total Optimised Cost</Typography>
              <Typography variant="h4" sx={{ color: '#4ade80', fontWeight: 700 }}>{fmt(data.optimized_monthly_cost)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>After optimisation</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #4ade8022' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Category sx={{ color: '#4ade80' }} />
                <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', fontSize: 11 }}>Total Savings</Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#4ade80', fontWeight: 700 }}>{fmt(data.monthly_savings)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>{data.savings_percent.toFixed(1)}% reduction</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pie + resource type table */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Cost by Resource Type</Typography>
            <Box sx={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, value }) => `${name}: ${fmtK(value)}`}
                    labelLine={{ stroke: '#8b95a9' }}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
            <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Resource Type Details</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Type','Current','Optimised','Savings','Share'].map(h => (
                      <TableCell key={h} sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}
                        align={h === 'Type' ? 'left' : 'right'}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.cost_breakdown.map((item, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                      <TableCell sx={{ borderColor: '#2a3245' }}>
                        <Chip label={item.category} size="small"
                          sx={{ bgcolor: COLORS[i % COLORS.length] + '33', color: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] + '66', border: '1px solid' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(item.current_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(item.optimized_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: item.savings >= 0 ? '#4ade80' : '#f87171', borderColor: '#2a3245', fontWeight: 600 }}>{fmt(item.savings)}</TableCell>
                      <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <LinearProgress variant="determinate"
                            value={data.current_monthly_cost > 0 ? (item.current_cost / data.current_monthly_cost) * 100 : 0}
                            sx={{ width: 60, height: 6, borderRadius: 3, bgcolor: '#2a3245', '& .MuiLinearProgress-bar': { bgcolor: COLORS[i % COLORS.length] } }} />
                          <Typography variant="caption" sx={{ color: '#8b95a9', minWidth: 36 }}>
                            {data.current_monthly_cost > 0 ? ((item.current_cost / data.current_monthly_cost) * 100).toFixed(0) : 0}%
                          </Typography>
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

      {/* Namespace bar chart */}
      <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Top Namespaces by Savings Potential</Typography>
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.savings_by_namespace.slice(0, 10)} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3245" />
              <XAxis dataKey="name" stroke="#8b95a9" tick={{ fill: '#8b95a9', fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={fmtK} stroke="#8b95a9" tick={{ fill: '#8b95a9' }} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: '#8b95a9' }} />
              <Bar dataKey="current_cost" fill="#f87171" name="Current Cost" radius={[4,4,0,0]} />
              <Bar dataKey="savings"      fill="#4ade80" name="Savings"       radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Cluster + application tables */}
      <Grid container spacing={2}>
        {[
          { title: 'Savings by Cluster', items: data.savings_by_cluster },
          { title: 'Top Applications by Savings', items: data.savings_by_application.slice(0, 8) },
        ].map(({ title, items }) => (
          <Grid item xs={12} md={6} key={title}>
            <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>{title}</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Name','Workloads w/ Savings','Current','Savings'].map(h => (
                        <TableCell key={h} sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12 }}
                          align={h === 'Name' ? 'left' : 'right'}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item, i) => (
                      <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                        <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245' }}>{item.name}</TableCell>
                        <TableCell align="right" sx={{ color: '#8b95a9', borderColor: '#2a3245' }}>—</TableCell>
                        <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(item.current_cost)}</TableCell>
                        <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                          <Chip label={fmt(item.savings)} size="small" sx={{ bgcolor: '#14532d', color: '#4ade80' }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default CostBreakdown;
