import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { CloudOff as ExfilIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const DataExfiltrationInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/data-exfiltration${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load data exfiltration alerts</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ExfilIcon /> Data Exfiltration Detection
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Active Alerts</Typography>
          <Typography variant="h3" color="error">{data.active_alerts}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent>
          <Typography color="text.secondary">Total Detected</Typography>
          <Typography variant="h3">{data.total_detected}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: data.alerts?.some((a: any) => a.severity === 'critical') ? '#ffebee' : undefined }}>
          <CardContent>
            <Typography color="text.secondary">Critical Severity</Typography>
            <Typography variant="h3" color="error">
              {data.alerts?.filter((a: any) => a.severity === 'critical').length ?? 0}
            </Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Exfiltration Alerts</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>ID</TableCell>
                  <TableCell>Pod / Namespace</TableCell>
                  <TableCell>Data Transferred</TableCell>
                  <TableCell>Destination</TableCell>
                  <TableCell>Protocol</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Detected</TableCell>
                  <TableCell>Indicators</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.alerts ?? []).map((a: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: a.severity === 'critical' ? '#fff5f5' : '#fffde7' }}>
                    <TableCell><Chip label={a.id} size="small" variant="outlined" /></TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{a.pod}</Typography>
                      <Typography variant="caption" color="text.secondary">{a.namespace}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'error.main' }}>{a.data_transferred}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.destination}</TableCell>
                    <TableCell><Chip label={a.protocol} size="small" variant="outlined" /></TableCell>
                    <TableCell>
                      <Chip label={a.risk_score} size="small"
                        color={a.risk_score >= 90 ? 'error' : 'warning'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={a.severity} size="small"
                        color={a.severity === 'critical' ? 'error' : 'warning'} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(a.detection_time).toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(a.suspicious_indicators ?? []).slice(0, 2).map((ind: string, idx: number) => (
                          <Chip key={idx} label={ind} size="small" color="warning" variant="outlined" />
                        ))}
                        {(a.suspicious_indicators ?? []).length > 2 && (
                          <Chip label={`+${a.suspicious_indicators.length - 2}`} size="small" />
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

const DataExfiltration: React.FC = () => (
  <ClusterGuard><DataExfiltrationInner /></ClusterGuard>
);

export default DataExfiltration;
