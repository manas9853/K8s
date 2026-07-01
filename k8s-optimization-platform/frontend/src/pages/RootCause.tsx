import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface RootCause {
  category: string;
  description: string;
  impact: string;
  count: number;
  cost_impact: number;
  severity: string;
  recommendation: string;
}

interface WasteBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
  examples: string[];
}

interface ResourceIssue {
  resource_name: string;
  resource_type: string;
  namespace: string;
  cluster: string;
  issue_type: string;
  root_cause: string;
  current_state: Record<string, any>;
  recommended_action: string;
  estimated_savings: number;
  risk_level: string;
}

interface Analysis {
  total_waste: number;
  analysis_date: string;
  root_causes: RootCause[];
  waste_breakdown: WasteBreakdown[];
  top_contributors: Array<{
    name: string;
    type: string;
    waste: number;
    reason: string;
  }>;
  recommendations: string[];
}

const RootCauseInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [issues, setIssues] = useState<ResourceIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchAnalysis(),
        fetchIssues(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysis = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/root-cause/analysis${clusterParam}`);
    const data = await response.json();
    setAnalysis(data);
  };

  const fetchIssues = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/root-cause/issues${clusterParam}`);
    const data = await response.json();
    setIssues(data);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ErrorIcon color="error" />;
      case 'high':
        return <WarningIcon color="warning" />;
      case 'medium':
        return <InfoIcon color="info" />;
      case 'low':
        return <CheckCircleIcon color="success" />;
      default:
        return null;
    }
  };

  const COLORS = ['#f44336', '#ff9800', '#ffc107', '#4caf50', '#2196f3', '#9c27b0'];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Root Cause Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Understand why waste occurs and how to fix it
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {analysis && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <CardContent>
                  <Typography variant="h6" color="white" gutterBottom>
                    Total Monthly Waste
                  </Typography>
                  <Typography variant="h3" color="white" fontWeight="bold">
                    ${analysis.total_waste.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="white">
                    Identified across all clusters
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                <CardContent>
                  <Typography variant="h6" color="white" gutterBottom>
                    Root Causes
                  </Typography>
                  <Typography variant="h3" color="white" fontWeight="bold">
                    {analysis.root_causes.length}
                  </Typography>
                  <Typography variant="body2" color="white">
                    Categories identified
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
                <CardContent>
                  <Typography variant="h6" color="white" gutterBottom>
                    Affected Resources
                  </Typography>
                  <Typography variant="h3" color="white" fontWeight="bold">
                    {analysis.root_causes.reduce((sum, rc) => sum + rc.count, 0)}
                  </Typography>
                  <Typography variant="body2" color="white">
                    Resources need attention
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                <CardContent>
                  <Typography variant="h6" color="white" gutterBottom>
                    Potential Savings
                  </Typography>
                  <Typography variant="h3" color="white" fontWeight="bold">
                    ${analysis.total_waste.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="white">
                    If all issues resolved
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Root Causes */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Root Causes Breakdown
                </Typography>
                {analysis.root_causes.map((rc, idx) => (
                  <Accordion key={idx} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        {getSeverityIcon(rc.severity)}
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {rc.category}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {rc.count} resources • ${rc.cost_impact.toLocaleString()}/month
                          </Typography>
                        </Box>
                        <Chip
                          label={rc.severity}
                          color={getSeverityColor(rc.severity) as any}
                          size="small"
                        />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box>
                        <Typography variant="body2" paragraph>
                          <strong>Description:</strong> {rc.description}
                        </Typography>
                        <Typography variant="body2" paragraph>
                          <strong>Impact:</strong> {rc.impact}
                        </Typography>
                        <Alert severity="info" sx={{ mt: 2 }}>
                          <strong>Recommendation:</strong> {rc.recommendation}
                        </Alert>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Waste Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analysis.waste_breakdown}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.percentage.toFixed(1)}%`}
                    >
                      {analysis.waste_breakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Category Details
                </Typography>
                {analysis.waste_breakdown.map((wb, idx) => (
                  <Box key={idx} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight="bold">
                        {wb.category}
                      </Typography>
                      <Typography variant="body2" color="error">
                        ${wb.amount.toLocaleString()}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={wb.percentage}
                      sx={{ height: 8, borderRadius: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {wb.count} resources affected
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>

            {/* Top Contributors */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Top 5 Waste Contributors
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Rank</TableCell>
                        <TableCell>Resource</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Reason</TableCell>
                        <TableCell align="right">Monthly Waste</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analysis.top_contributors.map((contributor, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Chip label={`#${idx + 1}`} size="small" color="primary" />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">
                              {contributor.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={contributor.type} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{contributor.reason}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold" color="error">
                              ${contributor.waste.toLocaleString()}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            {/* Detailed Issues */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Detailed Resource Issues
                </Typography>
                {issues.map((issue, idx) => (
                  <Accordion key={idx} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {issue.resource_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {issue.cluster} / {issue.namespace} • {issue.issue_type}
                          </Typography>
                        </Box>
                        <Chip
                          label={`$${issue.estimated_savings}/mo`}
                          color="error"
                          size="small"
                        />
                        <Chip
                          label={issue.risk_level}
                          color={getSeverityColor(issue.risk_level) as any}
                          size="small"
                        />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Alert severity="warning">
                            <strong>Root Cause:</strong> {issue.root_cause}
                          </Alert>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" gutterBottom>
                            Current State
                          </Typography>
                          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                            {Object.entries(issue.current_state).map(([key, value]) => (
                              <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption">{key}:</Typography>
                                <Typography variant="caption" fontWeight="bold">{String(value)}</Typography>
                              </Box>
                            ))}
                          </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" gutterBottom>
                            Recommendation
                          </Typography>
                          <Alert severity="success">
                            {issue.recommended_action}
                          </Alert>
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" display="block">
                              <strong>Estimated Savings:</strong> ${issue.estimated_savings}/month
                            </Typography>
                            <Typography variant="caption" display="block">
                              <strong>Risk Level:</strong> {issue.risk_level}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Paper>
            </Grid>

            {/* Recommendations */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingDownIcon color="success" />
                  Action Plan
                </Typography>
                <List>
                  {analysis.recommendations.map((rec, idx) => (
                    <React.Fragment key={idx}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip label={`#${idx + 1}`} size="small" color="primary" />
                              <Typography variant="body2">{rec}</Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                      {idx < analysis.recommendations.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

const RootCause: React.FC = () => (
  <ClusterGuard><RootCauseInner /></ClusterGuard>
);

export default RootCause;

// Made with Bob
