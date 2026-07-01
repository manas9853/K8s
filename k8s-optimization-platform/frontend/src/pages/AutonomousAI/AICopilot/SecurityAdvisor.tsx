import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';

interface SecurityIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  affected_resources: string[];
  remediation: string;
  cve_ids?: string[];
}

interface SecurityData {
  summary: {
    total_issues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    security_score: number;
  };
  issues: SecurityIssue[];
  compliance_status: {
    cis_benchmark: string;
    pci_dss: string;
    hipaa: string;
  };
}

const SecurityAdvisor: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/autonomous-ai/copilot/security-advisor');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch security analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return <ErrorIcon color="error" />;
      case 'high': return <WarningIcon color="error" />;
      case 'medium': return <WarningIcon color="warning" />;
      case 'low': return <WarningIcon color="info" />;
      default: return <WarningIcon />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success.main';
    if (score >= 60) return 'warning.main';
    return 'error.main';
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Security Advisor</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Security Advisor</Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Security Advisor
          </Typography>
          <Typography variant="body1" color="text.secondary">
            AI-powered security analysis and vulnerability detection
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Security Score */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <SecurityIcon sx={{ fontSize: 48, color: getScoreColor(data.summary.security_score), mb: 2 }} />
              <Typography variant="h3" color={getScoreColor(data.summary.security_score)}>
                {data.summary.security_score}/100
              </Typography>
              <Typography color="text.secondary" gutterBottom>
                Security Score
              </Typography>
              <LinearProgress
                variant="determinate"
                value={data.summary.security_score}
                sx={{ mt: 2, height: 8, borderRadius: 4 }}
                color={data.summary.security_score >= 80 ? 'success' : data.summary.security_score >= 60 ? 'warning' : 'error'}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Issue Summary */}
        <Grid item xs={12} md={8}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="caption">
                    Critical
                  </Typography>
                  <Typography variant="h4" color="error">
                    {data.summary.critical}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="caption">
                    High
                  </Typography>
                  <Typography variant="h4" color="error">
                    {data.summary.high}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="caption">
                    Medium
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {data.summary.medium}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="caption">
                    Low
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {data.summary.low}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Compliance Status */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Compliance Status
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={4}>
                  <Chip
                    label={`CIS: ${data.compliance_status.cis_benchmark}`}
                    size="small"
                    color={data.compliance_status.cis_benchmark === 'Compliant' ? 'success' : 'warning'}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Chip
                    label={`PCI DSS: ${data.compliance_status.pci_dss}`}
                    size="small"
                    color={data.compliance_status.pci_dss === 'Compliant' ? 'success' : 'warning'}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Chip
                    label={`HIPAA: ${data.compliance_status.hipaa}`}
                    size="small"
                    color={data.compliance_status.hipaa === 'Compliant' ? 'success' : 'warning'}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Security Issues */}
      <Paper>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            Security Issues & Vulnerabilities
          </Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          {data.issues.map((issue) => (
            <Accordion key={issue.id}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  {getSeverityIcon(issue.severity)}
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {issue.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip
                        label={issue.severity}
                        size="small"
                        color={getSeverityColor(issue.severity)}
                      />
                      <Chip
                        label={issue.category}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${issue.affected_resources.length} resources`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Description
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {issue.description}
                    </Typography>
                  </Grid>

                  {issue.cve_ids && issue.cve_ids.length > 0 && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        CVE IDs
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {issue.cve_ids.map((cve) => (
                          <Chip
                            key={cve}
                            label={cve}
                            size="small"
                            icon={<BugReportIcon />}
                            color="error"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Grid>
                  )}

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Affected Resources
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {issue.affected_resources.map((resource, idx) => (
                        <Chip
                          key={idx}
                          label={resource}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>
                      Remediation
                    </Typography>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {issue.remediation}
                    </Alert>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<CheckCircleIcon />}
                      size="small"
                    >
                      Apply Fix
                    </Button>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default SecurityAdvisor;

// Made with Bob
