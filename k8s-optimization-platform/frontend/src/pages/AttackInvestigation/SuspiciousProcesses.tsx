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
import { colors } from '../../theme/colors';

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
  if (score >= 80) return colors.danger;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.info;
  return colors.success;
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
      <TableRow hover sx={{ '&:hover': { bgcolor: colors.surfaceHover } }}>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace' }}>{proc.pid}</TableCell>
        <TableCell sx={{ color: colors.danger, borderColor: colors.border, fontWeight: 700 }}>{proc.name}</TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 600 }}>{proc.pod}</Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>{proc.namespace}</Typography>
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip
            label={proc.user}
            size="small"
            sx={{ bgcolor: colors.border, color: proc.user === 'root' ? colors.danger : colors.textSecondary, fontWeight: 'bold', fontSize: 10 }}
          />
        </TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border, fontFamily: 'monospace', fontSize: 11, maxWidth: 200, wordBreak: 'break-all' }}>
          {proc.command}
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Typography variant="body2" sx={{ color: proc.cpu_usage >= 15 ? colors.danger : colors.textSecondary }}>
            {proc.cpu_usage}%
          </Typography>
        </TableCell>
        <TableCell sx={{ color: colors.textSecondary, borderColor: colors.border }}>{proc.memory_usage} MB</TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Chip label={String(proc.risk_score)} size="small" sx={{ bgcolor: colors.border, color: riskColor, fontWeight: 'bold' }} />
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {proc.suspicious_indicators.slice(0, 2).map((ind) => (
              <Chip key={ind} label={ind} size="small" sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10, height: 20 }} />
            ))}
            {proc.suspicious_indicators.length > 2 && (
              <Chip label={`+${proc.suspicious_indicators.length - 2}`} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: colors.border }}>
          <IconButton size="small" onClick={() => setOpen((value) => !value)} sx={{ color: colors.info }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: colors.surfaceAlt }}>
        <TableCell colSpan={10} sx={{ p: 0, borderColor: open ? colors.border : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.warning, mb: 1.5 }}>
                Why PID {proc.pid} ({proc.name}) is suspicious
              </Typography>
              <Stack spacing={1}>
                {reasons.map((reason) => (
                  <Typography key={reason} variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                    • {reason}
                  </Typography>
                ))}
              </Stack>
              {proc.suspicious_indicators.length > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.75 }}>
                    All Indicators
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75}>
                    {proc.suspicious_indicators.map((ind) => (
                      <Chip key={ind} label={ind} size="small" sx={{ bgcolor: colors.border, color: colors.warning, fontSize: 10 }} />
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

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-processes${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: ProcessData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suspicious processes');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const processes = useMemo(() => (Array.isArray(data?.suspicious_processes) ? data!.suspicious_processes : []), [data]);
  const criticalCount = useMemo(() => processes.filter((p) => p.risk_score >= 80).length, [processes]);
  const rootCount = useMemo(() => processes.filter((p) => p.user === 'root').length, [processes]);
  const highRiskProcesses = useMemo(() => processes.filter((p) => p.risk_score >= 60), [processes]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load suspicious processes</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BugIcon sx={{ fontSize: 32, color: colors.danger }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Suspicious Processes
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real threat-hunting output for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Suspicious', value: data.total_suspicious, color: colors.danger },
          { label: 'Critical Risk (≥80)', value: criticalCount, color: colors.danger },
          { label: 'Running as Root', value: rootCount, color: colors.warning },
          { label: 'High Risk (≥60)', value: highRiskProcesses.length, color: colors.warning },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {highRiskProcesses.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            High-Risk Processes — Why They Were Flagged
          </Typography>
          <Stack spacing={1.5}>
            {highRiskProcesses.slice(0, 4).map((proc) => (
              <Box key={`${proc.pod}-${proc.pid}`} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.danger }}>
                    PID {proc.pid} — {proc.name}
                  </Typography>
                  <Chip label={`Risk ${proc.risk_score}`} size="small" sx={{ bgcolor: colors.border, color: RISK_COLOR(proc.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                  {buildReason(proc)[0]}
                </Typography>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                  Pod: {proc.pod} · Namespace: {proc.namespace} · User: {proc.user} · Command: {proc.command}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary }}>
            Detected Suspicious Processes ({processes.length})
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            Derived from privileged and root-running pods. Expand a row for the full reason.
          </Typography>
        </Box>
        {processes.length === 0 ? (
          <Box p={4} textAlign="center">
            <Paper elevation={0} sx={{ maxWidth: 600, mx: 'auto', p: 4, border: `1px solid ${colors.border}`, borderRadius: 2, bgcolor: colors.surfaceAlt, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1 }}>
                No suspicious processes found
              </Typography>
              <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.7 }}>
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
                    <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 12, color: colors.textSecondary, bgcolor: colors.surfaceAlt, borderColor: colors.border, whiteSpace: 'nowrap' }}>
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
