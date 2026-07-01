import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { Block as QuarantineIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const QuarantineResourceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/quarantine${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  const handleQuarantine = (name: string, namespace: string) => {
    fetch('/api/v1/attack-investigation/response/quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pod', name, namespace }),
    })
      .then(r => r.json())
      .then(r => setActionResult(`Quarantined ${name}: ${r.actions_taken?.join(', ')}`))
      .catch(() => setActionResult('Action failed'));
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load quarantine data</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <QuarantineIcon /> Quarantine
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      {actionResult && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionResult(null)}>{actionResult}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Currently Quarantined</Typography>
          <Typography variant="h3" color="error">{data.total_quarantined}</Typography>
        </CardContent></Card></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Quarantined Resources</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Type</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Quarantined At</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.quarantined_resources ?? []).map((r: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: '#fff5f5' }}>
                    <TableCell><Chip label={r.type} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700 }}>{r.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.namespace}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{r.reason}</TableCell>
                    <TableCell><Chip label={r.status} size="small" color="error" /></TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(r.quarantined_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" color="warning"
                        onClick={() => handleQuarantine(r.name, r.namespace)}>
                        Re-Quarantine
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

const QuarantineResource: React.FC = () => (
  <ClusterGuard><QuarantineResourceInner /></ClusterGuard>
);

export default QuarantineResource;
