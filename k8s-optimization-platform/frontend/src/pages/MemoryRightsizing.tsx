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

interface MemoryRecommendation {
  current_usage: number;
  peak_usage: number;
  current_request: number;
  current_limit: number;
  recommended_request: number;
  recommended_limit: number;
  memory_saved: number;
  cost_saved: number;
}

interface Recommendation {
  cluster_id: string;
  namespace: string;
  workload_type: string;
  workload_name: string;
  status: string;
  confidence: string;
  memory: MemoryRecommendation;
  estimated_monthly_savings: number;
  performance_impact: string;
}

const MemoryRightsizing: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMemoryRecommendations();
  }, [clusterParam]);

  const fetchMemoryRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      
      // Filter for Memory-related recommendations
      const memoryRecs = data.filter((rec: Recommendation) => 
        rec.status === 'reduce_memory' || rec.status === 'increase_memory'
      );
      
      setRecommendations(memoryRecs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    const totalMemorySaved = recommendations.reduce((sum, rec) => sum + rec.memory.memory_saved, 0);
    const totalCostSaved = recommendations.reduce((sum, rec) => sum + rec.memory.cost_saved, 0);
    const overProvisionedCount = recommendations.filter(r => r.status === 'reduce_memory').length;
    const underProvisionedCount = recommendations.filter(r => r.status === 'increase_memory').length;
    
    return { totalMemorySaved, totalCostSaved, overProvisionedCount, underProvisionedCount };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reduce_memory': return 'success';
      case 'increase_memory': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reduce_memory': return <TrendingDown />;
      case 'increase_memory': return <TrendingUp />;
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
        Memory Rightsizing Recommendations
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Optimize memory allocations based on actual usage and peak patterns
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
                Total Memory Savings
              </Typography>
              <Typography variant="h4">
                {formatMemory(totals.totalMemorySaved)}
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
                workloads need more memory
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
                requiring memory optimization
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
              <TableCell>Peak Usage</TableCell>
              <TableCell>Current Request</TableCell>
              <TableCell>Recommended Request</TableCell>
              <TableCell>Memory Saved</TableCell>
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
                      {formatMemory(rec.memory.current_usage)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((rec.memory.current_usage / rec.memory.current_request) * 100, 100)}
                      sx={{ mt: 0.5, height: 6, borderRadius: 1 }}
                    />
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="warning.main">
                    {formatMemory(rec.memory.peak_usage)}
                  </Typography>
                </TableCell>
                <TableCell>{formatMemory(rec.memory.current_request)}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={rec.status === 'reduce_memory' ? 'success.main' : 'warning.main'}
                    fontWeight="medium"
                  >
                    {formatMemory(rec.memory.recommended_request)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={rec.memory.memory_saved > 0 ? 'success.main' : 'error.main'}
                  >
                    {rec.memory.memory_saved > 0 ? '+' : ''}{formatMemory(Math.abs(rec.memory.memory_saved))}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {formatCurrency(rec.memory.cost_saved)}
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
            No Memory Optimization Needed
          </Typography>
          <Typography color="text.secondary">
            All workloads have optimal memory allocations
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default MemoryRightsizing;

// Made with Bob
