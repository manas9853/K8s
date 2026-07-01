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
  Tab,
  Tabs,
} from '@mui/material';
import {
  Undo as UndoIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  History as HistoryIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Pending as PendingIcon,
  Info as InfoIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface ConfigurationSnapshot {
  field: string;
  old_value: string;
  new_value: string;
  resource_path: string;
}

interface ChangeRecord {
  change_id: string;
  action_id: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  cluster: string;
  change_type: string;
  user: string;
  timestamp: string;
  status: string;
  snapshots: ConfigurationSnapshot[];
  rollback_available: boolean;
  rollback_id: string | null;
}

interface RollbackResult {
  rollback_id: string;
  change_id: string;
  success: boolean;
  message: string;
  rolled_back_at: string;
}

interface AuditEntry {
  audit_id: string;
  change_id: string;
  action: string;
  user: string;
  timestamp: string;
  details: Record<string, any>;
  ip_address: string | null;
}

interface Summary {
  total_changes: number;
  successful_changes: number;
  failed_changes: number;
  rolled_back_changes: number;
  pending_changes: number;
  total_rollbacks: number;
  successful_rollbacks: number;
  failed_rollbacks: number;
}

const Rollback: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [rollbacks, setRollbacks] = useState<RollbackResult[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState(0);
  
  // Filters
  const [clusterFilter, setClusterFilter] = useState('all');
  const [namespaceFilter, setNamespaceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  
  // Rollback dialog
  const [rollbackDialog, setRollbackDialog] = useState<{
    open: boolean;
    changes: ChangeRecord[];
  }>({ open: false, changes: [] });
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterFilter, namespaceFilter, statusFilter, userFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchChanges(),
        fetchRollbacks(),
        fetchAuditTrail(),
        fetchSummary()
      ]);
      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChanges = async () => {
    const params = new URLSearchParams();
    if (clusterFilter !== 'all') params.append('cluster', clusterFilter);
    if (namespaceFilter !== 'all') params.append('namespace', namespaceFilter);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (userFilter !== 'all') params.append('user', userFilter);

    const response = await fetch(`${API_BASE_URL}/v1/rollback/history?${params}${clusterParam}`);
    const data = await response.json();
    setChanges(data);
  };

  const fetchRollbacks = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/rollback/rollbacks${clusterParam}`);
    const data = await response.json();
    setRollbacks(data);
  };

  const fetchAuditTrail = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/rollback/audit${clusterParam}`);
    const data = await response.json();
    setAuditTrail(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/rollback/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const handleRollback = async () => {
    if (selectedChanges.size === 0) {
      alert('Please select at least one change to rollback');
      return;
    }

    if (!rollbackReason.trim()) {
      alert('Please provide a reason for rollback');
      return;
    }

    try {
      setRollingBack(true);
      const response = await fetch('/api/v1/rollback/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_ids: Array.from(selectedChanges),
          reason: rollbackReason,
          user: 'admin@company.com'
        })
      });

      const results: RollbackResult[] = await response.json();
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      alert(
        `Rollback completed!\n` +
        `✅ Success: ${successCount}\n` +
        `❌ Failed: ${failCount}`
      );

      setRollbackDialog({ open: false, changes: [] });
      setRollbackReason('');
      setSelectedChanges(new Set());
      fetchData();
    } catch (err) {
      alert('Failed to rollback changes');
      console.error(err);
    } finally {
      setRollingBack(false);
    }
  };

  const toggleRowExpansion = (changeId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(changeId)) {
      newExpanded.delete(changeId);
    } else {
      newExpanded.add(changeId);
    }
    setExpandedRows(newExpanded);
  };

  const toggleChangeSelection = (changeId: string) => {
    const newSelected = new Set(selectedChanges);
    if (newSelected.has(changeId)) {
      newSelected.delete(changeId);
    } else {
      newSelected.add(changeId);
    }
    setSelectedChanges(newSelected);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'applied': return 'success';
      case 'failed': return 'error';
      case 'rolled_back': return 'warning';
      case 'pending': return 'info';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'applied': return <CheckIcon />;
      case 'failed': return <ErrorIcon />;
      case 'rolled_back': return <WarningIcon />;
      case 'pending': return <PendingIcon />;
      default: return <InfoIcon />;
    }
  };

  const uniqueClusters = Array.from(new Set(changes.map(c => c.cluster)));
  const uniqueNamespaces = Array.from(new Set(changes.map(c => c.namespace)));
  const uniqueUsers = Array.from(new Set(changes.map(c => c.user)));

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
        <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Rollback Engine
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.total_changes || 0}
              </Typography>
              <Typography variant="body2">Total Changes</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.successful_changes || 0}
              </Typography>
              <Typography variant="body2">Successful Changes</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.rolled_back_changes || 0}
              </Typography>
              <Typography variant="body2">Rolled Back</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
            <CardContent>
              <Typography variant="h3" sx={{ fontWeight: 700 }}>
                {summary?.total_rollbacks || 0}
              </Typography>
              <Typography variant="body2">Total Rollbacks</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Change History" />
          <Tab label="Rollback History" />
          <Tab label="Audit Trail" />
        </Tabs>
      </Paper>

      {/* Tab 0: Change History */}
      {activeTab === 0 && (
        <>
          {/* Filters */}
          <Paper sx={{ p: 2, mb: 3 }}>
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
                  <InputLabel>Status</InputLabel>
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
                    <MenuItem value="all">All Status</MenuItem>
                    <MenuItem value="applied">Applied</MenuItem>
                    <MenuItem value="failed">Failed</MenuItem>
                    <MenuItem value="rolled_back">Rolled Back</MenuItem>
                    <MenuItem value="pending">Pending</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>User</InputLabel>
                  <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} label="User">
                    <MenuItem value="all">All Users</MenuItem>
                    {uniqueUsers.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <Button
                  variant="contained"
                  color="warning"
                  fullWidth
                  startIcon={<UndoIcon />}
                  disabled={selectedChanges.size === 0}
                  onClick={() => setRollbackDialog({
                    open: true,
                    changes: changes.filter(c => selectedChanges.has(c.change_id))
                  })}
                >
                  Rollback ({selectedChanges.size})
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <Button variant="outlined" fullWidth onClick={fetchData}>
                  Refresh
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Changes Table */}
          <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
            <Table>
              <TableHead sx={{ background: '#1a237e' }}>
                <TableRow>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Select</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Resource</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Change Type</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>User</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Timestamp</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Rollback</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 700 }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {changes.map((change) => (
                  <React.Fragment key={change.change_id}>
                    <TableRow hover sx={{ '&:hover': { background: '#f5f5f5' } }}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedChanges.has(change.change_id)}
                          onChange={() => toggleChangeSelection(change.change_id)}
                          disabled={!change.rollback_available}
                          style={{ width: 18, height: 18, cursor: change.rollback_available ? 'pointer' : 'not-allowed' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {change.resource_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {change.namespace} • {change.cluster}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={change.change_type} size="small" sx={{ fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{change.user}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(change.timestamp).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(change.status)}
                          label={change.status}
                          color={getStatusColor(change.status) as any}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        {change.rollback_available ? (
                          <Chip label="Available" color="success" size="small" />
                        ) : change.rollback_id ? (
                          <Chip label={`Rolled back (${change.rollback_id})`} color="warning" size="small" />
                        ) : (
                          <Chip label="Not Available" color="default" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleRowExpansion(change.change_id)}>
                          {expandedRows.has(change.change_id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={8} sx={{ p: 0 }}>
                        <Collapse in={expandedRows.has(change.change_id)} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 3, background: '#fafafa' }}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                              Configuration Snapshots ({change.snapshots.length})
                            </Typography>
                            <TableContainer component={Paper} variant="outlined">
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Field</TableCell>
                                    <TableCell>Old Value</TableCell>
                                    <TableCell>New Value</TableCell>
                                    <TableCell>Resource Path</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {change.snapshots.map((snapshot, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {snapshot.field}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#d32f2f' }}>
                                        {snapshot.old_value}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#2e7d32' }}>
                                        {snapshot.new_value}
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                        {snapshot.resource_path}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Tab 1: Rollback History */}
      {activeTab === 1 && (
        <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
          <Table>
            <TableHead sx={{ background: '#1a237e' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Rollback ID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Change ID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Message</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Rolled Back At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rollbacks.map((rollback) => (
                <TableRow key={rollback.rollback_id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {rollback.rollback_id}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    {rollback.change_id}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={rollback.success ? <CheckIcon /> : <ErrorIcon />}
                      label={rollback.success ? 'Success' : 'Failed'}
                      color={rollback.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{rollback.message}</TableCell>
                  <TableCell>
                    {new Date(rollback.rolled_back_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 2: Audit Trail */}
      {activeTab === 2 && (
        <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
          <Table>
            <TableHead sx={{ background: '#1a237e' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Audit ID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Change ID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Action</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>User</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Timestamp</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>IP Address</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditTrail.map((audit) => (
                <TableRow key={audit.audit_id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {audit.audit_id}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    {audit.change_id}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={audit.action.replace('_', ' ')}
                      color={audit.action === 'rollback_change' ? 'warning' : 'primary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{audit.user}</TableCell>
                  <TableCell>
                    {new Date(audit.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    {audit.ip_address || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {JSON.stringify(audit.details)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Rollback Dialog */}
      <Dialog open={rollbackDialog.open} onClose={() => setRollbackDialog({ open: false, changes: [] })} maxWidth="md" fullWidth>
        <DialogTitle>
          <UndoIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Confirm Rollback
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            You are about to rollback {rollbackDialog.changes.length} change(s). This action will revert the configuration to its previous state.
          </Alert>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
            Changes to be rolled back:
          </Typography>
          <List dense>
            {rollbackDialog.changes.map((change) => (
              <ListItem key={change.change_id}>
                <ListItemText
                  primary={`${change.resource_type}/${change.resource_name}`}
                  secondary={`${change.change_type} • ${change.namespace} • ${change.cluster}`}
                />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason for Rollback"
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
            placeholder="Enter the reason for rolling back these changes..."
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackDialog({ open: false, changes: [] })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleRollback}
            disabled={rollingBack || !rollbackReason.trim()}
            startIcon={rollingBack ? <CircularProgress size={20} /> : <UndoIcon />}
          >
            {rollingBack ? 'Rolling Back...' : 'Confirm Rollback'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Rollback;

// Made with Bob
