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
  Chip,
  LinearProgress
} from '@mui/material';
import { Refresh, PieChart as PieChartIcon, Category } from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { API_BASE_URL } from '../config/api';

interface CostCategory {
  name: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  savings_percent: number;
  count: number;
}

interface CostBreakdownData {
  total_current_cost: number;
  total_optimized_cost: number;
  total_savings: number;
  by_resource_type: CostCategory[];
  by_namespace: CostCategory[];
  by_cluster: CostCategory[];
  by_confidence_level: CostCategory[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

const CostBreakdown: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CostBreakdownData | null>(null);
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
      
      // Calculate totals
      const totalSavings = recommendations.reduce((sum: number, rec: any) => 
        sum + (rec.estimated_monthly_savings || 0), 0
      );
      const totalCurrentCost = totalSavings / 0.3;
      const totalOptimizedCost = totalCurrentCost - totalSavings;
      
      // Group by resource type (CPU vs Memory)
      const cpuRecs = recommendations.filter((r: any) => r.status?.includes('cpu'));
      const memoryRecs = recommendations.filter((r: any) => r.status?.includes('memory'));
      const noActionRecs = recommendations.filter((r: any) => r.status === 'no_action');
      
      const cpuSavings = cpuRecs.reduce((sum: number, r: any) => sum + (r.estimated_monthly_savings || 0), 0);
      const memorySavings = memoryRecs.reduce((sum: number, r: any) => sum + (r.estimated_monthly_savings || 0), 0);
      
      const byResourceType: CostCategory[] = [
        {
          name: 'CPU Optimization',
          current_cost: cpuSavings / 0.3,
          optimized_cost: (cpuSavings / 0.3) - cpuSavings,
          savings: cpuSavings,
          savings_percent: 30,
          count: cpuRecs.length
        },
        {
          name: 'Memory Optimization',
          current_cost: memorySavings / 0.3,
          optimized_cost: (memorySavings / 0.3) - memorySavings,
          savings: memorySavings,
          savings_percent: 30,
          count: memoryRecs.length
        },
        {
          name: 'Already Optimized',
          current_cost: 0,
          optimized_cost: 0,
          savings: 0,
          savings_percent: 0,
          count: noActionRecs.length
        }
      ].filter(item => item.count > 0);
      
      // Group by namespace
      const namespaceMap = new Map<string, { savings: number; count: number }>();
      recommendations.forEach((rec: any) => {
        const ns = rec.namespace || 'unknown';
        const existing = namespaceMap.get(ns) || { savings: 0, count: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.count += 1;
        namespaceMap.set(ns, existing);
      });
      
      const byNamespace: CostCategory[] = Array.from(namespaceMap.entries())
        .map(([name, data]) => ({
          name,
          current_cost: data.savings / 0.3,
          optimized_cost: (data.savings / 0.3) - data.savings,
          savings: data.savings,
          savings_percent: 30,
          count: data.count
        }))
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 10);
      
      // Group by cluster
      const clusterMap = new Map<string, { savings: number; count: number }>();
      recommendations.forEach((rec: any) => {
        const cluster = rec.cluster_id || 'unknown';
        const existing = clusterMap.get(cluster) || { savings: 0, count: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.count += 1;
        clusterMap.set(cluster, existing);
      });
      
      const byCluster: CostCategory[] = Array.from(clusterMap.entries())
        .map(([name, data]) => ({
          name,
          current_cost: data.savings / 0.3,
          optimized_cost: (data.savings / 0.3) - data.savings,
          savings: data.savings,
          savings_percent: 30,
          count: data.count
        }))
        .sort((a, b) => b.savings - a.savings);
      
      // Group by confidence level
      const confidenceMap = new Map<string, { savings: number; count: number }>();
      recommendations.forEach((rec: any) => {
        const confidence = rec.confidence || 'unknown';
        const existing = confidenceMap.get(confidence) || { savings: 0, count: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.count += 1;
        confidenceMap.set(confidence, existing);
      });
      
      const byConfidence: CostCategory[] = Array.from(confidenceMap.entries())
        .map(([name, data]) => ({
          name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          current_cost: data.savings / 0.3,
          optimized_cost: (data.savings / 0.3) - data.savings,
          savings: data.savings,
          savings_percent: 30,
          count: data.count
        }))
        .sort((a, b) => b.savings - a.savings);
      
      setData({
        total_current_cost: totalCurrentCost,
        total_optimized_cost: totalOptimizedCost,
        total_savings: totalSavings,
        by_resource_type: byResourceType,
        by_namespace: byNamespace,
        by_cluster: byCluster,
        by_confidence_level: byConfidence
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

  const pieData = data.by_resource_type.map(item => ({
    name: item.name,
    value: item.savings,
    count: item.count
  }));

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Cost Breakdown Analysis</Typography>
          <Typography variant="body2" color="textSecondary">
            Detailed cost analysis by category, namespace, and resource type
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Current Cost</Typography>
              <Typography variant="h4">{formatCurrency(data.total_current_cost)}</Typography>
              <Typography variant="body2" color="error">Monthly baseline</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Optimized Cost</Typography>
              <Typography variant="h4" color="success.main">{formatCurrency(data.total_optimized_cost)}</Typography>
              <Typography variant="body2" color="success.main">After optimization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Category />
                <Typography variant="h6">Total Savings</Typography>
              </Box>
              <Typography variant="h4">{formatCurrency(data.total_savings)}</Typography>
              <Typography variant="body2">
                {((data.total_savings / data.total_current_cost) * 100).toFixed(1)}% reduction
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resource Type Breakdown */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Resource Type</Typography>
            <Box sx={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Resource Type Details</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.by_resource_type.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Chip 
                          label={item.name} 
                          size="small"
                          sx={{ bgcolor: COLORS[idx % COLORS.length], color: 'white' }}
                        />
                      </TableCell>
                      <TableCell align="right">{item.count}</TableCell>
                      <TableCell align="right">{formatCurrency(item.savings)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={(item.savings / data.total_savings) * 100} 
                            sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="caption">
                            {((item.savings / data.total_savings) * 100).toFixed(0)}%
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

      {/* Namespace Breakdown */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Top 10 Namespaces by Savings Potential</Typography>
        <Box sx={{ height: 300, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_namespace}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="current_cost" fill="#ef5350" name="Current Cost" />
              <Bar dataKey="savings" fill="#66bb6a" name="Savings" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Detailed Tables */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Cluster</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cluster</TableCell>
                    <TableCell align="right">Workloads</TableCell>
                    <TableCell align="right">Current</TableCell>
                    <TableCell align="right">Savings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.by_cluster.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{item.count}</TableCell>
                      <TableCell align="right">{formatCurrency(item.current_cost)}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={formatCurrency(item.savings)} 
                          color="success" 
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Confidence Level</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Confidence</TableCell>
                    <TableCell align="right">Count</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.by_confidence_level.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Chip 
                          label={item.name} 
                          size="small"
                          color={
                            item.name.includes('Low') ? 'success' :
                            item.name.includes('Medium') ? 'warning' : 'error'
                          }
                        />
                      </TableCell>
                      <TableCell align="right">{item.count}</TableCell>
                      <TableCell align="right">{formatCurrency(item.savings)}</TableCell>
                      <TableCell align="right">
                        {((item.savings / data.total_savings) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default CostBreakdown;

// Made with Bob
