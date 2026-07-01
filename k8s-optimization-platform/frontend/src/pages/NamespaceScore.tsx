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
  TextField,
  MenuItem,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface NamespaceScoreData {
  namespace: string;
  cluster: string;
  overall_score: number;
  cpu_efficiency: number;
  memory_efficiency: number;
  storage_efficiency: number;
  pod_health: number;
  resource_utilization: number;
  grade: string;
  status: string;
  pod_count: number;
  issues_count: number;
}

const NamespaceScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [namespaces, setNamespaces] = useState<NamespaceScoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/scoring/namespace-score');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNamespaces(data.namespaces || []);
    } catch (error) {
      console.error('Error fetching namespace scores:', error);
      // Mock data
      setNamespaces([
        {
          namespace: 'production',
          cluster: 'prod-cluster-us-east',
          overall_score: 95,
          cpu_efficiency: 92,
          memory_efficiency: 94,
          storage_efficiency: 98,
          pod_health: 96,
          resource_utilization: 94,
          grade: 'A',
          status: 'excellent',
          pod_count: 45,
          issues_count: 1,
        },
        {
          namespace: 'analytics',
          cluster: 'prod-cluster-us-east',
          overall_score: 62,
          cpu_efficiency: 58,
          memory_efficiency: 65,
          storage_efficiency: 62,
          pod_health: 68,
          resource_utilization: 60,
          grade: 'C',
          status: 'fair',
          pod_count: 32,
          issues_count: 8,
        },
        {
          namespace: 'payments',
          cluster: 'prod-cluster-us-east',
          overall_score: 82,
          cpu_efficiency: 80,
          memory_efficiency: 84,
          storage_efficiency: 82,
          pod_health: 85,
          resource_utilization: 80,
          grade: 'B',
          status: 'good',
          pod_count: 28,
          issues_count: 3,
        },
        {
          namespace: 'frontend',
          cluster: 'prod-cluster-us-east',
          overall_score: 88,
          cpu_efficiency: 85,
          memory_efficiency: 90,
          storage_efficiency: 88,
          pod_health: 90,
          resource_utilization: 87,
          grade: 'B',
          status: 'good',
          pod_count: 22,
          issues_count: 2,
        },
        {
          namespace: 'staging',
          cluster: 'staging-cluster',
          overall_score: 55,
          cpu_efficiency: 52,
          memory_efficiency: 58,
          storage_efficiency: 55,
          pod_health: 60,
          resource_utilization: 50,
          grade: 'D',
          status: 'needs_improvement',
          pod_count: 18,
          issues_count: 12,
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

  const clusters = ['all', ...Array.from(new Set(namespaces.map(ns => ns.cluster)))];
  const filteredNamespaces = selectedCluster === 'all'
    ? namespaces
    : namespaces.filter(ns => ns.cluster === selectedCluster);

  const avgScore = filteredNamespaces.length > 0
    ? filteredNamespaces.reduce((sum, ns) => sum + ns.overall_score, 0) / filteredNamespaces.length
    : 0;
  const excellentNamespaces = filteredNamespaces.filter(ns => ns.overall_score >= 90).length;
  const needsImprovement = filteredNamespaces.filter(ns => ns.overall_score < 70).length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Namespace Optimization Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Efficiency scores by namespace
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            select
            size="small"
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            sx={{ minWidth: 200 }}
            label="Filter by Cluster"
          >
            {clusters.map((cluster) => (
              <MenuItem key={cluster} value={cluster}>
                {cluster === 'all' ? 'All Clusters' : cluster}
              </MenuItem>
            ))}
          </TextField>
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
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
                  Across namespaces
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Excellent Namespaces
              </Typography>
              <Typography variant="h4" color="success.main">
                {excellentNamespaces}
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
                Total Namespaces
              </Typography>
              <Typography variant="h4" color="primary.main">
                {filteredNamespaces.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Being monitored
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Namespace Scores Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Namespace Score Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Namespace</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell align="center">Overall Score</TableCell>
                <TableCell align="center">Grade</TableCell>
                <TableCell align="center">CPU Efficiency</TableCell>
                <TableCell align="center">Memory Efficiency</TableCell>
                <TableCell align="center">Storage Efficiency</TableCell>
                <TableCell align="center">Pod Health</TableCell>
                <TableCell align="center">Resource Util</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Pods/Issues</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredNamespaces.map((ns, index) => (
                <TableRow key={`${ns.cluster}-${ns.namespace}-${index}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {ns.namespace}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={ns.cluster} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={ns.overall_score}
                          size={50}
                          color={getScoreColor(ns.overall_score)}
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
                            {ns.overall_score}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={ns.grade}
                      color={getGradeColor(ns.grade)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.cpu_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.cpu_efficiency}
                        color={getScoreColor(ns.cpu_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.memory_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.memory_efficiency}
                        color={getScoreColor(ns.memory_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.storage_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.storage_efficiency}
                        color={getScoreColor(ns.storage_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.pod_health}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.pod_health}
                        color={getScoreColor(ns.pod_health)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {ns.resource_utilization}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={ns.resource_utilization}
                        color={getScoreColor(ns.resource_utilization)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    {getStatusIcon(ns.status)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {ns.pod_count} pods
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      {ns.issues_count} issues
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

export default NamespaceScore;

// Made with Bob
