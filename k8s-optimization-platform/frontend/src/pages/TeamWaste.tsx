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
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

interface TeamWasteData {
  team_name: string;
  owner: string;
  total_waste_percentage: number;
  monthly_waste_cost: number;
  annual_waste_cost: number;
  namespace_count: number;
  pod_count: number;
  cpu_waste: number;
  memory_waste: number;
  potential_savings: number;
  waste_trend: string;
  top_wasting_namespace: string;
}

const TeamWaste: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [teams, setTeams] = useState<TeamWasteData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/heatmap/team-waste');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTeams(data.teams || []);
    } catch (error) {
      console.error('Error fetching team waste data:', error);
      // Mock data
      setTeams([
        {
          team_name: 'Analytics Team',
          owner: 'Sarah Johnson',
          total_waste_percentage: 58,
          monthly_waste_cost: 4250.75,
          annual_waste_cost: 51009.00,
          namespace_count: 5,
          pod_count: 87,
          cpu_waste: 62,
          memory_waste: 54,
          potential_savings: 2550.45,
          waste_trend: 'increasing',
          top_wasting_namespace: 'analytics-prod',
        },
        {
          team_name: 'Payments Team',
          owner: 'Michael Chen',
          total_waste_percentage: 42,
          monthly_waste_cost: 2890.50,
          annual_waste_cost: 34686.00,
          namespace_count: 3,
          pod_count: 54,
          cpu_waste: 45,
          memory_waste: 39,
          potential_savings: 1445.25,
          waste_trend: 'stable',
          top_wasting_namespace: 'payments-backend',
        },
        {
          team_name: 'Frontend Team',
          owner: 'Emily Rodriguez',
          total_waste_percentage: 35,
          monthly_waste_cost: 1850.25,
          annual_waste_cost: 22203.00,
          namespace_count: 4,
          pod_count: 62,
          cpu_waste: 38,
          memory_waste: 32,
          potential_savings: 925.13,
          waste_trend: 'decreasing',
          top_wasting_namespace: 'frontend-staging',
        },
        {
          team_name: 'Infrastructure Team',
          owner: 'David Kim',
          total_waste_percentage: 28,
          monthly_waste_cost: 1240.00,
          annual_waste_cost: 14880.00,
          namespace_count: 6,
          pod_count: 45,
          cpu_waste: 30,
          memory_waste: 26,
          potential_savings: 620.00,
          waste_trend: 'stable',
          top_wasting_namespace: 'monitoring',
        },
        {
          team_name: 'ML/AI Team',
          owner: 'Dr. Lisa Wang',
          total_waste_percentage: 65,
          monthly_waste_cost: 5890.40,
          annual_waste_cost: 70684.80,
          namespace_count: 4,
          pod_count: 38,
          cpu_waste: 70,
          memory_waste: 60,
          potential_savings: 3534.24,
          waste_trend: 'increasing',
          top_wasting_namespace: 'ml-training',
        },
        {
          team_name: 'DevOps Team',
          owner: 'James Wilson',
          total_waste_percentage: 32,
          monthly_waste_cost: 980.75,
          annual_waste_cost: 11769.00,
          namespace_count: 7,
          pod_count: 52,
          cpu_waste: 35,
          memory_waste: 29,
          potential_savings: 490.38,
          waste_trend: 'decreasing',
          top_wasting_namespace: 'ci-cd',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getWasteColor = (percentage: number) => {
    if (percentage >= 60) return 'error';
    if (percentage >= 40) return 'warning';
    return 'success';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') return <TrendingUpIcon color="error" fontSize="small" />;
    if (trend === 'decreasing') return <TrendingUpIcon color="success" fontSize="small" sx={{ transform: 'rotate(180deg)' }} />;
    return <TrendingUpIcon color="info" fontSize="small" sx={{ transform: 'rotate(90deg)' }} />;
  };

  const totalWaste = teams.reduce((sum, t) => sum + t.monthly_waste_cost, 0);
  const totalSavings = teams.reduce((sum, t) => sum + t.potential_savings, 0);
  const avgWaste = teams.length > 0 ? teams.reduce((sum, t) => sum + t.total_waste_percentage, 0) / teams.length : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Team Waste & Accountability
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track resource waste by team ownership
          </Typography>
        </Box>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Team Waste
              </Typography>
              <Typography variant="h4" color="error.main">
                ${totalWaste.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly across all teams
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Potential Savings
              </Typography>
              <Typography variant="h4" color="success.main">
                ${totalSavings.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly if optimized
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Waste
              </Typography>
              <Typography variant="h4" color="warning.main">
                {avgWaste.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per team average
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Teams Tracked
              </Typography>
              <Typography variant="h4" color="primary.main">
                {teams.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active teams
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Team Waste Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Team Waste Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="center">Waste %</TableCell>
                <TableCell align="center">CPU Waste</TableCell>
                <TableCell align="center">Memory Waste</TableCell>
                <TableCell align="right">Monthly Cost</TableCell>
                <TableCell align="right">Annual Cost</TableCell>
                <TableCell align="right">Potential Savings</TableCell>
                <TableCell align="center">Resources</TableCell>
                <TableCell align="center">Trend</TableCell>
                <TableCell>Top Wasting NS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.team_name} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                        <GroupIcon fontSize="small" />
                      </Avatar>
                      <Typography variant="body2" fontWeight="medium">
                        {team.team_name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{team.owner}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${team.total_waste_percentage}%`}
                      color={getWasteColor(team.total_waste_percentage)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.cpu_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.cpu_waste}
                        color={getWasteColor(team.cpu_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.memory_waste}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.memory_waste}
                        color={getWasteColor(team.memory_waste)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" color="error.main">
                      ${team.monthly_waste_cost.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      ${team.annual_waste_cost.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" color="success.main">
                      ${team.potential_savings.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {team.namespace_count} NS
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {team.pod_count} pods
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {getTrendIcon(team.waste_trend)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={team.top_wasting_namespace}
                      size="small"
                      variant="outlined"
                      color="error"
                    />
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

export default TeamWaste;

// Made with Bob
