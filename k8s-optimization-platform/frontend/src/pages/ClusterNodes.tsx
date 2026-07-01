import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface NodeCondition {
  type: string;
  status: string;
}

interface NodeInfo {
  name: string;
  status: string;
  roles: string[];
  age: string;
  version: string;
  os_image: string;
  kernel_version: string;
  container_runtime: string;
  cpu_capacity: string;
  memory_capacity: string;
  cpu_allocatable: string;
  memory_allocatable: string;
  cpu_usage: number;
  memory_usage: number;
  pod_count: number;
  pod_capacity: number;
  conditions: NodeCondition[];
}

interface ClusterNodeGroup {
  cluster_id: string;
  cluster_name: string;
  nodes: NodeInfo[];
}

const ClusterNodes: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading, activeClusterId, selectCluster } = useCluster();

  const [nodeGroups, setNodeGroups] = useState<ClusterNodeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local filter — which cluster to display in this page
  // Initialises from the global active selection (or 'all')
  const [selectedClusterId, setSelectedClusterId] = useState<string>(
    activeClusterId || 'all'
  );

  // Sync local selector when the global active cluster changes
  useEffect(() => {
    setSelectedClusterId(activeClusterId || 'all');
  }, [activeClusterId]);

  // Fetch nodes whenever the selected cluster or the cluster list changes
  useEffect(() => {
    // Don't fetch until we know which clusters exist
    if (clustersLoading) return;
    // If there are no clusters attached at all, nothing to fetch
    if (clusters.length === 0) return;

    fetchNodes(selectedClusterId);
  }, [selectedClusterId, clusters, clustersLoading]);

  const fetchNodes = async (clusterId: string) => {
    try {
      setLoading(true);
      setError(null);

      const param = clusterId && clusterId !== 'all'
        ? `?cluster_id=${encodeURIComponent(clusterId)}`
        : '';

      const response = await fetch(`${API_BASE_URL}/v1/clusters/nodes${param}`);

      if (!response.ok) {
      const data = await response.json();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: NodeInfo[] = await response.json();

      // Group flat node list by cluster_id.
      // The backend tags each node name as "<cluster_id>-node-<n>" (dummy data)
      // or returns them for a single cluster when cluster_id is filtered.
      // We use the registered cluster list as the grouping key.

      if (clusterId && clusterId !== 'all') {
        // Single-cluster view
        const cluster = clusters.find((c) => c.id === clusterId);
        setNodeGroups([
          {
            cluster_id: clusterId,
            cluster_name: cluster?.name ?? clusterId,
            nodes: data,
          },
        ]);
      } else {
        // All-clusters view — group by cluster based on registered cluster IDs
        const grouped: Record<string, NodeInfo[]> = {};

        data.forEach((node) => {
          // Try to match node name against known cluster IDs
          // Backend dummy nodes are named "<cluster_id>-node-<n>"
          let matchedId = 'unknown';
          for (const cluster of clusters) {
            if (node.name.startsWith(cluster.id)) {
              matchedId = cluster.id;
              break;
            }
          }
          if (!grouped[matchedId]) grouped[matchedId] = [];
          grouped[matchedId].push(node);
        });

        const groups: ClusterNodeGroup[] = Object.entries(grouped)
          .filter(([id]) => id !== 'unknown')
          .map(([id, nodes]) => ({
            cluster_id: id,
            cluster_name: clusters.find((c) => c.id === id)?.name ?? id,
            nodes,
          }));

        setNodeGroups(groups);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
      console.error('Error fetching nodes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClusterChange = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setSelectedClusterId(val);
    // Also update the global context so the sidebar / other pages stay in sync
    selectCluster(val);
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'default' =>
    status === 'Ready' ? 'success' : 'error';

  const getUsageColor = (usage: number): 'success' | 'warning' | 'error' => {
    if (usage < 60) return 'success';
    if (usage < 80) return 'warning';
    return 'error';
  };

  // ── Loading cluster list ──────────────────────────────────────────────────
  if (clustersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // ── No clusters attached ──────────────────────────────────────────────────
  if (!clustersLoading && clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">
          No clusters attached yet
        </Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Node information is scoped to registered clusters. Connect a cluster
          first using the Cluster Onboarding page, then come back here to see
          live node data.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/cluster-onboarding')}
        >
          Go to Cluster Onboarding
        </Button>
      </Box>
    );
  }

  const totalNodes = nodeGroups.reduce((sum, g) => sum + g.nodes.length, 0);
  const totalReadyNodes = nodeGroups.reduce(
    (sum, g) => sum + g.nodes.filter((n) => n.status === 'Ready').length,
    0
  );
  const totalPods = nodeGroups.reduce(
    (sum, g) => sum + g.nodes.reduce((ps, n) => ps + n.pod_count, 0),
    0
  );

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cluster Nodes
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Detailed node information for{' '}
            {selectedClusterId === 'all'
              ? `all ${clusters.length} registered clusters`
              : clusters.find((c) => c.id === selectedClusterId)?.name ?? selectedClusterId}
          </Typography>
        </Box>

        {/* Cluster selector */}
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Cluster</InputLabel>
          <Select
            value={selectedClusterId}
            label="Cluster"
            onChange={handleClusterChange}
          >
            <MenuItem value="all">All Clusters</MenuItem>
            {clusters.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Box display="flex" gap={2} my={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Nodes
            </Typography>
            <Typography variant="h4">{loading ? '—' : totalNodes}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Ready Nodes
            </Typography>
            <Typography variant="h4" color="success.main">
              {loading ? '—' : totalReadyNodes}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Pods on Nodes
            </Typography>
            <Typography variant="h4">{loading ? '—' : totalPods}</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Node data loading spinner */}
      {loading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}

      {/* Render each cluster's nodes */}
      {!loading &&
        nodeGroups.map((group) => (
          <Box key={group.cluster_id} sx={{ mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, mt: 3 }}>
              {group.cluster_name} ({group.nodes.length} nodes)
            </Typography>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Node Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Roles</TableCell>
                    <TableCell>Age</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell align="right">CPU Usage</TableCell>
                    <TableCell align="right">Memory Usage</TableCell>
                    <TableCell align="right">Pods</TableCell>
                    <TableCell>System Info</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.nodes.map((node) => (
                    <TableRow key={node.name} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {node.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          {node.status === 'Ready' ? (
                            <CheckCircleIcon color="success" fontSize="small" />
                          ) : (
                            <ErrorIcon color="error" fontSize="small" />
                          )}
                          <Chip
                            label={node.status}
                            size="small"
                            color={getStatusColor(node.status)}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        {node.roles.map((role, idx) => (
                          <Chip key={idx} label={role} size="small" sx={{ mr: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>{node.age}</TableCell>
                      <TableCell>
                        <Typography variant="caption">{node.version}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Box display="flex" justifyContent="space-between" mb={0.5}>
                            <Typography variant="caption">
                              {node.cpu_usage.toFixed(1)}%
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {node.cpu_allocatable}
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(node.cpu_usage, 100)}
                            color={getUsageColor(node.cpu_usage)}
                            sx={{ height: 6, borderRadius: 1 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Box display="flex" justifyContent="space-between" mb={0.5}>
                            <Typography variant="caption">
                              {node.memory_usage.toFixed(1)}%
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {node.memory_allocatable}
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(node.memory_usage, 100)}
                            color={getUsageColor(node.memory_usage)}
                            sx={{ height: 6, borderRadius: 1 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {node.pod_count} / {node.pod_capacity}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(
                            (node.pod_count / node.pod_capacity) * 100,
                            100
                          )}
                          sx={{ height: 4, borderRadius: 1, mt: 0.5 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" display="block">
                          {node.os_image}
                        </Typography>
                        <Typography variant="caption" display="block" color="textSecondary">
                          {node.container_runtime}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ))}

      {/* No data for selected cluster */}
      {!loading && nodeGroups.length === 0 && (
        <Alert severity="info">
          No node data found for the selected cluster.
        </Alert>
      )}
    </Box>
  );
};

export default ClusterNodes;

// Made with Bob
