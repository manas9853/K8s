import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { Visibility as InsiderIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const InsiderThreatInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/insider-threat${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load insider threat data</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InsiderIcon /> Insider Threat Detection
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">High Risk Users</Typography>
          <Typography variant="h3" color="error">{data.high_risk_users}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent>
          <Typography color="text.secondary">Total Alerts</Typography>
          <Typography variant="h3">{data.total_alerts}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#fff3e0' }}><CardContent>
          <Typography color="text.secondary">Under Investigation</Typography>
          <Typography variant="h3" color="warning.dark">
            {(data.threats ?? []).filter((t: any) => t.status === 'investigating').length}
          </Typography>
        </CardContent></Card></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Insider Threat Actors</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>ID</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions Taken</TableCell>
                  <TableCell>Data Accessed</TableCell>
                  <TableCell>Last Activity</TableCell>
                  <TableCell>Suspicious Activities</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.threats ?? []).map((t: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: t.risk_score >= 80 ? '#fff5f5' : '#fffde7' }}>
                    <TableCell><Chip label={t.id} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}>{t.user}</TableCell>
                    <TableCell>
                      <Chip label={t.user_type} size="small" variant="outlined"
                        color={t.user_type === 'human' ? 'primary' : 'info'} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={t.risk_score}
                          color={t.risk_score >= 80 ? 'error' : 'warning'}
                          sx={{ width: 60, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption" fontWeight={700}>{t.risk_score}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={t.status ?? 'active'} size="small"
                        color={t.status === 'investigating' ? 'warning' : 'error'} />
                    </TableCell>
                    <TableCell align="center">{t.actions_taken}</TableCell>
                    <TableCell sx={{ color: 'error.main', fontWeight: 700 }}>{t.data_accessed}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(t.last_activity).toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(t.suspicious_activities ?? []).slice(0, 2).map((a: string, idx: number) => (
                          <Chip key={idx} label={a} size="small" color="warning" variant="outlined" />
                        ))}
                        {(t.suspicious_activities ?? []).length > 2 && (
                          <Chip label={`+${t.suspicious_activities.length - 2}`} size="small" />
                        )}
                      </Box>
                    </TableCell>
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

const InsiderThreat: React.FC = () => (
  <ClusterGuard><InsiderThreatInner /></ClusterGuard>
);

export default InsiderThreat;
