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
  Badge,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Security as SecurityIcon,
  Block as BlockIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface Threat {
  id: string;
  name: string;
  type: string;
  severity: string;
  status: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  affected_pods: string[];
  affected_namespaces: string[];
  indicators: string[];
  risk_score: number;
  auto_response: string;
}

interface ThreatStats {
  total_threats: number;
  critical_threats: number;
  high_threats: number;
  medium_threats: number;
  low_threats: number;
  active_threats: number;
  blocked_threats: number;
  monitoring_threats: number;
  total_affected_pods: number;
  total_affected_namespaces: number;
}

const ActiveThreatsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [threats, setThreats] = useState<Threat[]>([]);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchThreatData();
  }, [clusterParam]);

  const fetchThreatData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/active-threats${clusterParam}`);
      const data = await response.json();
      setThreats(data.threats);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError('Failed to fetch threat data');
      console.error('Error fetching threat data:', err);
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
      case 'blocked':
        return 'warning';
      case 'monitoring':
        return 'info';
      default:
        return 'default';
    }
  };

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return 'error';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'info';
    return 'success';
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading threat data...</Typography>
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
          <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Active Threats
        </Typography>
        <Button variant="contained" color="primary" onClick={fetchThreatData}>
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
                  Total Threats
                </Typography>
                <Typography variant="h4">{stats.total_threats}</Typography>
                <Typography variant="body2" color="textSecondary">
                  Active: {stats.active_threats}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#ffebee' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Critical Threats
                </Typography>
                <Typography variant="h4" color="error">
                  {stats.critical_threats}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Immediate action required
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
                  {stats.high_threats}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Needs attention
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#e3f2fd' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Blocked
                </Typography>
                <Typography variant="h4" color="info.main">
                  {stats.blocked_threats}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Successfully contained
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Monitoring
                </Typography>
                <Typography variant="h5">{stats.monitoring_threats}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Affected Pods
                </Typography>
                <Typography variant="h5">{stats.total_affected_pods}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Affected Namespaces
                </Typography>
                <Typography variant="h5">{stats.total_affected_namespaces}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Threats Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Real-Time Threat Detection
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Threat ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Occurrences</TableCell>
                  <TableCell>Affected Resources</TableCell>
                  <TableCell>Timeline</TableCell>
                  <TableCell>Indicators</TableCell>
                  <TableCell>Auto Response</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {threats.map((threat) => (
                  <TableRow key={threat.id}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {threat.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {threat.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={threat.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={threat.severity}
                        color={getSeverityColor(threat.severity) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={threat.status}
                        color={getStatusColor(threat.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={threat.risk_score}
                          color={getRiskScoreColor(threat.risk_score) as any}
                          sx={{ width: 60, height: 8, borderRadius: 1 }}
                        />
                        <Typography variant="body2">{threat.risk_score}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Badge badgeContent={threat.occurrences} color="error">
                        <TrendingUpIcon />
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        Pods: {threat.affected_pods.length}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        NS: {threat.affected_namespaces.length}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        First: {threat.first_seen}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Last: {threat.last_seen}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {threat.indicators.slice(0, 2).map((indicator, idx) => (
                          <Chip
                            key={idx}
                            label={indicator}
                            size="small"
                            variant="outlined"
                            color="warning"
                          />
                        ))}
                        {threat.indicators.length > 2 && (
                          <Chip
                            label={`+${threat.indicators.length - 2}`}
                            size="small"
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={threat.auto_response}
                        size="small"
                        color={threat.auto_response === 'Enabled' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="View Details">
                          <IconButton size="small" color="primary">
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Block Threat">
                          <IconButton size="small" color="error">
                            <BlockIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove">
                          <IconButton size="small" color="warning">
                            <DeleteIcon />
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

const ActiveThreats: React.FC = () => (
  <ClusterGuard><ActiveThreatsInner /></ClusterGuard>
);

export default ActiveThreats;

// Made with Bob
