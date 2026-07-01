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
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  Build as BuildIcon,
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayArrowIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PatchRecommendation {
  id: string;
  title: string;
  severity: string;
  affected_resources: string[];
  current_version: string;
  recommended_version: string;
  cve_ids: string[];
  risk_level: string;
  estimated_downtime: string;
  patch_priority: number;
  automated_patch_available: boolean;
  remediation_steps: string[];
}

interface PatchRecommendationsData {
  recommendations: PatchRecommendation[];
  total_recommendations: number;
  critical_patches: number;
  high_patches: number;
  medium_patches: number;
  automated_patches_available: number;
  last_updated: string;
}

const PatchRecommendations: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<PatchRecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [clusterParam]);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/security/patch-recommendations${clusterParam}`);
      const data = await response.json();
      setData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch patch recommendations');
      console.error('Error fetching patch recommendations:', err);
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

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority === 1) return 'error';
    if (priority === 2) return 'warning';
    return 'info';
  };

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
        <BuildIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4">Patch Recommendations</Typography>
      </Box>

      {/* Patch Statistics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Recommendations
              </Typography>
              <Typography variant="h3">
                {data.total_recommendations}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Patches needed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Critical Patches
              </Typography>
              <Typography variant="h3" color="error">
                {data.critical_patches}
              </Typography>
              <Typography variant="caption" color="error">
                Immediate action required
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                High Priority
              </Typography>
              <Typography variant="h3" color="warning.main">
                {data.high_patches}
              </Typography>
              <Typography variant="caption" color="warning.main">
                Schedule soon
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Automated Patches
              </Typography>
              <Typography variant="h3" color="success.main">
                {data.automated_patches_available}
              </Typography>
              <Typography variant="caption" color="success.main">
                One-click apply
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Patch Recommendations */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recommended Patches (Priority Order)
        </Typography>
        {data.recommendations.length === 0 ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            No patches needed. All systems are up to date!
          </Alert>
        ) : (
          <Box>
            {data.recommendations.map((patch) => (
              <Accordion key={patch.id}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" width="100%" gap={2}>
                    <Chip 
                      label={`P${patch.patch_priority}`} 
                      color={getPriorityColor(patch.patch_priority)}
                      size="small"
                    />
                    <Chip 
                      label={patch.severity.toUpperCase()} 
                      color={getSeverityColor(patch.severity)}
                      size="small"
                    />
                    <Typography variant="body1" fontWeight="bold" sx={{ flexGrow: 1 }}>
                      {patch.title}
                    </Typography>
                    <Chip 
                      label={`Risk: ${patch.risk_level}`} 
                      color={getRiskColor(patch.risk_level)}
                      size="small"
                      variant="outlined"
                    />
                    {patch.automated_patch_available && (
                      <Chip 
                        label="Auto-patchable" 
                        color="success"
                        size="small"
                        icon={<PlayArrowIcon />}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Version Information
                      </Typography>
                      <Box display="flex" gap={1} mb={2}>
                        <Chip 
                          label={`Current: ${patch.current_version}`} 
                          size="small"
                          color="error"
                        />
                        <Chip 
                          label={`Recommended: ${patch.recommended_version}`} 
                          size="small"
                          color="success"
                        />
                      </Box>

                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Patch Details
                      </Typography>
                      <Table size="small">
                        <TableBody>
                          <TableRow>
                            <TableCell>Estimated Downtime</TableCell>
                            <TableCell>{patch.estimated_downtime}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Risk Level</TableCell>
                            <TableCell>
                              <Chip 
                                label={patch.risk_level} 
                                color={getRiskColor(patch.risk_level)}
                                size="small"
                              />
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Affected Resources</TableCell>
                            <TableCell>{patch.affected_resources.length}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>

                      <Typography variant="subtitle2" color="textSecondary" gutterBottom sx={{ mt: 2 }}>
                        Related CVEs
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1}>
                        {patch.cve_ids.map((cve) => (
                          <Chip 
                            key={cve}
                            label={cve} 
                            size="small"
                            variant="outlined"
                            color="error"
                          />
                        ))}
                      </Box>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                        Remediation Steps
                      </Typography>
                      <List dense>
                        {patch.remediation_steps.map((step, index) => (
                          <ListItem key={index}>
                            <ListItemText 
                              primary={step}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItem>
                        ))}
                      </List>

                      <Box mt={2} display="flex" gap={2}>
                        {patch.automated_patch_available ? (
                          <>
                            <Button 
                              variant="contained" 
                              color="primary"
                              startIcon={<PlayArrowIcon />}
                              size="small"
                            >
                              Apply Patch Now
                            </Button>
                            <Button 
                              variant="outlined" 
                              color="primary"
                              startIcon={<ScheduleIcon />}
                              size="small"
                            >
                              Schedule Patch
                            </Button>
                          </>
                        ) : (
                          <Alert severity="info" sx={{ width: '100%' }}>
                            Manual patching required. Follow the remediation steps above.
                          </Alert>
                        )}
                      </Box>

                      <Typography variant="subtitle2" color="textSecondary" gutterBottom sx={{ mt: 2 }}>
                        Affected Resources (showing first 5)
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {patch.affected_resources.slice(0, 5).map((resource, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Typography variant="body2" noWrap>
                                    {resource}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                            {patch.affected_resources.length > 5 && (
                              <TableRow>
                                <TableCell>
                                  <Typography variant="caption" color="textSecondary">
                                    ... and {patch.affected_resources.length - 5} more
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            )}
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
          Last updated: {new Date(data.last_updated).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default PatchRecommendations;

// Made with Bob
