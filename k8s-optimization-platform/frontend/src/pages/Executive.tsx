import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Alert,
  CircularProgress,
  Chip,
  Button,
  Paper
} from '@mui/material';
import {
  TrendingDown,
  TrendingUp,
  AttachMoney,
  Nature,
  Warning,
  CheckCircle,
  Info,
  Add as AddIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ExecutiveKPIs {
  total_monthly_spend: number;
  total_annual_spend: number;
  potential_monthly_savings: number;
  savings_realized: number;
  optimization_coverage_percent: number;
  carbon_footprint_reduction_kg: number;
  cost_trend_percent: number;
  total_nodes: number;
  total_pods: number;
  total_namespaces: number;
  total_clusters: number;
}

interface ExecutiveInsight {
  title: string;
  description: string;
  impact: string;
  category: string;
  action_required: boolean;
  estimated_savings: number | null;
  action_url?: string;
}

interface CostTrend {
  month: string;
  actual_cost: number;
  optimized_cost: number;
  savings: number;
}

interface WasteSource {
  source: string;
  type: string;
  monthly_waste: number;
  waste_percent: number;
  pods_affected: number;
}

interface ExecutiveOverview {
  kpis: ExecutiveKPIs;
  insights: ExecutiveInsight[];
  cost_trends: CostTrend[];
  top_waste_sources: WasteSource[];
  timestamp: string;
}

const Executive: React.FC = () => {
  const navigate = useNavigate();
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExecutiveOverview | null>(null);

  useEffect(() => {
    fetchExecutiveData();
  }, [clusterParam]);

  const fetchExecutiveData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/v1/executive/overview${clusterParam}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch executive data');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching executive data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high': return <Warning />;
      case 'medium': return <Info />;
      case 'low': return <CheckCircle />;
      default: return <Info />;
    }
  };

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Executive metrics are calculated from registered clusters. Connect a cluster via
          the Cluster Onboarding page and KPIs, insights and cost trends will populate automatically.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3}>
        <Alert severity="info">No data available</Alert>
      </Box>
    );
  }

  const { kpis, insights, cost_trends, top_waste_sources } = data;

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Executive Overview Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        For Leadership & FinOps Teams
      </Typography>

      {/* Infra counts row */}
      <Grid container spacing={2} sx={{ mt: 2, mb: 1 }}>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Clusters</Typography>
              <Typography variant="h5" fontWeight="bold">{kpis.total_clusters}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Nodes</Typography>
              <Typography variant="h5" fontWeight="bold">{kpis.total_nodes}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Pods</Typography>
              <Typography variant="h5" fontWeight="bold">{kpis.total_pods}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Namespaces</Typography>
              <Typography variant="h5" fontWeight="bold">{kpis.total_namespaces}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mt: 1 }}>
        {/* Total Monthly Spend */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AttachMoney color="primary" />
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Monthly Spend
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(kpis.total_monthly_spend)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Annual: {formatCurrency(kpis.total_annual_spend)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Potential Savings */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <TrendingDown color="success" />
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Potential Savings
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {formatCurrency(kpis.potential_monthly_savings)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Per month
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Savings Realized */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <CheckCircle color="success" />
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Savings Realized
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {formatCurrency(kpis.savings_realized)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This month
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Optimization Coverage */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <TrendingUp color="primary" />
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Optimization Coverage
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {kpis.optimization_coverage_percent.toFixed(1)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={kpis.optimization_coverage_percent} 
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Carbon Footprint */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Nature color="success" />
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Carbon Reduction
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {formatNumber(kpis.carbon_footprint_reduction_kg)} kg
              </Typography>
              <Typography variant="caption" color="text.secondary">
                CO₂ saved this month
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Cost Trend */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                {kpis.cost_trend_percent < 0 ? (
                  <TrendingDown color="success" />
                ) : (
                  <TrendingUp color="error" />
                )}
                <Typography variant="body2" color="text.secondary" ml={1}>
                  Cost Trend
                </Typography>
              </Box>
              <Typography 
                variant="h4" 
                fontWeight="bold"
                color={kpis.cost_trend_percent < 0 ? 'success.main' : 'error.main'}
              >
                {kpis.cost_trend_percent > 0 ? '+' : ''}{kpis.cost_trend_percent.toFixed(1)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs last month
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Executive Insights */}
      <Box mt={4}>
        <Typography variant="h5" gutterBottom fontWeight="bold">
          Executive Insights
        </Typography>
        <Grid container spacing={2}>
          {insights.map((insight, index) => (
            <Grid item xs={12} key={index}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" mb={1}>
                        {getImpactIcon(insight.impact)}
                        <Typography variant="h6" ml={1} fontWeight="bold">
                          {insight.title}
                        </Typography>
                        <Chip 
                          label={insight.impact.toUpperCase()} 
                          color={getImpactColor(insight.impact)}
                          size="small"
                          sx={{ ml: 2 }}
                        />
                        {insight.action_required && (
                          <Chip 
                            label="ACTION REQUIRED" 
                            color="error"
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {insight.description}
                      </Typography>
                      {insight.estimated_savings && (
                        <Typography variant="body2" color="success.main" fontWeight="bold">
                          Estimated Savings: {formatCurrency(insight.estimated_savings)}/month
                        </Typography>
                      )}
                    </Box>
                    {insight.action_required && (
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        sx={{ ml: 2 }}
                        onClick={() => navigate(insight.action_url || '/recommendations')}
                      >
                        Take Action
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Cost Trends */}
      <Box mt={4}>
        <Typography variant="h5" gutterBottom fontWeight="bold">
          Cost Trends (Last 6 Months)
        </Typography>
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2}>
            {cost_trends.map((trend, index) => (
              <Grid item xs={12} sm={6} md={2} key={index}>
                <Box textAlign="center">
                  <Typography variant="caption" color="text.secondary">
                    {trend.month}
                  </Typography>
                  <Typography variant="h6" fontWeight="bold">
                    {formatCurrency(trend.actual_cost)}
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    Saved: {formatCurrency(trend.savings)}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={(trend.savings / trend.actual_cost) * 100}
                    color="success"
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Box>

      {/* Top Waste Sources */}
      <Box mt={4}>
        <Typography variant="h5" gutterBottom fontWeight="bold">
          Top Waste Sources
        </Typography>
        <Grid container spacing={2}>
          {top_waste_sources.map((source, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {source.source}
                  </Typography>
                  <Chip label={source.type} size="small" sx={{ mb: 2 }} />
                  <Typography variant="h5" color="error.main" fontWeight="bold">
                    {formatCurrency(source.monthly_waste)}/mo
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {source.waste_percent.toFixed(1)}% of total waste
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {source.pods_affected} pods affected
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={source.waste_percent}
                    color="error"
                    sx={{ mt: 2 }}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};

export default Executive;

// Made with Bob
