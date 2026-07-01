import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Paper,
  LinearProgress,
  Alert,
  Button,
  TextField,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Security as SecurityIcon,
  ArrowForward as ArrowForwardIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import axios from 'axios';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface AttackStep {
  step_number: number;
  timestamp: string;
  technique: string;
  mitre_id: string;
  description: string;
  indicators?: string[];
  suspicious_indicators?: string[];
  affected_resources: string[];
  severity: string;
  detection_confidence: number;
}

interface AttackPathData {
  incident_id: string;
  attack_chain: AttackStep[];
  entry_point: {
    resource: string;
    method: string;
    timestamp: string;
  };
  current_stage: string;
  predicted_next_steps: string[];
  risk_assessment: {
    overall_risk: string;
    data_exfiltration_risk: number;
    lateral_movement_risk: number;
    privilege_escalation_risk: number;
  };
}

const AttackPathAnalysisInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [incidentId, setIncidentId] = useState('INC-2024-001');
  const [attackPath, setAttackPath] = useState<AttackPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAttackPath();
  }, [incidentId]);

  const fetchAttackPath = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/attack-path/${incidentId}${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAttackPath(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch attack path data');
      console.error('Error fetching attack path:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    if (!severity) return 'default';
    switch (severity.toLowerCase()) {
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

  const getRiskColor = (risk: number) => {
    if (risk >= 80) return 'error';
    if (risk >= 60) return 'warning';
    if (risk >= 40) return 'info';
    return 'success';
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2, textAlign: 'center' }}>Loading attack path...</Typography>
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

  if (!attackPath) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="info">No attack path data available</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom>
          <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Attack Path Analysis
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label="Incident ID"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="INC-2024-001">INC-2024-001</MenuItem>
            <MenuItem value="INC-2024-002">INC-2024-002</MenuItem>
            <MenuItem value="INC-2024-003">INC-2024-003</MenuItem>
          </TextField>
          <Button variant="contained" color="primary" onClick={fetchAttackPath}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Entry Point & Risk Assessment */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Entry Point
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Resource:</strong> {attackPath.entry_point.resource}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Method:</strong> {attackPath.entry_point.method}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Timestamp:</strong> {attackPath.entry_point.timestamp}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Chip
                  label={`Current Stage: ${attackPath.current_stage}`}
                  color="warning"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Risk Assessment
              </Typography>
              <Chip
                label={`Overall Risk: ${attackPath.risk_assessment.overall_risk}`}
                color={getSeverityColor(attackPath.risk_assessment.overall_risk) as any}
                sx={{ mb: 2 }}
              />
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Data Exfiltration Risk
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={attackPath.risk_assessment.data_exfiltration_risk}
                    color={getRiskColor(attackPath.risk_assessment.data_exfiltration_risk) as any}
                    sx={{ flexGrow: 1, height: 10, borderRadius: 1 }}
                  />
                  <Typography variant="body2">
                    {attackPath.risk_assessment.data_exfiltration_risk}%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Lateral Movement Risk
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={attackPath.risk_assessment.lateral_movement_risk}
                    color={getRiskColor(attackPath.risk_assessment.lateral_movement_risk) as any}
                    sx={{ flexGrow: 1, height: 10, borderRadius: 1 }}
                  />
                  <Typography variant="body2">
                    {attackPath.risk_assessment.lateral_movement_risk}%
                  </Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Privilege Escalation Risk
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={attackPath.risk_assessment.privilege_escalation_risk}
                    color={getRiskColor(attackPath.risk_assessment.privilege_escalation_risk) as any}
                    sx={{ flexGrow: 1, height: 10, borderRadius: 1 }}
                  />
                  <Typography variant="body2">
                    {attackPath.risk_assessment.privilege_escalation_risk}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Attack Chain */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Attack Chain Progression
          </Typography>
          <Box sx={{ mt: 2 }}>
            {attackPath.attack_chain.map((step, index) => (
              <Box key={step.step_number}>
                <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={2}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                        }}
                      >
                        <Typography variant="h4" color="primary">
                          {step.step_number}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {step.timestamp}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={10}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {step.technique}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Chip label={step.mitre_id} size="small" variant="outlined" />
                          <Chip
                            label={step.severity}
                            size="small"
                            color={getSeverityColor(step.severity) as any}
                          />
                        </Box>
                      </Box>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        {step.description}
                      </Typography>
                      <Box sx={{ mt: 1, mb: 1 }}>
                        <Typography variant="caption" fontWeight="bold">
                          Detection Confidence:
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={step.detection_confidence}
                            sx={{ width: 100, height: 8, borderRadius: 1 }}
                          />
                          <Typography variant="caption">
                            {step.detection_confidence}%
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" fontWeight="bold">
                          Indicators:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {((step as any).indicators ?? (step as any).suspicious_indicators ?? []).map((indicator: string, idx: number) => (
                            <Chip
                              key={idx}
                              label={indicator}
                              size="small"
                              variant="outlined"
                              color="warning"
                            />
                          ))}
                        </Box>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" fontWeight="bold">
                          Affected Resources:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {step.affected_resources.map((resource, idx) => (
                            <Chip key={idx} label={resource} size="small" />
                          ))}
                        </Box>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
                {index < attackPath.attack_chain.length - 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                    <ArrowForwardIcon color="primary" sx={{ fontSize: 40 }} />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Predicted Next Steps */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Predicted Next Steps
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Based on the current attack pattern, the following steps are likely to occur next
          </Alert>
          <List>
            {attackPath.predicted_next_steps.map((step, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemText
                    primary={step}
                    secondary={`Prediction ${index + 1}`}
                  />
                  <CheckCircleIcon color="action" />
                </ListItem>
                {index < attackPath.predicted_next_steps.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

const AttackPathAnalysis: React.FC = () => (
  <ClusterGuard><AttackPathAnalysisInner /></ClusterGuard>
);

export default AttackPathAnalysis;

// Made with Bob
