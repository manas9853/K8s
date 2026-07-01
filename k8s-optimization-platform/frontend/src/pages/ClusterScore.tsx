import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface ClusterScoreData {
  cluster_name: string;
  overall_score: number;
  cpu_efficiency: number;
  memory_efficiency: number;
  storage_efficiency: number;
  node_utilization: number;
  cleanup_status: number;
  grade: string;
  status: string;
  recommendations_count: number;
  issues_count: number;
}

const ClusterScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [clusters, setClusters] = useState<ClusterScoreData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/scoring/cluster-score');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (error) {
      console.error('Error fetching cluster scores:', error);
      // Mock data
      setClusters([
        {
          cluster_name: 'prod-cluster-us-east',
          overall_score: 92,
          cpu_efficiency: 88,
          memory_efficiency: 90,
          storage_efficiency: 95,
          node_utilization: 92,
          cleanup_status: 98,
          grade: 'A',
          status: 'excellent',
          recommendations_count: 3,
          issues_count: 1,
        },
        {
          cluster_name: 'prod-cluster-eu-west',
          overall_score: 78,
          cpu_efficiency: 75,
          memory_efficiency: 80,
          storage_efficiency: 78,
          node_utilization: 76,
          cleanup_status: 82,
          grade: 'B',
          status: 'good',
          recommendations_count: 8,
          issues_count: 3,
        },
        {
          cluster_name: 'staging-cluster',
          overall_score: 58,
          cpu_efficiency: 52,
          memory_efficiency: 60,
          storage_efficiency: 58,
          node_utilization: 55,
          cleanup_status: 65,
          grade: 'D',
          status: 'needs_improvement',
          recommendations_count: 15,
          issues_count: 8,
        },
        {
          cluster_name: 'dev-cluster',
          overall_score: 65,
          cpu_efficiency: 62,
          memory_efficiency: 68,
          storage_efficiency: 65,
          node_utilization: 63,
          cleanup_status: 70,
          grade: 'C',
          status: 'fair',
          recommendations_count: 12,
          issues_count: 5,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 50) return 'warning';
    return 'error';
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'success';
      case 'B': return 'info';
      case 'C': return 'warning';
      default: return 'error';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircleIcon color="success" />;
      case 'good': return <CheckCircleIcon color="info" />;
      case 'fair': return <WarningIcon color="warning" />;
      default: return <ErrorIcon color="error" />;
    }
  };

  const avgScore = clusters.length > 0
    ? clusters.reduce((sum, c) => sum + c.overall_score, 0) / clusters.length
    : 0;
  const excellentClusters = clusters.filter(c => c.overall_score >= 90).length;
  const needsImprovement = clusters.filter(c => c.overall_score < 70).length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cluster Optimization Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Overall health and efficiency scores for all clusters
          </Typography>
        </Box>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Score
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={avgScore}
                    size={60}
                    color={getScoreColor(avgScore)}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h6" component="div">
                      {avgScore.toFixed(0)}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Across all clusters
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Excellent Clusters
              </Typography>
              <Typography variant="h4" color="success.main">
                {excellentClusters}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Score ≥ 90
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Needs Improvement
              </Typography>
              <Typography variant="h4" color="error.main">
                {needsImprovement}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Score {'<'} 70
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Clusters
              </Typography>
              <Typography variant="h4" color="primary.main">
                {clusters.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Being monitored
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Cluster Scores Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Cluster Score Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cluster Name</TableCell>
                <TableCell align="center">Overall Score</TableCell>
                <TableCell align="center">Grade</TableCell>
                <TableCell align="center">CPU Efficiency</TableCell>
                <TableCell align="center">Memory Efficiency</TableCell>
                <TableCell align="center">Storage Efficiency</TableCell>
                <TableCell align="center">Node Utilization</TableCell>
                <TableCell align="center">Cleanup Status</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Issues</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.cluster_name} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {cluster.cluster_name}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={cluster.overall_score}
                          size={50}
                          color={getScoreColor(cluster.overall_score)}
                        />
                        <Box
                          sx={{
                            top: 0,
                            left: 0,
                            bottom: 0,
                            right: 0,
                            position: 'absolute',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Typography variant="caption" component="div">
                            {cluster.overall_score}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={cluster.grade}
                      color={getGradeColor(cluster.grade)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.cpu_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.cpu_efficiency}
                        color={getScoreColor(cluster.cpu_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.memory_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.memory_efficiency}
                        color={getScoreColor(cluster.memory_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.storage_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.storage_efficiency}
                        color={getScoreColor(cluster.storage_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.node_utilization}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.node_utilization}
                        color={getScoreColor(cluster.node_utilization)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {cluster.cleanup_status}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={cluster.cleanup_status}
                        color={getScoreColor(cluster.cleanup_status)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    {getStatusIcon(cluster.status)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {cluster.recommendations_count} recommendations
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      {cluster.issues_count} issues
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default ClusterScore;

// Made with Bob
