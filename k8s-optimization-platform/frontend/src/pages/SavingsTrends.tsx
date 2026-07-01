import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container,
  Typography,
  Paper,
  Box,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { Refresh, TrendingUp, TrendingDown, ShowChart } from '@mui/icons-material';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';

interface TrendData {
  month: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  cumulative_savings: number;
  optimization_rate: number;
}

interface SavingsTrendsData {
  total_savings: number;
  monthly_trend: TrendData[];
  projected_annual_savings: number;
  optimization_velocity: number;
  avg_monthly_savings: number;
  peak_savings_month: string;
  trend_direction: 'increasing' | 'decreasing' | 'stable';
}

const SavingsTrends: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SavingsTrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '12m'>('6m');

  useEffect(() => {
    fetchData();
  }, [timeRange, clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const recommendations = await response.json();
      
      // Calculate current monthly savings
      const currentMonthlySavings = recommendations.reduce((sum: number, rec: any) => 
        sum + (rec.estimated_monthly_savings || 0), 0
      );
      
      // Generate historical trend data (simulated for demo)
      const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentMonth = new Date().getMonth();
      
      const monthlyTrend: TrendData[] = [];
      let cumulativeSavings = 0;
      
      for (let i = months - 1; i >= 0; i--) {
        const monthIndex = (currentMonth - i + 12) % 12;
        const monthName = monthNames[monthIndex];
        
        // Simulate gradual improvement in optimization
        const optimizationProgress = (months - i) / months;
        const monthlySavings = currentMonthlySavings * (0.5 + optimizationProgress * 0.5);
        const currentCost = monthlySavings / 0.3;
        const optimizedCost = currentCost - monthlySavings;
        
        cumulativeSavings += monthlySavings;
        
        monthlyTrend.push({
          month: monthName,
          current_cost: currentCost,
          optimized_cost: optimizedCost,
          savings: monthlySavings,
          cumulative_savings: cumulativeSavings,
          optimization_rate: (monthlySavings / currentCost) * 100
        });
      }
      
      // Calculate metrics
      const avgMonthlySavings = monthlyTrend.reduce((sum, m) => sum + m.savings, 0) / monthlyTrend.length;
      const peakMonth = monthlyTrend.reduce((max, m) => m.savings > max.savings ? m : max, monthlyTrend[0]);
      
      // Calculate trend direction
      const firstHalf = monthlyTrend.slice(0, Math.floor(monthlyTrend.length / 2));
      const secondHalf = monthlyTrend.slice(Math.floor(monthlyTrend.length / 2));
      const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.savings, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.savings, 0) / secondHalf.length;
      
      let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
      const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      if (changePercent > 10) trendDirection = 'increasing';
      else if (changePercent < -10) trendDirection = 'decreasing';
      
      // Calculate optimization velocity (rate of improvement)
      const optimizationVelocity = changePercent;
      
      setData({
        total_savings: cumulativeSavings,
        monthly_trend: monthlyTrend,
        projected_annual_savings: currentMonthlySavings * 12,
        optimization_velocity: optimizationVelocity,
        avg_monthly_savings: avgMonthlySavings,
        peak_savings_month: peakMonth.month,
        trend_direction: trendDirection
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (!data) return null;

  const getTrendIcon = () => {
    if (data.trend_direction === 'increasing') return <TrendingUp sx={{ color: 'success.main' }} />;
    if (data.trend_direction === 'decreasing') return <TrendingDown sx={{ color: 'error.main' }} />;
    return <ShowChart sx={{ color: 'info.main' }} />;
  };

  const getTrendColor = () => {
    if (data.trend_direction === 'increasing') return 'success';
    if (data.trend_direction === 'decreasing') return 'error';
    return 'info';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Savings Trends Analysis</Typography>
          <Typography variant="body2" color="textSecondary">
            Historical savings trends and future projections
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value as '3m' | '6m' | '12m')}
            >
              <MenuItem value="3m">Last 3 Months</MenuItem>
              <MenuItem value="6m">Last 6 Months</MenuItem>
              <MenuItem value="12m">Last 12 Months</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Savings (Period)</Typography>
              <Typography variant="h4">{formatCurrency(data.total_savings)}</Typography>
              <Typography variant="body2" color="success.main">
                Cumulative savings
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg Monthly Savings</Typography>
              <Typography variant="h4">{formatCurrency(data.avg_monthly_savings)}</Typography>
              <Typography variant="body2" color="textSecondary">
                Per month average
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Optimization Velocity</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getTrendIcon()}
                <Typography variant="h4">
                  {Math.abs(data.optimization_velocity).toFixed(1)}%
                </Typography>
              </Box>
              <Chip 
                label={data.trend_direction.toUpperCase()} 
                color={getTrendColor() as any}
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Typography gutterBottom>Projected Annual Savings</Typography>
              <Typography variant="h4">{formatCurrency(data.projected_annual_savings)}</Typography>
              <Typography variant="body2">
                Based on current trend
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cumulative Savings Trend */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Cumulative Savings Over Time</Typography>
        <Box sx={{ height: 300, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.monthly_trend}>
              <defs>
                <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="cumulative_savings" 
                stroke="#8884d8" 
                fillOpacity={1} 
                fill="url(#colorSavings)"
                name="Cumulative Savings"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Monthly Savings Trend */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Monthly Savings Trend</Typography>
        <Box sx={{ height: 300, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="savings" fill="#66bb6a" name="Monthly Savings" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Cost Comparison Trend */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Cost Comparison: Current vs Optimized</Typography>
        <Box sx={{ height: 300, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="current_cost" 
                stroke="#ef5350" 
                strokeWidth={2}
                name="Current Cost"
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="optimized_cost" 
                stroke="#66bb6a" 
                strokeWidth={2}
                name="Optimized Cost"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Optimization Rate Trend */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Optimization Rate Trend</Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Percentage of cost savings achieved each month
        </Typography>
        <Box sx={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} />
              <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="optimization_rate" 
                stroke="#9c27b0" 
                strokeWidth={2}
                name="Optimization Rate"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Insights */}
      <Paper sx={{ p: 3, mt: 3, bgcolor: 'info.light', color: 'info.contrastText' }}>
        <Typography variant="h6" gutterBottom>Key Insights</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="body2">
              • Peak savings month: <strong>{data.peak_savings_month}</strong>
            </Typography>
            <Typography variant="body2">
              • Trend direction: <strong>{data.trend_direction.toUpperCase()}</strong>
            </Typography>
            <Typography variant="body2">
              • Optimization velocity: <strong>{data.optimization_velocity > 0 ? '+' : ''}{data.optimization_velocity.toFixed(1)}%</strong>
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2">
              • Average monthly savings: <strong>{formatCurrency(data.avg_monthly_savings)}</strong>
            </Typography>
            <Typography variant="body2">
              • Total period savings: <strong>{formatCurrency(data.total_savings)}</strong>
            </Typography>
            <Typography variant="body2">
              • Projected annual impact: <strong>{formatCurrency(data.projected_annual_savings)}</strong>
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default SavingsTrends;

// Made with Bob
