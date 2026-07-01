import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button, Grid,
} from '@mui/material';
import { Memory as MinerIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const CryptoMinerDetectionInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/crypto-miner-detection${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load crypto miner detections</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MinerIcon /> Crypto Miner Detection
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Active Miners</Typography>
          <Typography variant="h3" color="error">{data.active_miners}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent>
          <Typography color="text.secondary">Total Detected</Typography>
          <Typography variant="h3">{data.total_detected}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#fff3e0' }}><CardContent>
          <Typography color="text.secondary">Est. Daily Cost Impact</Typography>
          <Typography variant="h5" color="warning.dark" fontWeight={700}>
            {data.miners?.reduce((s: number, m: any) => {
              const val = parseFloat((m.estimated_cost ?? '$0').replace('$', '').replace('/day', ''));
              return s + (isNaN(val) ? 0 : val);
            }, 0).toFixed(0) ?? 0}$/day
          </Typography>
        </CardContent></Card></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Detected Miners</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>ID</TableCell>
                  <TableCell>Pod / Namespace</TableCell>
                  <TableCell>Node</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="center">CPU %</TableCell>
                  <TableCell>Mining Pool</TableCell>
                  <TableCell>Hash Rate</TableCell>
                  <TableCell>Cost/Day</TableCell>
                  <TableCell>Detected</TableCell>
                  <TableCell>Indicators</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.miners ?? []).map((m: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: '#fff5f5' }}>
                    <TableCell><Chip label={m.id} size="small" variant="outlined" color="error" /></TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{m.pod}</Typography>
                      <Typography variant="caption" color="text.secondary">{m.namespace}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.node}</TableCell>
                    <TableCell><Chip label={m.miner_type} size="small" color="error" /></TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={Math.min(m.cpu_usage, 100)}
                          color="error" sx={{ width: 50, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption" fontWeight={700}>{m.cpu_usage}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'error.main' }}>{m.mining_pool}</TableCell>
                    <TableCell>{m.hash_rate}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'warning.dark' }}>{m.estimated_cost}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{new Date(m.detection_time).toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(m.suspicious_indicators ?? []).slice(0, 2).map((ind: string, idx: number) => (
                          <Chip key={idx} label={ind} size="small" color="error" variant="outlined" />
                        ))}
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

const CryptoMinerDetection: React.FC = () => (
  <ClusterGuard><CryptoMinerDetectionInner /></ClusterGuard>
);

export default CryptoMinerDetection;
