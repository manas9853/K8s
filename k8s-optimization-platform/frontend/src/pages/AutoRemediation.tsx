import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const AutoRemediation: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/drift-detection/auto-remediation${clusterParam}`)
      .then(res => res.json())
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
    const interval = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/drift-detection/auto-remediation${clusterParam}`)
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
        <SecurityIcon /> Auto Remediation
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Success Rate</Typography>
            <Typography variant="h3">{data.success_rate}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Total Actions</Typography>
            <Typography variant="h3">{data.total_actions}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Remediation Actions</Typography>
            <Typography variant="h3">{data.remediation_actions}</Typography>
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
                  <TableCell>Resource</TableCell><TableCell>Type</TableCell><TableCell>Severity</TableCell><TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.remediation_actions && data.remediation_actions.slice(0, 50).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{item.resource_name || item.id}</TableCell><TableCell>{item.drift_type || item.alert_type || item.action_type}</TableCell><TableCell><Chip label={item.severity || item.drift_severity} size="small" /></TableCell><TableCell>{item.status}</TableCell>
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

export default AutoRemediation;
