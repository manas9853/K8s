import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Alert,
  Grid,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PVC {
  name: string;
  namespace: string;
  cluster_id: string;   // resolved cluster this PVC belongs to
  capacity: string;
  used_capacity: string;
  utilization_percent: number;
  status: string;
  storage_class: string;
  used_by_pods: string[];
}

interface Recommendation {
  severity: 'ok' | 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  action: string;
}

interface PodBreakdown {
  pod_name: string;
  namespace: string;
  status: string;
  node: string;
  owner_kind: string;
  owner_name: string;
  restarts: number;
  cpu_request: number;
  memory_request_mb: number;
  containers: string[];
}

interface PVCAnalysis {
  pvc_name: string;
  namespace: string;
  status: string;
  storage_class: string;
  access_modes: string[];
  total_capacity: string;
  used_space: string;
  free_space: string;
  usage_percentage: number;
  has_real_usage: boolean;
  mounting_pods_count: number;
  pod_breakdown: PodBreakdown[];
  recommendations: Recommendation[];
  note: string;
  data_source: string;
  // legacy
  file_count: number;
  old_files_count: number;
  potential_savings: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PVCFileAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam, activeClusterId } = useActiveCluster();

  const [analysis, setAnalysis]             = useState<PVCAnalysis | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [selectedPVC, setSelectedPVC]       = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [pvcs, setPvcs]                     = useState<PVC[]>([]);
  const [loadingPVCs, setLoadingPVCs]       = useState(true);

  useEffect(() => {
    fetchPVCs();
    setAnalysis(null);
    setError(null);
  }, [clusterParam]);

  const fetchPVCs = async () => {
    try {
      setLoadingPVCs(true);
      const qs = activeClusterId && activeClusterId !== 'all'
        ? `?cluster_id=${encodeURIComponent(activeClusterId)}`
        : '';
      const response = await fetch(`${API_BASE_URL}/v1/storage/pvcs-analysis${qs}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: PVC[] = await response.json();
      setPvcs(data);
      if (data.length > 0) {
        setSelectedNamespace(data[0].namespace);
        setSelectedPVC(data[0].name);
        setSelectedClusterId(data[0].cluster_id || '');
      }
    } catch (err: any) {
      console.error('Error fetching PVCs:', err);
    } finally {
      setLoadingPVCs(false);
    }
  };

  const analyzePVC = async (namespace: string, pvcName: string, clusterId?: string) => {
    try {
      setLoading(true);
      setError(null);
      setAnalysis(null);
      // Prefer the cluster_id embedded in the PVC item; fall back to active cluster selector
      const cid = clusterId || selectedClusterId || (activeClusterId !== 'all' ? activeClusterId : '');
      const qs = cid ? `?cluster_id=${encodeURIComponent(cid)}` : '';
      const response = await fetch(
        `${API_BASE_URL}/v1/storage/pvcs-analysis/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}${qs}`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${response.status}`);
      }
      const data: PVCAnalysis = await response.json();
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to analyse PVC');
    } finally {
      setLoading(false);
    }
  };

  // ── severity helpers ───────────────────────────────────────────────────────

  const severityColor = (s: string) => {
    if (s === 'critical') return 'error';
    if (s === 'warning')  return 'warning';
    if (s === 'ok')       return 'success';
    return 'info';
  };

  const SeverityIcon: React.FC<{ s: string }> = ({ s }) => {
    if (s === 'critical') return <ErrorIcon color="error" fontSize="small" />;
    if (s === 'warning')  return <WarningIcon color="warning" fontSize="small" />;
    if (s === 'ok')       return <CheckCircleIcon color="success" fontSize="small" />;
    return <InfoIcon color="info" fontSize="small" />;
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">PVC Analysis</Typography>
        </Box>
        {analysis && (
          <IconButton onClick={() => analyzePVC(analysis.namespace, analysis.pvc_name, selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        )}
      </Box>

      {/* PVC selector */}
      {loadingPVCs ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <LinearProgress />
            <Typography align="center" sx={{ mt: 2 }}>Loading PVCs…</Typography>
          </CardContent>
        </Card>
      ) : pvcs.length === 0 ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No PVCs found in the cluster. The agent may still be collecting data — wait 60 s and refresh.
        </Alert>
      ) : (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Select PVC to Analyse</Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Namespace</InputLabel>
                  <Select
                    value={selectedNamespace}
                    label="Namespace"
                    onChange={(e) => {
                      setSelectedNamespace(e.target.value);
                      const first = pvcs.find(p => p.namespace === e.target.value);
                      if (first) {
                        setSelectedPVC(first.name);
                        setSelectedClusterId(first.cluster_id || '');
                      }
                    }}
                  >
                    {Array.from(new Set(pvcs.map(p => p.namespace))).sort().map(ns => (
                      <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>PVC Name</InputLabel>
                  <Select
                    value={selectedPVC}
                    label="PVC Name"
                    onChange={(e) => {
                      setSelectedPVC(e.target.value);
                      const found = pvcs.find(p => p.name === e.target.value && p.namespace === selectedNamespace);
                      if (found) setSelectedClusterId(found.cluster_id || '');
                    }}
                  >
                    {pvcs
                      .filter(p => p.namespace === selectedNamespace)
                      .map(pvc => (
                        <MenuItem key={pvc.name} value={pvc.name}>
                          {pvc.name} — {pvc.capacity}
                          {pvc.used_by_pods.length > 0 &&
                            ` (${pvc.used_by_pods.length} pod${pvc.used_by_pods.length > 1 ? 's' : ''})`}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => analyzePVC(selectedNamespace, selectedPVC, selectedClusterId)}
                  disabled={!selectedNamespace || !selectedPVC || loading}
                  sx={{ height: 56 }}
                >
                  {loading ? <><CircularProgress size={18} sx={{ mr: 1 }} />Analysing…</> : 'Analyse PVC'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {!analysis && !error && !loading && (
        <Alert severity="info">
          Select a PVC above and click <strong>Analyse PVC</strong> to see real usage data collected by the agent.
        </Alert>
      )}

      {analysis && (
        <>
          {/* Capacity summary cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Total Capacity</Typography>
                  <Typography variant="h4">{analysis.total_capacity}</Typography>
                  <Typography variant="body2" color="textSecondary">{analysis.storage_class}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Used</Typography>
                  <Typography variant="h4"
                    color={analysis.usage_percentage > 85 ? 'error.main' : analysis.usage_percentage > 70 ? 'warning.main' : 'inherit'}>
                    {analysis.has_real_usage ? analysis.used_space : 'N/A'}
                  </Typography>
                  {analysis.has_real_usage && (
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(analysis.usage_percentage, 100)}
                      color={analysis.usage_percentage > 85 ? 'error' : analysis.usage_percentage > 70 ? 'warning' : 'primary'}
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Free</Typography>
                  <Typography variant="h4">
                    {analysis.has_real_usage ? analysis.free_space : 'N/A'}
                  </Typography>
                  {analysis.has_real_usage && (
                    <Typography variant="body2" color="textSecondary">
                      {analysis.usage_percentage}% utilised
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Mounting Pods</Typography>
                  <Typography variant="h4">{analysis.mounting_pods_count}</Typography>
                  <Typography variant="body2" color="textSecondary">
                    {analysis.access_modes.join(', ')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Data source note */}
          <Alert
            severity={analysis.has_real_usage ? 'success' : 'info'}
            sx={{ mb: 3 }}
            icon={analysis.has_real_usage ? <CheckCircleIcon /> : <InfoIcon />}
          >
            {analysis.note}
          </Alert>

          {/* Recommendations */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Recommendations</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {analysis.recommendations.map((rec, i) => (
                  <Alert
                    key={i}
                    severity={severityColor(rec.severity) as any}
                    icon={<SeverityIcon s={rec.severity} />}
                  >
                    <Typography variant="subtitle2"><strong>{rec.title}</strong></Typography>
                    <Typography variant="body2">{rec.detail}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <strong>Action:</strong> {rec.action}
                    </Typography>
                  </Alert>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Mounting pods breakdown */}
          {analysis.pod_breakdown.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Mounting Pods ({analysis.pod_breakdown.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Pod</strong></TableCell>
                        <TableCell><strong>Namespace</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Owner</strong></TableCell>
                        <TableCell><strong>Node</strong></TableCell>
                        <TableCell><strong>Restarts</strong></TableCell>
                        <TableCell><strong>CPU Req</strong></TableCell>
                        <TableCell><strong>Mem Req</strong></TableCell>
                        <TableCell><strong>Containers</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analysis.pod_breakdown.map((pod, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {pod.pod_name}
                            </Typography>
                          </TableCell>
                          <TableCell>{pod.namespace}</TableCell>
                          <TableCell>
                            <Chip
                              label={pod.status}
                              size="small"
                              color={pod.status === 'Running' ? 'success' : 'warning'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="textSecondary">
                              {pod.owner_kind && `${pod.owner_kind}: `}{pod.owner_name || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: 12 }}>{pod.node || '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={pod.restarts}
                              size="small"
                              color={pod.restarts > 10 ? 'error' : pod.restarts > 5 ? 'warning' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{pod.cpu_request ? `${pod.cpu_request} cores` : '—'}</TableCell>
                          <TableCell>{pod.memory_request_mb ? `${pod.memory_request_mb} MB` : '—'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: 11 }}>
                              {pod.containers.join(', ')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* No pods mounted */}
          {analysis.pod_breakdown.length === 0 && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              No running pods are currently mounting this PVC. It is allocated but idle.
            </Alert>
          )}
        </>
      )}
    </Box>
  );
};

export default PVCFileAnalysis;

// Made with Bob
