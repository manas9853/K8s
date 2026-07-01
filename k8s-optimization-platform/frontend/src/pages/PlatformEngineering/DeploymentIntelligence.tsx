import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    deploymentName: 'payments-api',
    namespace: 'payments',
    cluster: 'prod-us-east-1',
    riskScore: 82,
    riskLevel: 'High',
    recentChanges: '3 releases, 2 config updates',
    recommendation: 'Add canary rollout and tighten resource limits',
  },
  {
    deploymentName: 'inventory-worker',
    namespace: 'inventory',
    cluster: 'staging-eu-west-1',
    riskScore: 46,
    riskLevel: 'Medium',
    recentChanges: '1 image update',
    recommendation: 'Monitor queue lag after deployment',
  },
  {
    deploymentName: 'frontend-web',
    namespace: 'web',
    cluster: 'dev-ap-south-1',
    riskScore: 18,
    riskLevel: 'Low',
    recentChanges: 'Static asset cache refresh',
    recommendation: 'Current rollout pattern is acceptable',
  },
];

const DeploymentIntelligence: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const highRiskCount = data.filter((row) => row.riskLevel === 'High' || row.riskLevel === 'Critical').length;
  const avgRisk = Math.round(data.reduce((sum, row) => sum + row.riskScore, 0) / data.length);
  const clusterCount = new Set(data.map((row) => row.cluster)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Deployment Intelligence & Risk Scoring</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Deployments</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">High Risk</Typography><Typography variant="h5">{highRiskCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Average Risk / Clusters</Typography><Typography variant="h5">{avgRisk} / {clusterCount}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Deployment Name</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Risk Score (0-100)</TableCell><TableCell>Risk Level</TableCell><TableCell>Recent Changes</TableCell><TableCell>Recommendation</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.deploymentName}</TableCell><TableCell>{row.namespace}</TableCell><TableCell>{row.cluster}</TableCell><TableCell>{row.riskScore}</TableCell><TableCell><Chip label={row.riskLevel} color={row.riskLevel === 'Low' ? 'success' : row.riskLevel === 'Medium' ? 'warning' : 'error'} size="small" /></TableCell><TableCell>{row.recentChanges}</TableCell><TableCell>{row.recommendation}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default DeploymentIntelligence;
// Made with Bob
