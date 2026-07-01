import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Alert,
  Button,
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

const PlaybookExecutionInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/playbook-execution${clusterParam}`);
      const data = await response.json();
      setData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading...</Typography>
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
          P l a y b o o k  E x e c u t i o n
        </Typography>
        <Button variant="contained" color="primary" onClick={fetchData}>
          Refresh
        </Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            P l a y b o o k  E x e c u t i o n Dashboard
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            This page is under development. Full functionality will be available soon.
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
};

const PlaybookExecution: React.FC = () => (
  <ClusterGuard><PlaybookExecutionInner /></ClusterGuard>
);

export default PlaybookExecution;
