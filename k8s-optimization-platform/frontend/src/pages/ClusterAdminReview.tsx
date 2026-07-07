import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { Security as SecurityIcon, Warning as WarningIcon } from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ClusterAdmin {
  subject_type: string;
  subject_name: string;
  namespace: string;
  binding_name: string;
  pods_using: number;
  justification: string;
  risk_level: string;
  recommendation: string;
}

interface ClusterAdminData {
  cluster_admin_score: number;
  total_cluster_admins: number;
  justified: number;
  needs_review: number;
  unjustified: number;
  cluster_admins: ClusterAdmin[];
  recommendation?: string;
  last_scan?: string;
}

const RISK_COLOR: Record<string, string> = {
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
};

const JUST_COLOR: Record<string, string> = {
  justified: '#a5d6a7',
  unjustified: '#ef5350',
  needs_review: '#ffa726',
};

const ClusterAdminReview: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ClusterAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/security/rbac-analysis/cluster-admin${clusterParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ClusterAdminData = await res.json();
        if (!mounted) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData(true);
    const id = setInterval(() => fetchData(false), 120000);
    return () => { mounted = false; clearInterval(id); };
  }, [clusterParam]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
      <CircularProgress />
    </Box>
  );
  if (error) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">{error}</Alert></Box>;
  if (!data) return <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}><Alert severity="error">Failed to load data</Alert></Box>;

  const admins = Array.isArray(data.cluster_admins) ? data.cluster_admins : [];
  const unjustified = admins.filter(a => a.justification === 'unjustified');
  const score = data.cluster_admin_score ?? 0;
  const scoreColor = score >= 70 ? '#a5d6a7' : score >= 40 ? '#ffa726' : '#ef5350';

  const r = 54; const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* HEADER */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <SecurityIcon sx={{ fontSize: 32, color: '#90caf9' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Cluster Admin Review
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            RBAC cluster-admin binding audit · {data.total_cluster_admins} bindings ·{' '}
            Last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      {/* SCORE + STAT CARDS */}
      <Grid container spacing={2} mb={3}>
        {/* Score ring */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#8892a4' }} gutterBottom>
                Admin Score
              </Typography>
              <Box sx={{ position: 'relative', width: 130, height: 130, mx: 'auto' }}>
                <svg width={130} height={130}>
                  <circle cx={65} cy={65} r={r} fill="none" stroke="#2a3245" strokeWidth={11} />
                  <circle cx={65} cy={65} r={r} fill="none" stroke={scoreColor} strokeWidth={11}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    transform="rotate(-90 65 65)" />
                </svg>
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: scoreColor }}>{score}</Typography>
                  <Typography variant="caption" sx={{ color: '#8892a4' }}>/ 100</Typography>
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: '#8892a4', display: 'block', mt: 1 }}>
                {unjustified.length > 0
                  ? `${unjustified.length} unjustified binding${unjustified.length > 1 ? 's' : ''}`
                  : 'All bindings justified'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Stat cards */}
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            {[
              { label: 'Total Admins',  count: data.total_cluster_admins ?? 0, color: '#90caf9' },
              { label: 'Unjustified',   count: data.unjustified ?? 0,           color: '#ef5350' },
              { label: 'Justified',     count: data.justified ?? 0,             color: '#a5d6a7' },
              { label: 'Needs Review',  count: data.needs_review ?? 0,          color: '#ffa726' },
            ].map(({ label, count, color }) => (
              <Grid item xs={6} md={3} key={label}>
                <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
                  <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Recommendation banner */}
          {data.recommendation && (
            <Paper sx={{ p: 2, mt: 2, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <Typography variant="body2" sx={{ color: '#8892a4' }}>{data.recommendation}</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* UNJUSTIFIED SPOTLIGHT */}
      {unjustified.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5}>
            <WarningIcon sx={{ color: '#ef5350' }} />
            <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Unjustified Cluster-Admin Bindings
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', ml: 'auto' }}>
              Immediate action required
            </Typography>
          </Box>
          <Stack spacing={1}>
            {unjustified.slice(0, 5).map((item, i) => (
              <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {item.subject_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      {item.subject_type} · {item.namespace} · binding: {item.binding_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#8892a4', display: 'block', mt: 0.5, fontSize: 12 }}>
                      {item.recommendation}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
                    <Chip label={`${item.pods_using} pods`} size="small"
                      sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
                    <Chip label={item.risk_level.toUpperCase()} size="small"
                      sx={{ bgcolor: '#2a3245', color: RISK_COLOR[item.risk_level] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ALL BINDINGS TABLE */}
      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            All Cluster-Admin Bindings ({admins.length})
          </Typography>
        </Box>
        {admins.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography variant="body1" sx={{ color: '#8892a4' }}>No cluster-admin bindings found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Subject', 'Type', 'Namespace', 'Binding', 'Pods Using', 'Risk', 'Justification', 'Recommendation'].map(h => (
                    <TableCell key={h} sx={{
                      fontWeight: 700, fontSize: 12, color: '#8892a4',
                      bgcolor: '#131d2e', borderColor: '#2a3245'
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {admins.slice(0, 50).map((item, i) => (
                  <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245' }}>
                      {item.subject_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                      {item.subject_type}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#8892a4', borderColor: '#2a3245' }}>
                      {item.namespace}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 160 }}>
                      {item.binding_name}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#e8eaf0', borderColor: '#2a3245', textAlign: 'center' }}>
                      {item.pods_using}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={item.risk_level.toUpperCase()} size="small"
                        sx={{ bgcolor: '#2a3245', color: RISK_COLOR[item.risk_level] ?? '#e8eaf0', fontWeight: 'bold', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: '#2a3245' }}>
                      <Chip label={item.justification} size="small"
                        sx={{ bgcolor: '#2a3245', color: JUST_COLOR[item.justification] ?? '#e8eaf0', fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: '#8892a4', borderColor: '#2a3245', maxWidth: 200 }}>
                      {item.recommendation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

    </Box>
  );
};

export default ClusterAdminReview;
// Made with Bob
