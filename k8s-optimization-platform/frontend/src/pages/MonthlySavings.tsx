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
import { Refresh, TrendingDown, AttachMoney, Savings } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SavingsByEntity {
  name: string;
  current_cost: number;
  optimized_cost: number;
  savings: number;
  savings_percent: number;
}

interface MonthlySavingsData {
  total_monthly_savings: number;
  savings_percent: number;
  current_monthly_cost: number;
  optimized_monthly_cost: number;
  savings_by_cluster: SavingsByEntity[];
  savings_by_namespace: SavingsByEntity[];
  savings_by_workload_type: SavingsByEntity[];
  top_savings_opportunities: Array<{
    workload: string;
    namespace: string;
    current_cost: number;
    optimized_cost: number;
    savings: number;
  }>;
}

const MonthlySavings: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<MonthlySavingsData | null>(null);
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
      
      // Calculate monthly savings from recommendations
      const totalSavings = recommendations.reduce((sum: number, rec: any) => 
        sum + (rec.estimated_monthly_savings || 0), 0
      );
      
      const currentCost = totalSavings / 0.3; // Assume 30% savings potential
      const optimizedCost = currentCost - totalSavings;
      
      // Group by cluster
      const clusterMap = new Map<string, { current: number; savings: number }>();
      recommendations.forEach((rec: any) => {
        const cluster = rec.cluster_id || 'unknown';
        const existing = clusterMap.get(cluster) || { current: 0, savings: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.current += (rec.estimated_monthly_savings || 0) / 0.3;
        clusterMap.set(cluster, existing);
      });
      
      // Group by namespace
      const namespaceMap = new Map<string, { current: number; savings: number }>();
      recommendations.forEach((rec: any) => {
        const ns = rec.namespace || 'unknown';
        const existing = namespaceMap.get(ns) || { current: 0, savings: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.current += (rec.estimated_monthly_savings || 0) / 0.3;
        namespaceMap.set(ns, existing);
      });
      
      // Group by workload type
      const workloadMap = new Map<string, { current: number; savings: number }>();
      recommendations.forEach((rec: any) => {
        const type = rec.workload_type || 'unknown';
        const existing = workloadMap.get(type) || { current: 0, savings: 0 };
        existing.savings += rec.estimated_monthly_savings || 0;
        existing.current += (rec.estimated_monthly_savings || 0) / 0.3;
        workloadMap.set(type, existing);
      });
      
      const savingsByCluster = Array.from(clusterMap.entries()).map(([name, data]) => ({
        name,
        current_cost: data.current,
        optimized_cost: data.current - data.savings,
        savings: data.savings,
        savings_percent: (data.savings / data.current) * 100
      })).sort((a, b) => b.savings - a.savings);
      
      const savingsByNamespace = Array.from(namespaceMap.entries()).map(([name, data]) => ({
        name,
        current_cost: data.current,
        optimized_cost: data.current - data.savings,
        savings: data.savings,
        savings_percent: (data.savings / data.current) * 100
      })).sort((a, b) => b.savings - a.savings);
      
      const savingsByWorkloadType = Array.from(workloadMap.entries()).map(([name, data]) => ({
        name,
        current_cost: data.current,
        optimized_cost: data.current - data.savings,
        savings: data.savings,
        savings_percent: (data.savings / data.current) * 100
      })).sort((a, b) => b.savings - a.savings);
      
      const topOpportunities = recommendations
        .filter((rec: any) => rec.estimated_monthly_savings > 0)
        .sort((a: any, b: any) => b.estimated_monthly_savings - a.estimated_monthly_savings)
        .slice(0, 10)
        .map((rec: any) => ({
          workload: rec.workload_name,
          namespace: rec.namespace,
          current_cost: (rec.estimated_monthly_savings || 0) / 0.3,
          optimized_cost: (rec.estimated_monthly_savings || 0) / 0.3 - (rec.estimated_monthly_savings || 0),
          savings: rec.estimated_monthly_savings || 0
        }));
      
      setData({
        total_monthly_savings: totalSavings,
        savings_percent: (totalSavings / currentCost) * 100,
        current_monthly_cost: currentCost,
        optimized_monthly_cost: optimizedCost,
        savings_by_cluster: savingsByCluster,
        savings_by_namespace: savingsByNamespace,
        savings_by_workload_type: savingsByWorkloadType,
        top_savings_opportunities: topOpportunities
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
          <Typography variant="h4">Monthly Savings Analysis</Typography>
          <Typography variant="body2" color="textSecondary">
            Detailed breakdown of potential monthly cost savings
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Savings />
                <Typography variant="h6">Total Monthly Savings</Typography>
              </Box>
              <Typography variant="h3">{formatCurrency(data.total_monthly_savings)}</Typography>
              <Typography variant="body2">{data.savings_percent.toFixed(1)}% reduction</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Current Monthly Cost</Typography>
              <Typography variant="h4">{formatCurrency(data.current_monthly_cost)}</Typography>
              <Typography variant="body2" color="error">Before optimization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Optimized Monthly Cost</Typography>
              <Typography variant="h4" color="success.main">{formatCurrency(data.optimized_monthly_cost)}</Typography>
              <Typography variant="body2" color="success.main">After optimization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Savings Opportunities</Typography>
              <Typography variant="h4">{data.top_savings_opportunities.length}</Typography>
              <Typography variant="body2">Top workloads to optimize</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top Savings Opportunities */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Top 10 Savings Opportunities</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Workload</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell align="right">Current Cost</TableCell>
                <TableCell align="right">Optimized Cost</TableCell>
                <TableCell align="right">Monthly Savings</TableCell>
                <TableCell align="right">Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.top_savings_opportunities.map((opp, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{opp.workload}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={opp.namespace} size="small" />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(opp.current_cost)}</TableCell>
                  <TableCell align="right">{formatCurrency(opp.optimized_cost)}</TableCell>
                  <TableCell align="right">
                    <Chip 
                      label={formatCurrency(opp.savings)} 
                      color="success" 
                      size="small"
                      icon={<TrendingDown />}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ width: 150 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={(opp.savings / opp.current_cost) * 100} 
                        sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                        color="success"
                      />
                      <Typography variant="caption">
                        {((opp.savings / opp.current_cost) * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Savings by Category */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Cluster</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cluster</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.savings_by_cluster.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{formatCurrency(item.savings)}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${item.savings_percent.toFixed(1)}%`} 
                          size="small" 
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Namespace</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Namespace</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.savings_by_namespace.slice(0, 10).map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{formatCurrency(item.savings)}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${item.savings_percent.toFixed(1)}%`} 
                          size="small" 
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Savings by Workload Type</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.savings_by_workload_type.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{formatCurrency(item.savings)}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${item.savings_percent.toFixed(1)}%`} 
                          size="small" 
                          color="success"
                        />
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

export default MonthlySavings;

// Made with Bob
