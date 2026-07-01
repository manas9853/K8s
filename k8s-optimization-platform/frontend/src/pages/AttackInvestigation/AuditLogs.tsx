import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button,
} from '@mui/material';
import { Article as LogIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const AuditLogsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/audit-logs${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load audit logs</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LogIcon /> Audit Logs
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography color="text.secondary">Total Events</Typography>
          <Typography variant="h3">{data.total_events}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1, bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Suspicious Events</Typography>
          <Typography variant="h3" color="error">{data.suspicious_events}</Typography>
        </CardContent></Card>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Suspicious Audit Events</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Verb</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Object</TableCell>
                  <TableCell align="center">HTTP</TableCell>
                  <TableCell align="center">Risk</TableCell>
                  <TableCell>Reason</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.events ?? []).map((e: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: e.risk_score >= 80 ? '#fff5f5' : '#fffde7' }}>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(e.timestamp).toLocaleString()}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{e.user}</TableCell>
                    <TableCell><Chip label={e.verb} size="small"
                      color={e.verb === 'create' || e.verb === 'delete' ? 'error' : 'warning'} /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.resource}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.namespace}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.object_name}</TableCell>
                    <TableCell align="center">
                      <Chip label={e.response_code} size="small"
                        color={e.response_code < 300 ? 'success' : e.response_code < 400 ? 'warning' : 'error'} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={e.risk_score} size="small"
                        color={e.risk_score >= 80 ? 'error' : e.risk_score >= 60 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{e.reason}</TableCell>
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

const AuditLogs: React.FC = () => (
  <ClusterGuard><AuditLogsInner /></ClusterGuard>
);

export default AuditLogs;
