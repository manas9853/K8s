import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

interface OptimizationRecommendation {
  id: string;
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: string;
  savings: string;
  risk: string;
  priority: number;
}

interface AdvisorData {
  summary: {
    total_recommendations: number;
    high_priority: number;
    estimated_monthly_savings: string;
    quick_wins: number;
  };
  recommendations: OptimizationRecommendation[];
}

const OptimizationAdvisor: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/copilot/optimization-advisor');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch optimization recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      default: return 'default';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high': return <TrendingUpIcon color="success" />;
      case 'medium': return <TrendingUpIcon color="warning" />;
      case 'low': return <TrendingDownIcon color="action" />;
      default: return <InfoIcon />;
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Optimization Advisor</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Optimization Advisor</Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Optimization Advisor
          </Typography>
          <Typography variant="body1" color="text.secondary">
            AI-powered recommendations to optimize your Kubernetes infrastructure
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Recommendations
              </Typography>
              <Typography variant="h4">
                {data.summary.total_recommendations}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                High Priority
              </Typography>
              <Typography variant="h4" color="error">
                {data.summary.high_priority}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Est. Monthly Savings
              </Typography>
              <Typography variant="h4" color="success.main">
                {data.summary.estimated_monthly_savings}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Quick Wins
              </Typography>
              <Typography variant="h4" color="primary">
                {data.summary.quick_wins}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recommendations Table */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Optimization Recommendations
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Priority</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Recommendation</TableCell>
                <TableCell>Impact</TableCell>
                <TableCell>Effort</TableCell>
                <TableCell>Savings</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recommendations.map((rec) => (
                <TableRow key={rec.id} hover>
                  <TableCell>
                    <Chip
                      label={rec.priority}
                      size="small"
                      color={rec.priority <= 2 ? 'error' : rec.priority <= 4 ? 'warning' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={rec.category} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {rec.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {rec.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {getImpactIcon(rec.impact)}
                      <Typography variant="body2">{rec.impact}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{rec.effort}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="success.main" fontWeight="medium">
                      {rec.savings}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={rec.risk}
                      size="small"
                      color={getRiskColor(rec.risk)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CheckCircleIcon />}
                    >
                      Apply
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Legend */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Legend
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              <strong>Impact:</strong> Expected improvement in performance or cost
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              <strong>Effort:</strong> Time and resources required to implement
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              <strong>Risk:</strong> Potential impact on system stability
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              <strong>Quick Wins:</strong> Low effort, high impact recommendations
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default OptimizationAdvisor;

// Made with Bob
