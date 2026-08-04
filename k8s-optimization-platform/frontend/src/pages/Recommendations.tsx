import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
  Card,
  CardContent,
  Button,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Snackbar
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Info,
  Refresh,
  PlayArrow,
  AccessTime,
  Close,
  ArrowForward,
  History,
  Undo,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// Simulation resource interface
interface SimulationResource {
  resource_id: string;
  resource_type: string;
  cluster: string;
  namespace: string;
  name: string;
  cpu_request: number;
  cpu_limit: number;
  cpu_usage: number;
  memory_request: number;
  memory_limit: number;
  memory_usage: number;
  status: string;
  restarts: number;
  cost_per_hour: number;
  last_updated: string;
}

interface CPURecommendation {
  current_usage: number;
  current_request: number;
  current_limit: number;
  recommended_request: number;
  recommended_limit: number;
  cpu_saved: number;
  cost_saved: number;
}

interface MemoryRecommendation {
  current_usage: number;
  peak_usage: number;
  current_request: number;
  current_limit: number;
  recommended_request: number;
  recommended_limit: number;
  memory_saved: number;
  cost_saved: number;
}

interface Recommendation {
  cluster_id: string;
  namespace: string;
  workload_type: string;
  workload_name: string;
  status: string;
  confidence: string;
  cpu: CPURecommendation;
  memory: MemoryRecommendation;
  estimated_monthly_savings: number;
  performance_impact: string;
  created_at: string;
  resource_id?: string;
  live_data?: SimulationResource;
}

// Change Event interface
interface ChangeEvent {
  event_id: string;
  event_type: string;
  resource_type: string;
  resource_id: string;
  cluster: string;
  namespace: string;
  changes: Record<string, any>;
  before_state: Record<string, any>;
  after_state: Record<string, any>;
  cost_impact: number;
  timestamp: string;
  user: string;
  reason: string;
}

const Recommendations: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<Recommendation[]>([]);
  const [simulationResources, setSimulationResources] = useState<SimulationResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [minSavings, setMinSavings] = useState<string>('');

  // Fix Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [applyingFix, setApplyingFix] = useState(false);
  
  // Success notification state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  // Change History state
  const [changeHistory, setChangeHistory] = useState<ChangeEvent[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ChangeEvent | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    fetchRecommendations();
    fetchSimulationResources();
    
    // Poll simulation data and history every 5 seconds
    const interval = setInterval(() => {
      fetchSimulationResources();
      fetchChangeHistory();
    }, 5000);
    
    // Initial fetch of change history
    fetchChangeHistory();
    
    return () => clearInterval(interval);
  }, [clusterParam]);

  useEffect(() => {
    applyFilters();
  }, [recommendations, clusterFilter, namespaceFilter, confidenceFilter, minSavings]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/recommendations/${clusterParam}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json();
      setRecommendations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchSimulationResources = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/simulation/resources${clusterParam}`);
      if (response.ok) {
        const data = await response.json();
        setSimulationResources(data);
        setLastUpdated(new Date().toLocaleTimeString());
        
        // Merge simulation data with recommendations
        setRecommendations(prev => prev.map(rec => {
          const simResource = data.find((r: SimulationResource) => 
            r.cluster === rec.cluster_id && 
            r.namespace === rec.namespace && 
            r.name === rec.workload_name
          );
          return simResource ? { ...rec, live_data: simResource, resource_id: simResource.resource_id } : rec;
        }));
      }
    } catch (err) {
      console.error('Failed to fetch simulation resources:', err);
    }
  };

  const fetchChangeHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/simulation/history${clusterParam}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setChangeHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch change history:', err);
    }
  };

  const handleOpenRollbackDialog = (event: ChangeEvent) => {
    setSelectedEvent(event);
    setRollbackDialogOpen(true);
  };

  const handleCloseRollbackDialog = () => {
    setRollbackDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleRollback = async () => {
    if (!selectedEvent) return;

    setRollingBack(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/simulation/rollback${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEvent.event_id,
          user: 'admin'
        })
      });

      if (response.ok) {
        setSnackbarMessage('Change rolled back successfully!');
        setSnackbarOpen(true);
        handleCloseRollbackDialog();
        
        // Refresh data
        fetchSimulationResources();
        fetchChangeHistory();
        fetchRecommendations();
      } else {
        const error = await response.json();
        setSnackbarMessage(`Rollback failed: ${error.detail || 'Unknown error'}`);
        setSnackbarOpen(true);
      }
    } catch (err) {
      setSnackbarMessage('Failed to rollback change');
      setSnackbarOpen(true);
    } finally {
      setRollingBack(false);
    }
  };

  const handleOpenPreview = (rec: Recommendation) => {
    setSelectedRecommendation(rec);
    setPreviewModalOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewModalOpen(false);
    setSelectedRecommendation(null);
  };

  const handleApplyFix = async () => {
    if (!selectedRecommendation || !selectedRecommendation.resource_id) return;

    setApplyingFix(true);
    try {
      // Determine fix type based on recommendation status
      let fixType = 'optimize';
      if (selectedRecommendation.status.includes('reduce_cpu')) fixType = 'reduce_cpu';
      else if (selectedRecommendation.status.includes('reduce_memory')) fixType = 'reduce_memory';
      else if (selectedRecommendation.status.includes('increase_memory')) fixType = 'increase_memory';

      const response = await fetch(`${API_BASE_URL}/v1/simulation/fix${clusterParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: selectedRecommendation.resource_id,
          fix_type: fixType,
          new_values: {
            cpu_request: selectedRecommendation.cpu.recommended_request,
            cpu_limit: selectedRecommendation.cpu.recommended_limit,
            memory_request: selectedRecommendation.memory.recommended_request,
            memory_limit: selectedRecommendation.memory.recommended_limit
          },
          user: 'admin'
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSnackbarMessage(
          `✅ Fix applied successfully! Saved $${result.cost_impact.toFixed(2)}/month`
        );
        setSnackbarOpen(true);
        handleClosePreview();
        // Refresh data
        fetchSimulationResources();
      } else {
        throw new Error('Failed to apply fix');
      }
    } catch (err) {
      setSnackbarMessage('❌ Failed to apply fix. Please try again.');
      setSnackbarOpen(true);
    } finally {
      setApplyingFix(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...recommendations];
    if (clusterFilter !== 'all') filtered = filtered.filter(r => r.cluster_id === clusterFilter);
    if (namespaceFilter !== 'all') filtered = filtered.filter(r => r.namespace === namespaceFilter);
    if (confidenceFilter !== 'all') filtered = filtered.filter(r => r.confidence === confidenceFilter);
    if (minSavings) {
      const minValue = parseFloat(minSavings);
      if (!isNaN(minValue)) filtered = filtered.filter(r => r.estimated_monthly_savings >= minValue);
    }
    setFilteredRecommendations(filtered);
  };

  const getStatusIcon = (status: string) => {
    if (status.includes('reduce')) return <TrendingDown color="success" />;
    if (status.includes('increase')) return <TrendingUp color="warning" />;
    return <CheckCircle color="success" />;
  };

  const getStatusColor = (status: string): "success" | "warning" | "info" | "default" => {
    if (status.includes('reduce')) return 'success';
    if (status.includes('increase')) return 'warning';
    return 'info';
  };

  const getConfidenceColor = (confidence: string): "success" | "warning" | "error" | "default" => {
    if (confidence === 'low_risk') return 'success';
    if (confidence === 'medium_risk') return 'warning';
    return 'error';
  };

  const formatStatus = (status: string) => status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const formatConfidence = (confidence: string) => confidence.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const formatMemory = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

  const uniqueClusters = Array.from(new Set(recommendations.map(r => r.cluster_id)));
  const uniqueNamespaces = Array.from(new Set(recommendations.map(r => r.namespace)));
  const totalSavings = filteredRecommendations.reduce((sum, r) => sum + r.estimated_monthly_savings, 0);
  const savingsOpportunities = filteredRecommendations.filter(r => r.estimated_monthly_savings > 0).length;

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Resource Optimization Recommendations</Typography>
          {lastUpdated && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <AccessTime fontSize="small" color="action" />
              <Typography variant="caption" color="textSecondary">
                Live data updated: {lastUpdated}
              </Typography>
              <Badge color="success" variant="dot" sx={{ ml: 1 }} />
            </Box>
          )}
        </Box>
        <IconButton onClick={() => { fetchRecommendations(); fetchSimulationResources(); }} color="primary">
          <Refresh />
        </IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Total Recommendations</Typography>
              <Typography variant="h4">{filteredRecommendations.length}</Typography>
              <Typography variant="caption" color="textSecondary">
                Across {Array.from(new Set(simulationResources.map(r => r.cluster))).length} clusters
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Savings Opportunities</Typography>
              <Typography variant="h4" color="success.main">{savingsOpportunities}</Typography>
              <Typography variant="caption" color="textSecondary">
                {simulationResources.filter(r => r.status === 'over_provisioned').length} over-provisioned pods
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Potential Monthly Savings</Typography>
              <Typography variant="h4" color="success.main">${totalSavings.toFixed(0)}</Typography>
              <Typography variant="caption" color="textSecondary">
                Based on live resource data
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Low Risk Actions</Typography>
              <Typography variant="h4" color="info.main">
                {filteredRecommendations.filter(r => r.confidence === 'low_risk').length}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Safe to apply immediately
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Cluster</InputLabel><Select value={clusterFilter} label="Cluster" onChange={(e) => setClusterFilter(e.target.value)}><MenuItem value="all">All Clusters</MenuItem>{uniqueClusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Namespace</InputLabel><Select value={namespaceFilter} label="Namespace" onChange={(e) => setNamespaceFilter(e.target.value)}><MenuItem value="all">All Namespaces</MenuItem>{uniqueNamespaces.map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}</Select></FormControl></Grid>
          <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Confidence</InputLabel><Select value={confidenceFilter} label="Confidence" onChange={(e) => setConfidenceFilter(e.target.value)}><MenuItem value="all">All Levels</MenuItem><MenuItem value="low_risk">Low Risk</MenuItem><MenuItem value="medium_risk">Medium Risk</MenuItem><MenuItem value="high_risk">High Risk</MenuItem></Select></FormControl></Grid>
          <Grid item xs={12} sm={6} md={3}><TextField fullWidth size="small" label="Min Savings ($)" type="number" value={minSavings} onChange={(e) => setMinSavings(e.target.value)} /></Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Workload</TableCell>
              <TableCell>Cluster / Namespace</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell align="right">CPU (Live)</TableCell>
              <TableCell align="right">Memory (Live)</TableCell>
              <TableCell align="right">Current Cost</TableCell>
              <TableCell align="right">Savings</TableCell>
              <TableCell>Impact</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRecommendations.map((rec, idx) => {
              const liveData = rec.live_data;
              const currentCostPerMonth = liveData ? liveData.cost_per_hour * 730 : 0;
              
              return (
                <TableRow key={idx} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{rec.workload_name}</Typography>
                    <Typography variant="caption" color="textSecondary">{rec.workload_type}</Typography>
                    {liveData && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Badge color="success" variant="dot" />
                        <Typography variant="caption" color="success.main">Live</Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{rec.cluster_id}</Typography>
                    <Typography variant="caption" color="textSecondary">{rec.namespace}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      icon={getStatusIcon(rec.status)} 
                      label={formatStatus(rec.status)} 
                      color={getStatusColor(rec.status)} 
                      size="small" 
                    />
                    {liveData && liveData.restarts > 0 && (
                      <Tooltip title={`${liveData.restarts} restarts detected`}>
                        <Chip 
                          label={`${liveData.restarts} restarts`} 
                          color="warning" 
                          size="small" 
                          sx={{ ml: 0.5, mt: 0.5 }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={formatConfidence(rec.confidence)} 
                      color={getConfidenceColor(rec.confidence)} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell align="right">
                    {liveData ? (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {liveData.cpu_usage.toFixed(2)} / {liveData.cpu_request.toFixed(1)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          Usage / Request
                        </Typography>
                        <Typography variant="caption" display="block" color="primary">
                          → {rec.cpu.recommended_request.toFixed(1)} (rec)
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2">
                        {rec.cpu.current_request.toFixed(1)} → {rec.cpu.recommended_request.toFixed(1)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {liveData ? (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {formatMemory(liveData.memory_usage)} / {formatMemory(liveData.memory_request)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          Usage / Request
                        </Typography>
                        <Typography variant="caption" display="block" color="primary">
                          → {formatMemory(rec.memory.recommended_request)} (rec)
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2">
                        {formatMemory(rec.memory.current_request)} → {formatMemory(rec.memory.recommended_request)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {liveData ? (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          ${currentCostPerMonth.toFixed(2)}/mo
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          ${liveData.cost_per_hour.toFixed(4)}/hr
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="textSecondary">N/A</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography 
                      variant="body2" 
                      fontWeight="bold" 
                      color={rec.estimated_monthly_savings > 0 ? 'success.main' : 'error.main'}
                    >
                      ${rec.estimated_monthly_savings.toFixed(0)}/mo
                    </Typography>
                    {rec.estimated_monthly_savings > 0 && currentCostPerMonth > 0 && (
                      <Typography variant="caption" color="success.main">
                        {((rec.estimated_monthly_savings / currentCostPerMonth) * 100).toFixed(0)}% reduction
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={rec.performance_impact}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                        {rec.performance_impact}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<PlayArrow />}
                      disabled={!rec.resource_id}
                      onClick={() => handleOpenPreview(rec)}
                      sx={{ minWidth: 100 }}
                    >
                      Fix Now
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredRecommendations.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="textSecondary">
            No recommendations found
          </Typography>
        </Box>
      )}

      {/* Fix Preview Modal */}
      <Dialog 
        open={previewModalOpen} 
        onClose={handleClosePreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Fix Preview</Typography>
            <IconButton onClick={handleClosePreview} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedRecommendation && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                <strong>{selectedRecommendation.workload_name}</strong> ({selectedRecommendation.workload_type})
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {selectedRecommendation.cluster_id} / {selectedRecommendation.namespace}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="subtitle2" gutterBottom color="error">
                      Current State
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2"><strong>CPU Request:</strong> {selectedRecommendation.cpu.current_request.toFixed(1)}</Typography>
                      <Typography variant="body2"><strong>CPU Limit:</strong> {selectedRecommendation.cpu.current_limit.toFixed(1)}</Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}><strong>Memory Request:</strong> {formatMemory(selectedRecommendation.memory.current_request)}</Typography>
                      <Typography variant="body2"><strong>Memory Limit:</strong> {formatMemory(selectedRecommendation.memory.current_limit)}</Typography>
                      {selectedRecommendation.live_data && (
                        <Typography variant="body2" sx={{ mt: 1 }} color="error.main">
                          <strong>Current Cost:</strong> ${(selectedRecommendation.live_data.cost_per_hour * 730).toFixed(2)}/mo
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, bgcolor: 'success.50' }}>
                    <Typography variant="subtitle2" gutterBottom color="success.main">
                      After Fix
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2"><strong>CPU Request:</strong> {selectedRecommendation.cpu.recommended_request.toFixed(1)}</Typography>
                      <Typography variant="body2"><strong>CPU Limit:</strong> {selectedRecommendation.cpu.recommended_limit.toFixed(1)}</Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}><strong>Memory Request:</strong> {formatMemory(selectedRecommendation.memory.recommended_request)}</Typography>
                      <Typography variant="body2"><strong>Memory Limit:</strong> {formatMemory(selectedRecommendation.memory.recommended_limit)}</Typography>
                      {selectedRecommendation.live_data && (
                        <Typography variant="body2" sx={{ mt: 1 }} color="success.main">
                          <strong>New Cost:</strong> ${((selectedRecommendation.live_data.cost_per_hour * 730) - selectedRecommendation.estimated_monthly_savings).toFixed(2)}/mo
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
                <Typography variant="h6" color="success.main" gutterBottom>
                  💰 Estimated Savings: ${selectedRecommendation.estimated_monthly_savings.toFixed(2)}/month
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  <strong>Confidence:</strong> {formatConfidence(selectedRecommendation.confidence)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  <strong>Performance Impact:</strong> {selectedRecommendation.performance_impact}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePreview} disabled={applyingFix}>
            Cancel
          </Button>
          <Button 
            onClick={handleApplyFix} 
            variant="contained" 
            color="primary"
            disabled={applyingFix}
            startIcon={applyingFix ? <CircularProgress size={20} /> : <ArrowForward />}
          >
            {applyingFix ? 'Applying...' : 'Apply Fix'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change History Panel */}
      <Paper sx={{ mt: 4, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <History color="primary" />
            <Typography variant="h6">Change History</Typography>
            <Chip
              label={changeHistory.length}
              size="small"
              color="primary"
            />
          </Box>
          <Button
            size="small"
            startIcon={historyExpanded ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            {historyExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </Box>

        {historyExpanded && (
          <>
            {changeHistory.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="textSecondary">
                  No changes applied yet. Apply a fix to see it here.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>Resource</TableCell>
                      <TableCell>Cluster</TableCell>
                      <TableCell>Namespace</TableCell>
                      <TableCell>Change Type</TableCell>
                      <TableCell align="right">Cost Impact</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {changeHistory.map((event) => (
                      <TableRow key={event.event_id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccessTime fontSize="small" color="action" />
                            <Typography variant="body2">
                              {new Date(event.timestamp).toLocaleString()}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {event.before_state.name || 'N/A'}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {event.resource_type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={event.cluster} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip label={event.namespace} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={event.event_type.replace('_', ' ')}
                            size="small"
                            color={event.event_type.includes('reduce') ? 'success' : 'info'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight="bold"
                            color={event.cost_impact < 0 ? 'success.main' : 'error.main'}
                          >
                            {event.cost_impact < 0 ? '-' : '+'}${Math.abs(event.cost_impact * 730).toFixed(2)}/mo
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {event.cost_impact < 0 ? '-' : '+'}${Math.abs(event.cost_impact).toFixed(4)}/hr
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{event.user}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Rollback this change">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleOpenRollbackDialog(event)}
                            >
                              <Undo />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Paper>

      {/* Rollback Confirmation Dialog */}
      <Dialog
        open={rollbackDialogOpen}
        onClose={handleCloseRollbackDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="warning" />
            <Typography variant="h6">Confirm Rollback</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedEvent && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to rollback this change?
              </Typography>
              
              <Paper sx={{ p: 2, mt: 2, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" gutterBottom>Change Details:</Typography>
                <Typography variant="body2"><strong>Resource:</strong> {selectedEvent.before_state.name}</Typography>
                <Typography variant="body2"><strong>Cluster:</strong> {selectedEvent.cluster}</Typography>
                <Typography variant="body2"><strong>Namespace:</strong> {selectedEvent.namespace}</Typography>
                <Typography variant="body2"><strong>Type:</strong> {selectedEvent.event_type}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Cost Impact:</strong>{' '}
                  <span style={{ color: selectedEvent.cost_impact < 0 ? 'green' : 'red' }}>
                    {selectedEvent.cost_impact < 0 ? '-' : '+'}${Math.abs(selectedEvent.cost_impact * 730).toFixed(2)}/mo
                  </span>
                </Typography>
              </Paper>

              <Alert severity="warning" sx={{ mt: 2 }}>
                This will restore the resource to its previous state. The change will be reversed immediately.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRollbackDialog}>
            Cancel
          </Button>
          <Button
            onClick={handleRollback}
            color="warning"
            variant="contained"
            disabled={rollingBack}
            startIcon={rollingBack ? <CircularProgress size={20} /> : <Undo />}
          >
            {rollingBack ? 'Rolling Back...' : 'Rollback'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Container>
  );
};

export default Recommendations;

// Made with Bob
