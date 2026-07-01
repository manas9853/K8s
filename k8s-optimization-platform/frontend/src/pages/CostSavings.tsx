import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import ClusterGuard from '../components/ClusterGuard';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress
} from '@mui/material';
import { Refresh, TrendingDown, AttachMoney } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface CostBreakdown {
  category: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  savings_percent: number;
}

interface TrendData {
  month: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
}

interface SavingsByEntity {
  name: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  savings_percent: number;
}

interface CostData {
  current_monthly_cost: number;
  current_yearly_cost: number;
  optimized_monthly_cost: number;
  optimized_yearly_cost: number;
  monthly_savings: number;
  yearly_savings: number;
  savings_percent: number;
  cost_breakdown: CostBreakdown[];
  trend_data: TrendData[];
  savings_by_cluster: SavingsByEntity[];
  savings_by_namespace: SavingsByEntity[];
  savings_by_team: SavingsByEntity[];
  savings_by_application: SavingsByEntity[];
}

const CostSavingsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cost-savings/overview${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch cost data');
      setData(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (!data) return null;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Cost Savings Analytics</Typography>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: 'error.light', color: 'white' }}><CardContent><Typography variant="h6">Current Monthly Cost</Typography><Typography variant="h3">{formatCurrency(data.current_monthly_cost)}</Typography><Typography variant="body2">Annual: {formatCurrency(data.current_yearly_cost)}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: 'success.light', color: 'white' }}><CardContent><Typography variant="h6">Optimized Monthly Cost</Typography><Typography variant="h3">{formatCurrency(data.optimized_monthly_cost)}</Typography><Typography variant="body2">Annual: {formatCurrency(data.optimized_yearly_cost)}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: 'primary.main', color: 'white' }}><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><TrendingDown /><Typography variant="h6">Monthly Savings</Typography></Box><Typography variant="h3">{formatCurrency(data.monthly_savings)}</Typography><Typography variant="body2">{data.savings_percent.toFixed(1)}% reduction</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: 'info.main', color: 'white' }}><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AttachMoney /><Typography variant="h6">Yearly Savings</Typography></Box><Typography variant="h3">{formatCurrency(data.yearly_savings)}</Typography><Typography variant="body2">Potential annual impact</Typography></CardContent></Card></Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Cost Breakdown</Typography>
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Category</TableCell><TableCell align="right">Current</TableCell><TableCell align="right">Optimized</TableCell><TableCell align="right">Savings</TableCell></TableRow></TableHead><TableBody>{data.cost_breakdown.map((item, idx) => (<TableRow key={idx}><TableCell>{item.category}</TableCell><TableCell align="right">{formatCurrency(item.current_cost)}</TableCell><TableCell align="right">{formatCurrency(item.optimized_cost)}</TableCell><TableCell align="right"><Chip label={`${formatCurrency(item.savings)} (${item.savings_percent.toFixed(1)}%)`} color="success" size="small" /></TableCell></TableRow>))}</TableBody></Table></TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>6-Month Trend</Typography>
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Month</TableCell><TableCell align="right">Current</TableCell><TableCell align="right">Optimized</TableCell><TableCell align="right">Savings</TableCell></TableRow></TableHead><TableBody>{data.trend_data.map((item, idx) => (<TableRow key={idx}><TableCell>{item.month}</TableCell><TableCell align="right">{formatCurrency(item.current_cost)}</TableCell><TableCell align="right">{formatCurrency(item.optimized_cost)}</TableCell><TableCell align="right"><Typography variant="body2" color="success.main" fontWeight="bold">{formatCurrency(item.savings)}</Typography></TableCell></TableRow>))}</TableBody></Table></TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Savings Breakdown</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>By Cluster</Typography>
            {data.savings_by_cluster.map((item, idx) => (<Box key={idx} sx={{ mb: 2 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight="bold" color="success.main">{formatCurrency(item.savings)} ({item.savings_percent.toFixed(1)}%)</Typography></Box><LinearProgress variant="determinate" value={item.savings_percent} color="success" /></Box>))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>By Namespace</Typography>
            {data.savings_by_namespace.slice(0, 5).map((item, idx) => (<Box key={idx} sx={{ mb: 2 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight="bold" color="success.main">{formatCurrency(item.savings)} ({item.savings_percent.toFixed(1)}%)</Typography></Box><LinearProgress variant="determinate" value={Math.min(item.savings_percent, 100)} color="success" /></Box>))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>By Team</Typography>
            {data.savings_by_team.map((item, idx) => (<Box key={idx} sx={{ mb: 2 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight="bold" color="success.main">{formatCurrency(item.savings)} ({item.savings_percent.toFixed(1)}%)</Typography></Box><LinearProgress variant="determinate" value={item.savings_percent} color="success" /></Box>))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>By Application</Typography>
            {data.savings_by_application.slice(0, 5).map((item, idx) => (<Box key={idx} sx={{ mb: 2 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}><Typography variant="body2">{item.name}</Typography><Typography variant="body2" fontWeight="bold" color="success.main">{formatCurrency(item.savings)} ({item.savings_percent.toFixed(1)}%)</Typography></Box><LinearProgress variant="determinate" value={Math.min(item.savings_percent, 100)} color="success" /></Box>))}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

const CostSavings: React.FC = () => (
  <ClusterGuard><CostSavingsInner /></ClusterGuard>
);

export default CostSavings;

// Made with Bob
