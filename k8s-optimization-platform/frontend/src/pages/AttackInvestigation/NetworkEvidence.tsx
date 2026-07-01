import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { NetworkCheck as NetworkIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const NetworkEvidenceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/network-evidence${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load network evidence</Alert>;

  const summary = data.network_summary ?? {};

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NetworkIcon /> Network Evidence — {data.pod_name}
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Connections', value: summary.total_connections, color: undefined },
          { label: 'Inbound', value: summary.inbound, color: undefined },
          { label: 'Outbound', value: summary.outbound, color: undefined },
          { label: 'Suspicious', value: summary.suspicious, color: '#ffebee' },
          { label: 'Data Transferred', value: summary.data_transferred, color: '#ffebee' },
        ].map((s, i) => (
          <Grid key={i} item xs={6} md={2}>
            <Card sx={{ bgcolor: s.color }}><CardContent>
              <Typography color="text.secondary" variant="caption">{s.label}</Typography>
              <Typography variant="h5" fontWeight={700}
                sx={{ color: s.color ? 'error.main' : 'inherit' }}>{s.value ?? '—'}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Network Connections</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Protocol</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell>Bytes Sent</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.connections ?? []).map((c: any, i: number) => (
                  <TableRow key={i} hover sx={{
                    bgcolor: c.risk === 'critical' ? '#fff5f5' : c.risk === 'high' ? '#fffde7' : undefined
                  }}>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(c.timestamp).toLocaleString()}</TableCell>
                    <TableCell><Chip label={c.protocol} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.source}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700,
                      color: 'error.main' }}>{c.destination}</TableCell>
                    <TableCell>{(c.bytes_sent / 1024 / 1024).toFixed(1)} MB</TableCell>
                    <TableCell>{c.duration}</TableCell>
                    <TableCell>
                      <Chip label={c.risk} size="small"
                        color={c.risk === 'critical' ? 'error' : c.risk === 'high' ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{c.reason}</TableCell>
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

const NetworkEvidence: React.FC = () => (
  <ClusterGuard><NetworkEvidenceInner /></ClusterGuard>
);

export default NetworkEvidence;
