import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress,
  Alert,
} from '@mui/material';
import {
  SwapHoriz as TrafficIcon,
  Lock as RestrictedIcon,
  LockOpen as UnrestrictedIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface TrafficFlow {
  source_namespace: string;
  target_namespace: string;
  is_restricted: boolean;
  risk_level: 'low' | 'medium' | 'high';
  connection_count: number;
  protocols: string[];
  has_network_policy: boolean;
  recommendation: string;
}

interface EastWestData {
  east_west_score: number;
  total_traffic_flows: number;
  restricted_flows: number;
  unrestricted_flows: number;
  traffic_flows: TrafficFlow[];
  recommendations: string[];
  last_scan: string;
}

const RISK_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

const EastWestTraffic: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<EastWestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE_URL}/v1/security/network-security/east-west-traffic${clusterParam}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(() => { setError(true); setLoading(false); });
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load east-west traffic data</Alert>;

  const scoreColor = data.east_west_score >= 80 ? '#2e7d32' : data.east_west_score >= 50 ? '#e65100' : '#b71c1c';

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrafficIcon /> East-West Traffic
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ border: `2px solid ${scoreColor}` }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>East-West Score</Typography>
              <Typography variant="h3" sx={{ color: scoreColor, fontWeight: 700 }}>
                {data.east_west_score}
                <Typography component="span" variant="h6" color="text.secondary">/100</Typography>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={data.east_west_score}
                  sx={{
                    height: 8, borderRadius: 4, bgcolor: '#2a3245',
                    '& .MuiLinearProgress-bar': { bgcolor: scoreColor },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card><CardContent>
            <Typography color="text.secondary" gutterBottom>Total Traffic Flows</Typography>
            <Typography variant="h3">{data.total_traffic_flows}</Typography>
          </CardContent></Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#0d2d1a', border: '1px solid #4ade8040' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Restricted Flows</Typography>
              <Typography variant="h3" sx={{ color: '#2e7d32' }}>{data.restricted_flows}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: '#2d1515', border: '1px solid #f8717140' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Unrestricted Flows</Typography>
              <Typography variant="h3" sx={{ color: data.unrestricted_flows > 0 ? '#b71c1c' : 'inherit' }}>
                {data.unrestricted_flows}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Traffic Flow Analysis</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#131d2e' }}>
                  <TableCell>Source Namespace</TableCell>
                  <TableCell align="center">→</TableCell>
                  <TableCell>Target Namespace</TableCell>
                  <TableCell align="center">Connections</TableCell>
                  <TableCell>Protocols</TableCell>
                  <TableCell>Network Policy</TableCell>
                  <TableCell>Risk</TableCell>
                  <TableCell>Recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.traffic_flows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No traffic flows detected
                    </TableCell>
                  </TableRow>
                ) : data.traffic_flows.slice(0, 100).map((flow, i) => (
                  <TableRow key={i} hover sx={{
                    bgcolor:
                      flow.risk_level === 'high' ? '#fff5f5' :
                      flow.risk_level === 'medium' ? '#fffde7' : undefined,
                  }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>
                      {flow.source_namespace}
                    </TableCell>
                    <TableCell align="center" sx={{ color: 'text.secondary' }}>→</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>
                      {flow.target_namespace}
                    </TableCell>
                    <TableCell align="center">{flow.connection_count.toLocaleString()}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {flow.protocols.map(p => (
                          <Chip key={p} label={p} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {flow.has_network_policy
                          ? <><RestrictedIcon fontSize="small" color="success" /><Typography variant="caption" color="success.main">Restricted</Typography></>
                          : <><UnrestrictedIcon fontSize="small" color="error" /><Typography variant="caption" color="error.main">None</Typography></>
                        }
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={flow.risk_level} size="small" color={RISK_COLOR[flow.risk_level]} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {flow.recommendation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Last scan: {new Date(data.last_scan).toLocaleString()}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default EastWestTraffic;
