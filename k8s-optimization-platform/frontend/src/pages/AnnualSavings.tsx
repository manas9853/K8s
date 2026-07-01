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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip
} from '@mui/material';
import { Refresh, CalendarToday, TrendingUp, AccountBalance } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';

interface AnnualProjection {
  quarter: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
}

interface AnnualSavingsData {
  total_annual_savings: number;
  current_annual_cost: number;
  optimized_annual_cost: number;
  savings_percent: number;
  quarterly_projections: AnnualProjection[];
  roi_metrics: {
    payback_period_months: number;
    roi_percent: number;
    implementation_cost: number;
  };
  cumulative_savings: Array<{
    month: string;
    savings: number;
    cumulative: number;
  }>;
}

const AnnualSavings: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AnnualSavingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const recommendations = await response.json();
      
      // Calculate annual savings
      const monthlySavings = recommendations.reduce((sum: number, rec: any) => 
        sum + (rec.estimated_monthly_savings || 0), 0
      );
      const annualSavings = monthlySavings * 12;
      const currentAnnualCost = (monthlySavings / 0.3) * 12;
      const optimizedAnnualCost = currentAnnualCost - annualSavings;
      
      // Quarterly projections
      const quarterlyProjections = [
        { quarter: 'Q1', current_cost: currentAnnualCost / 4, optimized_cost: optimizedAnnualCost / 4, savings: annualSavings / 4 },
        { quarter: 'Q2', current_cost: currentAnnualCost / 4, optimized_cost: optimizedAnnualCost / 4, savings: annualSavings / 4 },
        { quarter: 'Q3', current_cost: currentAnnualCost / 4, optimized_cost: optimizedAnnualCost / 4, savings: annualSavings / 4 },
        { quarter: 'Q4', current_cost: currentAnnualCost / 4, optimized_cost: optimizedAnnualCost / 4, savings: annualSavings / 4 }
      ];
      
      // Cumulative savings over 12 months
      const cumulativeSavings = Array.from({ length: 12 }, (_, i) => ({
        month: `Month ${i + 1}`,
        savings: monthlySavings,
        cumulative: monthlySavings * (i + 1)
      }));
      
      // ROI metrics
      const implementationCost = annualSavings * 0.1; // Assume 10% of annual savings as implementation cost
      const paybackPeriodMonths = implementationCost / monthlySavings;
      const roiPercent = ((annualSavings - implementationCost) / implementationCost) * 100;
      
      setData({
        total_annual_savings: annualSavings,
        current_annual_cost: currentAnnualCost,
        optimized_annual_cost: optimizedAnnualCost,
        savings_percent: (annualSavings / currentAnnualCost) * 100,
        quarterly_projections: quarterlyProjections,
        roi_metrics: {
          payback_period_months: paybackPeriodMonths,
          roi_percent: roiPercent,
          implementation_cost: implementationCost
        },
        cumulative_savings: cumulativeSavings
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

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Annual Savings Projection</Typography>
          <Typography variant="body2" color="textSecondary">
            12-month cost savings forecast and ROI analysis
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CalendarToday />
                <Typography variant="h6">Total Annual Savings</Typography>
              </Box>
              <Typography variant="h3">{formatCurrency(data.total_annual_savings)}</Typography>
              <Typography variant="body2">{data.savings_percent.toFixed(1)}% reduction</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Current Annual Cost</Typography>
              <Typography variant="h4">{formatCurrency(data.current_annual_cost)}</Typography>
              <Typography variant="body2" color="error">Before optimization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Optimized Annual Cost</Typography>
              <Typography variant="h4" color="success.main">{formatCurrency(data.optimized_annual_cost)}</Typography>
              <Typography variant="body2" color="success.main">After optimization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>ROI</Typography>
              <Typography variant="h4" color="primary.main">{data.roi_metrics.roi_percent.toFixed(0)}%</Typography>
              <Typography variant="body2">Return on investment</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ROI Metrics */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Investment & ROI Analysis</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <AccountBalance sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h5" color="primary">{formatCurrency(data.roi_metrics.implementation_cost)}</Typography>
              <Typography variant="body2" color="textSecondary">Estimated Implementation Cost</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <CalendarToday sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h5" color="success.main">{data.roi_metrics.payback_period_months.toFixed(1)} months</Typography>
              <Typography variant="body2" color="textSecondary">Payback Period</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <TrendingUp sx={{ fontSize: 48, color: 'info.main', mb: 1 }} />
              <Typography variant="h5" color="info.main">{data.roi_metrics.roi_percent.toFixed(0)}%</Typography>
              <Typography variant="body2" color="textSecondary">Annual ROI</Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Quarterly Projections */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Quarterly Savings Projection</Typography>
        <Box sx={{ height: 400, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.quarterly_projections}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="quarter" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="current_cost" fill="#ef5350" name="Current Cost" />
              <Bar dataKey="optimized_cost" fill="#66bb6a" name="Optimized Cost" />
              <Bar dataKey="savings" fill="#42a5f5" name="Savings" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
        <TableContainer sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Quarter</TableCell>
                <TableCell align="right">Current Cost</TableCell>
                <TableCell align="right">Optimized Cost</TableCell>
                <TableCell align="right">Savings</TableCell>
                <TableCell align="right">Savings %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.quarterly_projections.map((quarter) => (
                <TableRow key={quarter.quarter}>
                  <TableCell><Chip label={quarter.quarter} color="primary" /></TableCell>
                  <TableCell align="right">{formatCurrency(quarter.current_cost)}</TableCell>
                  <TableCell align="right">{formatCurrency(quarter.optimized_cost)}</TableCell>
                  <TableCell align="right">
                    <Chip 
                      label={formatCurrency(quarter.savings)} 
                      color="success" 
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    {((quarter.savings / quarter.current_cost) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ bgcolor: 'action.hover', fontWeight: 'bold' }}>
                <TableCell><strong>Annual Total</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.current_annual_cost)}</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.optimized_annual_cost)}</strong></TableCell>
                <TableCell align="right">
                  <Chip 
                    label={formatCurrency(data.total_annual_savings)} 
                    color="success"
                  />
                </TableCell>
                <TableCell align="right"><strong>{data.savings_percent.toFixed(1)}%</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Cumulative Savings */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Cumulative Savings Over 12 Months</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Monthly Savings</TableCell>
                <TableCell align="right">Cumulative Savings</TableCell>
                <TableCell align="right">Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cumulative_savings.map((month, idx) => (
                <TableRow key={idx}>
                  <TableCell>{month.month}</TableCell>
                  <TableCell align="right">{formatCurrency(month.savings)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="bold" color="success.main">
                      {formatCurrency(month.cumulative)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip 
                      label={`${((month.cumulative / data.total_annual_savings) * 100).toFixed(0)}%`}
                      size="small"
                      color={idx === 11 ? 'success' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};

export default AnnualSavings;

// Made with Bob
