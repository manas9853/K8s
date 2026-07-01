import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button,
} from '@mui/material';
import { PersonSearch as UserIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface SuspiciousUser {
  username: string;
  type: string;
  namespace: string;
  risk_score: number;
  suspicious_activities: string[];
  last_activity: string;
  first_detected: string;
  permissions: string[];
}

interface UserData {
  total_suspicious: number;
  suspicious_users: SuspiciousUser[];
}

const SuspiciousUsersInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-users${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load suspicious users</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UserIcon /> Suspicious Users
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#ffebee' }}>
            <CardContent>
              <Typography color="text.secondary">Total Suspicious</Typography>
              <Typography variant="h3" color="error">{data.total_suspicious}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#ffebee' }}>
            <CardContent>
              <Typography color="text.secondary">Critical Risk (&ge;80)</Typography>
              <Typography variant="h3" color="error">
                {data.suspicious_users.filter(u => u.risk_score >= 80).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Service Accounts</Typography>
              <Typography variant="h3">
                {data.suspicious_users.filter(u => u.type === 'service_account').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Suspicious Users ({data.suspicious_users.length})</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Username</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Last Activity</TableCell>
                  <TableCell>Suspicious Activities</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.suspicious_users.map((u, i) => (
                  <TableRow key={i} hover sx={{ bgcolor: u.risk_score >= 80 ? '#fff5f5' : '#fffde7' }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.username}</TableCell>
                    <TableCell>
                      <Chip label={u.type} size="small" variant="outlined"
                        color={u.type === 'service_account' ? 'info' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.namespace}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={u.risk_score}
                          color={u.risk_score >= 80 ? 'error' : 'warning'}
                          sx={{ width: 60, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption" fontWeight={700}>{u.risk_score}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {u.permissions.slice(0, 2).map((p, idx) => (
                          <Chip key={idx} label={p} size="small"
                            color={p === 'cluster-admin' ? 'error' : 'default'} variant="outlined" />
                        ))}
                        {u.permissions.length > 2 && <Chip label={`+${u.permissions.length - 2}`} size="small" />}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(u.last_activity).toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {u.suspicious_activities.slice(0, 2).map((a, idx) => (
                          <Chip key={idx} label={a} size="small" color="warning" variant="outlined" />
                        ))}
                        {u.suspicious_activities.length > 2 && (
                          <Chip label={`+${u.suspicious_activities.length - 2}`} size="small" />
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

const SuspiciousUsers: React.FC = () => (
  <ClusterGuard><SuspiciousUsersInner /></ClusterGuard>
);

export default SuspiciousUsers;
