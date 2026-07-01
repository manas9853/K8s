import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Typography,
  Paper,
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
  LinearProgress,
  IconButton,
  Avatar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Group as GroupIcon,
  AttachMoney as AttachMoneyIcon,
  Savings as SavingsIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';

interface TeamCostRow {
  team_name: string;
  namespace_count: number;
  pod_count: number;
  monthly_cost: number;
  wasted_cost: number;
  savings_opportunity: number;
}

const DUMMY_DATA: TeamCostRow[] = [
  { team_name: 'Analytics Team',       namespace_count: 5, pod_count: 87, monthly_cost: 7320.50, wasted_cost: 4250.75, savings_opportunity: 58 },
  { team_name: 'Payments Team',        namespace_count: 3, pod_count: 54, monthly_cost: 6880.00, wasted_cost: 2890.50, savings_opportunity: 42 },
  { team_name: 'Frontend Team',        namespace_count: 4, pod_count: 62, monthly_cost: 5290.75, wasted_cost: 1850.25, savings_opportunity: 35 },
  { team_name: 'Infrastructure Team',  namespace_count: 6, pod_count: 45, monthly_cost: 4430.00, wasted_cost: 1240.00, savings_opportunity: 28 },
  { team_name: 'ML/AI Team',           namespace_count: 4, pod_count: 38, monthly_cost: 9060.80, wasted_cost: 5890.40, savings_opportunity: 65 },
  { team_name: 'DevOps Team',          namespace_count: 7, pod_count: 52, monthly_cost: 3060.25, wasted_cost:  980.75, savings_opportunity: 32 },
  { team_name: 'Security Team',        namespace_count: 2, pod_count: 24, monthly_cost: 1820.00, wasted_cost:  418.60, savings_opportunity: 23 },
  { team_name: 'Data Engineering',     namespace_count: 5, pod_count: 71, monthly_cost: 8140.20, wasted_cost: 3256.08, savings_opportunity: 40 },
];

const TeamCostAnalysis: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data] = useState<TeamCostRow[]>(DUMMY_DATA);
  const [loading] = useState(false);

  const totalMonthly      = data.reduce((s, r) => s + r.monthly_cost,  0);
  const totalWasted       = data.reduce((s, r) => s + r.wasted_cost,   0);
  const totalSavings      = data.reduce((s, r) => s + r.wasted_cost * (r.savings_opportunity / 100), 0);
  const avgSavingsOpportunity = data.reduce((s, r) => s + r.savings_opportunity, 0) / data.length;

  const getSavingsColor = (pct: number): 'error' | 'warning' | 'success' => {
    if (pct >= 50) return 'error';
    if (pct >= 30) return 'warning';
    return 'success';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Team Cost Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Per-team cost breakdown and savings opportunities — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AttachMoneyIcon color="primary" />
                <Typography color="text.secondary">Total Monthly Spend</Typography>
              </Box>
              <Typography variant="h4" color="primary.main">
                ${totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across {data.length} teams
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingDownIcon color="error" />
                <Typography color="text.secondary">Total Wasted Cost</Typography>
              </Box>
              <Typography variant="h4" color="error.main">
                ${totalWasted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {((totalWasted / totalMonthly) * 100).toFixed(1)}% of total spend
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SavingsIcon color="success" />
                <Typography color="text.secondary">Recoverable Savings</Typography>
              </Box>
              <Typography variant="h4" color="success.main">
                ${totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                If all opportunities actioned
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <GroupIcon color="warning" />
                <Typography color="text.secondary">Avg Savings Opportunity</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">
                {avgSavingsOpportunity.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per-team average
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Team Cost Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team Name</TableCell>
                <TableCell align="center">Namespace Count</TableCell>
                <TableCell align="center">Pod Count</TableCell>
                <TableCell align="right">Monthly Cost ($)</TableCell>
                <TableCell align="right">Wasted Cost ($)</TableCell>
                <TableCell align="center">Savings Opportunity (%)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.team_name} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                        <GroupIcon fontSize="small" />
                      </Avatar>
                      <Typography variant="body2" fontWeight="medium">
                        {row.team_name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{row.namespace_count}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{row.pod_count}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium">
                      ${row.monthly_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="error.main" fontWeight="medium">
                      ${row.wasted_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        label={`${row.savings_opportunity}%`}
                        color={getSavingsColor(row.savings_opportunity)}
                        size="small"
                      />
                      <LinearProgress
                        variant="determinate"
                        value={row.savings_opportunity}
                        color={getSavingsColor(row.savings_opportunity)}
                        sx={{ width: '80px', borderRadius: 1 }}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default TeamCostAnalysis;

// Made with Bob
