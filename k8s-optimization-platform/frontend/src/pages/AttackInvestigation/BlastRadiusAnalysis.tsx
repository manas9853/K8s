import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Paper,
  LinearProgress,
  Alert,
  Button,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface BlastRadiusData {
  incident_id: string;
  impact_summary: {
    total_affected_resources: number;
    affected_namespaces: number;
    affected_nodes: number;
    affected_services: number;
    data_exposure_risk: string;
  };
  affected_resources: Array<{
    type: string;
    name: string;
    namespace: string;
    impact_level: string;
    exposure_type: string;
  }>;
  network_exposure: {
    exposed_services: number;
    external_connections: number;
    internal_connections: number;
  };
  data_at_risk: {
    secrets: number;
    configmaps: number;
    pvcs: number;
    estimated_data_size: string;
  };
}

const BlastRadiusAnalysisInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [incidentId, setIncidentId] = useState('INC-2024-001');
  const [blastRadius, setBlastRadius] = useState<BlastRadiusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBlastRadius();
  }, [incidentId]);

  const fetchBlastRadius = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/blast-radius/${incidentId}${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setBlastRadius(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch blast radius data');
      console.error('Error fetching blast radius:', err);
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (impact: string) => {
    if (!impact) return 'default';
    switch (impact.toLowerCase()) {
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

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading blast radius...</Typography>
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

  if (!blastRadius) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="info">No blast radius data available</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom>
          <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Blast Radius Analysis
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label="Incident ID"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="INC-2024-001">INC-2024-001</MenuItem>
            <MenuItem value="INC-2024-002">INC-2024-002</MenuItem>
            <MenuItem value="INC-2024-003">INC-2024-003</MenuItem>
          </TextField>
          <Button variant="contained" color="primary" onClick={fetchBlastRadius}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Impact Summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Affected Resources
              </Typography>
              <Typography variant="h4">
                {blastRadius.impact_summary.total_affected_resources}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Affected Namespaces
              </Typography>
              <Typography variant="h4">
                {blastRadius.impact_summary.affected_namespaces}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Affected Nodes
              </Typography>
              <Typography variant="h4">
                {blastRadius.impact_summary.affected_nodes}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#ffebee' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Data Exposure Risk
              </Typography>
              <Typography variant="h4" color="error">
                {blastRadius.impact_summary.data_exposure_risk}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Network & Data Exposure */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Network Exposure
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Exposed Services: {blastRadius.network_exposure.exposed_services}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  External Connections: {blastRadius.network_exposure.external_connections}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  Internal Connections: {blastRadius.network_exposure.internal_connections}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Data at Risk
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Secrets: {blastRadius.data_at_risk.secrets}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  ConfigMaps: {blastRadius.data_at_risk.configmaps}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  PVCs: {blastRadius.data_at_risk.pvcs}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  Estimated Data Size: {blastRadius.data_at_risk.estimated_data_size}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Affected Resources Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Affected Resources
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Impact Level</TableCell>
                  <TableCell>Exposure Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {blastRadius.affected_resources.map((resource, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Chip label={resource.type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{resource.name}</TableCell>
                    <TableCell>{resource.namespace}</TableCell>
                    <TableCell>
                      <Chip
                        label={resource.impact_level}
                        size="small"
                        color={getImpactColor(resource.impact_level) as any}
                      />
                    </TableCell>
                    <TableCell>{resource.exposure_type}</TableCell>
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

const BlastRadiusAnalysis: React.FC = () => (
  <ClusterGuard><BlastRadiusAnalysisInner /></ClusterGuard>
);

export default BlastRadiusAnalysis;

// Made with Bob
