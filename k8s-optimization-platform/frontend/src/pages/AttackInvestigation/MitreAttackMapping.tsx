import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Map as MitreIcon, ExpandMore as ExpandIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface MitreTechnique {
  id: string;
  name: string;
  detected: number;
  severity: string;
  description: string;
}

interface MitreTactic {
  name: string;
  techniques: MitreTechnique[];
}

interface MitreAttackResponse {
  total_techniques_detected: number;
  total_signal_count: number;
  tactics: MitreTactic[];
  cluster_name?: string;
  last_updated?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function severityColor(severity: string) {
  if (severity === 'critical') return '#ef5350';
  if (severity === 'high') return '#ffa726';
  if (severity === 'medium') return '#90caf9';
  return '#a5d6a7';
}

function buildTechniqueReason(technique: MitreTechnique, tacticName: string): string {
  const count = technique.detected;

  const descriptions: Record<string, string> = {
    T1611: `${count} privileged containers were detected that can break container isolation and escape to the host kernel. ` +
      `This is the MITRE ATT&CK technique T1611 (Escape to Host) — the most direct path from container compromise to full node compromise.`,
    T1548: `${count} pods have allowPrivilegeEscalation set to true. This enables child processes to gain higher privileges than their parent, ` +
      `matching MITRE T1548 (Abuse Elevation Control Mechanism).`,
    T1078: `${count} containers are running as UID 0 (root). Root processes have fewer syscall restrictions and are more likely to succeed at ` +
      `local privilege escalation attacks, mapped to MITRE T1078 (Valid Accounts).`,
    T1046: `${count} pods are using the host network namespace, giving them direct visibility of all cluster node services. ` +
      `An attacker can use this to enumerate running services across the entire node — MITRE T1046 (Network Service Scanning).`,
    T1613: `${count} host-network pods can also enumerate processes and containers running on the underlying node, ` +
      `matching MITRE T1613 (Container and Resource Discovery).`,
    T1528: `${count} pods are using the default service account whose token is auto-mounted. An attacker who compromises any of these pods ` +
      `gains a Kubernetes API token, enabling credential theft — MITRE T1528 (Steal Application Access Token).`,
    T1610: `${count} privileged containers are actively deployed in the cluster. ` +
      `MITRE T1610 (Deploy Container) covers the use of privileged containers as a vector to execute malicious workloads.`,
  };

  return descriptions[technique.id] ??
    `${count} signals detected for technique ${technique.id} under tactic ${tacticName}. ${technique.description}.`;
}

const MitreAttackMappingInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<MitreAttackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/mitre-attack${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: MitreAttackResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MITRE ATT&CK data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const allTechniques = useMemo(
    () => (data?.tactics ?? []).flatMap((t) => t.techniques),
    [data]
  );
  const criticalCount = useMemo(
    () => allTechniques.filter((t) => t.severity === 'critical' && t.detected > 0).length,
    [allTechniques]
  );
  const activeTechniques = useMemo(
    () => allTechniques.filter((t) => t.detected > 0),
    [allTechniques]
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load MITRE ATT&CK data</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <MitreIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              MITRE ATT&CK Mapping
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real technique detections for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Techniques Detected', value: data.total_techniques_detected, color: data.total_techniques_detected > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Total Signal Count', value: data.total_signal_count, color: '#90caf9' },
          { label: 'Tactics Covered', value: data.tactics.length, color: '#90caf9' },
          { label: 'Critical Techniques', value: criticalCount, color: criticalCount > 0 ? '#ef5350' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Active technique explanations */}
      {activeTechniques.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these techniques are detected
          </Typography>
          <Stack spacing={1.5}>
            {data.tactics.flatMap((tactic) =>
              tactic.techniques.filter((t) => t.detected > 0).map((tech) => (
                <Box key={tech.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                  <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip label={tech.id} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                          {tech.name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#8892a4' }}>
                        Tactic: {tactic.name}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={1}>
                      <Chip label={tech.severity.toUpperCase()} size="small" sx={{ bgcolor: '#2a3245', color: severityColor(tech.severity), fontWeight: 'bold', fontSize: 10 }} />
                      <Chip label={`${tech.detected} signals`} size="small" sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.75 }}>
                    {buildTechniqueReason(tech, tactic.name)}
                  </Typography>
                </Box>
              ))
            )}
          </Stack>
        </Paper>
      )}

      {/* Tactic accordions */}
      <Stack spacing={1}>
        {data.tactics.map((tactic) => {
          const tacticDetections = tactic.techniques.reduce((sum, t) => sum + t.detected, 0);
          return (
            <Accordion
              key={tactic.name}
              defaultExpanded
              sx={{
                bgcolor: '#1e2433',
                border: '1px solid #2a3245',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': { borderBottom: '1px solid #2a3245' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandIcon sx={{ color: '#8892a4' }} />}>
                <Box display="flex" alignItems="center" gap={2} width="100%">
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#e8eaf0' }}>
                    {tactic.name}
                  </Typography>
                  <Chip label={`${tactic.techniques.length} technique${tactic.techniques.length !== 1 ? 's' : ''}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                  <Chip
                    label={`${tacticDetections} signal${tacticDetections !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ bgcolor: '#2a3245', color: tacticDetections > 0 ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Technique ID', 'Name', 'Detections', 'Severity', 'Description'].map((header) => (
                        <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tactic.techniques.map((tech) => (
                      <TableRow key={tech.id} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Chip label={tech.id} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ color: '#e8eaf0', fontWeight: 700, borderColor: '#2a3245', minWidth: 200 }}>
                          {tech.name}
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Chip
                            label={String(tech.detected)}
                            size="small"
                            sx={{ bgcolor: '#2a3245', color: tech.detected > 0 ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Chip label={tech.severity} size="small" sx={{ bgcolor: '#2a3245', color: severityColor(tech.severity), fontWeight: 'bold', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 260 }}>
                          {tech.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Box>
  );
};

const MitreAttackMapping: React.FC = () => (
  <ClusterGuard>
    <MitreAttackMappingInner />
  </ClusterGuard>
);

export default MitreAttackMapping;
