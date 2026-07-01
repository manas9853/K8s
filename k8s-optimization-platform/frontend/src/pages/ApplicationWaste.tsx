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
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Apps as AppsIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ApplicationWasteData {
  application_name: string;
  namespace: string;
  cluster: string;
  team: string;
  waste_percentage: number;
  cpu_waste: number;
  memory_waste: number;
  monthly_cost: number;
  deployment_count: number;
  pod_count: number;
  over_provisioned_pods: number;
  recommendation: string;
  severity: string;
}

const ApplicationWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [applications, setApplications] = useState<ApplicationWasteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/heatmap/application-waste${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setApplications(data.applications || []);
    } catch (error) {
      console.error('Error fetching application waste data:', error);
      // Mock data
      setApplications([
        {
          application_name: 'analytics-pipeline',
          namespace: 'analytics',
          cluster: 'prod-cluster-us-east',
          team: 'Analytics Team',
          waste_percentage: 68,
          cpu_waste: 72,
          memory_waste: 64,
          monthly_cost: 1850.50,
          deployment_count: 5,
          pod_count: 28,
          over_provisioned_pods: 19,
          recommendation: 'Critical: Reduce CPU by 50%, Memory by 40%',
          severity: 'critical',
        },
        {
          application_name: 'payment-gateway',
          namespace: 'payments',
          cluster: 'prod-cluster-us-east',
          team: 'Payments Team',
          waste_percentage: 42,
          cpu_waste: 45,
          memory_waste: 39,
          monthly_cost: 980.25,
          deployment_count: 3,
          pod_count: 18,
          over_provisioned_pods: 8,
          recommendation: 'Optimize 8 over-provisioned pods',
          severity: 'medium',
        },
        {
          application_name: 'user-service',
          namespace: 'backend',
          cluster: 'prod-cluster-us-east',
          team: 'Backend Team',
          waste_percentage: 35,
          cpu_waste: 38,
          memory_waste: 32,
          monthly_cost: 720.75,
          deployment_count: 2,
          pod_count: 12,
          over_provisioned_pods: 4,
          recommendation: 'Right-size 4 pods',
          severity: 'low',
        },
        {
          application_name: 'ml-training-job',
          namespace: 'ml-training',
          cluster: 'prod-cluster-us-east',
          team: 'ML/AI Team',
          waste_percentage: 75,
          cpu_waste: 80,
          memory_waste: 70,
          monthly_cost: 3240.00,
          deployment_count: 4,
          pod_count: 22,
          over_provisioned_pods: 17,
          recommendation: 'Critical: Massive over-provisioning detected',
          severity: 'critical',
        },
        {
          application_name: 'frontend-web',
          namespace: 'frontend',
          cluster: 'prod-cluster-us-east',
          team: 'Frontend Team',
          waste_percentage: 28,
          cpu_waste: 30,
          memory_waste: 26,
          monthly_cost: 450.30,
          deployment_count: 2,
          pod_count: 15,
          over_provisioned_pods: 4,
          recommendation: 'Well optimized, minor adjustments',
          severity: 'low',
        },
        {
          application_name: 'notification-service',
          namespace: 'backend',
          cluster: 'prod-cluster-us-east',
          team: 'Backend Team',
          waste_percentage: 52,
          cpu_waste: 55,
          memory_waste: 49,
          monthly_cost: 890.40,
          deployment_count: 2,
          pod_count: 10,
          over_provisioned_pods: 5,
          recommendation: 'Reduce resources by 30%',
          severity: 'high',
        },
        {
          application_name: 'api-gateway',
          namespace: 'backend',
          cluster: 'prod-cluster-us-east',
          team: 'Backend Team',
          waste_percentage: 38,
          cpu_waste: 40,
          memory_waste: 36,
          monthly_cost: 620.15,
          deployment_count: 1,
          pod_count: 8,
          over_provisioned_pods: 3,
          recommendation: 'Optimize 3 pods',
          severity: 'medium',
        },
        {
          application_name: 'cache-service',
          namespace: 'backend',
          cluster: 'prod-cluster-us-east',
          team: 'Infrastructure Team',
          waste_percentage: 22,
          cpu_waste: 24,
          memory_waste: 20,
          monthly_cost: 320.50,
          deployment_count: 1,
          pod_count: 6,
          over_provisioned_pods: 1,
          recommendation: 'Minimal waste, well configured',
          severity: 'low',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getWasteColor = (percentage: number) => {
    if (percentage >= 60) return 'error';
    if (percentage >= 40) return 'warning';
    return 'success';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'success';
    }
  };

  const filteredApplications = applications.filter(app =>
    app.application_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.team.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalWaste = filteredApplications.reduce((sum, app) => sum + app.monthly_cost, 0);
  const avgWaste = filteredApplications.length > 0
    ? filteredApplications.reduce((sum, app) => sum + app.waste_percentage, 0) / filteredApplications.length
    : 0;
  const totalPods = filteredApplications.reduce((sum, app) => sum + app.pod_count, 0);
  const overProvisionedPods = filteredApplications.reduce((sum, app) => sum + app.over_provisioned_pods, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Application Waste Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Identify waste at the application level
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
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
                Total Waste Cost
              </Typography>
              <Typography variant="h4" color="error.main">
                ${totalWaste.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly across apps
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Waste
              </Typography>
              <Typography variant="h4" color="warning.main">
                {avgWaste.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per application
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Over-Provisioned Pods
              </Typography>
              <Typography variant="h4" color="error.main">
                {overProvisionedPods}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Out of {totalPods} pods
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Applications
              </Typography>
              <Typography variant="h4" color="primary.main">
                {filteredApplications.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active applications
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Application Waste Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Application Waste Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Application</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Team</TableCell>
                <TableCell align="center">Waste %</TableCell>
                <TableCell align="center">CPU Waste</TableCell>
                <TableCell align="center">Memory Waste</TableCell>
                <TableCell align="right">Monthly Cost</TableCell>
                <TableCell align="center">Pods</TableCell>
                <TableCell align="center">Severity</TableCell>
                <TableCell>Recommendation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredApplications.map((app, index) => (
                <TableRow key={`${app.application_name}-${index}`} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AppsIcon color="primary" fontSize="small" />
                      <Typography variant="body2" fontWeight="medium">
                        {app.application_name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={app.namespace} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {app.team}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${app.waste_percentage}%`}
                      color={getWasteColor(app.waste_percentage)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {app.cpu_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={app.cpu_waste}
                        color={getWasteColor(app.cpu_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {app.memory_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={app.memory_waste}
                        color={getWasteColor(app.memory_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" color="error.main">
                      ${app.monthly_cost.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {app.pod_count} total
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      {app.over_provisioned_pods} over-prov
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={app.severity.toUpperCase()}
                      color={getSeverityColor(app.severity)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {app.recommendation}
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

export default ApplicationWaste;

// Made with Bob
