import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const LeastPrivilegeReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/rbac-analysis/least-privilege${clusterParam}`)
      .then(res => res.json())
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
    const interval = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/rbac-analysis/least-privilege${clusterParam}`)
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
        <SecurityIcon /> Least Privilege
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Least Privilege Score</Typography>
            <Typography variant="h3">{data.least_privilege_score}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Total Violations</Typography>
            <Typography variant="h3">{data.total_violations}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Privilege Violations</Typography>
            <Typography variant="h3">{data.privilege_violations}</Typography>
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
                  <TableCell>Pod</TableCell><TableCell>Container</TableCell><TableCell>Severity</TableCell><TableCell>Violations</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.privilege_violations && data.privilege_violations.slice(0, 50).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{item.pod_name}</TableCell><TableCell>{item.container_name}</TableCell><TableCell><Chip label={item.severity} size="small" /></TableCell><TableCell>{item.violation_count}</TableCell>
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

export default LeastPrivilegeReview;
