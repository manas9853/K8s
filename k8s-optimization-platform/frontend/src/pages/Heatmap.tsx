import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
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
  IconButton,
  Tooltip,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface HeatmapCell {
  cluster: string;
  namespace: string;
  waste_percentage: number;
  waste_amount: number;
  total_cost: number;
  severity: string;
  resource_count: number;
}

interface ResourceWaste {
  resource_type: string;
  resource_name: string;
  namespace: string;
  cluster: string;
  waste_amount: number;
  waste_percentage: number;
  cpu_waste: number;
  memory_waste: number;
  reason: string;
}

interface Summary {
  total_clusters: number;
  total_namespaces: number;
  total_waste: number;
  average_waste_percentage: number;
  hotspots: Array<{
    cluster: string;
    namespace: string;
    waste_percentage: number;
    waste_amount: number;
    severity: string;
  }>;
  severity_distribution: Record<string, number>;
}

const Heatmap: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [resourceWaste, setResourceWaste] = useState<ResourceWaste[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchHeatmap(),
        fetchResourceWaste(),
        fetchSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeatmap = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/heatmap/heatmap${clusterParam}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setHeatmapData(data);
  };

  const fetchResourceWaste = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/heatmap/resources${clusterParam}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setResourceWaste(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/heatmap/summary${clusterParam}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setSummary(data);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#d32f2f';
      case 'high':
        return '#f57c00';
      case 'medium':
        return '#fbc02d';
      case 'low':
        return '#388e3c';
      default:
        return '#9e9e9e';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ErrorIcon color="error" />;
      case 'high':
        return <WarningIcon color="warning" />;
      case 'medium':
        return <InfoIcon color="info" />;
      case 'low':
        return <CheckCircleIcon color="success" />;
      default:
        return null;
    }
  };

  const getWasteColor = (percentage: number) => {
    if (percentage >= 60) return '#d32f2f';
    if (percentage >= 40) return '#f57c00';
    if (percentage >= 20) return '#fbc02d';
    return '#388e3c';
  };

  const clusters = ['all', ...Array.from(new Set(heatmapData.map((d) => d.cluster)))];
  const filteredData = selectedCluster === 'all'
    ? heatmapData
    : heatmapData.filter((d) => d.cluster === selectedCluster);

  // Group by cluster for heatmap visualization
  const groupedByCluster = filteredData.reduce((acc, cell) => {
    if (!acc[cell.cluster]) {
      acc[cell.cluster] = [];
    }
    acc[cell.cluster].push(cell);
    return acc;
  }, {} as Record<string, HeatmapCell[]>);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Kubernetes Waste Heatmap
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visual representation of waste across clusters and namespaces
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Cluster</InputLabel>
            <Select
              value={selectedCluster}
              label="Filter by Cluster"
              onChange={(e) => setSelectedCluster(e.target.value)}
            >
              {clusters.map((cluster) => (
                <MenuItem key={cluster} value={cluster}>
                  {cluster === 'all' ? 'All Clusters' : cluster}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Summary Cards */}
      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Total Waste
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  ${summary.total_waste.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="white">
                  Across {summary.total_namespaces} namespaces
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Avg Waste %
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.average_waste_percentage.toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="white">
                  Average across all namespaces
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Critical
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.severity_distribution.critical}
                </Typography>
                <Typography variant="body2" color="white">
                  Namespaces need immediate attention
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <CardContent>
                <Typography variant="h6" color="white" gutterBottom>
                  Clusters
                </Typography>
                <Typography variant="h3" color="white" fontWeight="bold">
                  {summary.total_clusters}
                </Typography>
                <Typography variant="body2" color="white">
                  Total clusters monitored
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Heatmap Visualization */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Waste Heatmap by Cluster & Namespace
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Color intensity indicates waste severity
            </Typography>
            
            {Object.entries(groupedByCluster).map(([cluster, cells]) => (
              <Box key={cluster} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                  {cluster}
                </Typography>
                <Grid container spacing={1}>
                  {cells.map((cell) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={`${cell.cluster}-${cell.namespace}`}>
                      <Tooltip
                        title={
                          <Box>
                            <Typography variant="caption" display="block">
                              Waste: ${cell.waste_amount.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Total Cost: ${cell.total_cost.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" display="block">
                              Resources: {cell.resource_count}
                            </Typography>
                          </Box>
                        }
                      >
                        <Card
                          sx={{
                            bgcolor: getWasteColor(cell.waste_percentage),
                            color: 'white',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '&:hover': {
                              transform: 'scale(1.05)',
                            },
                          }}
                        >
                          <CardContent sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Typography variant="body2" fontWeight="bold" noWrap>
                                {cell.namespace}
                              </Typography>
                              {getSeverityIcon(cell.severity)}
                            </Box>
                            <Typography variant="h5" fontWeight="bold">
                              {cell.waste_percentage.toFixed(1)}%
                            </Typography>
                            <Typography variant="caption">
                              ${cell.waste_amount.toLocaleString()} waste
                            </Typography>
                          </CardContent>
                        </Card>
                      </Tooltip>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Top Hotspots */}
        {summary && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ErrorIcon color="error" />
                Top 5 Waste Hotspots
              </Typography>
              {summary.hotspots.map((hotspot, idx) => (
                <Alert
                  key={idx}
                  severity={
                    hotspot.severity === 'critical' ? 'error' :
                    hotspot.severity === 'high' ? 'warning' : 'info'
                  }
                  sx={{ mb: 1 }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        #{idx + 1} {hotspot.cluster} / {hotspot.namespace}
                      </Typography>
                      <Typography variant="caption">
                        ${hotspot.waste_amount.toLocaleString()} wasted
                      </Typography>
                    </Box>
                    <Chip
                      label={`${hotspot.waste_percentage.toFixed(1)}%`}
                      color={
                        hotspot.severity === 'critical' ? 'error' :
                        hotspot.severity === 'high' ? 'warning' : 'default'
                      }
                      size="small"
                    />
                  </Box>
                </Alert>
              ))}
            </Paper>
          </Grid>
        )}

        {/* Severity Distribution */}
        {summary && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Severity Distribution
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Object.entries(summary.severity_distribution).map(([severity, count]) => (
                  <Box key={severity} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        bgcolor: getSeverityColor(severity),
                        borderRadius: 1,
                      }}
                    />
                    <Typography variant="body2" sx={{ minWidth: 80, textTransform: 'capitalize' }}>
                      {severity}
                    </Typography>
                    <Box sx={{ flexGrow: 1, bgcolor: 'grey.200', height: 8, borderRadius: 1, position: 'relative' }}>
                      <Box
                        sx={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: `${(count / summary.total_namespaces) * 100}%`,
                          bgcolor: getSeverityColor(severity),
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                    <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 40, textAlign: 'right' }}>
                      {count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Top Wasteful Resources */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Top Wasteful Resources
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Resource</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Cluster / Namespace</TableCell>
                    <TableCell align="right">Waste</TableCell>
                    <TableCell align="right">Waste %</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resourceWaste.slice(0, 10).map((resource, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {resource.resource_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={resource.resource_type} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" display="block">
                          {resource.cluster}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {resource.namespace}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold" color="error">
                          ${resource.waste_amount.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${resource.waste_percentage.toFixed(1)}%`}
                          size="small"
                          sx={{
                            bgcolor: getWasteColor(resource.waste_percentage),
                            color: 'white',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{resource.reason}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Heatmap;

// Made with Bob
