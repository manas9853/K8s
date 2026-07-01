import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { FindInPage as EvidenceIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const PodEvidenceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/pod-evidence${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load pod evidence</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EvidenceIcon /> Pod Evidence — {data.pod_name}
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent>
          <Typography color="text.secondary">Pod</Typography>
          <Typography variant="h6" fontFamily="monospace">{data.pod_name}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent>
          <Typography color="text.secondary">Namespace</Typography>
          <Typography variant="h6" fontFamily="monospace">{data.namespace}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent>
          <Typography color="text.secondary">Running Processes</Typography>
          <Typography variant="h3">{data.running_processes?.length ?? 0}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent>
          <Typography color="text.secondary">Network Connections</Typography>
          <Typography variant="h3">{data.network_connections?.length ?? 0}</Typography>
        </CardContent></Card></Grid>
      </Grid>

      {/* Security Context */}
      {data.pod_spec?.security_context && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Security Context</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`Privileged: ${data.pod_spec.security_context.privileged}`}
                color={data.pod_spec.security_context.privileged ? 'error' : 'success'} />
              <Chip label={`Run As User: ${data.pod_spec.security_context.run_as_user}`}
                color={data.pod_spec.security_context.run_as_user === 0 ? 'error' : 'success'} />
              {(data.pod_spec.security_context.capabilities ?? []).map((c: string, i: number) => (
                <Chip key={i} label={c} color="warning" />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Running Processes */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Running Processes</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>PID</TableCell><TableCell>Name</TableCell>
                <TableCell align="center">CPU %</TableCell><TableCell align="center">Memory (MB)</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {(data.running_processes ?? []).map((p: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: p.name !== 'sh' ? '#fff5f5' : undefined }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{p.pid}</TableCell>
                    <TableCell sx={{ fontWeight: p.name !== 'sh' ? 700 : 400, color: p.name !== 'sh' ? 'error.main' : 'inherit' }}>{p.name}</TableCell>
                    <TableCell align="center">{p.cpu}</TableCell>
                    <TableCell align="center">{p.memory}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Network Connections */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Network Connections</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Local</TableCell><TableCell>Remote</TableCell>
                <TableCell>State</TableCell><TableCell>Bytes Sent</TableCell><TableCell>Bytes Recv</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {(data.network_connections ?? []).map((c: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: '#fff5f5' }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.local}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'error.main', fontWeight: 700 }}>{c.remote}</TableCell>
                    <TableCell><Chip label={c.state} size="small" color={c.state === 'ESTABLISHED' ? 'error' : 'default'} /></TableCell>
                    <TableCell>{(c.bytes_sent / 1024).toFixed(0)} KB</TableCell>
                    <TableCell>{(c.bytes_received / 1024).toFixed(0)} KB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Filesystem Changes */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Filesystem Changes</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Path</TableCell><TableCell>Action</TableCell><TableCell>Timestamp</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {(data.file_system_changes ?? []).map((f: any, i: number) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{f.path}</TableCell>
                    <TableCell><Chip label={f.action} size="small"
                      color={f.action === 'created' ? 'warning' : 'error'} /></TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(f.timestamp).toLocaleString()}</TableCell>
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

const PodEvidence: React.FC = () => (
  <ClusterGuard><PodEvidenceInner /></ClusterGuard>
);

export default PodEvidence;
