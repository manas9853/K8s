import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  IconButton,
  Alert,
  LinearProgress,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ForecastData {
  month: string;
  capacity_gi: number;
  utilization: number;
}

interface StorageForecast {
  current_capacity_gi: number;
  current_utilization_percentage: number;
  monthly_growth_rate: number;
  forecast: ForecastData[];
  recommendations: string[];
}

const StorageForecasting: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [forecastData, setForecastData] = useState<StorageForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForecasts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/storage/forecast`);
      if (!response.ok) {
        throw new Error('Failed to fetch storage forecast');
      }
      const data = await response.json();
      setForecastData(data);
    } catch (error) {
      console.error('Error fetching forecasts:', error);
      setError('Unable to load storage forecast data');
      setForecastData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecasts();
  }, [clusterParam]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'success';
    }
  };

  const getRiskLevel = () => {
    if (!forecastData) return 'low';
    const finalUtilization = forecastData.forecast[forecastData.forecast.length - 1]?.utilization || 0;
    if (finalUtilization >= 90) return 'high';
    if (finalUtilization >= 75) return 'medium';
    return 'low';
  };

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TimelineIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">Storage Forecasting</Typography>
        </Box>
        <IconButton onClick={fetchForecasts} color="primary" disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress />
          <Typography align="center" sx={{ mt: 2 }}>Loading storage forecast...</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && forecastData && (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            Storage growth predictions based on current PVC capacity across all namespaces
          </Alert>

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Current Capacity</Typography>
                  <Typography variant="h4">{forecastData.current_capacity_gi} GB</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Current Utilization</Typography>
                  <Typography variant="h4">{forecastData.current_utilization_percentage}%</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Monthly Growth Rate</Typography>
                  <Typography variant="h4">{forecastData.monthly_growth_rate}%</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Capacity Forecast</Typography>
                <Chip
                  label={`${getRiskLevel()} risk`}
                  color={getRiskColor(getRiskLevel())}
                  size="small"
                />
              </Box>
              
              <Grid container spacing={2}>
                {forecastData.forecast.map((item, index) => (
                  <Grid item xs={12} md={3} key={index}>
                    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                      <Typography color="textSecondary" variant="body2">{item.month}</Typography>
                      <Typography variant="h6">{item.capacity_gi} GB</Typography>
                      <Typography variant="body2" color={item.utilization >= 90 ? 'error' : item.utilization >= 75 ? 'warning.main' : 'success.main'}>
                        {item.utilization}% utilized
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Utilization Trend</Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(forecastData.current_utilization_percentage, 100)}
                  color={getRiskColor(getRiskLevel())}
                  sx={{ height: 10, borderRadius: 1 }}
                />
              </Box>
            </CardContent>
          </Card>

          {forecastData.recommendations.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Recommendations</Typography>
                {forecastData.recommendations.map((rec, index) => (
                  <Alert key={index} severity="info" sx={{ mb: index < forecastData.recommendations.length - 1 ? 2 : 0 }}>
                    {rec}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !error && !forecastData && (
        <Alert severity="info">
          No storage forecast data available. Please ensure PVCs are configured in your cluster.
        </Alert>
      )}
    </Box>
  );
};

export default StorageForecasting;

// Made with Bob
