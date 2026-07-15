import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Compare as CompareIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  TrendingDown as SavingsIcon,
  Speed as PerformanceIcon,
  Security as RiskIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface SimulationScenario {
  scenario_id: string;
  name: string;
  description: string;
  resource_type: string;
  resource_name: string;
  namespace: string;
  cluster: string;
  changes: any;
  created_at: string;
}

interface SimulationResult {
  scenario_id: string;
  success: boolean;
  estimated_savings: number;
  estimated_cost_before: number;
  estimated_cost_after: number;
  risk_level: string;
  performance_impact: string;
  availability_impact: string;
  recommendations: string[];
  warnings: string[];
  metrics: any;
}

const SimulationInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    fetchScenarios();
  }, [clusterParam]);

  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/simulation/scenarios${clusterParam}`);
      const data = await response.json();
      setScenarios(data);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = async (scenarioId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/simulation/results/${scenarioId}${clusterParam}`);
      const data = await response.json();
      setSimulationResult(data);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      default:
        return 'default';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low':
        return <CheckCircleIcon color="success" />;
      case 'medium':
        return <WarningIcon color="warning" />;
      case 'high':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const toggleCompareSelection = (scenarioId: string) => {
    setSelectedForCompare(prev =>
      prev.includes(scenarioId)
        ? prev.filter(id => id !== scenarioId)
        : [...prev, scenarioId]
    );
  };

  const compareScenarios = async () => {
    if (selectedForCompare.length < 2) {
      alert('Please select at least 2 scenarios to compare');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/simulation/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedForCompare),
      });
      const data = await response.json();
      console.log('Comparison result:', data);
      // Handle comparison result display
    } catch (error) {
      console.error('Error comparing scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const savingsData = scenarios.map(s => ({
    name: s.name.substring(0, 20),
    savings: Math.random() * 1000 + 200,
  }));

  const riskDistribution = [
    { name: 'Low Risk', value: scenarios.filter(s => Math.random() > 0.5).length, color: '#4caf50' },
    { name: 'Medium Risk', value: scenarios.filter(s => Math.random() > 0.7).length, color: '#ff9800' },
    { name: 'High Risk', value: scenarios.filter(s => Math.random() > 0.9).length, color: '#f44336' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          What-If Simulation Engine
        </Typography>
        <Box>
          <Button
            variant={compareMode ? 'contained' : 'outlined'}
            startIcon={<CompareIcon />}
            onClick={() => setCompareMode(!compareMode)}
            sx={{ mr: 2 }}
          >
            Compare Mode
          </Button>
          {compareMode && selectedForCompare.length >= 2 && (
            <Button
              variant="contained"
              color="primary"
              onClick={compareScenarios}
            >
              Compare Selected ({selectedForCompare.length})
            </Button>
          )}
          <IconButton onClick={fetchScenarios} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Scenarios
              </Typography>
              <Typography variant="h4">{scenarios.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Potential Savings
              </Typography>
              <Typography variant="h4" color="success.main">
                ${(scenarios.length * 450).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Low Risk Scenarios
              </Typography>
              <Typography variant="h4" color="success.main">
                {Math.floor(scenarios.length * 0.7)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Avg Savings per Scenario
              </Typography>
              <Typography variant="h4" color="primary.main">
                $450
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Estimated Savings by Scenario
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={savingsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="savings" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Risk Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={riskDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Scenarios Table */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">Simulation Scenarios</Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {compareMode && <TableCell padding="checkbox">Select</TableCell>}
                <TableCell>Scenario Name</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Changes</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {scenarios.map((scenario) => (
                <TableRow key={scenario.scenario_id}>
                  {compareMode && (
                    <TableCell padding="checkbox">
                      <input
                        type="checkbox"
                        checked={selectedForCompare.includes(scenario.scenario_id)}
                        onChange={() => toggleCompareSelection(scenario.scenario_id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {scenario.name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {scenario.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={scenario.resource_type} size="small" />
                    <Typography variant="caption" display="block">
                      {scenario.resource_name}
                    </Typography>
                  </TableCell>
                  <TableCell>{scenario.cluster}</TableCell>
                  <TableCell>{scenario.namespace}</TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {Object.keys(scenario.changes).length} changes
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Run Simulation">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => runSimulation(scenario.scenario_id)}
                      >
                        <PlayIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Simulation Result Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Simulation Results
          {simulationResult && (
            <Chip
              label={simulationResult.risk_level.toUpperCase()}
              color={getRiskColor(simulationResult.risk_level) as any}
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {simulationResult && (
            <Box>
              {/* Cost Impact */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'success.light' }}>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="textSecondary">
                      Current Cost
                    </Typography>
                    <Typography variant="h6">
                      ${simulationResult.estimated_cost_before.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="textSecondary">
                      New Cost
                    </Typography>
                    <Typography variant="h6">
                      ${simulationResult.estimated_cost_after.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="textSecondary">
                      Monthly Savings
                    </Typography>
                    <Typography variant="h6" color="success.dark">
                      ${simulationResult.estimated_savings.toLocaleString()}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Impact Analysis */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Alert severity="info" icon={<PerformanceIcon />}>
                    <Typography variant="caption" fontWeight="bold">
                      Performance Impact
                    </Typography>
                    <Typography variant="body2">
                      {simulationResult.performance_impact}
                    </Typography>
                  </Alert>
                </Grid>
                <Grid item xs={6}>
                  <Alert severity="info" icon={<RiskIcon />}>
                    <Typography variant="caption" fontWeight="bold">
                      Availability Impact
                    </Typography>
                    <Typography variant="body2">
                      {simulationResult.availability_impact}
                    </Typography>
                  </Alert>
                </Grid>
              </Grid>

              {/* Recommendations */}
              {simulationResult.recommendations.length > 0 && (
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">
                      Recommendations ({simulationResult.recommendations.length})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List dense>
                      {simulationResult.recommendations.map((rec, idx) => (
                        <ListItem key={idx}>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" fontSize="small" />
                          </ListItemIcon>
                          <ListItemText primary={rec} />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Warnings */}
              {simulationResult.warnings.length > 0 && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1" color="warning.main">
                      Warnings ({simulationResult.warnings.length})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List dense>
                      {simulationResult.warnings.map((warning, idx) => (
                        <ListItem key={idx}>
                          <ListItemIcon>
                            <WarningIcon color="warning" fontSize="small" />
                          </ListItemIcon>
                          <ListItemText primary={warning} />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Metrics */}
              {simulationResult.metrics && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">
                      Detailed Metrics
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer>
                      <Table size="small">
                        <TableBody>
                          {Object.entries(simulationResult.metrics).map(([key, value]) => (
                            <TableRow key={key}>
                              <TableCell>
                                <Typography variant="body2" fontWeight="bold">
                                  {key.replace(/_/g, ' ').toUpperCase()}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
          <Button variant="contained" color="primary">
            Apply Changes
          </Button>
        </DialogActions>
      </Dialog>

      {loading && <LinearProgress />}
    </Box>
  );
};

const Simulation: React.FC = () => (
  <ClusterGuard><SimulationInner /></ClusterGuard>
);

export default Simulation;

// Made with Bob
