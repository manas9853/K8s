import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button,
} from '@mui/material';
import { Terminal as TerminalIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const ProcessHistoryInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/process-history${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load process history</Alert>;

  const suspicious = (data.process_history ?? []).filter((p: any) =>
    p.command?.toLowerCase().includes('wget') ||
    p.command?.toLowerCase().includes('curl') ||
    p.command?.toLowerCase().includes('xmrig') ||
    p.command?.toLowerCase().includes('chmod')
  );

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon /> Process History — {data.pod_name}
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography color="text.secondary">Pod</Typography>
          <Typography variant="h6" fontFamily="monospace">{data.pod_name}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography color="text.secondary">Total Commands</Typography>
          <Typography variant="h3">{data.process_history?.length ?? 0}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1, bgcolor: suspicious.length > 0 ? '#ffebee' : undefined }}><CardContent>
          <Typography color="text.secondary">Suspicious Commands</Typography>
          <Typography variant="h3" color={suspicious.length > 0 ? 'error' : 'inherit'}>{suspicious.length}</Typography>
        </CardContent></Card>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Command Execution History</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>PID</TableCell>
                  <TableCell>PPID</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Command</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell align="center">Exit Code</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.process_history ?? []).map((p: any, i: number) => {
                  const isSuspicious = p.command?.match(/wget|curl|xmrig|chmod|nc |bash -i/i);
                  return (
                    <TableRow key={i} hover sx={{ bgcolor: isSuspicious ? '#fff5f5' : undefined }}>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(p.timestamp).toLocaleString()}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{p.pid}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{p.ppid}</TableCell>
                      <TableCell>
                        <Chip label={p.user} size="small" color={p.user === 'root' ? 'error' : 'default'} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem',
                        color: isSuspicious ? 'error.main' : 'inherit', fontWeight: isSuspicious ? 700 : 400 }}>
                        {p.command}
                      </TableCell>
                      <TableCell>{p.duration}</TableCell>
                      <TableCell align="center">
                        {p.exit_code === null
                          ? <Chip label="running" size="small" color="warning" />
                          : <Chip label={p.exit_code} size="small" color={p.exit_code === 0 ? 'success' : 'error'} />
                        }
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const ProcessHistory: React.FC = () => (
  <ClusterGuard><ProcessHistoryInner /></ClusterGuard>
);

export default ProcessHistory;
