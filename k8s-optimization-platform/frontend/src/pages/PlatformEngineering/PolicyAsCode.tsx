import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    policyName: 'restrict-privileged-containers',
    type: 'Kyverno',
    enforcementMode: 'Enforce',
    rulesCount: 12,
    violations: 3,
    cluster: 'prod-us-east-1',
    status: 'Active',
  },
  {
    policyName: 'required-network-policies',
    type: 'OPA',
    enforcementMode: 'Audit',
    rulesCount: 8,
    violations: 11,
    cluster: 'staging-eu-west-1',
    status: 'Review',
  },
  {
    policyName: 'mandatory-labeling',
    type: 'Kyverno',
    enforcementMode: 'Warn',
    rulesCount: 5,
    violations: 6,
    cluster: 'dev-ap-south-1',
    status: 'Active',
  },
];

const PolicyAsCode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const activeCount = data.filter((row) => row.status === 'Active').length;
  const totalViolations = data.reduce((sum, row) => sum + row.violations, 0);
  const clusterCount = new Set(data.map((row) => row.cluster)).size;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Policy as Code Management</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Policies</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Active Policies</Typography><Typography variant="h5">{activeCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Violations / Clusters</Typography><Typography variant="h5">{totalViolations} / {clusterCount}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Policy Name</TableCell><TableCell>Type</TableCell><TableCell>Enforcement Mode</TableCell><TableCell>Rules Count</TableCell><TableCell>Violations (Last 24h)</TableCell><TableCell>Cluster</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.policyName}</TableCell><TableCell>{row.type}</TableCell><TableCell><Chip label={row.enforcementMode} color={row.enforcementMode === 'Enforce' ? 'error' : row.enforcementMode === 'Audit' ? 'warning' : 'info'} size="small" /></TableCell><TableCell>{row.rulesCount}</TableCell><TableCell>{row.violations}</TableCell><TableCell>{row.cluster}</TableCell><TableCell><Chip label={row.status} color={row.status === 'Active' ? 'success' : 'warning'} size="small" /></TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default PolicyAsCode;
// Made with Bob
