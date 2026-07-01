import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  LinearProgress,
  Tooltip
} from '@mui/material';
import {
  TrendingDown,
  TrendingUp,
  CheckCircle,
  Warning
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface CPURecommendation {
  current_usage: number;
  current_request: number;
  current_limit: number;
  recommended_request: number;
  recommended_limit: number;
  cpu_saved: number;
  cost_saved: number;
}

interface Recommendation {
  cluster_id: string;
  namespace: string;
  workload_type: string;
  workload_name: string;
  status: string;
  confidence: string;
  cpu: CPURecommendation;
  estimated_monthly_savings: number;
  performance_impact: string;
}

const CPURightsizing: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCPURecommendations();
  }, [clusterParam]);

  const fetchCPURecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      
      // Filter for CPU-related recommendations
      const cpuRecs = data.filter((rec: Recommendation) => 
        rec.status === 'reduce_cpu' || rec.status === 'increase_cpu'
      );
      
      setRecommendations(cpuRecs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    const totalCPUSaved = recommendations.reduce((sum, rec) => sum + rec.cpu.cpu_saved, 0);
    const totalCostSaved = recommendations.reduce((sum, rec) => sum + rec.cpu.cost_saved, 0);
    const overProvisionedCount = recommendations.filter(r => r.status === 'reduce_cpu').length;
    const underProvisionedCount = recommendations.filter(r => r.status === 'increase_cpu').length;
    
    return { totalCPUSaved, totalCostSaved, overProvisionedCount, underProvisionedCount };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reduce_cpu': return 'success';
      case 'increase_cpu': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reduce_cpu': return <TrendingDown />;
      case 'increase_cpu': return <TrendingUp />;
      default: return <CheckCircle />;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'low_risk': return 'success';
      case 'medium_risk': return 'warning';
      case 'high_risk': return 'error';
      default: return 'default';
    }
  };

  const formatCPU = (cores: number) => {
    if (cores < 1) {
      return `${Math.round(cores * 1000)}m`;
    }
    return `${cores.toFixed(2)} cores`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const totals = calculateTotals();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        CPU Rightsizing Recommendations
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Optimize CPU allocations based on actual usage patterns
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total CPU Savings
              </Typography>
              <Typography variant="h4">
                {formatCPU(totals.totalCPUSaved)}
              </Typography>
              <Typography variant="body2" color="success.main">
                {formatCurrency(totals.totalCostSaved)}/month
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Over-Provisioned
              </Typography>
              <Typography variant="h4" color="success.main">
                {totals.overProvisionedCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                workloads can be reduced
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Under-Provisioned
              </Typography>
              <Typography variant="h4" color="warning.main">
                {totals.underProvisionedCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                workloads need more CPU
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Workloads
              </Typography>
              <Typography variant="h4">
                {recommendations.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                requiring CPU optimization
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recommendations Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Workload</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Current Usage</TableCell>
              <TableCell>Current Request</TableCell>
              <TableCell>Recommended Request</TableCell>
              <TableCell>CPU Saved</TableCell>
              <TableCell>Monthly Savings</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Confidence</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recommendations.map((rec, index) => (
              <TableRow key={index} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {rec.workload_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rec.workload_type}
                  </Typography>
                </TableCell>
                <TableCell>{rec.namespace}</TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">
                      {formatCPU(rec.cpu.current_usage)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((rec.cpu.current_usage / rec.cpu.current_request) * 100, 100)}
                      sx={{ mt: 0.5, height: 6, borderRadius: 1 }}
                    />
                  </Box>
                </TableCell>
                <TableCell>{formatCPU(rec.cpu.current_request)}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={rec.status === 'reduce_cpu' ? 'success.main' : 'warning.main'}
                    fontWeight="medium"
                  >
                    {formatCPU(rec.cpu.recommended_request)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={rec.cpu.cpu_saved > 0 ? 'success.main' : 'error.main'}
                  >
                    {rec.cpu.cpu_saved > 0 ? '+' : ''}{formatCPU(Math.abs(rec.cpu.cpu_saved))}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {formatCurrency(rec.cpu.cost_saved)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getStatusIcon(rec.status)}
                    label={rec.status.replace('_', ' ').toUpperCase()}
                    color={getStatusColor(rec.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={rec.performance_impact}>
                    <Chip
                      label={rec.confidence.replace('_', ' ').toUpperCase()}
                      color={getConfidenceColor(rec.confidence)}
                      size="small"
                    />
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {recommendations.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No CPU Optimization Needed
          </Typography>
          <Typography color="text.secondary">
            All workloads have optimal CPU allocations
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default CPURightsizing;

// Made with Bob
