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

interface BenchmarkMetric {
  name: string;
  value: number;
  unit: string;
  percentile: number;
  industry_average: number;
  best_practice: number;
}

interface ClusterBenchmark {
  cluster_name: string;
  provider?: string;
  region?: string;
  benchmark_date: string;
  overall_score: number;
  grade: string;
  metrics: BenchmarkMetric[];
  strengths: string[];
  weaknesses: string[];
  comparison: {
    vs_industry_average: string;
    vs_best_practice: string;
    rank: string;
  };
}

const Benchmarking: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [clusters, setClusters] = useState<ClusterBenchmark[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/clusters/benchmarking/all${clusterParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ClusterBenchmark[] = await res.json();
      setClusters(data);
    } catch (err) {
      console.error('Error fetching benchmarking data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMetricValue = (cluster: ClusterBenchmark, name: string): number => {
    const m = cluster.metrics.find(x => x.name.toLowerCase().includes(name.toLowerCase()));
    return m ? m.value : cluster.overall_score;
  };

  const radarData = clusters.map(c => ({
    cluster: c.cluster_name,
    'Resource Efficiency': getMetricValue(c, 'resource'),
    'Cost Optimization': getMetricValue(c, 'cost'),
    'Reliability': getMetricValue(c, 'reliab'),
  }));

  const barData = clusters.map(c => ({
    cluster_name: c.cluster_name,
    overall_score: c.overall_score,
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Cross-Cluster Benchmarking</Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Cluster Performance Comparison</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="cluster" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Resource Efficiency" dataKey="Resource Efficiency" stroke="#8884d8" fill="#8884d8" fillOpacity={0.4} />
                <Radar name="Cost Optimization" dataKey="Cost Optimization" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.4} />
                <Radar name="Reliability" dataKey="Reliability" stroke="#ffc658" fill="#ffc658" fillOpacity={0.4} />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Overall Score Comparison</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cluster_name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="overall_score" fill="#1a56db" name="Overall Score" />
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
                <TableCell>Grade</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Resource Efficiency</TableCell>
                <TableCell>Cost Optimization</TableCell>
                <TableCell>Reliability</TableCell>
                <TableCell>vs Industry Avg</TableCell>
                <TableCell>Rank</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clusters.map((cluster) => {
                const resourceEff = getMetricValue(cluster, 'resource');
                const costOpt = getMetricValue(cluster, 'cost');
                const reliability = getMetricValue(cluster, 'reliab');
                const vsAvg = cluster.comparison.vs_industry_average;
                const isPositive = !vsAvg.startsWith('-');
                return (
                  <TableRow key={cluster.cluster_name}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">{cluster.cluster_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cluster.provider ?? 'k8s'} {cluster.region ? `• ${cluster.region}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cluster.grade}
                        color={cluster.grade.startsWith('A') ? 'success' : cluster.grade === 'B' ? 'info' : cluster.grade === 'C' ? 'warning' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cluster.overall_score.toFixed(1)}
                        color={cluster.overall_score >= 85 ? 'success' : cluster.overall_score >= 70 ? 'info' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{resourceEff.toFixed(1)}%</TableCell>
                    <TableCell>{costOpt.toFixed(1)}</TableCell>
                    <TableCell>{reliability.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isPositive ? (
                          <TrendingUpIcon color="success" fontSize="small" />
                        ) : (
                          <TrendingDownIcon color="error" fontSize="small" />
                        )}
                        <Typography variant="body2" color={isPositive ? 'success.main' : 'error.main'}>
                          {vsAvg}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={cluster.comparison.rank} size="small" variant="outlined" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default Benchmarking;

// Made with Bob
