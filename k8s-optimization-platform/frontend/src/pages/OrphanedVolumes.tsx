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
  IconButton,
  Button,
  Alert,
  Grid,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface OrphanedVolume {
  name: string;
  type: string;
  namespace: string;
  capacity: string;
  age: string;
  reason: string;
  cost_impact: string;
}

const OrphanedVolumes: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [volumes, setVolumes] = useState<OrphanedVolume[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrphanedVolumes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/storage/orphaned`);
      const data = await response.json();
      setVolumes(data);
    } catch (error) {
      console.error('Error fetching orphaned volumes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrphanedVolumes();
  }, [clusterParam]);

  const totalWaste = volumes.reduce((sum, vol) => {
    const cost = parseFloat(vol.cost_impact.replace(/[^0-9.]/g, '')) || 0;
    return sum + cost;
  }, 0);

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
          <WarningIcon sx={{ fontSize: 40, color: 'warning.main' }} />
          <Typography variant="h4">Orphaned Volumes</Typography>
        </Box>
        <IconButton onClick={fetchOrphanedVolumes} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Orphaned Volumes</Typography>
              <Typography variant="h4" color="warning.main">{volumes.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Wasted Capacity</Typography>
              <Typography variant="h4">
                {volumes.reduce((sum, v) => sum + parseFloat(v.capacity), 0).toFixed(0)} GB
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Monthly Waste</Typography>
              <Typography variant="h4" color="error.main">${totalWaste.toFixed(2)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {volumes.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Found {volumes.length} orphaned volumes wasting ${totalWaste.toFixed(2)}/month. 
            Consider deleting unused volumes to reduce costs.
          </Typography>
        </Alert>
      )}

      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Namespace</strong></TableCell>
                  <TableCell><strong>Capacity</strong></TableCell>
                  <TableCell><strong>Age</strong></TableCell>
                  <TableCell><strong>Cost Impact</strong></TableCell>
                  <TableCell><strong>Reason</strong></TableCell>
                  <TableCell><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">Loading...</TableCell>
                  </TableRow>
                ) : volumes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Alert severity="success">No orphaned volumes found! Your cluster is clean.</Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  volumes.map((volume) => (
                    <TableRow key={`${volume.namespace}-${volume.name}`}>
                      <TableCell><strong>{volume.name}</strong></TableCell>
                      <TableCell>
                        <Chip label={volume.type} size="small" color="primary" />
                      </TableCell>
                      <TableCell>{volume.namespace}</TableCell>
                      <TableCell>{volume.capacity}</TableCell>
                      <TableCell>{volume.age}</TableCell>
                      <TableCell>
                        <Typography color="error.main" fontWeight="bold">
                          {volume.cost_impact}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary">
                          {volume.reason}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          variant="outlined"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default OrphanedVolumes;

// Made with Bob
