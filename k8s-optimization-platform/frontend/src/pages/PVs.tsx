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
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Grid,
  Alert,
  Skeleton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PV {
  name: string;
  capacity: string;
  access_modes: string[];
  reclaim_policy: string;
  status: string;
  claim: string;
  storage_class: string;
  reason: string;
  age: string;
  volume_mode: string;
  node_affinity: any;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PVs: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [pvs, setPVs] = useState<PV[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [storageClassFilter, setStorageClassFilter] = useState<string>('all');
  const [selectedPV, setSelectedPV] = useState<PV | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  const fetchPVs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/storage/pvs`);
      const data = await response.json();
      setPVs(data);
    } catch (error) {
      console.error('Error fetching PVs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPVs();
  }, [clusterParam]);

  const handleRefresh = () => {
    fetchPVs();
  };

  const handleRowClick = (pv: PV) => {
    setSelectedPV(pv);
    setDialogOpen(true);
    setTabValue(0);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedPV(null);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available':
        return 'success';
      case 'bound':
        return 'primary';
      case 'released':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available':
        return <CheckCircleIcon fontSize="small" />;
      case 'bound':
        return <InfoIcon fontSize="small" />;
      case 'released':
        return <WarningIcon fontSize="small" />;
      case 'failed':
        return <ErrorIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const filteredPVs = pvs.filter((pv) => {
    const matchesSearch = pv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pv.claim?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || pv.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesStorageClass = storageClassFilter === 'all' || pv.storage_class === storageClassFilter;
    return matchesSearch && matchesStatus && matchesStorageClass;
  });

  const uniqueStatuses = Array.from(new Set(pvs.map(pv => pv.status)));
  const uniqueStorageClasses = Array.from(new Set(pvs.map(pv => pv.storage_class)));

  const stats = {
    total: pvs.length,
    available: pvs.filter(pv => pv.status.toLowerCase() === 'available').length,
    bound: pvs.filter(pv => pv.status.toLowerCase() === 'bound').length,
    released: pvs.filter(pv => pv.status.toLowerCase() === 'released').length,
    failed: pvs.filter(pv => pv.status.toLowerCase() === 'failed').length,
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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Persistent Volumes
          </Typography>
        </Box>
        <IconButton onClick={handleRefresh} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total PVs</Typography>
              <Typography variant="h4">{stats.total}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Available</Typography>
              <Typography variant="h4" color="success.main">{stats.available}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Bound</Typography>
              <Typography variant="h4" color="primary.main">{stats.bound}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Released</Typography>
              <Typography variant="h4" color="warning.main">{stats.released}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Failed</Typography>
              <Typography variant="h4" color="error.main">{stats.failed}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search by name or claim..."
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
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  {uniqueStatuses.map((status) => (
                    <MenuItem key={status} value={status}>{status}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Storage Class</InputLabel>
                <Select
                  value={storageClassFilter}
                  label="Storage Class"
                  onChange={(e) => setStorageClassFilter(e.target.value)}
                >
                  <MenuItem value="all">All Classes</MenuItem>
                  {uniqueStorageClasses.map((sc) => (
                    <MenuItem key={sc} value={sc}>{sc}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* PVs Table */}
      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Capacity</strong></TableCell>
                  <TableCell><strong>Access Modes</strong></TableCell>
                  <TableCell><strong>Reclaim Policy</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Claim</strong></TableCell>
                  <TableCell><strong>Storage Class</strong></TableCell>
                  <TableCell><strong>Age</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from(new Array(5)).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                    </TableRow>
                  ))
                ) : filteredPVs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="textSecondary">
                        No persistent volumes found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPVs.map((pv) => (
                    <TableRow
                      key={pv.name}
                      hover
                      onClick={() => handleRowClick(pv)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Tooltip title="Click for details">
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {pv.name}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{pv.capacity}</TableCell>
                      <TableCell>
                        {pv.access_modes.map((mode, idx) => (
                          <Chip key={idx} label={mode} size="small" sx={{ mr: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>
                        <Chip label={pv.reclaim_policy} size="small" color="default" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(pv.status) || undefined}
                          label={pv.status}
                          color={getStatusColor(pv.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {pv.claim ? (
                          <Typography variant="body2">{pv.claim}</Typography>
                        ) : (
                          <Typography variant="body2" color="textSecondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={pv.storage_class} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{pv.age}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon />
            <Typography variant="h6">{selectedPV?.name}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
            <Tab label="Overview" />
            <Tab label="Specifications" />
            <Tab label="Node Affinity" />
            <Tab label="Status" />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Capacity</Typography>
                <Typography variant="body1" gutterBottom>{selectedPV?.capacity}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Storage Class</Typography>
                <Typography variant="body1" gutterBottom>{selectedPV?.storage_class}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Reclaim Policy</Typography>
                <Typography variant="body1" gutterBottom>{selectedPV?.reclaim_policy}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Volume Mode</Typography>
                <Typography variant="body1" gutterBottom>{selectedPV?.volume_mode}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Status</Typography>
                <Chip
                  icon={getStatusIcon(selectedPV?.status || '') || undefined}
                  label={selectedPV?.status}
                  color={getStatusColor(selectedPV?.status || '')}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" color="textSecondary">Age</Typography>
                <Typography variant="body1" gutterBottom>{selectedPV?.age}</Typography>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Access Modes</Typography>
                <Box sx={{ mt: 1 }}>
                  {selectedPV?.access_modes.map((mode, idx) => (
                    <Chip key={idx} label={mode} sx={{ mr: 1, mb: 1 }} />
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Claim Reference</Typography>
                <Typography variant="body1" gutterBottom>
                  {selectedPV?.claim || 'Not bound to any claim'}
                </Typography>
              </Grid>
              {selectedPV?.reason && (
                <Grid item xs={12}>
                  <Alert severity="info">
                    <Typography variant="body2">{selectedPV.reason}</Typography>
                  </Alert>
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            {selectedPV?.node_affinity ? (
              <Box>
                <Typography variant="body2" component="pre" sx={{ 
                  bgcolor: 'grey.100', 
                  p: 2, 
                  borderRadius: 1,
                  overflow: 'auto'
                }}>
                  {JSON.stringify(selectedPV.node_affinity, null, 2)}
                </Typography>
              </Box>
            ) : (
              <Alert severity="info">No node affinity configured</Alert>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Alert severity={selectedPV?.status.toLowerCase() === 'bound' ? 'success' : 'info'}>
                  <Typography variant="subtitle2">Current Status: {selectedPV?.status}</Typography>
                  {selectedPV?.reason && (
                    <Typography variant="body2" sx={{ mt: 1 }}>{selectedPV.reason}</Typography>
                  )}
                </Alert>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary">Status Details</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {selectedPV?.status.toLowerCase() === 'available' && 
                    'This volume is available and ready to be bound to a claim.'}
                  {selectedPV?.status.toLowerCase() === 'bound' && 
                    'This volume is bound to a persistent volume claim and in use.'}
                  {selectedPV?.status.toLowerCase() === 'released' && 
                    'This volume was released from its claim but not yet reclaimed.'}
                  {selectedPV?.status.toLowerCase() === 'failed' && 
                    'This volume has failed and cannot be used.'}
                </Typography>
              </Grid>
            </Grid>
          </TabPanel>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default PVs;

// Made with Bob
