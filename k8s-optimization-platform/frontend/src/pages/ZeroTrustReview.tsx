import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const ZeroTrustReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/network-security/zero-trust${clusterParam}`)
      .then(res => res.json())
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
    const interval = setInterval(() => {
      fetch(`${API_BASE_URL}/v1/security/network-security/zero-trust${clusterParam}`)
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
        <SecurityIcon /> Zero Trust
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Zero Trust Score</Typography>
            <Typography variant="h3">{data.zero_trust_score}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Grade</Typography>
            <Typography variant="h3">{data.grade}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Gaps Identified</Typography>
            <Typography variant="h3">{data.gaps ? data.gaps.length : 0}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Namespaces Assessed</Typography>
            <Typography variant="h3">{data.namespace_assessment ? data.namespace_assessment.length : 0}</Typography>
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
                  <TableCell>Namespace</TableCell><TableCell>Status</TableCell><TableCell>Score</TableCell><TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.namespace_assessment && data.namespace_assessment.slice(0, 50).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{item.namespace}</TableCell><TableCell><Chip label={item.coverage_status || item.grade} size="small" /></TableCell><TableCell>{item.coverage_percentage || item.zero_trust_score}</TableCell><TableCell>{item.recommendation}</TableCell>
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

export default ZeroTrustReview;
