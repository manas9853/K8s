import React, { useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, LinearProgress,
} from '@mui/material';

const DUMMY_DATA = [
  {
    standardName: 'Pod Security Baseline',
    category: 'Security',
    appliesTo: 'All production namespaces',
    compliance: 92,
    violationsCount: 14,
    autoFixAvailable: 'Yes',
    priority: 'High',
  },
  {
    standardName: 'Requests and Limits Required',
    category: 'Resource',
    appliesTo: 'All workloads',
    compliance: 78,
    violationsCount: 29,
    autoFixAvailable: 'Yes',
    priority: 'Critical',
  },
  {
    standardName: 'Ingress TLS Enforcement',
    category: 'Networking',
    appliesTo: 'Public-facing services',
    compliance: 64,
    violationsCount: 11,
    autoFixAvailable: 'No',
    priority: 'Medium',
  },
];

const PlatformStandards: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data] = useState(DUMMY_DATA);
  const avgCompliance = Math.round(data.reduce((sum, row) => sum + row.compliance, 0) / data.length);
  const autoFixCount = data.filter((row) => row.autoFixAvailable === 'Yes').length;
  const totalViolations = data.reduce((sum, row) => sum + row.violationsCount, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Platform Standards Compliance</Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Standards</Typography><Typography variant="h5">{data.length}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Average Compliance</Typography><Typography variant="h5">{avgCompliance}%</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card><CardContent><Typography color="text.secondary">Auto-Fix Available / Violations</Typography><Typography variant="h5">{autoFixCount} / {totalViolations}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Standard Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Applies To</TableCell>
                <TableCell>Compliance %</TableCell>
                <TableCell>Violations Count</TableCell>
                <TableCell>Auto-Fix Available</TableCell>
                <TableCell>Priority</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.standardName}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.appliesTo}</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: '100%' }}>
                        <LinearProgress variant="determinate" value={row.compliance} />
                      </Box>
                      <Typography variant="body2">{row.compliance}%</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{row.violationsCount}</TableCell>
                  <TableCell><Chip label={row.autoFixAvailable} color={row.autoFixAvailable === 'Yes' ? 'success' : 'default'} size="small" /></TableCell>
                  <TableCell><Chip label={row.priority} color={row.priority === 'Critical' ? 'error' : row.priority === 'High' ? 'warning' : 'info'} size="small" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
export default PlatformStandards;
// Made with Bob
