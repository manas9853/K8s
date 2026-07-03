import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tab,
  Tabs
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';
import InfoIcon from '@mui/icons-material/Info';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DeleteIcon from '@mui/icons-material/Delete';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloudIcon from '@mui/icons-material/Cloud';
import { API_BASE_URL } from '../config/api';

interface PVC {
  name: string;
  namespace: string;
  status: string;
  volume: string;
  capacity: string;
  used_capacity: string;
  free_capacity: string;
  utilization_percent: number;
  access_modes: string[];
  storage_class: string;
  age: string;
  labels: { [key: string]: string };
  annotations: { [key: string]: string };
  created_at: string;
  volume_mode?: string;
  used_by_pods: string[];
}

interface Investigation {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

interface Recommendation {
  category: 'performance' | 'cost' | 'reliability' | 'security';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  action: string;
}

const PVCs: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [pvcs, setPVCs] = useState<PVC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPVC, setSelectedPVC] = useState<PVC | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const fetchPVCs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/storage/pvcs${clusterParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setPVCs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PVCs');
      console.error('Error fetching PVCs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPVCs();
  }, [clusterParam]);

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    if (status === 'Bound') return 'success';
    if (status === 'Pending') return 'warning';
    return 'error';
  };

  const getStatusIcon = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'success') return <CheckCircleIcon color="success" />;
    if (color === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const parseCapacity = (capacity: string): number => {
    const match = capacity.match(/(\d+)([A-Za-z]+)/);
    if (!match) return 0;
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers: { [key: string]: number } = {
      'KI': 1024,
      'MI': 1024 * 1024,
      'GI': 1024 * 1024 * 1024,
      'TI': 1024 * 1024 * 1024 * 1024,
    };
    
    return value * (multipliers[unit] || 1);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Generate investigations for a PVC
  const generateInvestigations = (pvc: PVC): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check PVC status
    if (pvc.status !== 'Bound') {
      investigations.push({
        type: 'error',
        title: 'PVC Not Bound',
        description: `PVC is in ${pvc.status} state`,
        action: 'Check if matching PV exists and storage class is available'
      });
    }

    // Check if PVC is used
    if (!pvc.used_by_pods || pvc.used_by_pods.length === 0) {
      investigations.push({
        type: 'warning',
        title: 'Unused PVC',
        description: 'PVC is not attached to any pods',
        action: 'Consider deleting if no longer needed to save costs'
      });
    }

    // Check storage class
    if (!pvc.storage_class || pvc.storage_class === '') {
      investigations.push({
        type: 'warning',
        title: 'No Storage Class',
        description: 'PVC has no storage class specified',
        action: 'Specify storage class for better performance and management'
      });
    }

    // Check access modes
    if (pvc.access_modes.includes('ReadWriteMany')) {
      investigations.push({
        type: 'info',
        title: 'Shared Volume',
        description: 'PVC uses ReadWriteMany access mode',
        action: 'Ensure storage backend supports concurrent access'
      });
    }

    // Check capacity
    const capacityBytes = parseCapacity(pvc.capacity);
    if (capacityBytes > 100 * 1024 * 1024 * 1024) { // > 100GB
      investigations.push({
        type: 'warning',
        title: 'Large Volume',
        description: `PVC has ${pvc.capacity} capacity`,
        action: 'Review if this capacity is necessary'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (pvc: PVC): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Cost recommendations
    if (!pvc.used_by_pods || pvc.used_by_pods.length === 0) {
      const capacityBytes = parseCapacity(pvc.capacity);
      const monthlyCost = (capacityBytes / (1024 * 1024 * 1024)) * 0.10; // $0.10 per GB/month estimate
      
      recommendations.push({
        category: 'cost',
        priority: 'high',
        title: 'Delete Unused PVC',
        description: `PVC is not attached to any pods and consuming ${pvc.capacity}`,
        impact: `Potential savings: $${monthlyCost.toFixed(2)}/month`,
        action: 'Delete PVC if no longer needed'
      });
    }

    // Performance recommendations
    if (pvc.storage_class === 'standard' || pvc.storage_class === 'default') {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        title: 'Consider Premium Storage',
        description: 'Using standard storage class',
        impact: 'May have lower IOPS and throughput',
        action: 'Upgrade to premium storage class for better performance'
      });
    }

    // Reliability recommendations
    if (!pvc.storage_class.includes('replicated') && !pvc.storage_class.includes('redundant')) {
      recommendations.push({
        category: 'reliability',
        priority: 'medium',
        title: 'No Replication Detected',
        description: 'Storage class may not provide data replication',
        impact: 'Risk of data loss on hardware failure',
        action: 'Use replicated storage class for critical data'
      });
    }

    // Security recommendations
    if (!pvc.annotations || !pvc.annotations['encrypted']) {
      recommendations.push({
        category: 'security',
        priority: 'high',
        title: 'Encryption Not Enabled',
        description: 'PVC may not be encrypted at rest',
        impact: 'Data may be vulnerable if storage is compromised',
        action: 'Enable encryption for sensitive data'
      });
    }

    return recommendations;
  };

  const filteredPVCs = pvcs.filter(pvc =>
    pvc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pvc.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pvc.storage_class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRowClick = (pvc: PVC) => {
    setSelectedPVC(pvc);
    setDetailsOpen(true);
    setActiveTab(0);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedPVC(null);
  };

  const renderDetailsDialog = () => {
    if (!selectedPVC) return null;

    const investigations = generateInvestigations(selectedPVC);
    const recommendations = generateRecommendations(selectedPVC);

    return (
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <StorageIcon />
            <Typography variant="h6">{selectedPVC.name}</Typography>
            <Chip
              label={selectedPVC.status}
              color={getStatusColor(selectedPVC.status)}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Overview" icon={<InfoIcon />} iconPosition="start" />
            <Tab label="Investigations" icon={<WarningIcon />} iconPosition="start" />
            <Tab label="Recommendations" icon={<TrendingUpIcon />} iconPosition="start" />
            <Tab label="Usage" icon={<AttachFileIcon />} iconPosition="start" />
            <Tab label="Actions" icon={<DeleteIcon />} iconPosition="start" />
          </Tabs>

          <Box sx={{ mt: 3 }}>
            {activeTab === 0 && (
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Basic Information</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="Namespace" secondary={selectedPVC.namespace} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Status" secondary={selectedPVC.status} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Volume" secondary={selectedPVC.volume || 'N/A'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Capacity" secondary={selectedPVC.capacity} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Storage Class" secondary={selectedPVC.storage_class || 'default'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Age" secondary={selectedPVC.age} />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Access Configuration</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText 
                            primary="Access Modes" 
                            secondary={selectedPVC.access_modes.join(', ')} 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Volume Mode" 
                            secondary={selectedPVC.volume_mode || 'Filesystem'} 
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText 
                            primary="Used By Pods" 
                            secondary={selectedPVC.used_by_pods?.length || 0} 
                          />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Labels</Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {Object.entries(selectedPVC.labels).map(([key, value]) => (
                          <Chip key={key} label={`${key}: ${value}`} size="small" />
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}

            {activeTab === 1 && (
              <Box>
                <Typography variant="h6" gutterBottom>Investigations</Typography>
                {investigations.length === 0 ? (
                  <Alert severity="success">No issues detected</Alert>
                ) : (
                  <List>
                    {investigations.map((inv, idx) => (
                      <React.Fragment key={idx}>
                        <ListItem alignItems="flex-start">
                          <ListItemIcon>
                            {inv.type === 'error' && <ErrorIcon color="error" />}
                            {inv.type === 'warning' && <WarningIcon color="warning" />}
                            {inv.type === 'info' && <InfoIcon color="info" />}
                          </ListItemIcon>
                          <ListItemText
                            primary={inv.title}
                            secondary={
                              <>
                                <Typography variant="body2">{inv.description}</Typography>
                                {inv.action && (
                                  <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                                    Action: {inv.action}
                                  </Typography>
                                )}
                              </>
                            }
                          />
                        </ListItem>
                        {idx < investigations.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Box>
            )}

            {activeTab === 2 && (
              <Box>
                <Typography variant="h6" gutterBottom>Recommendations</Typography>
                {recommendations.length === 0 ? (
                  <Alert severity="success">No recommendations at this time</Alert>
                ) : (
                  <List>
                    {recommendations.map((rec, idx) => (
                      <React.Fragment key={idx}>
                        <ListItem alignItems="flex-start">
                          <ListItemIcon>
                            <Chip
                              label={rec.priority}
                              color={rec.priority === 'high' ? 'error' : rec.priority === 'medium' ? 'warning' : 'info'}
                              size="small"
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={rec.title}
                            secondary={
                              <>
                                <Typography variant="body2">{rec.description}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                  Impact: {rec.impact}
                                </Typography>
                                <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                                  Action: {rec.action}
                                </Typography>
                              </>
                            }
                          />
                        </ListItem>
                        {idx < recommendations.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Box>
            )}

            {activeTab === 3 && (
              <Box>
                <Typography variant="h6" gutterBottom>Pod Usage</Typography>
                {!selectedPVC.used_by_pods || selectedPVC.used_by_pods.length === 0 ? (
                  <Alert severity="warning">PVC is not attached to any pods</Alert>
                ) : (
                  <List>
                    {selectedPVC.used_by_pods.map((pod, idx) => (
                      <ListItem key={idx}>
                        <ListItemIcon>
                          <AttachFileIcon />
                        </ListItemIcon>
                        <ListItemText primary={pod} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            )}

            {activeTab === 4 && (
              <Box>
                <Typography variant="h6" gutterBottom>Available Actions</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Button
                      variant="outlined"
                      color="primary"
                      fullWidth
                      startIcon={<CloudIcon />}
                    >
                      Expand Volume
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Button
                      variant="outlined"
                      color="warning"
                      fullWidth
                      startIcon={<DeleteIcon />}
                      disabled={selectedPVC.used_by_pods && selectedPVC.used_by_pods.length > 0}
                    >
                      Delete PVC
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  };

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Persistent Volume Claims</Typography>
        <IconButton onClick={fetchPVCs} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total PVCs</Typography>
              <Typography variant="h4">{pvcs.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Bound</Typography>
              <Typography variant="h4" color="success.main">
                {pvcs.filter(p => p.status === 'Bound').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Pending</Typography>
              <Typography variant="h4" color="warning.main">
                {pvcs.filter(p => p.status === 'Pending').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Unused</Typography>
              <Typography variant="h4" color="error.main">
                {pvcs.filter(p => !p.used_by_pods || p.used_by_pods.length === 0).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3, p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search PVCs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Provisioned</TableCell>
              <TableCell>Used</TableCell>
              <TableCell>Free</TableCell>
              <TableCell>Storage Class</TableCell>
              <TableCell>Access Modes</TableCell>
              <TableCell>Used By</TableCell>
              <TableCell>Age</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPVCs.map((pvc) => {
              const hasUsage = pvc.used_capacity !== 'N/A' && pvc.utilization_percent > 0;
              const barColor = pvc.utilization_percent >= 85 ? 'error' : pvc.utilization_percent >= 60 ? 'warning' : 'primary';
              return (
              <TableRow
                key={`${pvc.namespace}-${pvc.name}`}
                hover
                onClick={() => handleRowClick(pvc)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Tooltip title={pvc.status}>
                    {getStatusIcon(pvc.status)}
                  </Tooltip>
                </TableCell>
                <TableCell>{pvc.name}</TableCell>
                <TableCell>
                  <Chip label={pvc.namespace} size="small" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{pvc.capacity}</Typography>
                </TableCell>
                <TableCell>
                  {hasUsage ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 130 }}>
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(pvc.utilization_percent, 100)}
                          sx={{ height: 6, borderRadius: 3 }}
                          color={barColor}
                        />
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                        {pvc.used_capacity} ({pvc.utilization_percent.toFixed(1)}%)
                      </Typography>
                    </Box>
                  ) : (
                    <Chip label="N/A" size="small" variant="outlined" />
                  )}
                </TableCell>
                <TableCell>
                  {hasUsage ? (
                    <Typography variant="body2" color={pvc.utilization_percent >= 85 ? 'error' : 'text.secondary'}>
                      {pvc.free_capacity}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="success.main">{pvc.free_capacity}</Typography>
                  )}
                </TableCell>
                <TableCell>{pvc.storage_class || 'default'}</TableCell>
                <TableCell>
                  {pvc.access_modes.map(mode => (
                    <Chip key={mode} label={mode} size="small" sx={{ mr: 0.5 }} />
                  ))}
                </TableCell>
                <TableCell>
                  {pvc.used_by_pods.length === 0 ? (
                    <Tooltip title="Not mounted by any pod — potential cost saving" arrow>
                      <Chip label="Not Bound" size="small" color="warning" />
                    </Tooltip>
                  ) : (
                    <Tooltip title={pvc.used_by_pods.join(', ')} arrow>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 200 }}>
                        {pvc.used_by_pods.slice(0, 2).map(pod => (
                          <Chip key={pod} label={pod} size="small" color="success"
                            sx={{ maxWidth: 140, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                        ))}
                        {pvc.used_by_pods.length > 2 && (
                          <Chip label={`+${pvc.used_by_pods.length - 2} more`} size="small" variant="outlined" />
                        )}
                      </Box>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>{pvc.age}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {renderDetailsDialog()}
    </Box>
  );
};

export default PVCs;
