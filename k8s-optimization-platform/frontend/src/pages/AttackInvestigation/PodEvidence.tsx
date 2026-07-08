import React, { useEffect, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
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
import { FindInPage as EvidenceIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface SecurityContext {
  privileged?: boolean;
  run_as_user?: number;
  read_only_root_filesystem?: boolean;
  allow_privilege_escalation?: boolean;
}

interface Resources {
  cpu_request: number | string;
  memory_request_mb: number;
  cpu_limit: number | string;
  memory_limit_mb: number;
}

interface PodSpec {
  image: string;
  security_context: SecurityContext;
  resources: Resources;
}

interface Process {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

interface NetworkConnection {
  local: string;
  remote: string;
  state: string;
  bytes_sent: number;
  bytes_received: number;
}

interface FilesystemChange {
  path: string;
  action: string;
  timestamp: string;
}

interface PodEvidenceData {
  pod_name: string;
  namespace: string;
  evidence_collected: string;
  pod_spec: PodSpec;
  running_processes: Process[];
  network_connections: NetworkConnection[];
  file_system_changes: FilesystemChange[];
  cluster_name: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildReason(data: PodEvidenceData): string[] {
  const reasons: string[] = [];
  const sc = data.pod_spec?.security_context ?? {};
  const res = data.pod_spec?.resources;

  if (sc.privileged) {
    reasons.push('This pod is running in privileged mode, which grants it full access to the host kernel — equivalent to running as root on the node itself. This is one of the most dangerous container misconfigurations.');
  }
  if (sc.run_as_user === 0) {
    reasons.push('The primary process runs as UID 0 (root). If exploited, a root process can escape the container namespace through kernel bugs or misconfigured volume mounts.');
  }
  if (sc.read_only_root_filesystem === false) {
    reasons.push('The root filesystem is writable. An attacker can plant backdoors, modify binaries, or drop persistence scripts directly on the container filesystem.');
  }
  if (sc.allow_privilege_escalation) {
    reasons.push('Privilege escalation is allowed (allowPrivilegeEscalation: true). This means a child process inside the container can gain more privileges than its parent, enabling setuid attacks.');
  }

  const suspiciousProcs = (data.running_processes ?? []).filter((p) => p.name !== 'sh' && p.name !== 'pause');
  if (suspiciousProcs.length > 0) {
    reasons.push(`${suspiciousProcs.length} unexpected process${suspiciousProcs.length > 1 ? 'es' : ''} (${suspiciousProcs.map((p) => p.name).join(', ')}) were detected running inside this pod beyond the expected entrypoint.`);
  }

  if ((data.network_connections ?? []).length > 0) {
    const established = data.network_connections.filter((c) => c.state === 'ESTABLISHED');
    reasons.push(`${established.length} active network connection${established.length !== 1 ? 's' : ''} to external hosts ${established.slice(0, 2).map((c) => c.remote).join(', ')} detected — possible data exfiltration or C2 communication.`);
  }

  if ((data.file_system_changes ?? []).length > 0) {
    reasons.push(`${data.file_system_changes.length} filesystem modification${data.file_system_changes.length !== 1 ? 's' : ''} were recorded after container startup, indicating possible persistence or tampering.`);
  }

  const cpuLimit = Number(res?.cpu_limit) || 0;
  const memLimit = res?.memory_limit_mb || 0;
  if (cpuLimit === 0 && memLimit === 0) {
    reasons.push('No CPU or memory limits are set on this pod, allowing it to consume unlimited host resources — a common trait of crypto-mining workloads.');
  }

  if (reasons.length === 0) {
    reasons.push(`This pod (${data.pod_name}) was flagged as the highest-risk workload in namespace ${data.namespace} based on live cluster analysis. Review the security context and resource configuration above.`);
  }

  return reasons;
}

const SEC_CTX_ITEMS = (sc: SecurityContext) => [
  { label: 'Privileged', value: sc.privileged === true ? 'true' : sc.privileged === false ? 'false' : 'not set', bad: sc.privileged === true },
  { label: 'Run As User', value: sc.run_as_user !== undefined ? String(sc.run_as_user) : 'not set', bad: sc.run_as_user === 0 },
  { label: 'Read-Only Root FS', value: sc.read_only_root_filesystem === false ? 'false' : sc.read_only_root_filesystem === true ? 'true' : 'not set', bad: sc.read_only_root_filesystem === false },
  { label: 'Allow Privilege Escalation', value: sc.allow_privilege_escalation === true ? 'true' : sc.allow_privilege_escalation === false ? 'false' : 'not set', bad: sc.allow_privilege_escalation === true },
];

const PodEvidenceInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PodEvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const r = await fetch(`${API_BASE_URL}/v1/attack-investigation/pod-evidence${clusterParam}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const result: PodEvidenceData = await r.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load pod evidence');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

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
        <Alert severity="error">No pod evidence available</Alert>
      </Box>
    );
  }

  const reasons = buildReason(data);
  const sc = data.pod_spec?.security_context ?? {};
  const res = data.pod_spec?.resources;

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <EvidenceIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Pod Evidence
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Forensic evidence for <strong style={{ color: '#e8eaf0' }}>{data.pod_name}</strong> in cluster {data.cluster_name} · Collected {formatTimestamp(data.evidence_collected)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Pod', value: data.pod_name, mono: true },
          { label: 'Namespace', value: data.namespace, mono: true },
          { label: 'Running Processes', value: String(data.running_processes?.length ?? 0), mono: false },
          { label: 'Network Connections', value: String(data.network_connections?.length ?? 0), mono: false },
          { label: 'Filesystem Changes', value: String(data.file_system_changes?.length ?? 0), mono: false },
        ].map((item) => (
          <Grid item xs={12} sm={6} md key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', fontFamily: item.mono ? 'monospace' : 'inherit', wordBreak: 'break-all', fontSize: item.mono ? 13 : 18 }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Why this pod is suspicious */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#ffa726', mb: 1.5 }}>
          Why this pod is suspicious
        </Typography>
        <Stack spacing={1}>
          {reasons.map((reason, i) => (
            <Typography key={i} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.75 }}>
              • {reason}
            </Typography>
          ))}
        </Stack>
      </Paper>

      {/* Pod Spec */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Pod Specification
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Box sx={{ p: 1.5, bgcolor: '#131d2e', border: '1px solid #2a3245', borderRadius: 1, mb: 2 }}>
              <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.5 }}>Image</Typography>
              <Typography variant="body2" sx={{ color: '#60a5fa', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {data.pod_spec?.image ?? 'unknown'}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ p: 1.5, bgcolor: '#131d2e', border: '1px solid #2a3245', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 1 }}>Security Context</Typography>
              <Stack spacing={0.75}>
                {SEC_CTX_ITEMS(sc).map((item) => (
                  <Box key={item.label} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>{item.label}</Typography>
                    <Chip
                      label={item.value}
                      size="small"
                      sx={{ bgcolor: '#2a3245', color: item.bad ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ p: 1.5, bgcolor: '#131d2e', border: '1px solid #2a3245', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 1 }}>Resources</Typography>
              <Stack spacing={0.75}>
                {[
                  { label: 'CPU Request', value: res?.cpu_request !== undefined ? String(res.cpu_request) : 'none' },
                  { label: 'Memory Request', value: res?.memory_request_mb ? `${res.memory_request_mb} MB` : 'none' },
                  { label: 'CPU Limit', value: Number(res?.cpu_limit) ? String(res.cpu_limit) : 'none' },
                  { label: 'Memory Limit', value: res?.memory_limit_mb ? `${res.memory_limit_mb} MB` : 'none' },
                ].map((item) => (
                  <Box key={item.label} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>{item.label}</Typography>
                    <Chip
                      label={item.value}
                      size="small"
                      sx={{ bgcolor: '#2a3245', color: item.value === 'none' ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Running Processes */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Running Processes
        </Typography>
        {(data.running_processes ?? []).length === 0 ? (
          <Typography variant="body2" sx={{ color: '#8892a4' }}>No process telemetry available from the cluster.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['PID', 'Name', 'CPU %', 'Memory (MB)'].map((h) => (
                  <TableCell key={h} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.running_processes.map((p, i) => (
                <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace' }}>{p.pid}</TableCell>
                  <TableCell sx={{ color: p.name !== 'sh' ? '#ef5350' : '#a5d6a7', borderColor: '#2a3245', fontWeight: p.name !== 'sh' ? 700 : 400 }}>{p.name}</TableCell>
                  <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245' }}>{p.cpu}</TableCell>
                  <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245' }}>{p.memory}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Network Connections */}
      <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Network Connections
        </Typography>
        {(data.network_connections ?? []).length === 0 ? (
          <Typography variant="body2" sx={{ color: '#8892a4' }}>No active network connections detected for this pod. Live socket telemetry requires the k8s-agent running on the same node.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Local', 'Remote', 'State', 'Sent (KB)', 'Received (KB)'].map((h) => (
                  <TableCell key={h} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.network_connections.map((c, i) => (
                <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>{c.local}</TableCell>
                  <TableCell sx={{ color: '#ef5350', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{c.remote}</TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={c.state} size="small" sx={{ bgcolor: '#2a3245', color: c.state === 'ESTABLISHED' ? '#ef5350' : '#8892a4', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245' }}>{((c.bytes_sent ?? 0) / 1024).toFixed(1)}</TableCell>
                  <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245' }}>{((c.bytes_received ?? 0) / 1024).toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Filesystem Changes */}
      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Filesystem Changes
        </Typography>
        {(data.file_system_changes ?? []).length === 0 ? (
          <Typography variant="body2" sx={{ color: '#8892a4' }}>No filesystem modification events detected. inotify-based filesystem auditing requires the k8s-agent to be active on the pod's node.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Path', 'Action', 'Timestamp'].map((h) => (
                  <TableCell key={h} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.file_system_changes.map((f, i) => (
                <TableRow key={i} hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
                  <TableCell sx={{ color: '#60a5fa', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>{f.path}</TableCell>
                  <TableCell sx={{ borderColor: '#2a3245' }}>
                    <Chip label={f.action} size="small" sx={{ bgcolor: '#2a3245', color: f.action === 'created' ? '#ffa726' : '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                  </TableCell>
                  <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12 }}>{formatTimestamp(f.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
};

const PodEvidence: React.FC = () => (
  <ClusterGuard>
    <PodEvidenceInner />
  </ClusterGuard>
);

export default PodEvidence;
