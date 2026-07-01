import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Badge,
  Tab,
  Tabs,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RecommendIcon from '@mui/icons-material/Recommend';
import ScaleIcon from '@mui/icons-material/ZoomOutMap';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import { API_BASE_URL } from '../config/api';

interface StatefulSet {
  name: string;
  namespace: string;
  replicas_desired: number;
  replicas_ready: number;
  replicas_current: number;
  service_name: string;
  age: string;
  labels: { [key: string]: string };
  containers: Array<{
    name: string;
    image: string;
    ports: Array<{ containerPort: number; protocol: string }>;
    resources: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
  }>;
  volume_claim_templates: Array<{
    name: string;
    storage_class: string | null;
    access_modes: string[];
    storage: string | null;
  }>;
  selector: { [key: string]: string };
  created_at: string;
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

const StatefulSets: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [statefulsets, setStatefulSets] = useState<StatefulSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatefulSet, setSelectedStatefulSet] = useState<StatefulSet | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchStatefulSets = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/statefulsets${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setStatefulSets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch statefulsets');
      console.error('Error fetching statefulsets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchStatefulSets(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getStatusColor = (ss: StatefulSet): 'success' | 'warning' | 'error' => {
    if (ss.replicas_ready === ss.replicas_desired && ss.replicas_current === ss.replicas_desired) {
      return 'success';
    }
    if (ss.replicas_ready > 0) {
      return 'warning';
    }
    return 'error';
  };

  const getStatusIcon = (ss: StatefulSet) => {
    const color = getStatusColor(ss);
    if (color === 'success') return <CheckCircleIcon color="success" />;
    if (color === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getReadyPercentage = (ss: StatefulSet): number => {
    if (ss.replicas_desired === 0) return 0;
    return Math.round((ss.replicas_ready / ss.replicas_desired) * 100);
  };

  // Generate investigations for a statefulset
  const generateInvestigations = (ss: StatefulSet): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check replica status
    if (ss.replicas_ready < ss.replicas_desired) {
      investigations.push({
        type: 'error',
        title: 'Replica Mismatch',
        description: `Only ${ss.replicas_ready} of ${ss.replicas_desired} replicas are ready`,
        action: 'Check pod events and logs'
      });
    }

    // Check for missing PVCs
    if (ss.volume_claim_templates.length === 0) {
      investigations.push({
        type: 'warning',
        title: 'No Persistent Storage',
        description: 'StatefulSet has no volume claim templates configured',
        action: 'Consider adding persistent storage for stateful data'
      });
    }

    // Check resource limits
    ss.containers.forEach(container => {
      if (!container.resources.limits) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set CPU and memory limits to prevent resource exhaustion'
        });
      }
      if (!container.resources.requests) {
        investigations.push({
          type: 'warning',
          title: `No Resource Requests - ${container.name}`,
          description: 'Container has no resource requests set',
          action: 'Set resource requests for proper scheduling'
        });
      }
    });

    // Check service configuration
    if (!ss.service_name) {
      investigations.push({
        type: 'info',
        title: 'No Headless Service',
        description: 'StatefulSet has no associated service',
        action: 'Create a headless service for stable network identities'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (ss: StatefulSet): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Performance recommendations
    ss.containers.forEach(container => {
      const cpuRequest = container.resources.requests?.cpu;
      const cpuLimit = container.resources.limits?.cpu;
      
      if (cpuRequest && cpuLimit && cpuRequest !== cpuLimit) {
        recommendations.push({
          category: 'performance',
          priority: 'medium',
          title: 'CPU Request/Limit Mismatch',
          description: `Container ${container.name} has different CPU request (${cpuRequest}) and limit (${cpuLimit})`,
          impact: 'May cause CPU throttling under load',
          action: 'Consider setting equal values for predictable performance'
        });
      }
    });

    // Cost recommendations
    if (ss.replicas_desired > 3) {
      recommendations.push({
        category: 'cost',
        priority: 'low',
        title: 'High Replica Count',
        description: `StatefulSet has ${ss.replicas_desired} replicas`,
        impact: 'Higher infrastructure costs',
        action: 'Review if all replicas are necessary for your workload'
      });
    }

    // Reliability recommendations
    if (ss.replicas_desired === 1) {
      recommendations.push({
        category: 'reliability',
        priority: 'high',
        title: 'Single Replica',
        description: 'StatefulSet has only 1 replica',
        impact: 'No high availability - single point of failure',
        action: 'Consider increasing to 3 replicas for production workloads'
      });
    }

    // Security recommendations
    ss.containers.forEach(container => {
      if (container.image.includes(':latest')) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          title: 'Using :latest Tag',
          description: `Container ${container.name} uses :latest image tag`,
          impact: 'Unpredictable deployments and security risks',
          action: 'Pin to specific image version'
        });
      }
    });

    return recommendations;
  };

  const handleScaleUp = (ss: StatefulSet) => {
    console.log(`Scaling up ${ss.name} from ${ss.replicas_desired} to ${ss.replicas_desired + 1}`);
    // TODO: Implement actual scaling API call
    alert(`Would scale ${ss.name} to ${ss.replicas_desired + 1} replicas`);
  };

  const handleScaleDown = (ss: StatefulSet) => {
    if (ss.replicas_desired > 1) {
      console.log(`Scaling down ${ss.name} from ${ss.replicas_desired} to ${ss.replicas_desired - 1}`);
      // TODO: Implement actual scaling API call
      alert(`Would scale ${ss.name} to ${ss.replicas_desired - 1} replicas`);
    }
  };

  const handleAutoFix = (ss: StatefulSet, issue: string) => {
    console.log(`Auto-fixing ${issue} for ${ss.name}`);
    // TODO: Implement actual fix API call
    alert(`Would auto-fix: ${issue} for ${ss.name}`);
  };

  const filteredStatefulSets = statefulsets.filter(ss =>
    ss.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ss.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStatefulSets = statefulsets.length;
  const healthyStatefulSets = statefulsets.filter(ss => 
    ss.replicas_ready === ss.replicas_desired && ss.replicas_current === ss.replicas_desired
  ).length;
  const totalReplicas = statefulsets.reduce((sum, ss) => sum + ss.replicas_desired, 0);
  const readyReplicas = statefulsets.reduce((sum, ss) => sum + ss.replicas_ready, 0);
  const totalIssues = statefulsets.reduce((sum, ss) => 
    sum + generateInvestigations(ss).filter(i => i.type === 'error' || i.type === 'warning').length, 0
  );

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
    <Box>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h4" gutterBottom>
            StatefulSets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage stateful applications with stable network identities and persistent storage
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <StorageIcon color="primary" />
                <Typography color="text.secondary" gutterBottom>
                  Total StatefulSets
                </Typography>
              </Box>
              <Typography variant="h4">
                {totalStatefulSets}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Healthy
              </Typography>
              <Typography variant="h4" color="success.main">
                {healthyStatefulSets}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {totalStatefulSets > 0 ? Math.round((healthyStatefulSets / totalStatefulSets) * 100) : 0}% healthy
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Replicas
              </Typography>
              <Typography variant="h4">
                {totalReplicas}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {readyReplicas} ready
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <Badge badgeContent={totalIssues} color="error">
                  <BugReportIcon color="action" />
                </Badge>
                <Typography color="text.secondary" gutterBottom>
                  Issues Found
                </Typography>
              </Box>
              <Typography variant="h4" color={totalIssues > 0 ? "error.main" : "success.main"}>
                {totalIssues}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Search and Actions */}
      <Box display="flex" gap={2} mb={2}>
        <TextField
          placeholder="Search statefulsets..."
          variant="outlined"
          size="small"
          fullWidth
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
        <Tooltip title="Refresh">
          <IconButton onClick={() => fetchStatefulSets(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* StatefulSets Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Replicas</TableCell>
              <TableCell>Ready</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Service</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStatefulSets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography color="text.secondary">
                    {searchTerm ? 'No statefulsets match your search' : 'No statefulsets found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredStatefulSets.map((ss) => {
                const investigations = generateInvestigations(ss);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${ss.namespace}-${ss.name}`} hover>
                    <TableCell>
                      <Tooltip title={`${ss.replicas_ready}/${ss.replicas_desired} ready`}>
                        {getStatusIcon(ss)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {ss.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={ss.namespace} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {ss.replicas_desired}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2">
                            {ss.replicas_ready}/{ss.replicas_desired}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({getReadyPercentage(ss)}%)
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={getReadyPercentage(ss)}
                          color={getStatusColor(ss)}
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Badge badgeContent={issueCount} color="error">
                        <Chip 
                          label={issueCount === 0 ? "Healthy" : `${issueCount} issues`}
                          size="small"
                          color={issueCount === 0 ? "success" : "error"}
                        />
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ss.service_name ? (
                        <Chip 
                          label={ss.service_name} 
                          size="small" 
                          color="primary"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{ss.age}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setSelectedStatefulSet(ss);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Scale Up">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleScaleUp(ss)}
                          >
                            <ScaleIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredStatefulSets.length} of {totalStatefulSets} statefulsets
        </Typography>
      </Box>

      {/* Details Dialog */}
      <Dialog 
        open={detailsOpen} 
        onClose={() => setDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        {selectedStatefulSet && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedStatefulSet.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedStatefulSet.namespace}
                  </Typography>
                </Box>
                {getStatusIcon(selectedStatefulSet)}
              </Box>
            </DialogTitle>
            <DialogContent>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Overview" />
                <Tab label="Investigations" />
                <Tab label="Recommendations" />
                <Tab label="Diagnostics" />
                <Tab label="Actions" />
              </Tabs>

              {/* Overview Tab */}
              {activeTab === 0 && (
                <Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Replica Status</Typography>
                          <Typography>Desired: {selectedStatefulSet.replicas_desired}</Typography>
                          <Typography>Current: {selectedStatefulSet.replicas_current}</Typography>
                          <Typography>Ready: {selectedStatefulSet.replicas_ready}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Service</Typography>
                          <Typography>{selectedStatefulSet.service_name || 'None'}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Age: {selectedStatefulSet.age}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Containers</Typography>
                          {selectedStatefulSet.containers.map((container, idx) => (
                            <Box key={idx} mb={2}>
                              <Typography variant="body2" fontWeight="medium">{container.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{container.image}</Typography>
                              <Box mt={1}>
                                <Typography variant="caption">
                                  CPU: {container.resources.requests?.cpu || 'N/A'} / {container.resources.limits?.cpu || 'N/A'}
                                </Typography>
                                <br />
                                <Typography variant="caption">
                                  Memory: {container.resources.requests?.memory || 'N/A'} / {container.resources.limits?.memory || 'N/A'}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Grid>
                    {selectedStatefulSet.volume_claim_templates.length > 0 && (
                      <Grid item xs={12}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="subtitle2" gutterBottom>Volume Claims</Typography>
                            {selectedStatefulSet.volume_claim_templates.map((vct, idx) => (
                              <Box key={idx} mb={1}>
                                <Typography variant="body2">{vct.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Storage: {vct.storage || 'N/A'} | Class: {vct.storage_class || 'default'}
                                </Typography>
                              </Box>
                            ))}
                          </CardContent>
                        </Card>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              )}

              {/* Investigations Tab */}
              {activeTab === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <TroubleshootIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Active Investigations
                  </Typography>
                  {generateInvestigations(selectedStatefulSet).map((inv, idx) => (
                    <Accordion key={idx}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {inv.type === 'error' && <ErrorIcon color="error" />}
                          {inv.type === 'warning' && <WarningIcon color="warning" />}
                          {inv.type === 'info' && <InfoIcon color="info" />}
                          <Typography>{inv.title}</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>{inv.description}</Typography>
                        {inv.action && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Recommended Action:
                            </Typography>
                            <Typography variant="body2">{inv.action}</Typography>
                            <Button 
                              size="small" 
                              variant="contained" 
                              sx={{ mt: 1 }}
                              onClick={() => handleAutoFix(selectedStatefulSet, inv.title)}
                            >
                              Auto-Fix
                            </Button>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedStatefulSet).length === 0 && (
                    <Alert severity="success">No issues found - StatefulSet is healthy!</Alert>
                  )}
                </Box>
              )}

              {/* Recommendations Tab */}
              {activeTab === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <RecommendIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Optimization Recommendations
                  </Typography>
                  {generateRecommendations(selectedStatefulSet).map((rec, idx) => (
                    <Card key={idx} sx={{ mb: 2 }} variant="outlined">
                      <CardContent>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Chip 
                            label={rec.category} 
                            size="small" 
                            color={
                              rec.category === 'security' ? 'error' :
                              rec.category === 'performance' ? 'warning' :
                              rec.category === 'cost' ? 'info' : 'success'
                            }
                          />
                          <Chip 
                            label={rec.priority} 
                            size="small" 
                            variant="outlined"
                            color={
                              rec.priority === 'high' ? 'error' :
                              rec.priority === 'medium' ? 'warning' : 'default'
                            }
                          />
                        </Box>
                        <Typography variant="subtitle2" gutterBottom>{rec.title}</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {rec.description}
                        </Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="caption" color="text.secondary">Impact:</Typography>
                        <Typography variant="body2" paragraph>{rec.impact}</Typography>
                        <Typography variant="caption" color="text.secondary">Action:</Typography>
                        <Typography variant="body2">{rec.action}</Typography>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          sx={{ mt: 1 }}
                          onClick={() => handleAutoFix(selectedStatefulSet, rec.title)}
                        >
                          Apply Recommendation
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {/* Diagnostics Tab */}
              {activeTab === 3 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <HealthAndSafetyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Health Checks & Validations
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedStatefulSet.replicas_ready === selectedStatefulSet.replicas_desired ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Replica Health"
                        secondary={`${selectedStatefulSet.replicas_ready}/${selectedStatefulSet.replicas_desired} replicas ready`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedStatefulSet.service_name ? "success" : "warning"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Service Configuration"
                        secondary={selectedStatefulSet.service_name ? `Service: ${selectedStatefulSet.service_name}` : "No service configured"}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedStatefulSet.volume_claim_templates.length > 0 ? "success" : "warning"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Persistent Storage"
                        secondary={`${selectedStatefulSet.volume_claim_templates.length} volume claim templates`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Security Checks"
                        secondary="Image tags, resource limits, security contexts"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <NetworkCheckIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Network Validation"
                        secondary="Service connectivity and DNS resolution"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SpeedIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Performance Metrics"
                        secondary="CPU and memory utilization analysis"
                      />
                    </ListItem>
                  </List>
                </Box>
              )}

              {/* Actions Tab */}
              {activeTab === 4 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <BuildIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Available Actions
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Scaling</Typography>
                          <Box display="flex" gap={1} mt={2}>
                            <Button 
                              variant="outlined" 
                              fullWidth
                              onClick={() => handleScaleDown(selectedStatefulSet)}
                              disabled={selectedStatefulSet.replicas_desired <= 1}
                            >
                              Scale Down
                            </Button>
                            <Button 
                              variant="contained" 
                              fullWidth
                              onClick={() => handleScaleUp(selectedStatefulSet)}
                            >
                              Scale Up
                            </Button>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Current: {selectedStatefulSet.replicas_desired} replicas
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Troubleshooting</Typography>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            View Pod Logs
                          </Button>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            View Events
                          </Button>
                          <Button variant="outlined" fullWidth>
                            Restart Pods
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Automated Fixes</Typography>
                          <Button variant="contained" color="success" fullWidth sx={{ mb: 1 }}>
                            Apply All Safe Recommendations
                          </Button>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            Fix Resource Limits
                          </Button>
                          <Button variant="outlined" fullWidth>
                            Update Image Tags
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default StatefulSets;

// Made with Bob
