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
  Tabs,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import EventIcon from '@mui/icons-material/Event';
import FilterListIcon from '@mui/icons-material/FilterList';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryIcon from '@mui/icons-material/Category';
import { API_BASE_URL } from '../config/api';

interface KubernetesEvent {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source_component: string;
  source_host: string;
  first_timestamp: string;
  last_timestamp: string;
  count: number;
  involved_object_kind: string;
  involved_object_name: string;
  age: string;
}

interface Investigation {
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

const Events: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [events, setEvents] = useState<KubernetesEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<KubernetesEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/observability/events${clusterParam}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const raw = await response.json();

      // Normalise: the backend may return the old shape (involved_object: {kind, name})
      // or the new flat shape (involved_object_kind, involved_object_name).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalised: KubernetesEvent[] = raw.map((e: any) => ({
        name:                  e.name ?? '',
        namespace:             e.namespace ?? '',
        type:                  e.type ?? 'Normal',
        reason:                e.reason ?? '',
        message:               e.message ?? '',
        involved_object_kind:  e.involved_object_kind  ?? e.involved_object?.kind  ?? '',
        involved_object_name:  e.involved_object_name  ?? e.involved_object?.name  ?? '',
        source_component:      e.source_component ?? '',
        source_host:           e.source_host      ?? '',
        first_timestamp:       e.first_timestamp  ?? '',
        last_timestamp:        e.last_timestamp   ?? '',
        count:                 e.count ?? 1,
        age:                   e.age   ?? '',
      }));

      setEvents(normalised);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [clusterParam]);

  const getTypeColor = (type: string): 'success' | 'warning' | 'error' | 'info' => {
    if (type === 'Normal') return 'success';
    if (type === 'Warning') return 'warning';
    return 'error';
  };

  const getTypeIcon = (type: string) => {
    if (type === 'Normal') return <CheckCircleIcon color="success" />;
    if (type === 'Warning') return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getReasonColor = (reason: string): 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' => {
    const errorReasons = ['Failed', 'FailedScheduling', 'FailedMount', 'FailedAttachVolume', 'BackOff', 'Unhealthy'];
    const warningReasons = ['Killing', 'Preempting', 'EvictionThresholdMet'];
    const successReasons = ['Started', 'Created', 'Scheduled', 'Pulled', 'SuccessfulCreate'];
    
    if (errorReasons.some(r => reason.includes(r))) return 'error';
    if (warningReasons.some(r => reason.includes(r))) return 'warning';
    if (successReasons.some(r => reason.includes(r))) return 'success';
    return 'default';
  };

  // Generate investigations for an event
  const generateInvestigations = (evt: KubernetesEvent): Investigation[] => {
    const investigations: Investigation[] = [];

    // Check for repeated events
    if (evt.count > 10) {
      investigations.push({
        type: 'error',
        title: 'Repeated Event',
        description: `Event has occurred ${evt.count} times`,
        action: 'Investigate root cause to prevent recurring issues'
      });
    } else if (evt.count > 5) {
      investigations.push({
        type: 'warning',
        title: 'Multiple Occurrences',
        description: `Event has occurred ${evt.count} times`,
        action: 'Monitor for pattern and potential issues'
      });
    }

    // Check event type
    if (evt.type === 'Warning') {
      investigations.push({
        type: 'warning',
        title: 'Warning Event',
        description: evt.message,
        action: 'Review event details and take corrective action'
      });
    }

    // Check specific reasons
    if (evt.reason.includes('Failed')) {
      investigations.push({
        type: 'error',
        title: 'Failure Detected',
        description: `${evt.reason}: ${evt.message}`,
        action: 'Immediate investigation required'
      });
    }

    if (evt.reason.includes('BackOff')) {
      investigations.push({
        type: 'error',
        title: 'Container BackOff',
        description: 'Container is in CrashLoopBackOff state',
        action: 'Check container logs and fix application errors'
      });
    }

    if (evt.reason.includes('OOM')) {
      investigations.push({
        type: 'error',
        title: 'Out of Memory',
        description: 'Container was killed due to OOM',
        action: 'Increase memory limits or optimize application'
      });
    }

    if (evt.reason.includes('Unhealthy')) {
      investigations.push({
        type: 'warning',
        title: 'Health Check Failed',
        description: 'Liveness or readiness probe failed',
        action: 'Review probe configuration and application health'
      });
    }

    return investigations;
  };

  const uniqueNamespaces = Array.from(new Set(events.map(e => e.namespace))).sort();
  const uniqueTypes = Array.from(new Set(events.map(e => e.type))).sort();

  const filteredEvents = events.filter(evt => {
    const matchesSearch = 
      evt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.involved_object_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || evt.type === typeFilter;
    const matchesNamespace = namespaceFilter === 'all' || evt.namespace === namespaceFilter;
    
    return matchesSearch && matchesType && matchesNamespace;
  });

  const handleRowClick = (event: KubernetesEvent) => {
    setSelectedEvent(event);
    setDetailsOpen(true);
    setActiveTab(0);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedEvent(null);
  };

  const renderDetailsDialog = () => {
    if (!selectedEvent) return null;

    const investigations = generateInvestigations(selectedEvent);

    return (
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <EventIcon />
            <Typography variant="h6">{selectedEvent.reason}</Typography>
            <Chip
              label={selectedEvent.type}
              color={getTypeColor(selectedEvent.type)}
              size="small"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Overview" icon={<InfoIcon />} iconPosition="start" />
            <Tab label="Investigations" icon={<WarningIcon />} iconPosition="start" />
            <Tab label="Timeline" icon={<AccessTimeIcon />} iconPosition="start" />
          </Tabs>

          <Box sx={{ mt: 3 }}>
            {activeTab === 0 && (
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Event Details</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="Namespace" secondary={selectedEvent.namespace} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Type" secondary={selectedEvent.type} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Reason" secondary={selectedEvent.reason} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Message" secondary={selectedEvent.message} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Count" secondary={selectedEvent.count} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Age" secondary={selectedEvent.age} />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Involved Object</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="Kind" secondary={selectedEvent.involved_object_kind} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Name" secondary={selectedEvent.involved_object_name} />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Source</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="Component" secondary={selectedEvent.source_component} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Host" secondary={selectedEvent.source_host || 'N/A'} />
                        </ListItem>
                      </List>
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
                <Typography variant="h6" gutterBottom>Event Timeline</Typography>
                <Card>
                  <CardContent>
                    <List dense>
                      <ListItem>
                        <ListItemIcon>
                          <AccessTimeIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="First Occurrence"
                          secondary={new Date(selectedEvent.first_timestamp).toLocaleString()}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <AccessTimeIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Last Occurrence"
                          secondary={new Date(selectedEvent.last_timestamp).toLocaleString()}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <CategoryIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Total Occurrences"
                          secondary={`${selectedEvent.count} times`}
                        />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
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
        <Typography variant="h4">Kubernetes Events</Typography>
        <IconButton onClick={fetchEvents} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Events</Typography>
              <Typography variant="h4">{events.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Normal</Typography>
              <Typography variant="h4" color="success.main">
                {events.filter(e => e.type === 'Normal').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Warning</Typography>
              <Typography variant="h4" color="warning.main">
                {events.filter(e => e.type === 'Warning').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Repeated ({'>'}10)</Typography>
              <Typography variant="h4" color="error.main">
                {events.filter(e => e.count > 10).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search events..."
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
              <InputLabel>Type</InputLabel>
              <Select
                value={typeFilter}
                label="Type"
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <MenuItem value="all">All Types</MenuItem>
                {uniqueTypes.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Namespace</InputLabel>
              <Select
                value={namespaceFilter}
                label="Namespace"
                onChange={(e) => setNamespaceFilter(e.target.value)}
              >
                <MenuItem value="all">All Namespaces</MenuItem>
                {uniqueNamespaces.map(ns => (
                  <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Object</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Count</TableCell>
              <TableCell>Age</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEvents.map((event, idx) => (
              <TableRow
                key={`${event.namespace}-${event.name}-${idx}`}
                hover
                onClick={() => handleRowClick(event)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Tooltip title={event.type}>
                    {getTypeIcon(event.type)}
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip label={event.namespace} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={event.reason}
                    color={getReasonColor(event.reason)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                    {event.involved_object_kind && `${event.involved_object_kind}/`}{event.involved_object_name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                    {event.source_component}{event.source_host ? `, ${event.source_host}` : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                    {event.message}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={event.count}
                    size="small"
                    color={event.count > 10 ? 'error' : event.count > 5 ? 'warning' : 'default'}
                  />
                </TableCell>
                <TableCell>{event.age}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {renderDetailsDialog()}
    </Box>
  );
};

export default Events;

// Made with Bob
