import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  Search as SearchIcon,
  Block as BlockIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface SuspiciousPod {
  pod_name: string;
  namespace: string;
  node: string;
  suspicious_indicators: string[];
  risk_score: number;
  first_detected: string;
  status: string;
  anomalies: string[];
}

const SuspiciousPodsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [pods, setPods] = useState<SuspiciousPod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSuspiciousPods();
  }, [clusterParam]);

  const fetchSuspiciousPods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-pods${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPods(data.suspicious_pods);
      setError(null);
    } catch (err) {
      setError('Failed to fetch suspicious pods');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'error';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'info';
    return 'success';
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading suspicious pods...</Typography>
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
          <SearchIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Suspicious Pods
        </Typography>
        <Button variant="contained" color="primary" onClick={fetchSuspiciousPods}>
          Refresh
        </Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Detected Suspicious Pods ({pods.length})
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Pod Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Node</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Indicators</TableCell>
                  <TableCell>Anomalies</TableCell>
                  <TableCell>First Detected</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pods.map((pod, index) => (
                  <TableRow key={index}>
                    <TableCell>{pod.pod_name}</TableCell>
                    <TableCell>{pod.namespace}</TableCell>
                    <TableCell>{pod.node}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={pod.risk_score}
                          color={getRiskColor(pod.risk_score) as any}
                          sx={{ width: 60, height: 8, borderRadius: 1 }}
                        />
                        <Typography variant="body2">{pod.risk_score}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={pod.status} size="small" color="warning" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {pod.suspicious_indicators.slice(0, 2).map((indicator, idx) => (
                          <Chip key={idx} label={indicator} size="small" variant="outlined" />
                        ))}
                        {pod.suspicious_indicators.length > 2 && (
                          <Chip label={`+${pod.suspicious_indicators.length - 2}`} size="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {pod.anomalies.slice(0, 2).map((anomaly, idx) => (
                          <Chip key={idx} label={anomaly} size="small" color="error" />
                        ))}
                        {pod.anomalies.length > 2 && (
                          <Chip label={`+${pod.anomalies.length - 2}`} size="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{pod.first_detected}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="View Details">
                          <IconButton size="small" color="primary">
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Quarantine">
                          <IconButton size="small" color="warning">
                            <BlockIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Terminate">
                          <IconButton size="small" color="error">
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

const SuspiciousPods: React.FC = () => (
  <ClusterGuard><SuspiciousPodsInner /></ClusterGuard>
);

export default SuspiciousPods;

// Made with Bob
