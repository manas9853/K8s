import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Terminal as TerminalIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface ProcessEntry {
  timestamp: string;
  pid: number;
  ppid: number;
  command: string;
  user: string;
  exit_code: number | null;
  duration: string;
}

interface ProcessHistoryResponse {
  pod_name: string;
  namespace: string;
  process_history: ProcessEntry[];
  cluster_name?: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildReason(entry: ProcessEntry, podName: string, namespace: string): string[] {
  const reasons: string[] = [];
  const command = entry.command?.toLowerCase() ?? '';

  reasons.push(`This process was observed in pod ${podName} under namespace ${namespace}. Process telemetry is tied to the currently selected suspicious pod from the backend.`);

  if (entry.user === 'root') {
    reasons.push('The process is running as root. Root execution inside a container increases the blast radius if the workload is compromised.');
  }

  if (command === '/bin/sh' || command.includes('sh')) {
    reasons.push('The active command is a shell process. An interactive shell inside a suspicious pod is important because attackers commonly use shells to explore the container and execute follow-up commands.');
  }

  if (entry.exit_code === null) {
    reasons.push('The process is still running, which means the suspicious execution context remains active and can continue making changes or spawning child processes.');
  }

  if (entry.ppid === 0 && entry.pid === 1) {
    reasons.push('This process is PID 1, so it is the primary process for the container. If the main process itself is a shell, that is a high-signal runtime concern.');
  }

  reasons.push(`Backend-reported execution duration is ${entry.duration}, which indicates whether the process is still active or already completed.`);
  return reasons;
}

const ProcessHistoryInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ProcessHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/process-history${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: ProcessHistoryResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load process history');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const processes = useMemo(() => data?.process_history ?? [], [data]);
  const runningProcesses = useMemo(() => processes.filter((process) => process.exit_code === null).length, [processes]);
  const rootProcesses = useMemo(() => processes.filter((process) => process.user === 'root').length, [processes]);
  const shellProcesses = useMemo(() => processes.filter((process) => (process.command ?? '').toLowerCase().includes('sh')).length, [processes]);

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
        <Alert severity="error">Failed to load process history</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <TerminalIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Process History
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real runtime process evidence for {data.pod_name} in {data.cluster_name || 'cluster'}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Pod', value: data.pod_name, color: '#e8eaf0', mono: true },
          { label: 'Namespace', value: data.namespace, color: '#e8eaf0', mono: true },
          { label: 'Observed Processes', value: String(processes.length), color: '#90caf9', mono: false },
          { label: 'Running Processes', value: String(runningProcesses), color: runningProcesses > 0 ? '#ffa726' : '#a5d6a7', mono: false },
          { label: 'Root Processes', value: String(rootProcesses), color: rootProcesses > 0 ? '#ef5350' : '#a5d6a7', mono: false },
          { label: 'Shell Processes', value: String(shellProcesses), color: shellProcesses > 0 ? '#ef5350' : '#a5d6a7', mono: false },
        ].map((item) => (
          <Grid item xs={12} sm={6} md={2} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245', height: '100%' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ color: item.color, fontFamily: item.mono ? 'monospace' : 'inherit', wordBreak: 'break-all', fontSize: item.mono ? 13 : 24 }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {processes.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Why these processes matter
          </Typography>
          <Stack spacing={1.5}>
            {processes.map((entry, index) => (
              <Box key={`${entry.timestamp}-${entry.pid}-${index}`} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" gap={1} flexWrap="wrap" mb={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0', fontFamily: 'monospace' }}>
                      {entry.command}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#8892a4' }}>
                      PID {entry.pid} · PPID {entry.ppid} · {formatTimestamp(entry.timestamp)}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip label={entry.user} size="small" sx={{ bgcolor: '#2a3245', color: entry.user === 'root' ? '#ef5350' : '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                    <Chip label={entry.exit_code === null ? 'running' : `exit ${entry.exit_code}`} size="small" sx={{ bgcolor: '#2a3245', color: entry.exit_code === null ? '#ffa726' : entry.exit_code === 0 ? '#a5d6a7' : '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                  </Box>
                </Box>
                <Stack spacing={0.75}>
                  {buildReason(entry, data.pod_name, data.namespace).map((reason) => (
                    <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                      • {reason}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 2.5, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 2 }}>
          Command Execution History
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Timestamp', 'PID', 'PPID', 'User', 'Command', 'Duration', 'Exit Code'].map((header) => (
                <TableCell key={header} sx={{ color: '#8892a4', fontWeight: 700, bgcolor: '#131d2e', borderColor: '#2a3245', fontSize: 12 }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {processes.map((entry, index) => (
              <TableRow key={`${entry.timestamp}-${entry.pid}-${index}`} hover sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12, minWidth: 145 }}>{formatTimestamp(entry.timestamp)}</TableCell>
                <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontFamily: 'monospace' }}>{entry.pid}</TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace' }}>{entry.ppid}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={entry.user} size="small" sx={{ bgcolor: '#2a3245', color: entry.user === 'root' ? '#ef5350' : '#90caf9', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ color: entry.user === 'root' ? '#ef5350' : '#e8eaf0', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12, minWidth: 220, fontWeight: entry.user === 'root' ? 700 : 400 }}>
                  {entry.command}
                </TableCell>
                <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontSize: 12 }}>{entry.duration}</TableCell>
                <TableCell sx={{ borderColor: '#2a3245' }}>
                  <Chip label={entry.exit_code === null ? 'running' : String(entry.exit_code)} size="small" sx={{ bgcolor: '#2a3245', color: entry.exit_code === null ? '#ffa726' : entry.exit_code === 0 ? '#a5d6a7' : '#ef5350', fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

const ProcessHistory: React.FC = () => (
  <ClusterGuard>
    <ProcessHistoryInner />
  </ClusterGuard>
);

export default ProcessHistory;
