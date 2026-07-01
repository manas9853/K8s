import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { Delete as KillIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const KillPodInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/kill-pod${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  const handleKill = (name: string, namespace: string) => {
    fetch('/api/v1/attack-investigation/response/kill-pod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, namespace }),
    })
      .then(r => r.json())
      .then(r => setActionResult(`Killed ${name}: ${r.actions_taken?.join(', ')}`))
      .catch(() => setActionResult('Action failed'));
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load killed pods data</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KillIcon /> Kill Pod
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      {actionResult && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionResult(null)}>{actionResult}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Pods Terminated</Typography>
          <Typography variant="h3" color="error">{data.total_killed}</Typography>
        </CardContent></Card></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Terminated Pods History</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Pod Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Killed By</TableCell>
                  <TableCell>Killed At</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.killed_pods ?? []).map((p: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: '#fff5f5' }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700 }}>{p.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.namespace}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{p.reason}</TableCell>
                    <TableCell><Chip label={p.killed_by} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(p.killed_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="small" variant="contained" color="error" startIcon={<KillIcon />}
                        onClick={() => handleKill(p.name, p.namespace)}>
                        Kill Again
                      </Button>
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

const KillPod: React.FC = () => (
  <ClusterGuard><KillPodInner /></ClusterGuard>
);

export default KillPod;
