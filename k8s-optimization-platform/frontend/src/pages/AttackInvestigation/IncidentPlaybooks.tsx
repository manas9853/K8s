import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, LinearProgress, Alert, Button, Grid,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper,
} from '@mui/material';
import { PlayArrow as PlaybookIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const SEV_COLOR: Record<string, 'error' | 'warning' | 'info'> = {
  critical: 'error', high: 'warning', medium: 'info',
};

const AUTOMATION_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  'fully-automated': 'success', 'semi-automated': 'warning', 'manual': 'default',
};

const IncidentPlaybooksInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/playbooks${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load playbooks</Alert>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlaybookIcon /> Incident Playbooks
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent>
          <Typography color="text.secondary">Total Playbooks</Typography>
          <Typography variant="h3">{data.total_playbooks}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Critical Severity</Typography>
          <Typography variant="h3" color="error">
            {(data.playbooks ?? []).filter((p: any) => p.severity === 'critical').length}
          </Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#e8f5e9' }}><CardContent>
          <Typography color="text.secondary">Semi/Fully Automated</Typography>
          <Typography variant="h3" color="success.main">
            {(data.playbooks ?? []).filter((p: any) => p.automation_level !== 'manual').length}
          </Typography>
        </CardContent></Card></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Available Playbooks</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell align="center">Steps</TableCell>
                  <TableCell>Est. Time</TableCell>
                  <TableCell>Automation</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.playbooks ?? []).map((p: any, i: number) => (
                  <TableRow key={i} hover sx={{ bgcolor: p.severity === 'critical' ? '#fff5f5' : undefined }}>
                    <TableCell><Chip label={p.id} size="small" variant="outlined" /></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{p.description}</TableCell>
                    <TableCell>
                      <Chip label={p.severity} size="small" color={SEV_COLOR[p.severity] ?? 'default'} />
                    </TableCell>
                    <TableCell align="center">{p.steps}</TableCell>
                    <TableCell>{p.estimated_time}</TableCell>
                    <TableCell>
                      <Chip label={p.automation_level} size="small"
                        color={AUTOMATION_COLOR[p.automation_level] ?? 'default'} />
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="contained" color="primary" startIcon={<PlaybookIcon />}>
                        Execute
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

const IncidentPlaybooks: React.FC = () => (
  <ClusterGuard><IncidentPlaybooksInner /></ClusterGuard>
);

export default IncidentPlaybooks;
