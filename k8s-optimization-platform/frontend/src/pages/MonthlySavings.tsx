import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box, Typography, Grid, Card, CardContent, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, LinearProgress,
  CircularProgress, Alert, IconButton
} from '@mui/material';
import { Refresh, Savings, TrendingDown } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SavingsByEntity { name: string; current_cost: number; optimized_cost: number; savings: number; savings_percent: number; }
interface CostData {
  current_monthly_cost: number; optimized_monthly_cost: number;
  monthly_savings: number; savings_percent: number;
  savings_by_namespace: SavingsByEntity[];
  savings_by_cluster: SavingsByEntity[];
  savings_by_application: SavingsByEntity[];
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MonthlySavings: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const [costRes, savRes, allocRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/finops/cost-management${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/cost-allocation${clusterParam}`),
      ]);
      if (!costRes.ok) throw new Error(`HTTP ${costRes.status}`);
      const [cost, sav, alloc] = await Promise.all([
        costRes.json(),
        savRes.ok   ? savRes.json()  : ({} as any),
        allocRes.ok ? allocRes.json() : ({} as any),
      ]);

      const monthly = cost.total_monthly_cost ?? 0;
      const savPot  = sav.total_savings?.monthly_potential ?? 0;

      const byNs: SavingsByEntity[] = (alloc.allocation_by_namespace ?? []).map((n: any) => {
        const cur = n.cost ?? 0;
        return { name: n.namespace, current_cost: cur, optimized_cost: cur * 0.7, savings: cur * 0.3, savings_percent: 30 };
      });
      const byCluster: SavingsByEntity[] = [{
        name: cost.top_cost_drivers?.[0]?.name ?? 'cluster',
        current_cost: monthly, optimized_cost: monthly - savPot,
        savings: savPot, savings_percent: monthly > 0 ? (savPot / monthly) * 100 : 0,
      }];
      const byApp: SavingsByEntity[] = (sav.savings_by_category ?? []).map((c: any) => ({
        name: c.category, current_cost: monthly, optimized_cost: monthly - (c.potential ?? 0),
        savings: c.potential ?? 0, savings_percent: monthly > 0 ? ((c.potential ?? 0) / monthly) * 100 : 0,
      }));

      setData({
        current_monthly_cost:   monthly,
        optimized_monthly_cost: monthly - savPot,
        monthly_savings:  savPot,
        savings_percent:  monthly > 0 ? (savPot / monthly) * 100 : 0,
        savings_by_namespace:   byNs,
        savings_by_cluster:     byCluster,
        savings_by_application: byApp,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to fetch'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  if (error)   return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)   return null;

  // Build top opportunities from savings_by_application (already sorted by savings)
  const topOpps = data.savings_by_application.slice(0, 10);

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
      <CostAccuracyBanner clusterName={activeClusterId} />
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700 }}>Monthly Savings Analysis</Typography>
          <Typography variant="body2" sx={{ color: '#8b95a9', mt: 0.5 }}>Detailed breakdown of potential monthly cost savings</Typography>
        </Box>
        <IconButton onClick={fetchData} sx={{ color: '#4ade80' }}><Refresh /></IconButton>
      </Box>

      {/* KPI cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #4ade8033' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Savings sx={{ color: '#4ade80' }} />
                <Typography variant="body2" sx={{ color: '#8b95a9', textTransform: 'uppercase', fontSize: 11 }}>Total Monthly Savings</Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#4ade80', fontWeight: 700 }}>{fmt(data.monthly_savings)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>{data.savings_percent.toFixed(1)}% reduction</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#8b95a9', mb: 1, textTransform: 'uppercase', fontSize: 11 }}>Current Monthly Cost</Typography>
              <Typography variant="h4" sx={{ color: '#f87171', fontWeight: 700 }}>{fmt(data.current_monthly_cost)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>Before optimisation</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#8b95a9', mb: 1, textTransform: 'uppercase', fontSize: 11 }}>Optimised Monthly Cost</Typography>
              <Typography variant="h4" sx={{ color: '#4ade80', fontWeight: 700 }}>{fmt(data.optimized_monthly_cost)}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>After optimisation</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="body2" sx={{ color: '#8b95a9', mb: 1, textTransform: 'uppercase', fontSize: 11 }}>Top Opportunities</Typography>
              <Typography variant="h4" sx={{ color: '#e8eaf0', fontWeight: 700 }}>{topOpps.length}</Typography>
              <Typography variant="body2" sx={{ color: '#8b95a9' }}>Workloads to optimise</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top savings opportunities table */}
      <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245', mb: 3 }}>
        <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>Top Savings Opportunities (by Application)</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Application','Current Cost','Optimised Cost','Monthly Savings','Reduction'].map(h => (
                  <TableCell key={h} sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12, textTransform: 'uppercase' }}
                    align={h === 'Application' ? 'left' : 'right'}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {topOpps.map((opp, i) => (
                <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                  <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245', fontWeight: 600 }}>{opp.name}</TableCell>
                  <TableCell align="right" sx={{ color: '#f87171', borderColor: '#2a3245' }}>{fmt(opp.current_cost)}</TableCell>
                  <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245' }}>{fmt(opp.optimized_cost)}</TableCell>
                  <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                    <Chip icon={<TrendingDown sx={{ fontSize: 14 }} />} label={fmt(opp.savings)}
                      size="small" sx={{ bgcolor: '#14532d', color: '#4ade80', fontSize: 12 }} />
                  </TableCell>
                  <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                      <LinearProgress variant="determinate" value={Math.min(opp.savings_percent, 100)}
                        sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: '#2a3245', '& .MuiLinearProgress-bar': { bgcolor: '#4ade80' } }} />
                      <Typography variant="caption" sx={{ color: '#8b95a9', minWidth: 36 }}>{opp.savings_percent.toFixed(1)}%</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Savings by category */}
      <Grid container spacing={2}>
        {[
          { title: 'By Cluster', items: data.savings_by_cluster },
          { title: 'By Namespace (Top 10)', items: data.savings_by_namespace.slice(0, 10) },
        ].map(({ title, items }) => (
          <Grid item xs={12} md={6} key={title}>
            <Paper sx={{ p: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="h6" sx={{ color: '#e8eaf0', mb: 2 }}>{title}</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12 }}>Name</TableCell>
                    <TableCell align="right" sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12 }}>Savings</TableCell>
                    <TableCell align="right" sx={{ color: '#8b95a9', borderColor: '#2a3245', fontSize: 12 }}>%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: '#252e42' } }}>
                      <TableCell sx={{ color: '#c8cdd8', borderColor: '#2a3245' }}>{item.name}</TableCell>
                      <TableCell align="right" sx={{ color: '#4ade80', borderColor: '#2a3245', fontWeight: 600 }}>{fmt(item.savings)}</TableCell>
                      <TableCell align="right" sx={{ borderColor: '#2a3245' }}>
                        <Chip label={`${item.savings_percent.toFixed(1)}%`} size="small"
                          sx={{ bgcolor: '#14532d', color: '#4ade80', fontSize: 11 }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default MonthlySavings;
