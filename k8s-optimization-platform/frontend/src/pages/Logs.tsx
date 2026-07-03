import React, { useState, useEffect, useRef } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  LinearProgress,
  IconButton,
  InputAdornment,
  Chip,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon,
  Description as LogIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const Logs: React.FC = () => {
  const { clusterParam } = useActiveCluster();

  // ── Selectors ─────────────────────────────────────────────────────────────
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);

  const [pods, setPods] = useState<string[]>([]);
  const [selectedPod, setSelectedPod] = useState('');
  const [loadingPods, setLoadingPods] = useState(false);

  const [tailLines, setTailLines] = useState('100');

  // ── Log output ─────────────────────────────────────────────────────────────
  const [rawLogs, setRawLogs] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logBoxRef = useRef<HTMLDivElement>(null);

  // ── Fetch namespaces on mount / cluster change ─────────────────────────────
  useEffect(() => {
    fetchNamespaces();
  }, [clusterParam]);

  // ── Fetch pods whenever namespace changes ──────────────────────────────────
  useEffect(() => {
    if (selectedNamespace) {
      setSelectedPod('');
      setPods([]);
      setRawLogs('');
      fetchPods(selectedNamespace);
    }
  }, [selectedNamespace]);

  const fetchNamespaces = async () => {
    try {
      setLoadingNamespaces(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/observability/namespaces`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: string[] = await res.json();
      setNamespaces(data);
      if (data.length > 0 && !selectedNamespace) {
        setSelectedNamespace(data[0]);
      }
    } catch (e: any) {
      setError('Failed to load namespaces: ' + e.message);
    } finally {
      setLoadingNamespaces(false);
    }
  };

  const fetchPods = async (ns: string) => {
    try {
      setLoadingPods(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/v1/observability/namespace-pods?namespace=${encodeURIComponent(ns)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: string[] = await res.json();
      setPods(data);
    } catch (e: any) {
      setError('Failed to load pods: ' + e.message);
      setPods([]);
    } finally {
      setLoadingPods(false);
    }
  };

  const fetchLogs = async () => {
    if (!selectedNamespace || !selectedPod) {
      setError('Select a namespace and pod first');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setSearchQuery('');
      setRawLogs('');
      const tail = Math.max(1, Math.min(10000, parseInt(tailLines, 10) || 100));
      const res = await fetch(
        `${API_BASE_URL}/v1/observability/pod-logs?namespace=${encodeURIComponent(selectedNamespace)}&pod=${encodeURIComponent(selectedPod)}&tail_lines=${tail}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRawLogs(data.logs || '(no log output)');
      setTimeout(() => logBoxRef.current?.scrollTo(0, 0), 50);
    } catch (e: any) {
      setError('Failed to fetch logs: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([rawLogs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPod}-${selectedNamespace}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Filtered / highlighted display ────────────────────────────────────────
  const displayedLines = rawLogs
    ? rawLogs.split('\n').filter(line =>
        searchQuery === '' || line.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const matchCount = searchQuery && rawLogs
    ? rawLogs.split('\n').filter(l => l.toLowerCase().includes(searchQuery.toLowerCase())).length
    : null;

  const highlightLine = (line: string): React.ReactNode => {
    if (!searchQuery) return line;
    const idx = line.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return line;
    return (
      <>
        {line.slice(0, idx)}
        <mark style={{ background: '#f5c518', color: '#000', borderRadius: 2 }}>
          {line.slice(idx, idx + searchQuery.length)}
        </mark>
        {line.slice(idx + searchQuery.length)}
      </>
    );
  };

  const lineColor = (line: string): string => {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('err]') || l.includes('fatal') || l.includes('critical')) return '#ff6b6b';
    if (l.includes('warn') || l.includes('warning')) return '#ffd93d';
    if (l.includes('info')) return '#6bcb77';
    return '#d4d4d4';
  };

  // ── Log-level summary ─────────────────────────────────────────────────────
  const allLines = rawLogs ? rawLogs.split('\n') : [];
  const logLevelCounts = {
    error: allLines.filter(l => /error|fatal|critical/i.test(l)).length,
    warn: allLines.filter(l => /warn/i.test(l)).length,
    info: allLines.filter(l => /info/i.test(l)).length,
    debug: allLines.filter(l => /debug/i.test(l)).length,
  };

  // Tiny log volume bar (last 20 lines grouped in 4 buckets of 5)
  const volumeBuckets = rawLogs
    ? Array.from({ length: Math.min(20, allLines.length / 5 + 1) }, (_, i) => {
        const chunk = allLines.slice(i * 5, i * 5 + 5);
        return chunk.filter(l => /error|warn/i.test(l)).length * 2 + chunk.length;
      })
    : [];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Log Stream</Typography>
          <Typography variant="body2" color="textSecondary" mt={0.5}>
            Real-time pod logs · structured parsing · Datadog-style viewer
          </Typography>
        </Box>
        <IconButton onClick={fetchNamespaces} color="primary" title="Refresh namespaces">
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Log Configuration</Typography>
          <Grid container spacing={2} alignItems="flex-end">

            {/* Namespace */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth disabled={loadingNamespaces}>
                <InputLabel>Namespace</InputLabel>
                <Select
                  value={selectedNamespace}
                  label="Namespace"
                  onChange={(e: SelectChangeEvent) => setSelectedNamespace(e.target.value)}
                  endAdornment={loadingNamespaces ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined}
                >
                  {namespaces.map(ns => (
                    <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Pod — Select, populated from namespace */}
            <Grid item xs={12} md={4}>
              <FormControl fullWidth disabled={!selectedNamespace || loadingPods}>
                <InputLabel>Pod</InputLabel>
                <Select
                  value={selectedPod}
                  label="Pod"
                  onChange={(e: SelectChangeEvent) => setSelectedPod(e.target.value)}
                  endAdornment={loadingPods ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined}
                >
                  {pods.length === 0 && !loadingPods && (
                    <MenuItem disabled value="">
                      {selectedNamespace ? 'No pods in this namespace' : 'Select a namespace first'}
                    </MenuItem>
                  )}
                  {pods.map(p => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Tail lines */}
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Tail Lines"
                type="number"
                value={tailLines}
                onChange={e => setTailLines(e.target.value)}
                inputProps={{ min: 1, max: 10000 }}
              />
            </Grid>

            {/* Fetch button */}
            <Grid item xs={12} md={3}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={fetchLogs}
                disabled={loading || !selectedNamespace || !selectedPod}
                sx={{ height: '56px' }}
              >
                {loading ? 'Fetching…' : 'Fetch Logs'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Log-level summary strip */}
      {rawLogs && (
        <Box display="flex" gap={2} mb={2} flexWrap="wrap" alignItems="center">
          <Typography variant="caption" color="textSecondary" fontWeight={600}>Log Levels:</Typography>
          {[
            { label: 'ERROR', count: logLevelCounts.error, color: '#ef4444' },
            { label: 'WARN', count: logLevelCounts.warn, color: '#f59e0b' },
            { label: 'INFO', count: logLevelCounts.info, color: '#22c55e' },
            { label: 'DEBUG', count: logLevelCounts.debug, color: '#9ca3af' },
          ].map(({ label, count, color }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
              bgcolor: color + '15', border: `1px solid ${color}`, borderRadius: 1, px: 1, py: 0.25 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />
              <Typography variant="caption" fontWeight={700} sx={{ color }}>{label}</Typography>
              <Typography variant="caption" sx={{ color }}>{count}</Typography>
            </Box>
          ))}
          {volumeBuckets.length > 1 && (
            <Box display="flex" alignItems="flex-end" gap="2px" height={20} ml={1}>
              {volumeBuckets.map((v, i) => {
                const max = Math.max(...volumeBuckets, 1);
                return (
                  <Box key={i} sx={{ width: 6, height: `${Math.max(20, (v / max) * 100)}%`,
                    bgcolor: '#3b82f6', borderRadius: '1px 1px 0 0', opacity: 0.7 }} />
                );
              })}
            </Box>
          )}
          <Typography variant="caption" color="textSecondary">{allLines.length} total lines</Typography>
        </Box>
      )}

      {/* Log Output */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" fontWeight={700}>Log Stream</Typography>
              {rawLogs && (
                <Chip
                  label={`${rawLogs.split('\n').length} lines`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
              {matchCount !== null && (
                <Chip
                  label={`${matchCount} match${matchCount !== 1 ? 'es' : ''}`}
                  size="small"
                  color={matchCount > 0 ? 'success' : 'default'}
                  variant="outlined"
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {/* Search within logs */}
              <TextField
                size="small"
                placeholder="Search logs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={!rawLogs}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery('')}><ClearIcon fontSize="small" /></IconButton>
                    </InputAdornment>
                  ) : undefined,
                }}
                sx={{ width: 220 }}
              />
              {rawLogs && (
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={downloadLogs}
                  size="small"
                  variant="outlined"
                >
                  Download
                </Button>
              )}
            </Box>
          </Box>

          {loading && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Fetching logs from cluster via agent — this may take up to 15s…
              </Typography>
            </Box>
          )}

          <Paper
            ref={logBoxRef}
            sx={{
              p: 2,
              bgcolor: '#1e1e1e',
              color: '#d4d4d4',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              maxHeight: '600px',
              overflow: 'auto',
              wordBreak: 'break-all',
            }}
          >
            {!rawLogs && !loading && (
              <Typography color="textSecondary" sx={{ fontFamily: 'inherit' }}>
                {`# 1. Select a namespace\n# 2. Select a pod from that namespace\n# 3. Set tail lines (default 100)\n# 4. Click "Fetch Logs"`}
              </Typography>
            )}
            {displayedLines.map((line, i) => (
              <Box
                key={i}
                component="div"
                sx={{ color: lineColor(line), minHeight: '1.3em' }}
              >
                {highlightLine(line)}
              </Box>
            ))}
          </Paper>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Logs;

// Made with Bob
