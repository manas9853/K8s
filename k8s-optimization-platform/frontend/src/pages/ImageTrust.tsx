import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const ImageTrust: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/security/container-security/image-trust${clusterParam}`)
      .then(res => res.json())
      .then(result => { setData(result); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (!data) return <Alert severity="error">Failed to load data</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon /> Image Trust & Provenance
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Trust Score</Typography>
            <Typography variant="h3" sx={{ color: data.trust_score >= 70 ? '#4caf50' : '#f44336' }}>{data.trust_score}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Trusted Images</Typography>
            <Typography variant="h3" color="success">{data.trusted_images}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Untrusted Images</Typography>
            <Typography variant="h3" color="error">{data.untrusted_images}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Total Images</Typography>
            <Typography variant="h3">{data.total_images}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Image Analysis</Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Image</TableCell>
                  <TableCell>Registry</TableCell>
                  <TableCell>Trust Level</TableCell>
                  <TableCell>Signed</TableCell>
                  <TableCell>Uses Digest</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.image_analysis.slice(0, 50).map((img: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{img.image}</TableCell>
                    <TableCell>{img.registry}</TableCell>
                    <TableCell><Chip label={img.trust_level} color={img.trust_level === 'trusted' ? 'success' : 'error'} size="small" /></TableCell>
                    <TableCell>{img.signed ? '✓' : '✗'}</TableCell>
                    <TableCell>{img.uses_digest ? '✓' : '✗'}</TableCell>
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

export default ImageTrust;
