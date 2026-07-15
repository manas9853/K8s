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
  Switch,
  FormControlLabel,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Code as CodeIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  GitHub as GitHubIcon,
  IntegrationInstructions as IntegrationIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE_URL } from '../config/api';

interface GuardrailPolicy {
  policy_id: string;
  name: string;
  description: string;
  severity: string;
  enabled: boolean;
  threshold: any;
}

interface GuardrailViolation {
  severity: string;
  rule: string;
  message: string;
  current_value: any;
  recommended_value: any;
  potential_savings: number;
  impact: string;
}

interface GuardrailAnalysis {
  deployment_name: string;
  namespace: string;
  cluster: string;
  passed: boolean;
  total_violations: number;
  critical_violations: number;
  high_violations: number;
  medium_violations: number;
  low_violations: number;
  violations: GuardrailViolation[];
  estimated_monthly_cost: number;
  optimized_monthly_cost: number;
  potential_savings: number;
  recommendations: string[];
}

const Guardrails: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [analyses, setAnalyses] = useState<GuardrailAnalysis[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [selectedAnalysis, setSelectedAnalysis] = useState<GuardrailAnalysis | null>(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchPolicies(),
        fetchAnalyses(),
        fetchStats(),
        fetchSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPolicies = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/guardrails/policies${clusterParam}`);
    const data = await response.json();
    setPolicies(data);
  };

  const fetchAnalyses = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/guardrails/analyses${clusterParam}`);
    const data = await response.json();
    setAnalyses(data);
  };

  const fetchStats = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/guardrails/stats${clusterParam}`);
    const data = await response.json();
    setStats(data);
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/guardrails/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <ErrorIcon color="error" />;
      case 'medium':
        return <WarningIcon color="warning" />;
      case 'low':
        return <WarningIcon color="info" />;
      default:
        return null;
    }
  };

  const violationData = summary ? [
    { name: 'Passed', value: summary.passed, color: '#4caf50' },
    { name: 'Failed', value: summary.failed, color: '#f44336' },
  ] : [];

  const savingsData = analyses.map(a => ({
    name: a.deployment_name.substring(0, 15),
    savings: a.potential_savings,
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          CI/CD Cost Guardrails
        </Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      <CostAccuracyBanner clusterName={clusterParam} />

      {/* Summary Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Checks Today
                </Typography>
                <Typography variant="h4">{stats.total_checks_today}</Typography>
                <Typography variant="caption" color="success.main">
                  {stats.passed_today} passed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Waste Prevented
                </Typography>
                <Typography variant="h4" color="success.main">
                  ${stats.total_savings_prevented.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Policies
                </Typography>
                <Typography variant="h4">{stats.policies_enabled}</Typography>
                <Typography variant="caption">
                  of {stats.total_policies} total
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Avg Check Time
                </Typography>
                <Typography variant="h4">{stats.avg_check_time_ms}ms</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Pass/Fail Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={violationData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {violationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Potential Savings by Deployment
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={savingsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="savings" fill="#4caf50" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="Recent Analyses" icon={<SecurityIcon />} />
          <Tab label="Policies" icon={<SettingsIcon />} />
          <Tab label="Integration" icon={<IntegrationIcon />} />
        </Tabs>

        {/* Tab 0: Recent Analyses */}
        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>Deployment</TableCell>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Violations</TableCell>
                    <TableCell>Potential Savings</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analyses.map((analysis, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {analysis.passed ? (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Passed"
                            color="success"
                            size="small"
                          />
                        ) : (
                          <Chip
                            icon={<ErrorIcon />}
                            label="Failed"
                            color="error"
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell>{analysis.deployment_name}</TableCell>
                      <TableCell>{analysis.namespace}</TableCell>
                      <TableCell>{analysis.cluster}</TableCell>
                      <TableCell>
                        {analysis.total_violations > 0 && (
                          <Box>
                            {analysis.critical_violations > 0 && (
                              <Chip label={`${analysis.critical_violations} Critical`} color="error" size="small" sx={{ mr: 0.5 }} />
                            )}
                            {analysis.high_violations > 0 && (
                              <Chip label={`${analysis.high_violations} High`} color="error" size="small" sx={{ mr: 0.5 }} />
                            )}
                            {analysis.medium_violations > 0 && (
                              <Chip label={`${analysis.medium_violations} Medium`} color="warning" size="small" />
                            )}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main" fontWeight="bold">
                          ${analysis.potential_savings.toLocaleString()}/mo
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedAnalysis(analysis);
                            setOpenDialog(true);
                          }}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Tab 1: Policies */}
        {tabValue === 1 && (
          <Box sx={{ p: 2 }}>
            <List>
              {policies.map((policy) => (
                <Accordion key={policy.policy_id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle1">{policy.name}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {policy.description}
                        </Typography>
                      </Box>
                      <Chip
                        label={policy.severity.toUpperCase()}
                        color={getSeverityColor(policy.severity) as any}
                        size="small"
                        sx={{ mr: 2 }}
                      />
                      <FormControlLabel
                        control={<Switch checked={policy.enabled} />}
                        label={policy.enabled ? 'Enabled' : 'Disabled'}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="textSecondary">
                      Policy ID: {policy.policy_id}
                    </Typography>
                    {Object.keys(policy.threshold).length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2">Thresholds:</Typography>
                        <pre style={{ fontSize: '12px', background: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
                          {JSON.stringify(policy.threshold, null, 2)}
                        </pre>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </List>
          </Box>
        )}

        {/* Tab 2: Integration */}
        {tabValue === 2 && (
          <Box sx={{ p: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              Integrate guardrails into your CI/CD pipeline to prevent waste before deployment
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <GitHubIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">GitHub Actions</Typography>
                    </Box>
                    <Typography variant="body2" color="textSecondary" paragraph>
                      Add this workflow to your repository:
                    </Typography>
                    <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                      <pre style={{ fontSize: '11px', margin: 0, overflow: 'auto' }}>
{`name: Cost Guardrails
on: [pull_request]
jobs:
  cost-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check K8s Costs
        run: |
          curl -X POST \\
            http://your-platform/api/v1/guardrails/analyze \\
            -H "Content-Type: application/json" \\
            -d @deployment.json`}
                      </pre>
                    </Paper>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <CodeIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">GitLab CI</Typography>
                    </Box>
                    <Typography variant="body2" color="textSecondary" paragraph>
                      Add this stage to your .gitlab-ci.yml:
                    </Typography>
                    <Paper sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                      <pre style={{ fontSize: '11px', margin: 0, overflow: 'auto' }}>
{`cost-guardrails:
  stage: validate
  script:
    - curl -X POST \\
        http://your-platform/api/v1/guardrails/analyze \\
        -H "Content-Type: application/json" \\
        -d @deployment.json
  only:
    - merge_requests`}
                      </pre>
                    </Paper>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Webhook Endpoint
                    </Typography>
                    <TextField
                      fullWidth
                      value="http://your-platform.com/api/v1/guardrails/webhook"
                      InputProps={{ readOnly: true }}
                      sx={{ mb: 2 }}
                    />
                    <Typography variant="body2" color="textSecondary">
                      Use this webhook URL to integrate with any CI/CD system
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Analysis Details Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Analysis Details: {selectedAnalysis?.deployment_name}
        </DialogTitle>
        <DialogContent>
          {selectedAnalysis && (
            <Box>
              {/* Cost Summary */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: selectedAnalysis.passed ? 'success.light' : 'error.light' }}>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="caption">Current Cost</Typography>
                    <Typography variant="h6">
                      ${selectedAnalysis.estimated_monthly_cost.toLocaleString()}/mo
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption">Optimized Cost</Typography>
                    <Typography variant="h6">
                      ${selectedAnalysis.optimized_monthly_cost.toLocaleString()}/mo
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption">Potential Savings</Typography>
                    <Typography variant="h6" color="success.dark">
                      ${selectedAnalysis.potential_savings.toLocaleString()}/mo
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Violations */}
              {selectedAnalysis.violations.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Violations ({selectedAnalysis.total_violations})
                  </Typography>
                  <List>
                    {selectedAnalysis.violations.map((violation, idx) => (
                      <ListItem key={idx}>
                        <ListItemIcon>
                          {getSeverityIcon(violation.severity)}
                        </ListItemIcon>
                        <ListItemText
                          primary={violation.rule}
                          secondary={
                            <>
                              <Typography variant="body2">{violation.message}</Typography>
                              <Typography variant="caption" color="textSecondary">
                                Impact: {violation.impact}
                              </Typography>
                              {violation.potential_savings > 0 && (
                                <Typography variant="caption" color="success.main" display="block">
                                  Potential savings: ${violation.potential_savings}/mo
                                </Typography>
                              )}
                            </>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {/* Recommendations */}
              {selectedAnalysis.recommendations.length > 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Recommendations
                  </Typography>
                  <List>
                    {selectedAnalysis.recommendations.map((rec, idx) => (
                      <ListItem key={idx}>
                        <ListItemIcon>
                          <CheckCircleIcon color="success" />
                        </ListItemIcon>
                        <ListItemText primary={rec} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {loading && <LinearProgress />}
    </Box>
  );
};

export default Guardrails;

// Made with Bob
