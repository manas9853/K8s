import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ExposedService {
  service_name: string;
  namespace: string;
  type: string;
  external_access: string;
  ports: number[];
  risk_level: string;
  recommendation: string;
}

const riskColor = (level: string): 'error' | 'warning' | 'info' | 'default' => {
  switch (level) {
    case 'Critical': return 'error';
    case 'High':     return 'error';
    case 'Medium':   return 'warning';
    case 'Low':      return 'info';
    default:         return 'default';
  }
};

const ExternalExposure: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [services, setServices] = useState<ExposedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    fetch(`${API_BASE_URL}/v1/network/external-exposure${clusterParam}`)
      .then(res => res.json())
      .then(result => { setServices(result); setLoading(false); })
      .catch(err => { console.error(err); setError(true); setLoading(false); });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error) return <Alert severity="error">Failed to load data</Alert>;

  // Derive summary metrics from real data
  const totalExposed = services.length;
  const loadBalancers = services.filter(s => s.type === 'LoadBalancer').length;
  const nodePorts = services.filter(s => s.type === 'NodePort').length;
  const critical = services.filter(s => s.risk_level === 'Critical').length;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon /> External Exposure
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Exposed Services</Typography>
            <Typography variant="h3">{totalExposed}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>LoadBalancer</Typography>
            <Typography variant="h3">{loadBalancers}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>NodePort</Typography>
            <Typography variant="h3">{nodePorts}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Critical Risk</Typography>
            <Typography variant="h3" color="error.main">{critical}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Externally Exposed Services</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Service</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Access</TableCell>
                  <TableCell>Ports</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((svc, i) => (
                  <TableRow key={i}>
                    <TableCell>{svc.service_name}</TableCell>
                    <TableCell>{svc.namespace}</TableCell>
                    <TableCell>{svc.type}</TableCell>
                    <TableCell>{svc.external_access}</TableCell>
                    <TableCell>{svc.ports.join(', ')}</TableCell>
                    <TableCell>
                      <Chip label={svc.risk_level} size="small" color={riskColor(svc.risk_level)} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal' }}>{svc.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ExternalExposure;
