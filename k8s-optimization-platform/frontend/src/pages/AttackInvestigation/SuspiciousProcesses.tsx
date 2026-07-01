import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button,
} from '@mui/material';
import { BugReport as BugIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface SuspiciousProcess {
  pid: number;
  name: string;
  pod: string;
  namespace: string;
  cpu_usage: number;
  memory_usage: number;
  command: string;
  user: string;
  risk_score: number;
  suspicious_indicators: string[];
}

interface ProcessData {
  total_suspicious: number;
  suspicious_processes: SuspiciousProcess[];
}

const SuspiciousProcessesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ProcessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-processes${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load suspicious processes</Alert>;

  const getRiskColor = (score: number): 'error' | 'warning' | 'info' | 'success' =>
    score >= 80 ? 'error' : score >= 60 ? 'warning' : score >= 40 ? 'info' : 'success';

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugIcon /> Suspicious Processes
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
                {data.suspicious_processes.filter(p => p.risk_score >= 80).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary">Running as Root</Typography>
              <Typography variant="h3">
                {data.suspicious_processes.filter(p => p.user === 'root').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Detected Suspicious Processes ({data.suspicious_processes.length})</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>PID</TableCell>
                  <TableCell>Process</TableCell>
                  <TableCell>Pod / Namespace</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Command</TableCell>
                  <TableCell align="center">CPU %</TableCell>
                  <TableCell align="center">Memory (MB)</TableCell>
                  <TableCell align="center">Risk</TableCell>
                  <TableCell>Indicators</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.suspicious_processes.map((p, i) => (
                  <TableRow key={i} hover sx={{ bgcolor: p.risk_score >= 80 ? '#fff5f5' : '#fffde7' }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{p.pid}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'error.main' }}>{p.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{p.pod}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.namespace}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={p.user} size="small" color={p.user === 'root' ? 'error' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem', maxWidth: 200, wordBreak: 'break-all' }}>
                      {p.command}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={Math.min(p.cpu_usage, 100)}
                          color={p.cpu_usage > 80 ? 'error' : 'warning'}
                          sx={{ width: 50, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption">{p.cpu_usage}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">{p.memory_usage}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LinearProgress variant="determinate" value={p.risk_score}
                          color={getRiskColor(p.risk_score)}
                          sx={{ width: 50, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption" fontWeight={700}>{p.risk_score}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {p.suspicious_indicators.slice(0, 2).map((ind, idx) => (
                          <Chip key={idx} label={ind} size="small" color="warning" variant="outlined" />
                        ))}
                        {p.suspicious_indicators.length > 2 && (
                          <Chip label={`+${p.suspicious_indicators.length - 2}`} size="small" />
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

const SuspiciousProcesses: React.FC = () => (
  <ClusterGuard><SuspiciousProcessesInner /></ClusterGuard>
);

export default SuspiciousProcesses;
