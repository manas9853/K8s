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
import ComputerIcon from '@mui/icons-material/Computer';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RecommendIcon from '@mui/icons-material/Recommend';
import InfoIcon from '@mui/icons-material/Info';
import BugReportIcon from '@mui/icons-material/BugReport';
import DnsIcon from '@mui/icons-material/Dns';
import { API_BASE_URL } from '../config/api';

interface Container {
  name: string;
  image: string;
  ports: Array<{ containerPort: number; protocol: string }>;
  resources: {
    requests?: { [key: string]: string };
    limits?: { [key: string]: string };
  };
}

interface DaemonSet {
  name: string;
  namespace: string;
  desired_number_scheduled: number;
  current_number_scheduled: number;
  number_ready: number;
  number_available: number;
  number_misscheduled: number;
  age: string;
  labels: { [key: string]: string };
  selector: { [key: string]: string };
  containers: Container[];
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

const DaemonSets: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [daemonsets, setDaemonSets] = useState<DaemonSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDaemonSet, setSelectedDaemonSet] = useState<DaemonSet | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const fetchDaemonSets = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/daemonsets${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setDaemonSets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch daemonsets');
      console.error('Error fetching daemonsets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchDaemonSets(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getStatusColor = (ds: DaemonSet): 'success' | 'warning' | 'error' => {
    if (ds.number_ready === ds.desired_number_scheduled && ds.number_misscheduled === 0) {
      return 'success';
    }
    if (ds.number_ready > 0) {
      return 'warning';
    }
    return 'error';
  };

  const getStatusIcon = (ds: DaemonSet) => {
    const color = getStatusColor(ds);
    if (color === 'success') return <CheckCircleIcon color="success" />;
    if (color === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getNodeCoverage = (ds: DaemonSet): number => {
    if (ds.desired_number_scheduled === 0) return 0;
    return Math.round((ds.number_ready / ds.desired_number_scheduled) * 100);
  };

  // Generate investigations
  const generateInvestigations = (ds: DaemonSet): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check node coverage
    if (ds.number_ready < ds.desired_number_scheduled) {
      investigations.push({
        type: 'error',
        title: 'Incomplete Node Coverage',
        description: `Only ${ds.number_ready} of ${ds.desired_number_scheduled} nodes have ready pods`,
        action: 'Check node taints, tolerations, and pod scheduling constraints'
      });
    }

    // Check misscheduled pods
    if (ds.number_misscheduled > 0) {
      investigations.push({
        type: 'error',
        title: 'Misscheduled Pods',
        description: `${ds.number_misscheduled} pods are running on nodes where they should not be`,
        action: 'Review node selectors and affinity rules'
      });
    }

    // Check unavailable pods
    const unavailable = ds.current_number_scheduled - ds.number_available;
    if (unavailable > 0) {
      investigations.push({
        type: 'warning',
        title: 'Unavailable Pods',
        description: `${unavailable} pods are not available`,
        action: 'Check pod readiness probes and resource constraints'
      });
    }

    // Check resource limits
    ds.containers.forEach(container => {
      if (!container.resources.limits) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set CPU and memory limits to prevent node resource exhaustion'
        });
      }
      if (!container.resources.requests) {
        investigations.push({
          type: 'warning',
          title: `No Resource Requests - ${container.name}`,
          description: 'Container has no resource requests set',
          action: 'Set resource requests for proper node resource allocation'
        });
      }
    });

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (ds: DaemonSet): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Performance recommendations
    ds.containers.forEach(container => {
      const cpuRequest = container.resources.requests?.cpu;
      const cpuLimit = container.resources.limits?.cpu;
      
      if (cpuRequest && cpuLimit && cpuRequest !== cpuLimit) {
        recommendations.push({
          category: 'performance',
          priority: 'high',
          title: 'CPU Request/Limit Mismatch',
          description: `Container ${container.name} has different CPU request (${cpuRequest}) and limit (${cpuLimit})`,
          impact: 'May cause CPU throttling on nodes under load',
          action: 'DaemonSets should have equal CPU request/limit for predictable node performance'
        });
      }
    });

    // Reliability recommendations
    if (ds.number_misscheduled > 0) {
      recommendations.push({
        category: 'reliability',
        priority: 'high',
        title: 'Pod Misscheduling',
        description: 'Pods are running on incorrect nodes',
        impact: 'May cause service disruption or security issues',
        action: 'Review and fix node selectors, taints, and tolerations'
      });
    }

    // Security recommendations
    ds.containers.forEach(container => {
      if (container.image.includes(':latest')) {
        recommendations.push({
          category: 'security',
          priority: 'high',
          title: 'Using :latest Tag',
          description: `Container ${container.name} uses :latest image tag`,
          impact: 'Unpredictable updates across all nodes',
          action: 'Pin to specific image version for consistent node-level deployments'
        });
      }
    });

    // Cost recommendations
    const totalPods = ds.desired_number_scheduled;
    if (totalPods > 10) {
      recommendations.push({
        category: 'cost',
        priority: 'medium',
        title: 'High Node Count',
        description: `DaemonSet runs on ${totalPods} nodes`,
        impact: 'Higher resource consumption across cluster',
        action: 'Review if DaemonSet is needed on all nodes or can use node selectors'
      });
    }

    return recommendations;
  };

  const handleAutoFix = (ds: DaemonSet, issue: string) => {
    console.log(`Auto-fixing ${issue} for ${ds.name}`);
    alert(`Would auto-fix: ${issue} for ${ds.name}`);
  };

  const handleRestartPods = (ds: DaemonSet) => {
    console.log(`Restarting pods for ${ds.name}`);
    alert(`Would restart all pods for ${ds.name}`);
  };

  const filteredDaemonSets = daemonsets.filter(ds =>
    ds.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ds.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDaemonSets = daemonsets.length;
  const healthyDaemonSets = daemonsets.filter(ds => 
    ds.number_ready === ds.desired_number_scheduled && ds.number_misscheduled === 0
  ).length;
  const totalNodes = daemonsets.reduce((sum, ds) => sum + ds.desired_number_scheduled, 0);
  const coveredNodes = daemonsets.reduce((sum, ds) => sum + ds.number_ready, 0);
  const totalIssues = daemonsets.reduce((sum, ds) => 
    sum + generateInvestigations(ds).filter(i => i.type === 'error' || i.type === 'warning').length, 0
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
            DaemonSets
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage node-level workloads that run on every node in the cluster
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
                <ComputerIcon color="primary" />
                <Typography color="text.secondary" gutterBottom>
                  Total DaemonSets
                </Typography>
              </Box>
              <Typography variant="h4">
                {totalDaemonSets}
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
                {healthyDaemonSets}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {totalDaemonSets > 0 ? Math.round((healthyDaemonSets / totalDaemonSets) * 100) : 0}% healthy
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Node Coverage
              </Typography>
              <Typography variant="h4">
                {coveredNodes}/{totalNodes}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {totalNodes > 0 ? Math.round((coveredNodes / totalNodes) * 100) : 0}% covered
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
          placeholder="Search daemonsets..."
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
          <IconButton onClick={() => fetchDaemonSets(selectedClusterId)} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* DaemonSets Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Nodes</TableCell>
              <TableCell>Coverage</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDaemonSets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography color="text.secondary">
                    {searchTerm ? 'No daemonsets match your search' : 'No daemonsets found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredDaemonSets.map((ds) => {
                const investigations = generateInvestigations(ds);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${ds.namespace}-${ds.name}`} hover>
                    <TableCell>
                      <Tooltip title={`${ds.number_ready}/${ds.desired_number_scheduled} nodes ready`}>
                        {getStatusIcon(ds)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {ds.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={ds.namespace} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {ds.desired_number_scheduled}
                      </Typography>
                      {ds.number_misscheduled > 0 && (
                        <Typography variant="caption" color="error">
                          {ds.number_misscheduled} misscheduled
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2">
                            {ds.number_ready}/{ds.desired_number_scheduled}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({getNodeCoverage(ds)}%)
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={getNodeCoverage(ds)}
                          color={getStatusColor(ds)}
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
                    <TableCell>{ds.age}</TableCell>
                    <TableCell>
                      <Tooltip title="View Details">
                        <IconButton 
                          size="small" 
                          onClick={() => {
                            setSelectedDaemonSet(ds);
                            setDetailsOpen(true);
                          }}
                        >
                          <InfoIcon />
                        </IconButton>
                      </Tooltip>
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
          Showing {filteredDaemonSets.length} of {totalDaemonSets} daemonsets
        </Typography>
      </Box>

      {/* Details Dialog */}
      <Dialog 
        open={detailsOpen} 
        onClose={() => setDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        {selectedDaemonSet && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedDaemonSet.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedDaemonSet.namespace}
                  </Typography>
                </Box>
                {getStatusIcon(selectedDaemonSet)}
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
                          <Typography variant="subtitle2" gutterBottom>Node Coverage</Typography>
                          <Typography>Desired: {selectedDaemonSet.desired_number_scheduled}</Typography>
                          <Typography>Current: {selectedDaemonSet.current_number_scheduled}</Typography>
                          <Typography>Ready: {selectedDaemonSet.number_ready}</Typography>
                          <Typography>Available: {selectedDaemonSet.number_available}</Typography>
                          {selectedDaemonSet.number_misscheduled > 0 && (
                            <Typography color="error">Misscheduled: {selectedDaemonSet.number_misscheduled}</Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>DaemonSet Info</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Age: {selectedDaemonSet.age}
                          </Typography>
                          <Box mt={1}>
                            <Typography variant="caption">Coverage: {getNodeCoverage(selectedDaemonSet)}%</Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Containers</Typography>
                          {selectedDaemonSet.containers.map((container, idx) => (
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
                  {generateInvestigations(selectedDaemonSet).map((inv, idx) => (
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
                              onClick={() => handleAutoFix(selectedDaemonSet, inv.title)}
                            >
                              Auto-Fix
                            </Button>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedDaemonSet).length === 0 && (
                    <Alert severity="success">No issues found - DaemonSet is healthy!</Alert>
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
                  {generateRecommendations(selectedDaemonSet).map((rec, idx) => (
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
                          onClick={() => handleAutoFix(selectedDaemonSet, rec.title)}
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
                        <CheckCircleIcon color={selectedDaemonSet.number_ready === selectedDaemonSet.desired_number_scheduled ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Node Coverage"
                        secondary={`${selectedDaemonSet.number_ready}/${selectedDaemonSet.desired_number_scheduled} nodes covered`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedDaemonSet.number_misscheduled === 0 ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Scheduling"
                        secondary={`${selectedDaemonSet.number_misscheduled} misscheduled pods`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <DnsIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Node Selectors"
                        secondary="Validate node affinity and tolerations"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Security Checks"
                        secondary="Image tags, resource limits, privileged access"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <NetworkCheckIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Network Validation"
                        secondary="Host network and port conflicts"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SpeedIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Performance Metrics"
                        secondary="Per-node resource utilization"
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
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Pod Management</Typography>
                          <Button 
                            variant="contained" 
                            fullWidth 
                            sx={{ mb: 1 }}
                            onClick={() => handleRestartPods(selectedDaemonSet)}
                          >
                            Restart All Pods
                          </Button>
                          <Typography variant="caption" color="text.secondary">
                            Restarts pods on all {selectedDaemonSet.desired_number_scheduled} nodes
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Troubleshooting</Typography>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            View Pod Logs (All Nodes)
                          </Button>
                          <Button variant="outlined" fullWidth sx={{ mb: 1 }}>
                            View Events
                          </Button>
                          <Button variant="outlined" fullWidth>
                            Check Node Taints
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

export default DaemonSets;

// Made with Bob
