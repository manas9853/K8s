import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  AccountTree as DependencyIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface DependencyScanResult {
  package_name: string;
  current_version: string;
  vulnerable_version: string;
  fixed_version?: string;
  severity: string;
  cve_ids: string[];
  affected_images: string[];
  description: string;
  remediation: string;
}

interface DependencyScanningData {
  dependencies: DependencyScanResult[];
  total_vulnerabilities: number;
  critical_vulnerabilities: number;
  high_vulnerabilities: number;
  medium_vulnerabilities: number;
  low_vulnerabilities: number;
  patchable_vulnerabilities: number;
  last_scan: string;
}

const DependencyScanning: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<DependencyScanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/security/dependency-scanning${clusterParam}`);
      const data = await response.json();
      setData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch dependency scanning data');
      console.error('Error fetching dependency scanning:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const filteredDependencies = data?.dependencies.filter(dep =>
    dep.package_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dep.current_version.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dep.cve_ids.some(cve => cve.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box p={3}>
        <Alert severity="error">{error || 'No data available'}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <DependencyIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4">Dependency Scanning</Typography>
      </Box>

      {/* Vulnerability Statistics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Vulnerabilities
              </Typography>
              <Typography variant="h3">
                {data.total_vulnerabilities}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Critical
              </Typography>
              <Typography variant="h3" color="error">
                {data.critical_vulnerabilities}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                High
              </Typography>
              <Typography variant="h3" color="warning.main">
                {data.high_vulnerabilities}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Medium
              </Typography>
              <Typography variant="h3" color="info.main">
                {data.medium_vulnerabilities}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Patchable
              </Typography>
              <Typography variant="h3" color="success.main">
                {data.patchable_vulnerabilities}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search dependencies by package name, version, or CVE ID..."
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

      {/* Dependency Vulnerabilities */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Vulnerable Dependencies ({filteredDependencies.length} found)
        </Typography>
        {filteredDependencies.length === 0 ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            No vulnerable dependencies found. All packages are up to date!
          </Alert>
        ) : (
          <Box>
            {filteredDependencies.map((dep, index) => (
              <Accordion key={index}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" width="100%" gap={2}>
                    <Chip 
                      label={dep.severity.toUpperCase()} 
                      color={getSeverityColor(dep.severity)}
                      size="small"
                    />
                    <Typography variant="body1" fontWeight="bold">
                      {dep.package_name}
                    </Typography>
                    <Chip 
                      label={`v${dep.current_version}`} 
                      size="small"
                      variant="outlined"
                    />
                    {dep.fixed_version ? (
                      <CheckCircleIcon color="success" fontSize="small" />
                    ) : (
                      <CancelIcon color="error" fontSize="small" />
                    )}
                    <Box flexGrow={1} />
                    <Chip 
                      label={`${dep.cve_ids.length} CVEs`} 
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Description
                      </Typography>
                      <Typography variant="body2" paragraph>
                        {dep.description}
                      </Typography>

                      <Typography variant="subtitle2" color="textSecondary">
                        Version Information
                      </Typography>
                      <Box display="flex" gap={1} mb={2}>
                        <Chip 
                          label={`Current: ${dep.current_version}`} 
                          size="small"
                          color="error"
                        />
                        {dep.fixed_version && (
                          <Chip 
                            label={`Fixed: ${dep.fixed_version}`} 
                            size="small"
                            color="success"
                          />
                        )}
                      </Box>

                      <Typography variant="subtitle2" color="textSecondary">
                        CVE IDs
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                        {dep.cve_ids.map((cve) => (
                          <Chip 
                            key={cve}
                            label={cve} 
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="textSecondary">
                        Remediation
                      </Typography>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        {dep.remediation}
                      </Alert>

                      <Typography variant="subtitle2" color="textSecondary">
                        Affected Images
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {dep.affected_images.map((image, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Typography variant="body2" noWrap>
                                    {image}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Paper>

      <Box mt={2}>
        <Typography variant="caption" color="textSecondary">
          Last scan: {new Date(data.last_scan).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default DependencyScanning;

// Made with Bob
