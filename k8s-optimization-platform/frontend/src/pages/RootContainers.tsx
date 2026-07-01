import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Alert
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface RootContainer {
  pod_name: string;
  container_name: string;
  namespace: string;
  severity: string;
  user_id: number;
  group_id: number;
  read_only_root_fs: boolean;
  allow_privilege_escalation: boolean;
  security_context_set: boolean;
  recommendation: string;
  estimated_fix_time: string;
}

interface RootContainersData {
  total_root_containers: number;
  root_container_rate: number;
  total_containers: number;
  root_containers: RootContainer[];
  namespace_breakdown: Array<{
    namespace: string;
    total_containers: number;
    root_containers: number;
    root_percentage: number;
  }>;
  security_score: number;
  recommendation: string;
  last_scan: string;
}

const RootContainers: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<RootContainersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/security/container-security/root-containers${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setData(result);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching root containers data:', error);
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'info';
    }
  };

  if (loading) {
    return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  }

  if (!data) {
    return <Alert severity="error">Failed to load root containers data</Alert>;
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon /> Root Containers
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Root Containers</Typography>
              <Typography variant="h3" color="error">{data.total_root_containers}</Typography>
              <Typography variant="body2" color="textSecondary">{data.root_container_rate.toFixed(1)}% of total</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Security Score</Typography>
              <Typography variant="h3" sx={{ color: data.security_score >= 70 ? '#4caf50' : '#f44336' }}>
                {data.security_score}
              </Typography>
              <Typography variant="body2" color="textSecondary">out of 100</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Recommendation</Typography>
              <Typography variant="body1">{data.recommendation}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Namespace Breakdown</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Namespace</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Root</TableCell>
                      <TableCell align="right">%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.namespace_breakdown.slice(0, 10).map((ns) => (
                      <TableRow key={ns.namespace}>
                        <TableCell>{ns.namespace}</TableCell>
                        <TableCell align="right">{ns.total_containers}</TableCell>
                        <TableCell align="right">{ns.root_containers}</TableCell>
                        <TableCell align="right">
                          <Chip label={`${ns.root_percentage}%`} size="small" 
                            color={ns.root_percentage > 70 ? 'error' : ns.root_percentage > 40 ? 'warning' : 'success'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Root Container Details</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Severity</TableCell>
                  <TableCell>Pod</TableCell>
                  <TableCell>Container</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Security Context</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.root_containers.slice(0, 50).map((container, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Chip label={container.severity.toUpperCase()} 
                        color={getSeverityColor(container.severity) as any} size="small" />
                    </TableCell>
                    <TableCell>{container.pod_name}</TableCell>
                    <TableCell>{container.container_name}</TableCell>
                    <TableCell>{container.namespace}</TableCell>
                    <TableCell>
                      {!container.security_context_set && <Chip label="Not Set" size="small" color="error" sx={{ mr: 0.5 }} />}
                      {container.allow_privilege_escalation && <Chip label="Priv Esc" size="small" color="error" sx={{ mr: 0.5 }} />}
                      {!container.read_only_root_fs && <Chip label="RW FS" size="small" color="warning" />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">{container.recommendation}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
        Last updated: {new Date(data.last_scan).toLocaleString()}
      </Typography>
    </Box>
  );
};

export default RootContainers;

// Made with Bob
