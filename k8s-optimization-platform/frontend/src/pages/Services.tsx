import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
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
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import InfoIcon from '@mui/icons-material/Info';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import RouterIcon from '@mui/icons-material/Router';
import DnsIcon from '@mui/icons-material/Dns';
import { API_BASE_URL } from '../config/api';

interface ServicePort {
  name: string;
  protocol: string;
  port: number;
  target_port: string | number;
  node_port?: number;
}

interface Service {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ips: string[];
  ports: ServicePort[];
  selector: { [key: string]: string };
  age: string;
  labels: { [key: string]: string };
  annotations: { [key: string]: string };
  created_at: string;
  session_affinity?: string;
  load_balancer_ip?: string;
  external_name?: string;
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

const Services: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/network/services${clusterParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch services');
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [clusterParam]);

  const getTypeColor = (type: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' => {
    switch (type) {
      case 'LoadBalancer':
        return 'primary';
      case 'NodePort':
        return 'secondary';
      case 'ClusterIP':
        return 'default';
      case 'ExternalName':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'LoadBalancer':
        return <PublicIcon />;
      case 'NodePort':
        return <RouterIcon />;
      case 'ClusterIP':
        return <LockIcon />;
      case 'ExternalName':
        return <DnsIcon />;
      default:
        return <NetworkCheckIcon />;
    }
  };

  const isExternallyAccessible = (service: Service): boolean => {
    return service.type === 'LoadBalancer' || 
           service.type === 'NodePort' || 
           service.external_ips.length > 0;
  };

  // Generate investigations for a service
  const generateInvestigations = (svc: Service): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check if service has no selector
    if (!svc.selector || Object.keys(svc.selector).length === 0) {
      investigations.push({
        type: 'warning',
        title: 'No Selector Defined',
        description: 'Service has no selector, it may not route to any pods',
        action: 'Verify service configuration and add appropriate selectors'
      });
    }

    // Check LoadBalancer without external IP
    if (svc.type === 'LoadBalancer' && !svc.load_balancer_ip) {
      investigations.push({
        type: 'warning',
        title: 'LoadBalancer Pending',
        description: 'LoadBalancer service has no external IP assigned',
        action: 'Check cloud provider configuration and quotas'
      });
    }

    // Check for exposed services
    if (isExternallyAccessible(svc)) {
      investigations.push({
        type: 'info',
        title: 'Externally Accessible',
        description: `Service is accessible from outside the cluster via ${svc.type}`,
        action: 'Ensure proper security measures are in place'
      });
    }

    // Check for multiple ports
    if (svc.ports.length > 5) {
      investigations.push({
        type: 'warning',
        title: 'Many Ports Exposed',
        description: `Service exposes ${svc.ports.length} ports`,
        action: 'Review if all ports are necessary'
      });
    }

    // Check session affinity
    if (svc.session_affinity === 'ClientIP') {
      investigations.push({
        type: 'info',
        title: 'Session Affinity Enabled',
        description: 'Service uses ClientIP session affinity',
        action: 'Ensure this is required for your application'
      });
    }

    return investigations;
  };

  // Generate recommendations
  const generateRecommendations = (svc: Service): Recommendation[] => {
    const recommendations: Recommendation[] = [];

    // Security recommendations
    if (svc.type === 'LoadBalancer') {
      recommendations.push({
        category: 'security',
        priority: 'high',
        title: 'LoadBalancer Exposed to Internet',
        description: 'Service is publicly accessible via LoadBalancer',
        impact: 'Potential security risk if not properly secured',
        action: 'Implement network policies, use ingress with TLS, or restrict source IPs'
      });
    }

    if (svc.type === 'NodePort') {
      recommendations.push({
        category: 'security',
        priority: 'medium',
        title: 'NodePort Exposes Service on All Nodes',
        description: 'Service is accessible on all cluster nodes',
        impact: 'Increases attack surface',
        action: 'Consider using Ingress or LoadBalancer instead'
      });
    }

    // Cost recommendations
    if (svc.type === 'LoadBalancer') {
      recommendations.push({
        category: 'cost',
        priority: 'medium',
        title: 'LoadBalancer Incurs Additional Costs',
        description: 'Each LoadBalancer service creates a cloud load balancer',
        impact: 'Additional monthly costs ($15-30 per LoadBalancer)',
        action: 'Consider using Ingress to share a single LoadBalancer'
      });
    }

    // Performance recommendations
    if (!svc.session_affinity && svc.type !== 'ExternalName') {
      recommendations.push({
        category: 'performance',
        priority: 'low',
        title: 'No Session Affinity',
        description: 'Service does not maintain session affinity',
        impact: 'Requests may be distributed across different pods',
        action: 'Enable session affinity if your application requires sticky sessions'
      });
    }

    // Reliability recommendations
    if (Object.keys(svc.selector).length === 1) {
      recommendations.push({
        category: 'reliability',
        priority: 'low',
        title: 'Single Selector Label',
        description: 'Service uses only one selector label',
        impact: 'May match unintended pods',
        action: 'Use multiple labels for more precise pod selection'
      });
    }

    return recommendations;
  };

  const filteredServices = services.filter(svc =>
    svc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    svc.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    svc.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRowClick = (service: Service) => {
    setSelectedService(service);
    setDetailsOpen(true);
    setActiveTab(0);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedService(null);
  };

  const renderDetailsDialog = () => {
    if (!selectedService) return null;

    const investigations = generateInvestigations(selectedService);
    const recommendations = generateRecommendations(selectedService);

    return (
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {getTypeIcon(selectedService.type)}
            <Typography variant="h6">{selectedService.name}</Typography>
            <Chip
              label={selectedService.type}
              color={getTypeColor(selectedService.type)}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Overview" icon={<InfoIcon />} iconPosition="start" />
            <Tab label="Investigations" icon={<WarningIcon />} iconPosition="start" />
            <Tab label="Recommendations" icon={<TrendingUpIcon />} iconPosition="start" />
            <Tab label="Endpoints" icon={<NetworkCheckIcon />} iconPosition="start" />
            <Tab label="Actions" icon={<RouterIcon />} iconPosition="start" />
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
                          <ListItemText primary="Namespace" secondary={selectedService.namespace} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Type" secondary={selectedService.type} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Cluster IP" secondary={selectedService.cluster_ip} />
                        </ListItem>
                        {selectedService.load_balancer_ip && (
                          <ListItem>
                            <ListItemText primary="Load Balancer IP" secondary={selectedService.load_balancer_ip} />
                          </ListItem>
                        )}
                        {selectedService.external_name && (
                          <ListItem>
                            <ListItemText primary="External Name" secondary={selectedService.external_name} />
                          </ListItem>
                        )}
                        <ListItem>
                          <ListItemText primary="Session Affinity" secondary={selectedService.session_affinity || 'None'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Age" secondary={selectedService.age} />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Ports</Typography>
                      <List dense>
                        {selectedService.ports.map((port, idx) => (
                          <ListItem key={idx}>
                            <ListItemText
                              primary={port.name || `Port ${idx + 1}`}
                              secondary={`${port.protocol} ${port.port} → ${port.target_port}${port.node_port ? ` (NodePort: ${port.node_port})` : ''}`}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Selector</Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {Object.entries(selectedService.selector).map(([key, value]) => (
                          <Chip key={key} label={`${key}: ${value}`} size="small" />
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {selectedService.external_ips.length > 0 && (
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>External IPs</Typography>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                          {selectedService.external_ips.map((ip, idx) => (
                            <Chip key={idx} label={ip} size="small" color="primary" />
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                )}

                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Labels</Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {Object.entries(selectedService.labels).map(([key, value]) => (
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
                <Typography variant="h6" gutterBottom>Service Endpoints</Typography>
                <Alert severity="info">
                  Service endpoints are dynamically managed by Kubernetes based on pod selectors.
                  Use kubectl get endpoints {selectedService.name} -n {selectedService.namespace} for real-time endpoint information.
                </Alert>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Selector Labels:</Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {Object.entries(selectedService.selector).map(([key, value]) => (
                      <Chip key={key} label={`${key}=${value}`} size="small" color="primary" />
                    ))}
                  </Box>
                </Box>
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
                      startIcon={<NetworkCheckIcon />}
                    >
                      Test Connectivity
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      fullWidth
                      startIcon={<RouterIcon />}
                    >
                      View Endpoints
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
        <Typography variant="h4">Kubernetes Services</Typography>
        <IconButton onClick={fetchServices} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Services</Typography>
              <Typography variant="h4">{services.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>LoadBalancer</Typography>
              <Typography variant="h4" color="primary.main">
                {services.filter(s => s.type === 'LoadBalancer').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>NodePort</Typography>
              <Typography variant="h4" color="secondary.main">
                {services.filter(s => s.type === 'NodePort').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>ClusterIP</Typography>
              <Typography variant="h4">
                {services.filter(s => s.type === 'ClusterIP').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3, p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search services..."
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
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Cluster IP</TableCell>
              <TableCell>External Access</TableCell>
              <TableCell>Ports</TableCell>
              <TableCell>Age</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredServices.map((service) => (
              <TableRow
                key={`${service.namespace}-${service.name}`}
                hover
                onClick={() => handleRowClick(service)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Tooltip title={service.type}>
                    <Chip
                      icon={getTypeIcon(service.type)}
                      label={service.type}
                      color={getTypeColor(service.type)}
                      size="small"
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>{service.name}</TableCell>
                <TableCell>
                  <Chip label={service.namespace} size="small" />
                </TableCell>
                <TableCell>{service.cluster_ip}</TableCell>
                <TableCell>
                  {isExternallyAccessible(service) ? (
                    <Chip label="External" color="warning" size="small" icon={<PublicIcon />} />
                  ) : (
                    <Chip label="Internal" size="small" icon={<LockIcon />} />
                  )}
                </TableCell>
                <TableCell>
                  <Chip label={service.ports.length} size="small" />
                </TableCell>
                <TableCell>{service.age}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {renderDetailsDialog()}
    </Box>
  );
};

export default Services;

// Made with Bob
