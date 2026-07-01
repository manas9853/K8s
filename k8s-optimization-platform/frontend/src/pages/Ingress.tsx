import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
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
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Language as LanguageIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PathInfo {
  path: string;
  path_type: string;
  service: string;
  port: number;
}

interface IngressResource {
  name: string;
  namespace: string;
  hosts: string[];
  paths: PathInfo[];
  tls_enabled: boolean;
  ingress_class: string | null;
  age: string;
  labels: Record<string, string>;
  created_at: string;
}

const Ingress: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [ingresses, setIngresses] = useState<IngressResource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIngresses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/network/ingress`);
      const data = await response.json();
      setIngresses(data);
    } catch (error) {
      console.error('Error fetching ingresses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIngresses();
  }, [clusterParam]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LanguageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">Ingress Resources</Typography>
        </Box>
        <IconButton onClick={fetchIngresses} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Namespace</strong></TableCell>
                  <TableCell><strong>Hosts</strong></TableCell>
                  <TableCell><strong>Paths</strong></TableCell>
                  <TableCell><strong>TLS</strong></TableCell>
                  <TableCell><strong>Backend Services</strong></TableCell>
                  <TableCell><strong>Age</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">Loading...</TableCell>
                  </TableRow>
                ) : ingresses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Alert severity="info">No ingress resources found</Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  ingresses.map((ing) => (
                    <TableRow key={`${ing.namespace}-${ing.name}`}>
                      <TableCell><strong>{ing.name}</strong></TableCell>
                      <TableCell>{ing.namespace}</TableCell>
                      <TableCell>
                        {ing.hosts.map((host, idx) => (
                          <Chip key={idx} label={host} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>
                        {ing.paths.map((pathInfo, idx) => (
                          <Box key={idx} sx={{ mb: 0.5 }}>
                            <Chip
                              label={`${pathInfo.path} → ${pathInfo.service}:${pathInfo.port}`}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        ))}
                      </TableCell>
                      <TableCell>
                        {ing.tls_enabled ? (
                          <Chip icon={<SecurityIcon />} label="Enabled" color="success" size="small" />
                        ) : (
                          <Chip label="Disabled" color="warning" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        {ing.paths.map((pathInfo, idx) => (
                          <Chip key={idx} label={pathInfo.service} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>{ing.age}</TableCell>
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

export default Ingress;

// Made with Bob
