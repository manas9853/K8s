import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { API_BASE_URL } from '../config/api';

const Benchmarking: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [clusters, setClusters] = useState<any[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [clustersRes, comparisonRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/benchmarking/clusters${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/benchmarking/comparison${clusterParam}`),
      ]);
      setClusters(await clustersRes.json());
      setComparison(await comparisonRes.json());
    } finally {
      setLoading(false);
    }
  };

  const radarData = clusters.map(c => ({
    cluster: c.cluster_name,
    'CPU Efficiency': c.metrics.cpu_efficiency,
    'Memory Efficiency': c.metrics.memory_efficiency,
    'Cost Efficiency': c.metrics.cost_efficiency,
    'Reliability': c.metrics.reliability_score,
    'Performance': c.metrics.performance_score,
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Cross-Cluster Benchmarking</Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Cluster Performance Comparison</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="cluster" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Metrics" dataKey="CPU Efficiency" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Cost Comparison</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clusters}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cluster_name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="monthly_cost" fill="#8884d8" name="Monthly Cost ($)" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cluster</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Monthly Cost</TableCell>
                <TableCell>CPU Efficiency</TableCell>
                <TableCell>Memory Efficiency</TableCell>
                <TableCell>Waste %</TableCell>
                <TableCell>Rank</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.cluster_name}>
                  <TableCell>{cluster.cluster_name}</TableCell>
                  <TableCell>
                    <Chip
                      label={cluster.overall_score}
                      color={cluster.overall_score > 80 ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell>${cluster.monthly_cost.toLocaleString()}</TableCell>
                  <TableCell>{cluster.metrics.cpu_efficiency}%</TableCell>
                  <TableCell>{cluster.metrics.memory_efficiency}%</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {cluster.metrics.waste_percentage}%
                      {cluster.metrics.waste_percentage > 20 ? (
                        <TrendingUpIcon color="error" fontSize="small" />
                      ) : (
                        <TrendingDownIcon color="success" fontSize="small" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={`#${cluster.rank}`} size="small" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {loading && <LinearProgress />}
    </Box>
  );
};

export default Benchmarking;

// Made with Bob
