import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const ClusterAdminReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/rbac-analysis/cluster-admin${clusterParam}`)
      .then(res => res.json())
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
    const interval = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/rbac-analysis/cluster-admin${clusterParam}`)
        .then(res => res.json())
        .then(result => setData(result))
        .catch(err => console.error(err));
    }, 120000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon /> Cluster Admin Review
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Cluster Admin Score</Typography>
            <Typography variant="h3">{data.cluster_admin_score}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Total Cluster Admins</Typography>
            <Typography variant="h3">{data.total_cluster_admins}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Unjustified</Typography>
            <Typography variant="h3">{data.unjustified}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Cluster Admins</Typography>
            <Typography variant="h3">{data.cluster_admins}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Details</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell><TableCell>Namespace</TableCell><TableCell>Risk</TableCell><TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.cluster_admins && data.cluster_admins.slice(0, 50).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{item.name || item.service_account || item.subject_name}</TableCell><TableCell>{item.namespace}</TableCell><TableCell><Chip label={item.risk_level} size="small" /></TableCell><TableCell>{item.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
        Last updated: {data.last_scan && new Date(data.last_scan).toLocaleString()}
      </Typography>
    </Box>
  );
};

export default ClusterAdminReview;
