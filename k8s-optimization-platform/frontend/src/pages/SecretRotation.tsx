import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Alert, LinearProgress as Bar,
} from '@mui/material';
import { Security as SecurityIcon, RotateRight as RotateIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface SecretStatus {
  secret_name: string;
  namespace: string;
  age_days: number;
  last_rotated: string;
  status: 'rotated' | 'needs_rotation' | 'overdue';
  severity: 'low' | 'medium' | 'high';
  rotation_policy: string;
  used_by_pods: number;
  recommendation: string;
}

interface RotationData {
  rotation_score: number;
  total_secrets: number;
  rotated_secrets: number;
  needs_rotation: number;
  overdue_rotation: number;
  secrets_status: SecretStatus[];
  rotation_policy: string;
  last_scan: string;
}

const SEV_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  rotated: 'success',
  needs_rotation: 'warning',
  overdue: 'error',
};

const SecretRotation: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<RotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE_URL}/v1/security/secrets-security/rotation${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(() => { setError(true); setLoading(false); });
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load secret rotation data</Alert>;

  const scoreColor = data.rotation_score >= 80 ? '#2e7d32' : data.rotation_score >= 50 ? '#e65100' : '#b71c1c';

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <RotateIcon /> Secret Rotation
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: `2px solid ${scoreColor}` }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>Rotation Score</Typography>
              <Typography variant="h3" sx={{ color: scoreColor, fontWeight: 700 }}>
                {data.rotation_score}<Typography component="span" variant="h6" color="text.secondary">/100</Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Bar variant="determinate" value={data.rotation_score}
                  sx={{ height: 8, borderRadius: 4, bgcolor: '#e0e0e0', '& .MuiLinearProgress-bar': { bgcolor: scoreColor } }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="text.secondary" gutterBottom>Total Secrets</Typography>
            <Typography variant="h3">{data.total_secrets}</Typography>
            <Typography variant="caption" color="text.secondary">Policy: {data.rotation_policy}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.needs_rotation > 0 ? '#fff3e0' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Needs Rotation</Typography>
              <Typography variant="h3" sx={{ color: data.needs_rotation > 0 ? '#e65100' : 'inherit' }}>
                {data.needs_rotation}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.overdue_rotation > 0 ? '#ffebee' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Overdue</Typography>
              <Typography variant="h3" sx={{ color: data.overdue_rotation > 0 ? '#b71c1c' : 'inherit' }}>
                {data.overdue_rotation}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Secret Rotation Status</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Secret Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell align="center">Age (days)</TableCell>
                  <TableCell>Last Rotated</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Used by Pods</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.secrets_status.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No secrets found
                    </TableCell>
                  </TableRow>
                ) : data.secrets_status.slice(0, 100).map((s, i) => (
                  <TableRow key={i} hover sx={{
                    bgcolor: s.status === 'overdue' ? '#fff5f5' : s.status === 'needs_rotation' ? '#fffde7' : undefined
                  }}>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.secret_name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.namespace}</TableCell>
                    <TableCell align="center" sx={{ color: s.age_days > 180 ? '#b71c1c' : s.age_days > 90 ? '#e65100' : 'inherit' }}>
                      {s.age_days}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(s.last_rotated).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Chip label={s.status.replace('_', ' ')} size="small" color={STATUS_COLOR[s.status]} />
                    </TableCell>
                    <TableCell>
                      <Chip label={s.severity} size="small" color={SEV_COLOR[s.severity]} />
                    </TableCell>
                    <TableCell align="center">{s.used_by_pods}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{s.recommendation}</TableCell>
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

export default SecretRotation;
