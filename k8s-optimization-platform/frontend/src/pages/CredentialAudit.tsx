import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Alert,
} from '@mui/material';
import { ManageAccounts as CredIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface Credential {
  id: string;
  name: string;
  namespace: string;
  type: string;
  created_date: string;
  last_used: string;
  days_since_last_use: number;
  access_count: number;
  risk_level: 'low' | 'medium' | 'high';
  used_by_pods: number;
  permissions: string[];
  recommendation: string;
}

interface CredData {
  audit_score: number;
  total_credentials: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  credentials: Credential[];
  audit_findings: { credential_id: string; finding: string; severity: string; recommendation: string }[];
  recommendations: string[];
  last_scan: string;
}

const RISK_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

const CredentialAudit: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<CredData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE_URL}/v1/security/secrets-security/credential-audit${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(() => { setError(true); setLoading(false); });
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load credential audit data</Alert>;

  const scoreColor = data.audit_score >= 80 ? '#2e7d32' : data.audit_score >= 50 ? '#e65100' : '#b71c1c';

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CredIcon /> Credential Audit
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: `2px solid ${scoreColor}` }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>Audit Score</Typography>
              <Typography variant="h3" sx={{ color: scoreColor, fontWeight: 700 }}>
                {data.audit_score}<Typography component="span" variant="h6" color="text.secondary">/100</Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={data.audit_score}
                  sx={{ height: 8, borderRadius: 4, bgcolor: '#e0e0e0', '& .MuiLinearProgress-bar': { bgcolor: scoreColor } }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="text.secondary" gutterBottom>Total Credentials</Typography>
            <Typography variant="h3">{data.total_credentials}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.high_risk > 0 ? '#ffebee' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>High Risk</Typography>
              <Typography variant="h3" sx={{ color: data.high_risk > 0 ? '#b71c1c' : 'inherit' }}>
                {data.high_risk}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: data.medium_risk > 0 ? '#fff3e0' : undefined }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Medium Risk</Typography>
              <Typography variant="h3" sx={{ color: data.medium_risk > 0 ? '#e65100' : 'inherit' }}>
                {data.medium_risk}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.audit_findings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>{data.audit_findings.length} high-risk findings</strong> — {data.audit_findings[0]?.finding}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Credential Inventory</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="center">Days Inactive</TableCell>
                  <TableCell align="center">Access Count</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.credentials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No credentials found
                    </TableCell>
                  </TableRow>
                ) : data.credentials.slice(0, 100).map((c, i) => (
                  <TableRow key={i} hover sx={{
                    bgcolor: c.risk_level === 'high' ? '#fff5f5' : c.risk_level === 'medium' ? '#fffde7' : undefined
                  }}>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.namespace}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{c.type}</TableCell>
                    <TableCell align="center" sx={{
                      fontWeight: 700,
                      color: c.days_since_last_use > 90 ? '#b71c1c' : c.days_since_last_use > 30 ? '#e65100' : '#2e7d32'
                    }}>
                      {c.days_since_last_use}
                    </TableCell>
                    <TableCell align="center">{c.access_count}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {c.permissions.map(p => (
                          <Chip key={p} label={p} size="small" variant="outlined"
                            color={p === 'admin' || p === 'delete' ? 'warning' : 'default'} />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={c.risk_level} size="small" color={RISK_COLOR[c.risk_level]} />
                    </TableCell>
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

export default CredentialAudit;
