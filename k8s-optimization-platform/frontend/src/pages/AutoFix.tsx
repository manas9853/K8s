import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Alert,
  CircularProgress,
  IconButton,
  Collapse,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Badge,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Schedule as ScheduleIcon,
  Visibility as PreviewIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
  Code as CodeIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ResourceChange {
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
}

interface FixAction {
  action_id: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  cluster: string;
  fix_type: string;
  changes: ResourceChange[];
  estimated_savings: number;
  risk_level: string;
  requires_restart: boolean;
  estimated_downtime: string;
  status: string;
}

interface FixResult {
  action_id: string;
  success: boolean;
  message: string;
  applied_at: string;
  rollback_available: boolean;
}

interface Summary {
  total_actions: number;
  pending_actions: number;
  applied_actions: number;
  failed_actions: number;
  total_potential_savings: number;
  low_risk_count: number;
  medium_risk_count: number;
  high_risk_count: number;
}

const AutoFix: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [actions, setActions] = useState<FixAction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [applyingAction, setApplyingAction] = useState<string | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; action: FixAction | null }>({
    open: false,
    action: null,
  });
  
  // Filters
  const [clusterFilter, setClusterFilter] = useState('all');
  const [namespaceFilter, setNamespaceFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    fetchActions();
    fetchSummary();
  }, [clusterFilter, namespaceFilter, riskFilter, typeFilter]);

  const fetchActions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (clusterFilter !== 'all') params.append('cluster', clusterFilter);
      if (namespaceFilter !== 'all') params.append('namespace', namespaceFilter);
      if (riskFilter !== 'all') params.append('risk_level', riskFilter);
      if (typeFilter !== 'all') params.append('action_type', typeFilter);

      const response = await fetch(`${API_BASE_URL}/v1/autofix/actions?${params}${clusterParam}`);
      const data = await response.json();
      // Backend returns array directly, not wrapped in {actions: [...]}
      setActions(Array.isArray(data) ? data : (data.actions || []));
      setError(null);
    } catch (err) {
      setError('Failed to fetch fix actions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/autofix/summary${clusterParam}`);
      const data = await response.json();
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  };

  const handleApplyAction = async (actionId: string) => {
    setApplyingAction(actionId);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/autofix/apply/${actionId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: FixResult = await response.json();
      
      if (result.success) {
        alert(`✅ Fix applied successfully!\n${result.message}`);
        fetchActions();
        fetchSummary();
      } else {
        alert(`❌ Fix failed!\n${result.message}`);
      }
    } catch (err) {
      alert('Failed to apply fix');
      console.error(err);
    } finally {
      setApplyingAction(null);
    }
  };

  const handleBulkApply = async () => {
    if (selectedActions.size === 0) {
      alert('Please select actions to apply');
      return;
    }

    const confirmed = window.confirm(
      `Apply ${selectedActions.size} fix actions?\n\nThis will modify your Kubernetes resources.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch('/api/v1/autofix/bulk-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_ids: Array.from(selectedActions) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      
      alert(
        `Bulk Apply Results:\n` +
        `✅ Successful: ${result.successful}\n` +
        `❌ Failed: ${result.failed}\n` +
        `Total: ${result.total}`
      );
      
      setSelectedActions(new Set());
      fetchActions();
      fetchSummary();
    } catch (err) {
      alert('Failed to apply bulk fixes');
      console.error(err);
    }
  };

  const toggleRowExpansion = (actionId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(actionId)) {
      newExpanded.delete(actionId);
    } else {
      newExpanded.add(actionId);
    }
    setExpandedRows(newExpanded);
  };

  const toggleActionSelection = (actionId: string) => {
    const newSelected = new Set(selectedActions);
    if (newSelected.has(actionId)) {
      newSelected.delete(actionId);
    } else {
      newSelected.add(actionId);
    }
    setSelectedActions(newSelected);
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      default: return 'default';
    }
  };

  const getActionIcon = (type: string) => {
    if (!type) return <SettingsIcon />;
    if (type.includes('CPU')) return <SpeedIcon />;
    if (type.includes('Memory')) return <MemoryIcon />;
    if (type.includes('Storage')) return <StorageIcon />;
    return <SettingsIcon />;
  };

  const uniqueClusters = Array.from(new Set(actions.map(a => a.cluster)));
  const uniqueNamespaces = Array.from(new Set(actions.map(a => a.namespace)));
  const uniqueTypes = Array.from(new Set(actions.map(a => a.fix_type)));

  if (loading && actions.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1a237e' }}>
          <TerminalIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          One-Click Auto-Fix System
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Automated optimization recommendations with instant apply capabilities
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.total_actions || 0}
              </Typography>
              <Typography variant="body2">Total Fix Actions</Typography>
              <Typography variant="caption">
                {summary?.pending_actions || 0} pending
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                ${(summary?.total_potential_savings || 0).toLocaleString()}
              </Typography>
              <Typography variant="body2">Potential Savings</Typography>
              <Typography variant="caption">per month</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.low_risk_count || 0}
              </Typography>
              <Typography variant="body2">Low Risk Actions</Typography>
              <Typography variant="caption">safe to apply</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.applied_actions || 0}
              </Typography>
              <Typography variant="body2">Applied Actions</Typography>
              <Typography variant="caption">
                {summary?.failed_actions || 0} failed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Bulk Actions */}
      <Card sx={{ mb: 3, background: '#f5f5f5' }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Cluster</InputLabel>
                <Select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)} label="Cluster">
                  <MenuItem value="all">All Clusters</MenuItem>
                  {uniqueClusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Namespace</InputLabel>
                <Select value={namespaceFilter} onChange={(e) => setNamespaceFilter(e.target.value)} label="Namespace">
                  <MenuItem value="all">All Namespaces</MenuItem>
                  {uniqueNamespaces.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Risk Level</InputLabel>
                <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} label="Risk Level">
                  <MenuItem value="all">All Risks</MenuItem>
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Action Type</InputLabel>
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} label="Action Type">
                  <MenuItem value="all">All Types</MenuItem>
                  {uniqueTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={12} md={4}>
              <Box display="flex" gap={1}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayIcon />}
                  onClick={handleBulkApply}
                  disabled={selectedActions.size === 0}
                  fullWidth
                >
                  Apply Selected ({selectedActions.size})
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setSelectedActions(new Set())}
                  disabled={selectedActions.size === 0}
                >
                  Clear
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Actions Table */}
      <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
        <Table>
          <TableHead sx={{ background: '#1a237e' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Select</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Workload</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Action Type</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Risk</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Savings</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Confidence</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Actions</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actions.map((action) => (
              <React.Fragment key={action.action_id}>
                <TableRow hover sx={{ '&:hover': { background: '#f5f5f5' } }}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedActions.has(action.action_id)}
                      onChange={() => toggleActionSelection(action.action_id)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {action.resource_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {action.namespace} • {action.cluster}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getActionIcon(action.fix_type)}
                      label={action.fix_type}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={action.risk_level}
                      color={getRiskColor(action.risk_level) as any}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      ${action.estimated_savings}/mo
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={action.risk_level}
                      color={getRiskColor(action.risk_level) as any}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={action.status}
                      color={action.status === 'pending' ? 'warning' : 'success'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={0.5}>
                      <Tooltip title="Apply Fix">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleApplyAction(action.action_id)}
                          disabled={applyingAction === action.action_id}
                        >
                          {applyingAction === action.action_id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <PlayIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Preview Changes">
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => setPreviewDialog({ open: true, action })}
                        >
                          <PreviewIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => toggleRowExpansion(action.action_id)}
                    >
                      {expandedRows.has(action.action_id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={9} sx={{ p: 0 }}>
                    <Collapse in={expandedRows.has(action.action_id)} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 3, background: '#fafafa' }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                              <CodeIcon sx={{ mr: 1, verticalAlign: 'middle', fontSize: 18 }} />
                              Fix Type
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 2 }}>
                              {action.fix_type} for {action.resource_type}/{action.resource_name}
                            </Typography>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                              Resource Changes ({action.changes.length})
                            </Typography>
                            <TableContainer component={Paper} variant="outlined">
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Field</TableCell>
                                    <TableCell>Current</TableCell>
                                    <TableCell>New</TableCell>
                                    <TableCell>Reason</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {action.changes.map((change, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {change.field}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#d32f2f' }}>
                                        {change.old_value}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#2e7d32' }}>
                                        {change.new_value}
                                      </TableCell>
                                      <TableCell sx={{ fontSize: 11 }}>{change.reason}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                              Execution Details
                            </Typography>
                            <List dense>
                              <ListItem>
                                <ListItemText
                                  primary="Requires Restart"
                                  secondary={action.requires_restart ? 'Yes' : 'No'}
                                />
                                {action.requires_restart && <WarningIcon color="warning" />}
                              </ListItem>
                              <ListItem>
                                <ListItemText
                                  primary="Estimated Downtime"
                                  secondary={action.estimated_downtime}
                                />
                              </ListItem>
                              <ListItem>
                                <ListItemText
                                  primary="Status"
                                  secondary={action.status}
                                />
                              </ListItem>
                            </List>
                          </Grid>
                        </Grid>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialog.open}
        onClose={() => setPreviewDialog({ open: false, action: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ background: '#1a237e', color: 'white' }}>
          <CodeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Preview Changes
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {previewDialog.action && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {previewDialog.action.resource_type}/{previewDialog.action.resource_name}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {previewDialog.action.fix_type}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                Changes to be applied:
              </Typography>
              {previewDialog.action.changes.map((change, idx) => (
                <Box key={idx} sx={{ mb: 2, p: 2, background: '#f5f5f5', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {change.field}
                  </Typography>
                  <Box display="flex" gap={2} mt={1}>
                    <Box flex={1}>
                      <Typography variant="caption" color="error">Current:</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {change.old_value}
                      </Typography>
                    </Box>
                    <Box flex={1}>
                      <Typography variant="caption" color="success">New:</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {change.new_value}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Reason: {change.reason}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog({ open: false, action: null })}>
            Close
          </Button>
          {previewDialog.action && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon />}
              onClick={() => {
                handleApplyAction(previewDialog.action!.action_id);
                setPreviewDialog({ open: false, action: null });
              }}
            >
              Apply Fix
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AutoFix;

// Made with Bob
