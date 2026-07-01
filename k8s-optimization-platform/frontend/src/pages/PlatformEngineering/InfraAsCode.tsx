import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip,
} from '@mui/material';

const DUMMY_DATA = [
  {
    resourceName: 'eks-prod-cluster',
    provider: 'Terraform',
    stack: 'platform-core',
    state: 'Managed',
    lastApplied: '2026-06-25 18:30 UTC',
    owner: 'platform-team',
    costPerMonth: 4200,
  },
  {
    resourceName: 'ingress-nginx',
    provider: 'Helm',
    stack: 'networking',
    state: 'Drifted',
    lastApplied: '2026-06-24 13:10 UTC',
    owner: 'sre-team',
    costPerMonth: 760,
  },
  {
    resourceName: 'node-bootstrap',
    provider: 'Ansible',
    stack: 'compute-ops',
    state: 'Orphaned',
    lastApplied: '2026-06-20 07:55 UTC',
    owner: 'infra-automation',
    costPerMonth: 310,
  },
];

const InfraAsCode: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const managedCount = data.filter((row) => row.state === 'Managed').length;
  const driftedCount = data.filter((row) => row.state === 'Drifted').length;
  const totalCost = data.reduce((sum, row) => sum + row.costPerMonth, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Infrastructure as Code Tracking</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Tracked Resources</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Managed / Drifted</Typography><Typography variant="h5">{managedCount} / {driftedCount}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Estimated Cost / Month</Typography><Typography variant="h5">${totalCost}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead><TableRow><TableCell>Resource Name</TableCell><TableCell>Provider</TableCell><TableCell>Stack</TableCell><TableCell>State</TableCell><TableCell>Last Applied</TableCell><TableCell>Owner</TableCell><TableCell>Cost/Month ($)</TableCell></TableRow></TableHead>
            <TableBody>{data.map((row, i) => <TableRow key={i}><TableCell>{row.resourceName}</TableCell><TableCell>{row.provider}</TableCell><TableCell>{row.stack}</TableCell><TableCell><Chip label={row.state} color={row.state === 'Managed' ? 'success' : row.state === 'Drifted' ? 'warning' : 'default'} size="small" /></TableCell><TableCell>{row.lastApplied}</TableCell><TableCell>{row.owner}</TableCell><TableCell>{row.costPerMonth}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default InfraAsCode;
// Made with Bob
