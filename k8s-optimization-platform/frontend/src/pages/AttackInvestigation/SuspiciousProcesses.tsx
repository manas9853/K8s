import React, { useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  BugReport as BugIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
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
  cluster_name?: string;
  last_updated?: string;
}

const RISK_COLOR = (score: number) => {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildReason(proc: SuspiciousProcess): string[] {
  const reasons: string[] = [];

  if (proc.user === 'root') {
    reasons.push(`This process is running as root, meaning it has full system privileges inside the container — any exploit immediately gives host-level access.`);
  }

  if (proc.name === 'privileged-exec' || proc.command.includes('privileged')) {
    reasons.push(`The process name and command indicate it launched inside a privileged container, bypassing all Linux capability restrictions.`);
  }

  if (proc.cpu_usage >= 15) {
    reasons.push(`CPU usage of ${proc.cpu_usage}% is abnormally high for this workload type, suggesting active computation such as crypto-mining or brute-force activity.`);
  }

  if (proc.suspicious_indicators.length > 0) {
    reasons.push(`Pod-level signals feeding this process: ${proc.suspicious_indicators.join(' · ')}.`);
  }

  reasons.push(`Risk score ${proc.risk_score} places this process in the ${proc.risk_score >= 80 ? 'critical' : proc.risk_score >= 60 ? 'high' : 'medium'} tier.`);
  return reasons;
}

const ProcessRow: React.FC<{ proc: SuspiciousProcess }> = ({ proc }) => {
  const [open, setOpen] = useState(false);
  const riskColor = RISK_COLOR(proc.risk_score);
  const reasons = buildReason(proc);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace' }}>{proc.pid}</TableCell>
        <TableCell sx={{ color: '#ef5350', borderColor: '#2a3245', fontWeight: 700 }}>{proc.name}</TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Typography variant="body2" sx={{ color: '#e8eaf0', fontWeight: 600 }}>{proc.pod}</Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>{proc.namespace}</Typography>
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip
            label={proc.user}
            size="small"
            sx={{ bgcolor: '#2a3245', color: proc.user === 'root' ? '#ef5350' : '#8892a4', fontWeight: 'bold', fontSize: 10 }}
          />
        </TableCell>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 11, maxWidth: 200, wordBreak: 'break-all' }}>
          {proc.command}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Typography variant="body2" sx={{ color: proc.cpu_usage >= 15 ? '#ef5350' : '#8892a4' }}>
            {proc.cpu_usage}%
          </Typography>
        </TableCell>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245' }}>{proc.memory_usage} MB</TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={String(proc.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor, fontWeight: 'bold' }} />
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {proc.suspicious_indicators.slice(0, 2).map((ind) => (
              <Chip key={ind} label={ind} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20 }} />
            ))}
            {proc.suspicious_indicators.length > 2 && (
              <Chip label={`+${proc.suspicious_indicators.length - 2}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <IconButton size="small" onClick={() => setOpen((value) => !value)} sx={{ color: '#90caf9' }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: '#131d2e' }}>
        <TableCell colSpan={10} sx={{ p: 0, borderColor: open ? '#2a3245' : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#ffa726', mb: 1.5 }}>
                Why PID {proc.pid} ({proc.name}) is suspicious
              </Typography>
              <Stack spacing={1}>
                {reasons.map((reason) => (
                  <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                    • {reason}
                  </Typography>
                ))}
              </Stack>
              {proc.suspicious_indicators.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.75 }}>
                    All Indicators
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75}>
                    {proc.suspicious_indicators.map((ind) => (
                      <Chip key={ind} label={ind} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const SuspiciousProcessesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ProcessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-processes${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: ProcessData = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load suspicious processes');
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

  const processes = useMemo(() => (Array.isArray(data?.suspicious_processes) ? data!.suspicious_processes : []), [data]);
  const criticalCount = useMemo(() => processes.filter((p) => p.risk_score >= 80).length, [processes]);
  const rootCount = useMemo(() => processes.filter((p) => p.user === 'root').length, [processes]);
  const highRiskProcesses = useMemo(() => processes.filter((p) => p.risk_score >= 60), [processes]);

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
        <Alert severity="error">Failed to load suspicious processes</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BugIcon sx={{ fontSize: 32, color: '#ef5350' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Suspicious Processes
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real threat-hunting output for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Suspicious', value: data.total_suspicious, color: '#ef5350' },
          { label: 'Critical Risk (≥80)', value: criticalCount, color: '#ef5350' },
          { label: 'Running as Root', value: rootCount, color: '#ffa726' },
          { label: 'High Risk (≥60)', value: highRiskProcesses.length, color: '#ffa726' },
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

      {highRiskProcesses.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            High-Risk Processes — Why They Were Flagged
          </Typography>
          <Stack spacing={1.5}>
            {highRiskProcesses.slice(0, 4).map((proc) => (
              <Box key={`${proc.pod}-${proc.pid}`} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#ef5350' }}>
                    PID {proc.pid} — {proc.name}
                  </Typography>
                  <Chip label={`Risk ${proc.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: RISK_COLOR(proc.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                  {buildReason(proc)[0]}
                </Typography>
                <Typography variant="caption" sx={{ color: '#8892a4' }}>
                  Pod: {proc.pod} · Namespace: {proc.namespace} · User: {proc.user} · Command: {proc.command}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Detected Suspicious Processes ({processes.length})
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Derived from privileged and root-running pods. Expand a row for the full reason.
          </Typography>
        </Box>
        {processes.length === 0 ? (
          <Box p={4} textAlign="center">
            <Paper elevation={0} sx={{ maxWidth: 600, mx: 'auto', p: 4, border: '1px solid #2a3245', borderRadius: 2, bgcolor: '#131d2e', textAlign: 'center' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
                No suspicious processes found
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.7 }}>
                Processes are derived from privileged and root-running pods. The current cluster scan found no pods matching those criteria.
              </Typography>
            </Paper>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['PID', 'Process', 'Pod / Namespace', 'User', 'Command', 'CPU %', 'Memory', 'Risk', 'Indicators', 'Why'].map((heading) => (
                    <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {processes.map((proc) => <ProcessRow key={`${proc.pod}-${proc.pid}`} proc={proc} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const SuspiciousProcesses: React.FC = () => (
  <ClusterGuard>
    <SuspiciousProcessesInner />
  </ClusterGuard>
);

export default SuspiciousProcesses;
