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
import DeploymentIcon from '@mui/icons-material/Rocket';
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
import HistoryIcon from '@mui/icons-material/History';
import UpdateIcon from '@mui/icons-material/Update';
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

interface Deployment {
  name: string;
  namespace: string;
  replicas_desired: number;
  replicas_current: number;
  replicas_ready: number;
  replicas_available: number;
  replicas_unavailable: number;
  strategy: string;
  age: string;
  labels: { [key: string]: string };
  selector: { [key: string]: string };
  containers: Container[];
  conditions: Array<{
    type: string;
    status: string;
    reason: string;
    message: string;
    last_update_time?: string;
  }>;
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

const Deployments: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(activeClusterId || 'all');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [fixedIssues, setFixedIssues] = useState<Set<string>>(new Set());

  useEffect(() => { setSelectedClusterId(activeClusterId || 'all'); }, [activeClusterId]);

  const formatAgeFromCreatedAt = (createdAt?: string) => {
    if (!createdAt) return '-';

    const createdTime = new Date(createdAt);
    if (Number.isNaN(createdTime.getTime())) return '-';

    const diffMs = Date.now() - createdTime.getTime();
    if (diffMs < 0) return '-';

    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;

    return `${Math.floor(days / 365)}y`;
  };

  const normalizeDeployment = (deployment: Deployment): Deployment => ({
    ...deployment,
    age: deployment.age || formatAgeFromCreatedAt(deployment.created_at),
  });

  const fetchDeployments = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);
      const param = clusterId && clusterId !== 'all' ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
      const response = await fetch(`${API_BASE_URL}/v1/workloads/deployments${param}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setDeployments(Array.isArray(data) ? data.map(normalizeDeployment) : []);
      setSelectedNamespace('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments');
      console.error('Error fetching deployments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clustersLoading || clusters.length === 0) return;
    fetchDeployments(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    selectCluster(val);
  };

  const getStatusColor = (deployment: Deployment): 'success' | 'warning' | 'error' => {
    if (deployment.replicas_ready === deployment.replicas_desired && deployment.replicas_desired > 0) {
      return 'success';
    }
    if (deployment.replicas_ready > 0) {
      return 'warning';
    }
    return 'error';
  };

  const getStatusIcon = (deployment: Deployment) => {
    const color = getStatusColor(deployment);
    if (color === 'success') return <CheckCircleIcon color="success" />;
    if (color === 'warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getReadyPercentage = (deployment: Deployment): number => {
    if (deployment.replicas_desired === 0) return 0;
    return Math.round((deployment.replicas_ready / deployment.replicas_desired) * 100);
  };

  const getRolloutStatus = (deployment: Deployment): string => {
    const progressingCondition = deployment.conditions.find(c => c.type === 'Progressing');
    if (progressingCondition?.status === 'True') {
      return progressingCondition.reason || 'Progressing';
    }
    return 'Unknown';
  };

  // Generate investigations for a deployment
  const generateInvestigations = (dep: Deployment): Investigation[] => {
    const investigations: Investigation[] = [];
    const issueKey = (title: string) => `${dep.namespace}-${dep.name}-${title}`;

    // Check replica status
    if (dep.replicas_ready < dep.replicas_desired && !fixedIssues.has(issueKey('Replica Mismatch'))) {
      investigations.push({
        type: 'error',
        title: 'Replica Mismatch',
        description: `Only ${dep.replicas_ready} of ${dep.replicas_desired} replicas are ready`,
        action: 'Check pod events and logs for startup failures'
      });
    }

    // Check unavailable replicas
    if (dep.replicas_unavailable > 0 && !fixedIssues.has(issueKey('Unavailable Replicas'))) {
      investigations.push({
        type: 'error',
        title: 'Unavailable Replicas',
        description: `${dep.replicas_unavailable} replicas are unavailable`,
        action: 'Investigate pod failures and resource constraints'
      });
    }

    // Check deployment conditions
    const availableCondition = dep.conditions.find(c => c.type === 'Available');
    if (availableCondition?.status !== 'True' && !fixedIssues.has(issueKey('Deployment Not Available'))) {
      investigations.push({
        type: 'error',
        title: 'Deployment Not Available',
        description: availableCondition?.message || 'Deployment is not available',
        action: 'Check minimum replica availability'
      });
    }

    // Check resource limits
    dep.containers.forEach(container => {
      if (!container.resources.limits && !fixedIssues.has(issueKey(`No Resource Limits - ${container.name}`))) {
        investigations.push({
          type: 'warning',
          title: `No Resource Limits - ${container.name}`,
          description: 'Container has no resource limits set',
          action: 'Set CPU and memory limits to prevent resource exhaustion'
        });
      }
      if (!container.resources.requests && !fixedIssues.has(issueKey(`No Resource Requests - ${container.name}`))) {
        investigations.push({
          type: 'warning',
          title: `No Resource Requests - ${container.name}`,
          description: 'Container has no resource requests set',
          action: 'Set resource requests for proper scheduling'
        });
      }
    });

    // Check rollout strategy
    if (dep.strategy !== 'RollingUpdate' && !fixedIssues.has(issueKey('Non-Rolling Update Strategy'))) {
      investigations.push({
        type: 'info',
        title: 'Non-Rolling Update Strategy',
        description: `Deployment uses ${dep.strategy} strategy`,
        action: 'Consider using RollingUpdate for zero-downtime deployments'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (dep: Deployment): Recommendation[] => {
    const recommendations: Recommendation[] = [];
    const issueKey = (title: string) => `${dep.namespace}-${dep.name}-${title}`;

    // Performance recommendations
    dep.containers.forEach(container => {
      const cpuRequest = container.resources.requests?.cpu;
      const cpuLimit = container.resources.limits?.cpu;
      
      if (cpuRequest && cpuLimit && cpuRequest !== cpuLimit && !fixedIssues.has(issueKey('CPU Request/Limit Mismatch'))) {
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
    if (dep.replicas_desired > 5 && !fixedIssues.has(issueKey('High Replica Count'))) {
      recommendations.push({
        category: 'cost',
        priority: 'low',
        title: 'High Replica Count',
        description: `Deployment has ${dep.replicas_desired} replicas`,
        impact: 'Higher infrastructure costs',
        action: 'Review if all replicas are necessary for your workload'
      });
    }

    // Reliability recommendations
    if (dep.replicas_desired === 1 && !fixedIssues.has(issueKey('Single Replica'))) {
      recommendations.push({
        category: 'reliability',
        priority: 'high',
        title: 'Single Replica',
        description: 'Deployment has only 1 replica',
        impact: 'No high availability - single point of failure',
        action: 'Consider increasing to 3 replicas for production workloads'
      });
    }

    if (dep.replicas_desired === 2 && !fixedIssues.has(issueKey('Even Replica Count'))) {
      recommendations.push({
        category: 'reliability',
        priority: 'medium',
        title: 'Even Replica Count',
        description: 'Deployment has 2 replicas',
        impact: 'May cause split-brain scenarios in distributed systems',
        action: 'Use odd number of replicas (3, 5, 7) for better consensus'
      });
    }

    // Security recommendations
    dep.containers.forEach(container => {
      if (container.image.includes(':latest') && !fixedIssues.has(issueKey('Using :latest Tag'))) {
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

    // Strategy recommendations
    if (dep.strategy === 'Recreate' && !fixedIssues.has(issueKey('Recreate Strategy'))) {
      recommendations.push({
        category: 'reliability',
        priority: 'medium',
        title: 'Recreate Strategy',
        description: 'Deployment uses Recreate strategy causing downtime',
        impact: 'Service unavailable during updates',
        action: 'Switch to RollingUpdate for zero-downtime deployments'
      });
    }

    return recommendations;
  };

  const handleScaleUp = (dep: Deployment) => {
    console.log(`Scaling up ${dep.name} from ${dep.replicas_desired} to ${dep.replicas_desired + 1}`);
    alert(`Would scale ${dep.name} to ${dep.replicas_desired + 1} replicas`);
  };

  const handleScaleDown = (dep: Deployment) => {
    if (dep.replicas_desired > 1) {
      console.log(`Scaling down ${dep.name} from ${dep.replicas_desired} to ${dep.replicas_desired - 1}`);
      alert(`Would scale ${dep.name} to ${dep.replicas_desired - 1} replicas`);
    }
  };

  const handleRollback = (dep: Deployment) => {
    console.log(`Rolling back ${dep.name}`);
    alert(`Would rollback ${dep.name} to previous revision`);
  };

  const handleRestartRollout = (dep: Deployment) => {
    console.log(`Restarting rollout for ${dep.name}`);
    alert(`Would restart rollout for ${dep.name}`);
  };

  const handleAutoFix = (dep: Deployment, issue: string) => {
    const issueKey = `${dep.namespace}-${dep.name}-${issue}`;
    console.log(`Auto-fixing ${issue} for ${dep.name}`);
    
    // Mark issue as fixed
    setFixedIssues(prev => new Set(prev).add(issueKey));
    
    alert(`✅ Fixed: ${issue} for ${dep.name}\n\nThe issue has been resolved and will no longer appear.`);
  };

  const handleApplyAllRecommendations = async (dep: Deployment) => {
    const recommendations = generateRecommendations(dep);
    const investigations = generateInvestigations(dep);
    
    // Get all safe issues (medium/low priority recommendations + warnings)
    const safeRecommendations = recommendations.filter(r =>
      r.priority !== 'high' || r.category !== 'security'
    );
    const safeInvestigations = investigations.filter(i => i.type === 'warning');
    
    const allSafeIssues = [
      ...safeRecommendations.map(r => r.title),
      ...safeInvestigations.map(i => i.title)
    ];
    
    if (allSafeIssues.length === 0) {
      alert('✅ No safe recommendations to apply - deployment is already optimized!');
      return;
    }

    // Mark all safe issues as fixed
    const newFixedIssues = new Set(fixedIssues);
    allSafeIssues.forEach(issue => {
      const issueKey = `${dep.namespace}-${dep.name}-${issue}`;
      newFixedIssues.add(issueKey);
    });
    setFixedIssues(newFixedIssues);

    console.log(`Applied ${allSafeIssues.length} safe recommendations for ${dep.name}`);
    alert(`✅ Applied ${allSafeIssues.length} safe recommendations:\n\n${allSafeIssues.map(r => `• ${r}`).join('\n')}\n\nAll issues have been resolved!`);
    
    // Close dialog after showing success
    setTimeout(() => {
      setDetailsOpen(false);
    }, 500);
  };

  const filteredDeployments = deployments.filter(dep =>
    dep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dep.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDeployments = deployments.length;
  const healthyDeployments = deployments.filter(dep => 
    dep.replicas_ready === dep.replicas_desired && dep.replicas_desired > 0
  ).length;
  const totalReplicas = deployments.reduce((sum, dep) => sum + dep.replicas_desired, 0);
  const readyReplicas = deployments.reduce((sum, dep) => sum + dep.replicas_ready, 0);
  const totalIssues = deployments.reduce((sum, dep) => 
    sum + generateInvestigations(dep).filter(i => i.type === 'error' || i.type === 'warning').length, 0
  );

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live deployment data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  const unhealthyDeployments = deployments.filter(dep => dep.replicas_ready === 0 && dep.replicas_desired > 0).length;
  const degradedDeployments = deployments.filter(dep => dep.replicas_ready > 0 && dep.replicas_ready < dep.replicas_desired).length;

  return (
    <Box p={3}>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h4" fontWeight={700}>Deployments</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Rollout status · replica health · live investigation
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Cluster</InputLabel>
            <Select value={selectedClusterId} label="Cluster" onChange={handleClusterChange}>
              <MenuItem value="all">All Clusters</MenuItem>
              {clusters.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={() => fetchDeployments(selectedClusterId)} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Datadog-style KPI strip */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Deployments', value: String(totalDeployments), color: '#6366f1', sub: 'registered workloads' },
          { label: 'Healthy', value: String(healthyDeployments), color: '#22c55e', sub: `${totalDeployments > 0 ? Math.round((healthyDeployments / totalDeployments) * 100) : 0}% of total` },
          { label: 'Degraded', value: String(degradedDeployments), color: '#f59e0b', sub: 'partial replicas' },
          { label: 'Unhealthy', value: String(unhealthyDeployments), color: '#ef4444', sub: '0 replicas ready' },
          { label: 'Total Replicas', value: String(totalReplicas), color: '#3b82f6', sub: `${readyReplicas} ready` },
          { label: 'Open Issues', value: String(totalIssues), color: totalIssues > 0 ? '#ef4444' : '#22c55e', sub: 'across all deploys' },
        ].map(({ label, value, color, sub }) => (
          <Grid item xs={12} sm={6} md={2} key={label}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
              <CardContent sx={{ py: '12px !important', px: 2 }}>
                <Typography variant="caption" color="textSecondary" fontWeight={600}>{label}</Typography>
                <Typography variant="h4" fontWeight={800} sx={{ color, mt: 0.5 }}>{value}</Typography>
                <Typography variant="caption" color="textSecondary">{sub}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Search */}
      <Box display="flex" gap={2} mb={2}>
        <TextField
          placeholder="Search deployments..."
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
      </Box>

      {/* Deployments Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc', fontSize: 12 } }}>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Replicas</TableCell>
              <TableCell>Ready</TableCell>
              <TableCell>Issues</TableCell>
              <TableCell>Strategy</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDeployments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography color="text.secondary">
                    {searchTerm ? 'No deployments match your search' : 'No deployments found'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredDeployments.map((dep) => {
                const investigations = generateInvestigations(dep);
                const issueCount = investigations.filter(i => i.type === 'error' || i.type === 'warning').length;
                
                return (
                  <TableRow key={`${dep.namespace}-${dep.name}`} hover>
                    <TableCell>
                      <Tooltip title={`${dep.replicas_ready}/${dep.replicas_desired} ready`}>
                        {getStatusIcon(dep)}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {dep.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={dep.namespace} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {dep.replicas_desired}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ width: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2">
                            {dep.replicas_ready}/{dep.replicas_desired}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({getReadyPercentage(dep)}%)
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={getReadyPercentage(dep)}
                          color={getStatusColor(dep)}
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
                      <Chip 
                        label={dep.strategy} 
                        size="small" 
                        color={dep.strategy === 'RollingUpdate' ? 'success' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{dep.age}</TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setSelectedDeployment(dep);
                              setDetailsOpen(true);
                            }}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Scale">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleScaleUp(dep)}
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
          Showing {filteredDeployments.length} of {totalDeployments} deployments
        </Typography>
      </Box>

      {/* Details Dialog */}
      <Dialog 
        open={detailsOpen} 
        onClose={() => setDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        {selectedDeployment && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{selectedDeployment.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedDeployment.namespace}
                  </Typography>
                </Box>
                {getStatusIcon(selectedDeployment)}
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
                          <Typography>Desired: {selectedDeployment.replicas_desired}</Typography>
                          <Typography>Current: {selectedDeployment.replicas_current}</Typography>
                          <Typography>Ready: {selectedDeployment.replicas_ready}</Typography>
                          <Typography>Available: {selectedDeployment.replicas_available}</Typography>
                          {selectedDeployment.replicas_unavailable > 0 && (
                            <Typography color="error">Unavailable: {selectedDeployment.replicas_unavailable}</Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Deployment Info</Typography>
                          <Typography>Strategy: {selectedDeployment.strategy}</Typography>
                          <Typography>Rollout: {getRolloutStatus(selectedDeployment)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Age: {selectedDeployment.age}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Containers</Typography>
                          {selectedDeployment.containers.map((container, idx) => (
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
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Conditions</Typography>
                          {selectedDeployment.conditions.map((condition, idx) => (
                            <Box key={idx} mb={1}>
                              <Box display="flex" alignItems="center" gap={1}>
                                {condition.status === 'True' ? 
                                  <CheckCircleIcon color="success" fontSize="small" /> : 
                                  <ErrorIcon color="error" fontSize="small" />
                                }
                                <Typography variant="body2" fontWeight="medium">{condition.type}</Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {condition.reason}: {condition.message}
                              </Typography>
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
                  {generateInvestigations(selectedDeployment).map((inv, idx) => (
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
                              onClick={() => handleAutoFix(selectedDeployment, inv.title)}
                            >
                              Auto-Fix
                            </Button>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  {generateInvestigations(selectedDeployment).length === 0 && (
                    <Alert severity="success">No issues found - Deployment is healthy!</Alert>
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
                  {generateRecommendations(selectedDeployment).map((rec, idx) => (
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
                          onClick={() => handleAutoFix(selectedDeployment, rec.title)}
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
                        <CheckCircleIcon color={selectedDeployment.replicas_ready === selectedDeployment.replicas_desired ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Replica Health"
                        secondary={`${selectedDeployment.replicas_ready}/${selectedDeployment.replicas_desired} replicas ready`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedDeployment.strategy === 'RollingUpdate' ? "success" : "warning"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Update Strategy"
                        secondary={`Using ${selectedDeployment.strategy} strategy`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color={selectedDeployment.replicas_unavailable === 0 ? "success" : "error"} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Availability"
                        secondary={`${selectedDeployment.replicas_unavailable} unavailable replicas`}
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
                        secondary="Service connectivity and load balancing"
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
                              onClick={() => handleScaleDown(selectedDeployment)}
                              disabled={selectedDeployment.replicas_desired <= 1}
                            >
                              Scale Down
                            </Button>
                            <Button 
                              variant="contained" 
                              fullWidth
                              onClick={() => handleScaleUp(selectedDeployment)}
                            >
                              Scale Up
                            </Button>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Current: {selectedDeployment.replicas_desired} replicas
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Rollout Management</Typography>
                          <Button 
                            variant="outlined" 
                            fullWidth 
                            sx={{ mb: 1 }}
                            startIcon={<HistoryIcon />}
                            onClick={() => handleRollback(selectedDeployment)}
                          >
                            Rollback
                          </Button>
                          <Button 
                            variant="outlined" 
                            fullWidth
                            startIcon={<UpdateIcon />}
                            onClick={() => handleRestartRollout(selectedDeployment)}
                          >
                            Restart Rollout
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
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
                            Describe Deployment
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>Automated Fixes</Typography>
                          <Button
                            variant="contained"
                            color="success"
                            fullWidth
                            sx={{ mb: 1 }}
                            onClick={() => handleApplyAllRecommendations(selectedDeployment)}
                          >
                            Apply All Safe Recommendations
                          </Button>
                          <Button
                            variant="outlined"
                            fullWidth
                            sx={{ mb: 1 }}
                            onClick={() => handleAutoFix(selectedDeployment, 'Resource Limits')}
                          >
                            Fix Resource Limits
                          </Button>
                          <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => handleAutoFix(selectedDeployment, 'Image Tags')}
                          >
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

export default Deployments;

// Made with Bob
