import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, LinearProgress, Alert, Button,
  Accordion, AccordionSummary, AccordionDetails, Grid,
} from '@mui/material';
import { Map as MitreIcon, ExpandMore as ExpandIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const SEV_COLOR: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'success',
};

const MitreAttackMappingInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/mitre-attack${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load MITRE ATT&CK data</Alert>;

  const totalTechniques = (data.tactics ?? []).reduce((s: number, t: any) => s + (t.techniques ?? []).length, 0);
  const criticalCount = (data.tactics ?? []).flatMap((t: any) => t.techniques ?? [])
    .filter((t: any) => t.severity === 'critical').length;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MitreIcon /> MITRE ATT&CK Mapping
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: '#ffebee' }}><CardContent>
          <Typography color="text.secondary">Techniques Detected</Typography>
          <Typography variant="h3" color="error">{data.total_techniques_detected}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent>
          <Typography color="text.secondary">Tactics Covered</Typography>
          <Typography variant="h3">{data.tactics?.length ?? 0}</Typography>
        </CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card sx={{ bgcolor: criticalCount > 0 ? '#ffebee' : undefined }}><CardContent>
          <Typography color="text.secondary">Critical Techniques</Typography>
          <Typography variant="h3" color={criticalCount > 0 ? 'error' : 'inherit'}>{criticalCount}</Typography>
        </CardContent></Card></Grid>
      </Grid>

      {(data.tactics ?? []).map((tactic: any, ti: number) => (
        <Accordion key={ti} defaultExpanded sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandIcon />} sx={{ bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" fontWeight={700}>{tactic.name}</Typography>
              <Chip label={`${tactic.techniques?.length ?? 0} techniques`} size="small" />
              <Chip
                label={`${(tactic.techniques ?? []).reduce((s: number, t: any) => s + (t.detected ?? 0), 0)} detections`}
                size="small" color="error"
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>Technique ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="center">Detections</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Recent Incidents</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(tactic.techniques ?? []).map((tech: any, ti2: number) => (
                    <TableRow key={ti2} hover sx={{
                      bgcolor: tech.severity === 'critical' ? '#fff5f5' : tech.severity === 'high' ? '#fffde7' : undefined
                    }}>
                      <TableCell>
                        <Chip label={tech.id} size="small" variant="outlined" color="primary" />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{tech.name}</TableCell>
                      <TableCell align="center">
                        <Chip label={tech.detected} size="small"
                          color={tech.detected > 0 ? 'error' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Chip label={tech.severity} size="small"
                          color={SEV_COLOR[tech.severity] ?? 'default'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {(tech.recent_incidents ?? []).map((inc: string, idx: number) => (
                            <Chip key={idx} label={inc} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

const MitreAttackMapping: React.FC = () => (
  <ClusterGuard><MitreAttackMappingInner /></ClusterGuard>
);

export default MitreAttackMapping;
