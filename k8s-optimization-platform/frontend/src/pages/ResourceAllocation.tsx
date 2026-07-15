import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Paper,
  Chip
} from '@mui/material';
import {
  Memory,
  Speed,
  Storage,
  TrendingDown,
  CheckCircle
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface Recommendation {
  cluster_id: string;
  namespace: string;
  workload_type: string;
  workload_name: string;
  status: string;
  confidence: string;
  cpu: {
    cpu_saved: number;
    cost_saved: number;
  };
  memory: {
    memory_saved: number;
    cost_saved: number;
  };
  estimated_monthly_savings: number;
}

const ResourceAllocation: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, [clusterParam]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations/${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      setRecommendations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = () => {
    const totalCPUSaved = recommendations.reduce((sum, rec) => sum + rec.cpu.cpu_saved, 0);
    const totalMemorySaved = recommendations.reduce((sum, rec) => sum + rec.memory.memory_saved, 0);
    const totalCostSaved = recommendations.reduce((sum, rec) => sum + rec.estimated_monthly_savings, 0);
    
    const cpuRecommendations = recommendations.filter(r => 
      r.status === 'reduce_cpu' || r.status === 'increase_cpu'
    ).length;
    
    const memoryRecommendations = recommendations.filter(r => 
      r.status === 'reduce_memory' || r.status === 'increase_memory'
    ).length;
    
    const lowRiskCount = recommendations.filter(r => r.confidence === 'low_risk').length;
    const mediumRiskCount = recommendations.filter(r => r.confidence === 'medium_risk').length;
    const highRiskCount = recommendations.filter(r => r.confidence === 'high_risk').length;
    
    return {
      totalCPUSaved,
      totalMemorySaved,
      totalCostSaved,
      cpuRecommendations,
      memoryRecommendations,
      lowRiskCount,
      mediumRiskCount,
      highRiskCount
    };
  };

  const formatCPU = (cores: number) => {
    if (cores < 1) {
      return `${Math.round(cores * 1000)}m`;
    }
    return `${cores.toFixed(2)} cores`;
  };

  const formatMemory = (mb: number) => {
    if (mb < 1024) {
      return `${Math.round(mb)} MiB`;
    }
    return `${(mb / 1024).toFixed(2)} GiB`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const metrics = calculateMetrics();

  return (
    <Box>
      <CostAccuracyBanner clusterName={activeClusterId === 'all' ? null : activeClusterId} />
      <Typography variant="h4" gutterBottom>
        Resource Allocation Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Comprehensive view of all resource optimization opportunities
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Total Savings */}
      <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={8}>
            <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>
              Total Potential Monthly Savings
            </Typography>
            <Typography variant="h2" sx={{ color: 'white', fontWeight: 'bold' }}>
              {formatCurrency(metrics.totalCostSaved)}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mt: 1 }}>
              From {recommendations.length} optimization opportunities
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box textAlign="center">
              <TrendingDown sx={{ fontSize: 80, color: 'white', opacity: 0.8 }} />
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Resource Breakdown */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Speed sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                <Typography variant="h6">CPU Optimization</Typography>
              </Box>
              <Typography variant="h4" color="success.main" gutterBottom>
                {formatCPU(metrics.totalCPUSaved)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Can be reclaimed
              </Typography>
              <Chip 
                label={`${metrics.cpuRecommendations} recommendations`}
                size="small"
                color="primary"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Memory sx={{ fontSize: 40, color: 'secondary.main', mr: 2 }} />
                <Typography variant="h6">Memory Optimization</Typography>
              </Box>
              <Typography variant="h4" color="success.main" gutterBottom>
                {formatMemory(metrics.totalMemorySaved)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Can be reclaimed
              </Typography>
              <Chip 
                label={`${metrics.memoryRecommendations} recommendations`}
                size="small"
                color="secondary"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <CheckCircle sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                <Typography variant="h6">Risk Assessment</Typography>
              </Box>
              <Box mt={2}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">Low Risk</Typography>
                  <Chip label={metrics.lowRiskCount} size="small" color="success" />
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">Medium Risk</Typography>
                  <Chip label={metrics.mediumRiskCount} size="small" color="warning" />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">High Risk</Typography>
                  <Chip label={metrics.highRiskCount} size="small" color="error" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recommended Actions
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Start with
                </Typography>
                <Typography variant="h6" color="success.main">
                  Low Risk Items
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {metrics.lowRiskCount} safe optimizations
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Focus on
                </Typography>
                <Typography variant="h6" color="primary.main">
                  CPU Rightsizing
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {metrics.cpuRecommendations} workloads
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Review
                </Typography>
                <Typography variant="h6" color="secondary.main">
                  Memory Usage
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {metrics.memoryRecommendations} workloads
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Potential Savings
                </Typography>
                <Typography variant="h6" color="success.main">
                  {formatCurrency(metrics.totalCostSaved * 12)}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Annual savings
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ResourceAllocation;

// Made with Bob
