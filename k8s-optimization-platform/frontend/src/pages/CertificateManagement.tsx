import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Alert,
} from '@mui/material';
import { VerifiedUser as CertIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface Certificate {
  name: string;
  namespace: string;
  type: string;
  issuer: string;
  subject: string;
  issued_date: string;
  expiry_date: string;
  days_until_expiry: number;
  status: 'valid' | 'expiring_soon' | 'expired';
  severity: 'low' | 'high' | 'critical';
  auto_renewal: boolean;
  used_by_services: number;
  recommendation: string;
}

interface CertData {
  certificate_score: number;
  total_certificates: number;
  valid_certificates: number;
  expiring_soon: number;
  expired_certificates: number;
  certificates: Certificate[];
  recommendation: string;
  last_scan: string;
}

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'error',
};

const CertificateManagement: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE_URL}/v1/security/secrets-security/certificates${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(() => { setError(true); setLoading(false); });
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load certificate data</Alert>;

  const scoreColor = data.certificate_score >= 80 ? '#2e7d32' : data.certificate_score >= 50 ? '#e65100' : '#b71c1c';

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CertIcon /> Certificate Management
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: `2px solid ${scoreColor}` }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>Certificate Score</Typography>
              <Typography variant="h3" sx={{ color: scoreColor, fontWeight: 700 }}>
                {data.certificate_score}<Typography component="span" variant="h6" color="text.secondary">/100</Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={data.certificate_score}
                  sx={{ height: 8, borderRadius: 4, bgcolor: '#e0e0e0', '& .MuiLinearProgress-bar': { bgcolor: scoreColor } }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="text.secondary" gutterBottom>Total Certificates</Typography>
            <Typography variant="h3">{data.total_certificates}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.expiring_soon > 0 ? '#fff3e0' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Expiring Soon (&lt;30d)</Typography>
              <Typography variant="h3" sx={{ color: data.expiring_soon > 0 ? '#e65100' : 'inherit' }}>
                {data.expiring_soon}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.expired_certificates > 0 ? '#ffebee' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Expired</Typography>
              <Typography variant="h3" sx={{ color: data.expired_certificates > 0 ? '#b71c1c' : 'inherit' }}>
                {data.expired_certificates}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Certificate Inventory</Typography>
          {data.recommendation && (
            <Alert severity="info" sx={{ mb: 2 }}>{data.recommendation}</Alert>
          )}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Issuer</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell align="center">Days Until Expiry</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Auto-Renewal</TableCell>
                  <TableCell>Services</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No certificates found
                    </TableCell>
                  </TableRow>
                ) : data.certificates.map((c, i) => (
                  <TableRow key={i} hover sx={{
                    bgcolor: c.status === 'expired' ? '#fff5f5' : c.status === 'expiring_soon' ? '#fffde7' : undefined
                  }}>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.namespace}</TableCell>
                    <TableCell><Chip label={c.type} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{c.issuer}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</TableCell>
                    <TableCell align="center" sx={{
                      fontWeight: 700,
                      color: c.days_until_expiry < 0 ? '#b71c1c' : c.days_until_expiry < 30 ? '#e65100' : '#2e7d32'
                    }}>
                      {c.days_until_expiry < 0 ? `${Math.abs(c.days_until_expiry)}d ago` : `${c.days_until_expiry}d`}
                    </TableCell>
                    <TableCell>
                      <Chip label={c.status.replace('_', ' ')} size="small" color={STATUS_COLOR[c.status]} />
                    </TableCell>
                    <TableCell>
                      <Chip label={c.auto_renewal ? 'Yes' : 'No'} size="small"
                        color={c.auto_renewal ? 'success' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="center">{c.used_by_services}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{c.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CertificateManagement;
