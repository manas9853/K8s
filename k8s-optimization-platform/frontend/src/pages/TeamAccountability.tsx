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
  LinearProgress,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Alert,
  Divider,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  EmojiEvents as TrophyIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  People as PeopleIcon,
  AttachMoney as MoneyIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { API_BASE_URL } from '../config/api';

interface TeamCost {
  team_name: string;
  total_cost: number;
  waste: number;
  potential_savings: number;
  efficiency_score: number;
  resource_count: number;
  namespace_count: number;
  top_namespace: string;
  top_namespace_cost: number;
  trend: string;
  monthly_change: number;
}

interface TeamMember {
  name: string;
  email: string;
  role: string;
  resources_owned: number;
}

interface TeamResource {
  resource_type: string;
  count: number;
  cost: number;
  waste: number;
}

interface TeamNamespace {
  namespace: string;
  cost: number;
  waste: number;
  pod_count: number;
  efficiency_score: number;
}

interface TeamDetails {
  team_name: string;
  total_cost: number;
  waste: number;
  potential_savings: number;
  efficiency_score: number;
  members: TeamMember[];
  resources: TeamResource[];
  namespaces: TeamNamespace[];
  cost_trend: Array<{ month: string; cost: number }>;
  recommendations: string[];
}

interface Leaderboard {
  by_efficiency: Array<{ team: string; score: number; cost: number }>;
  by_savings: Array<{ team: string; savings: number; cost: number }>;
  by_waste: Array<{ team: string; waste: number; waste_percentage: number }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

const TeamAccountability: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [teams, setTeams] = useState<TeamCost[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  useEffect(() => {
    if (selectedTeam) {
      fetchTeamDetails(selectedTeam);
    }
  }, [selectedTeam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchTeams(), fetchLeaderboard()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/team-accountability/teams${clusterParam}`);
    const data = await response.json();
    setTeams(data);
    if (data.length > 0 && !selectedTeam) {
      setSelectedTeam(data[0].team_name);
    }
  };

  const fetchTeamDetails = async (teamName: string) => {
    const response = await fetch(`${API_BASE_URL}/v1/team-accountability/teams/${teamName}${clusterParam}`);
    const data = await response.json();
    setTeamDetails(data);
  };

  const fetchLeaderboard = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/team-accountability/leaderboard${clusterParam}`);
    const data = await response.json();
    setLeaderboard(data);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUpIcon color="error" />;
      case 'decreasing':
        return <TrendingDownIcon color="success" />;
      default:
        return <TrendingFlatIcon color="action" />;
    }
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 85) return 'success';
    if (score >= 75) return 'info';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const totalCost = teams.reduce((sum, t) => sum + t.total_cost, 0);
  const totalWaste = teams.reduce((sum, t) => sum + t.waste, 0);
  const totalSavings = teams.reduce((sum, t) => sum + t.potential_savings, 0);
  const avgEfficiency = teams.length > 0 ? Math.round(teams.reduce((sum, t) => sum + t.efficiency_score, 0) / teams.length) : 0;

  // Prepare pie chart data
  const pieData = teams.map((t) => ({
    name: t.team_name,
    value: t.total_cost,
  }));

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Team-Based Cost Accountability
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track costs, waste, and savings by team
          </Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <CardContent>
              <Typography variant="h6" color="white" gutterBottom>
                Total Cost
              </Typography>
              <Typography variant="h3" color="white" fontWeight="bold">
                ${totalCost.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="white">
                Across {teams.length} teams
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <CardContent>
              <Typography variant="h6" color="white" gutterBottom>
                Total Waste
              </Typography>
              <Typography variant="h3" color="white" fontWeight="bold">
                ${totalWaste.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="white">
                {((totalWaste / totalCost) * 100).toFixed(1)}% of total cost
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <CardContent>
              <Typography variant="h6" color="white" gutterBottom>
                Potential Savings
              </Typography>
              <Typography variant="h3" color="white" fontWeight="bold">
                ${totalSavings.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="white">
                Monthly opportunity
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <CardContent>
              <Typography variant="h6" color="white" gutterBottom>
                Avg Efficiency
              </Typography>
              <Typography variant="h3" color="white" fontWeight="bold">
                {avgEfficiency}
              </Typography>
              <Typography variant="body2" color="white">
                Out of 100
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Team Cost Table */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Team Cost Breakdown
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">Cost</TableCell>
                    <TableCell align="right">Waste</TableCell>
                    <TableCell align="right">Savings</TableCell>
                    <TableCell>Efficiency</TableCell>
                    <TableCell>Trend</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow
                      key={team.team_name}
                      hover
                      selected={selectedTeam === team.team_name}
                      onClick={() => setSelectedTeam(team.team_name)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {team.team_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {team.resource_count} resources
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold">
                          ${team.total_cost.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="error">
                          ${team.waste.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="success.main">
                          ${team.potential_savings.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 60 }}>
                            <LinearProgress
                              variant="determinate"
                              value={team.efficiency_score}
                              color={getEfficiencyColor(team.efficiency_score)}
                              sx={{ height: 6, borderRadius: 1 }}
                            />
                          </Box>
                          <Typography variant="caption">{team.efficiency_score}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {getTrendIcon(team.trend)}
                          {team.monthly_change !== 0 && (
                            <Typography
                              variant="caption"
                              color={
                                team.monthly_change > 0
                                  ? 'error.main'
                                  : 'success.main'
                              }
                            >
                              {team.monthly_change > 0 ? '+' : ''}
                              {team.monthly_change.toFixed(1)}%
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Cost Distribution Pie Chart */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Cost Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: $${(entry.value / 1000).toFixed(0)}k`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Leaderboards */}
        {leaderboard && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Team Leaderboards
              </Typography>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
                <Tab label="By Efficiency" />
                <Tab label="By Savings Opportunity" />
                <Tab label="By Waste" />
              </Tabs>

              {/* Efficiency Leaderboard */}
              {tabValue === 0 && (
                <Box sx={{ mt: 2 }}>
                  {leaderboard.by_efficiency.map((item, idx) => (
                    <Box
                      key={item.team}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 2,
                        mb: 1,
                        bgcolor: idx < 3 ? 'success.light' : 'grey.100',
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {idx < 3 && <TrophyIcon color={idx === 0 ? 'warning' : 'action'} />}
                        <Box>
                          <Typography variant="body1" fontWeight="medium">
                            #{idx + 1} {item.team}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Cost: ${item.cost.toLocaleString()}
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        label={`${item.score} / 100`}
                        color={getEfficiencyColor(item.score)}
                        size="small"
                      />
                    </Box>
                  ))}
                </Box>
              )}

              {/* Savings Leaderboard */}
              {tabValue === 1 && (
                <Box sx={{ mt: 2 }}>
                  {leaderboard.by_savings.map((item, idx) => (
                    <Box
                      key={item.team}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 2,
                        mb: 1,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                      }}
                    >
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          #{idx + 1} {item.team}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Cost: ${item.cost.toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography variant="h6" color="success.main" fontWeight="bold">
                        ${item.savings.toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Waste Leaderboard */}
              {tabValue === 2 && (
                <Box sx={{ mt: 2 }}>
                  {leaderboard.by_waste.map((item, idx) => (
                    <Box
                      key={item.team}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 2,
                        mb: 1,
                        bgcolor: idx < 3 ? 'error.light' : 'grey.100',
                        borderRadius: 1,
                      }}
                    >
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          #{idx + 1} {item.team}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.waste_percentage}% waste ratio
                        </Typography>
                      </Box>
                      <Typography variant="h6" color="error.main" fontWeight="bold">
                        ${item.waste.toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Grid>
        )}

        {/* Team Details */}
        {teamDetails && (
          <>
            {/* Cost Trend */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Cost Trend - {teamDetails.team_name}
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={teamDetails.cost_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="cost" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Resources Breakdown */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Resources - {teamDetails.team_name}
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={teamDetails.resources}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="resource_type" />
                    <YAxis />
                    <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="cost" fill="#8884d8" name="Cost" />
                    <Bar dataKey="waste" fill="#ff8042" name="Waste" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Team Members */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PeopleIcon />
                  Team Members
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {teamDetails.members.map((member) => (
                  <Box key={member.email} sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {member.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.role} • {member.email}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Owns {member.resources_owned} resources
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Grid>

            {/* Recommendations */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InfoIcon />
                  Recommendations
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {teamDetails.recommendations.length > 0 ? (
                  teamDetails.recommendations.map((rec, idx) => (
                    <Alert key={idx} severity="info" sx={{ mb: 1 }}>
                      {rec}
                    </Alert>
                  ))
                ) : (
                  <Alert severity="success">
                    No recommendations - team is well optimized!
                  </Alert>
                )}
              </Paper>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default TeamAccountability;

// Made with Bob
