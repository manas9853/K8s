import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
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
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
  Block as BlockIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  affected_resources: number;
  detection_time: string;
  last_activity: string;
  attack_type: string;
  confidence: number;
  mitre_tactics: string[];
}

interface IncidentStats {
  total_incidents: number;
  critical_incidents: number;
  high_incidents: number;
  medium_incidents: number;
  low_incidents: number;
  active_incidents: number;
  investigating: number;
  contained: number;
  resolved: number;
  avg_response_time: string;
  avg_containment_time: string;
}

const SecurityIncidentCenterInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIncidentData();
  }, [clusterParam]);

  const fetchIncidentData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/incident-center${clusterParam}`);
      const data = await response.json();
      setIncidents(data.recent_incidents || []);
      
      // Map summary to stats structure
      const summary = data.summary;
      if (summary) {
        setStats({
          total_incidents: summary.active_incidents + summary.investigating + summary.contained + summary.resolved_today,
          critical_incidents: summary.high_priority,
          high_incidents: summary.active_incidents,
          medium_incidents: summary.investigating,
          low_incidents: summary.contained,
          active_incidents: summary.active_incidents,
          investigating: summary.investigating,
          contained: summary.contained,
          resolved: summary.resolved_today,
          avg_response_time: summary.mean_time_to_respond,
          avg_containment_time: summary.mean_time_to_detect,
        });
      }
      setError(null);
    } catch (err) {
      setError('Failed to fetch incident data');
      console.error('Error fetching incident data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    if (!severity) return 'default';
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    if (!status) return 'default';
    switch (status.toLowerCase()) {
      case 'active':
        return 'error';
      case 'investigating':
        return 'warning';
      case 'contained':
        return 'info';
      case 'resolved':
        return 'success';
      default:
        return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    if (!severity) return <SecurityIcon />;
    switch (severity.toLowerCase()) {
      case 'critical':
        return <ErrorIcon color="error" />;
      case 'high':
        return <WarningIcon color="warning" />;
      case 'medium':
        return <WarningIcon color="info" />;
      case 'low':
        return <CheckCircleIcon color="success" />;
      default:
        return <SecurityIcon />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading incident data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom>
          <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Security Incident Center
        </Typography>
        <Button variant="contained" color="primary" onClick={fetchIncidentData}>
          Refresh
        </Button>
      </Box>

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Incidents
                </Typography>
                <Typography variant="h4">{stats.total_incidents}</Typography>
                <Typography variant="body2" color="textSecondary">
                  Active: {stats.active_incidents}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#ffebee' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Critical Incidents
                </Typography>
                <Typography variant="h4" color="error">
                  {stats.critical_incidents}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Requires immediate action
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#fff3e0' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  High Priority
                </Typography>
                <Typography variant="h4" color="warning.main">
                  {stats.high_incidents}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Needs attention
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#e8f5e9' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Resolved
                </Typography>
                <Typography variant="h4" color="success.main">
                  {stats.resolved}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Successfully handled
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Investigating
                </Typography>
                <Typography variant="h5">{stats.investigating}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Avg Response Time
                </Typography>
                <Typography variant="h5">{stats.avg_response_time}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Avg Containment Time
                </Typography>
                <Typography variant="h5">{stats.avg_containment_time}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Incidents Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Active Security Incidents
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Severity</TableCell>
                  <TableCell>Incident ID</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Attack Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Affected Resources</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Detection Time</TableCell>
                  <TableCell>MITRE Tactics</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getSeverityIcon(incident.severity)}
                        <Chip
                          label={incident.severity}
                          color={getSeverityColor(incident.severity) as any}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {incident.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {incident.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={incident.attack_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={incident.status}
                        color={getStatusColor(incident.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{incident.affected_resources}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={incident.confidence}
                          sx={{ width: 60, height: 8, borderRadius: 1 }}
                        />
                        <Typography variant="body2">{incident.confidence}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{incident.detection_time}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        Last: {incident.last_activity}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {incident.mitre_tactics.slice(0, 2).map((tactic, idx) => (
                          <Chip key={idx} label={tactic} size="small" variant="outlined" />
                        ))}
                        {incident.mitre_tactics.length > 2 && (
                          <Chip label={`+${incident.mitre_tactics.length - 2}`} size="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="View Details">
                          <IconButton size="small" color="primary">
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Contain">
                          <IconButton size="small" color="warning">
                            <BlockIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Start Investigation">
                          <IconButton size="small" color="success">
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

const SecurityIncidentCenter: React.FC = () => (
  <ClusterGuard><SecurityIncidentCenterInner /></ClusterGuard>
);

export default SecurityIncidentCenter;

// Made with Bob
