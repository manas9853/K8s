import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, LinearProgress,
  CircularProgress, Alert, IconButton
} from '@mui/material';
import { Refresh, TrendingDown, AttachMoney, MonetizationOn, AccountBalanceWallet } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SavingsByEntity { name: string; current_cost: number; optimized_cost: number; savings: number; savings_percent: number; }
interface CostBreakdownItem { category: string; current_cost: number; optimized_cost: number; savings: number; savings_percent: number; }
interface TrendItem { month: string; current_cost: number; optimized_cost: number; savings: number; }
interface CostData {
  current_monthly_cost: number; current_yearly_cost: number;
  optimized_monthly_cost: number; optimized_yearly_cost: number;
  monthly_savings: number; yearly_savings: number; savings_percent: number;
  cost_breakdown: CostBreakdownItem[]; trend_data: TrendItem[];
  savings_by_cluster: SavingsByEntity[]; savings_by_namespace: SavingsByEntity[];
  savings_by_team: SavingsByEntity[]; savings_by_application: SavingsByEntity[];
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatCard: React.FC<{ label: string; value: string; sub: string; icon: React.ReactNode; accent: string }> =
  ({ label, value, sub, icon, accent }) => (
    <Card sx={{ bgcolor: '#1e2433', border: `1px solid ${accent}22`, height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color: accent }}>{icon}</Box>
          <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>{label}</Typography>
        </Box>
        <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700, mb: 0.5 }}>{value}</Typography>
        <Typography variant="body2" sx={{ color: '#8b95a9' }}>{sub}</Typography>
      </CardContent>
    </Card>
  );

const BarRow: React.FC<{ label: string; savings: string; pct: number }> = ({ label, savings, pct }) => (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
      <Typography variant="body2" sx={{ color: '#c8cdd8', fontSize: 13 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: '#4ade80', fontWeight: 600, fontSize: 13 }}>{savings}</Typography>
    </Box>
    <LinearProgress variant="determinate" value={Math.min(pct, 100)}
      sx={{ height: 6, borderRadius: 3, bgcolor: '#2a3245', '& .MuiLinearProgress-bar': { bgcolor: '#4ade80', borderRadius: 3 } }} />
  </Box>
);

const CostSavingsInner: React.FC = () => {
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

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700 }}>Cost Savings Analytics</Typography>
          <Typography variant="body2" sx={{ color: '#8b95a9', mt: 0.5 }}>
            Potential savings from right-sizing cluster workloads
          </Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: '#4ade80' }}><Refresh /></IconButton>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Current Monthly" value={fmt(data.current_monthly_cost)}
            sub={`Annual: ${fmt(data.current_yearly_cost)}`} icon={<AttachMoney />} accent="#f87171" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Optimised Monthly" value={fmt(data.optimized_monthly_cost)}
            sub={`Annual: ${fmt(data.optimized_yearly_cost)}`} icon={<AccountBalanceWallet />} accent="#4ade80" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Monthly Savings" value={fmt(data.monthly_savings)}
            sub={`${data.savings_percent.toFixed(1)}% reduction`} icon={<TrendingDown />} accent="#60a5fa" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Annual Savings" value={fmt(data.yearly_savings)}
            sub="Potential annual impact" icon={<MonetizationOn />} accent="#a78bfa" />
        </Grid>
      </Grid>

      {/* Cost breakdown + 6-month trend */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Cost Breakdown by Resource</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Category','Current','Optimised','Savings'].map(h => (
                      <TableCell key={h} align={h==='Category'?'left':'right'}
                        sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.cost_breakdown.map((row, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                      <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245' }}>{row.category}</TableCell>
                      <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(row.current_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(row.optimized_cost)}</TableCell>
                      <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                        <Chip label={`${fmt(row.savings)} (${row.savings_percent.toFixed(1)}%)`}
                          size="small" sx={{ bgcolor: row.savings >= 0 ? '#14532d' : '#450a0a', color: row.savings >= 0 ? '#4ade80' : '#f87171', fontSize: 11 }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>6-Month Trend</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Month','Current','Optimised','Savings'].map(h => (
                      <TableCell key={h} align={h==='Month'?'left':'right'}
                        sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.trend_data.map((row, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                      <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245' }}>{row.month}</TableCell>
                      <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(row.current_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(row.optimized_cost)}</TableCell>
                      <TableCell align="right" sx={{ color: '#4ade80', fontWeight: 700, borderColor: '#2a3245' }}>{fmt(row.savings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Savings breakdown bars */}
      <Typography variant="h5" sx={{ color: '#e8eaf0', fontWeight: 600, mb: 2 }}>Savings Breakdown</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle1" sx={{ color: '#e8eaf0', mb: 2, fontWeight: 600 }}>By Cluster</Typography>
            {data.savings_by_cluster.map((item, i) => <BarRow key={i} label={item.name} savings={fmt(item.savings)} pct={item.savings_percent} />)}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle1" sx={{ color: '#e8eaf0', mb: 2, fontWeight: 600 }}>By Namespace (Top 5)</Typography>
            {data.savings_by_namespace.slice(0, 5).map((item, i) => <BarRow key={i} label={item.name} savings={fmt(item.savings)} pct={item.savings_percent} />)}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle1" sx={{ color: '#e8eaf0', mb: 2, fontWeight: 600 }}>By Team</Typography>
            {data.savings_by_team.length > 0
              ? data.savings_by_team.map((item, i) => <BarRow key={i} label={item.name} savings={fmt(item.savings)} pct={item.savings_percent} />)
              : <Typography variant="body2" sx={{ color: '#8b95a9' }}>No team labels found on pods</Typography>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <Typography variant="subtitle1" sx={{ color: '#e8eaf0', mb: 2, fontWeight: 600 }}>By Application (Top 5)</Typography>
            {data.savings_by_application.slice(0, 5).map((item, i) => <BarRow key={i} label={item.name} savings={fmt(item.savings)} pct={item.savings_percent} />)}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

const CostSavings: React.FC = () => <ClusterGuard><CostSavingsInner /></ClusterGuard>;
export default CostSavings;
