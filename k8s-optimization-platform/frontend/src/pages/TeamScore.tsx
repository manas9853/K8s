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
  CircularProgress,
  Avatar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Group as GroupIcon,
} from '@mui/icons-material';

interface TeamScoreData {
  team_name: string;
  owner: string;
  overall_score: number;
  resource_efficiency: number;
  cost_optimization: number;
  cleanup_score: number;
  compliance_score: number;
  best_practices: number;
  grade: string;
  status: string;
  namespace_count: number;
  pod_count: number;
  issues_count: number;
  recommendations_count: number;
}

const TeamScore: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [teams, setTeams] = useState<TeamScoreData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/scoring/team-score');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTeams(data.teams || []);
    } catch (error) {
      console.error('Error fetching team scores:', error);
      // Mock data
      setTeams([
        {
          team_name: 'Infrastructure Team',
          owner: 'David Kim',
          overall_score: 94,
          resource_efficiency: 92,
          cost_optimization: 95,
          cleanup_score: 96,
          compliance_score: 94,
          best_practices: 93,
          grade: 'A',
          status: 'excellent',
          namespace_count: 6,
          pod_count: 45,
          issues_count: 2,
          recommendations_count: 3,
        },
        {
          team_name: 'Frontend Team',
          owner: 'Emily Rodriguez',
          overall_score: 88,
          resource_efficiency: 85,
          cost_optimization: 90,
          cleanup_score: 88,
          compliance_score: 90,
          best_practices: 87,
          grade: 'B',
          status: 'good',
          namespace_count: 4,
          pod_count: 62,
          issues_count: 4,
          recommendations_count: 6,
        },
        {
          team_name: 'Payments Team',
          owner: 'Michael Chen',
          overall_score: 82,
          resource_efficiency: 80,
          cost_optimization: 84,
          cleanup_score: 82,
          compliance_score: 85,
          best_practices: 79,
          grade: 'B',
          status: 'good',
          namespace_count: 3,
          pod_count: 54,
          issues_count: 5,
          recommendations_count: 8,
        },
        {
          team_name: 'Analytics Team',
          owner: 'Sarah Johnson',
          overall_score: 65,
          resource_efficiency: 62,
          cost_optimization: 68,
          cleanup_score: 65,
          compliance_score: 70,
          best_practices: 60,
          grade: 'C',
          status: 'fair',
          namespace_count: 5,
          pod_count: 87,
          issues_count: 12,
          recommendations_count: 18,
        },
        {
          team_name: 'ML/AI Team',
          owner: 'Dr. Lisa Wang',
          overall_score: 58,
          resource_efficiency: 55,
          cost_optimization: 60,
          cleanup_score: 58,
          compliance_score: 62,
          best_practices: 55,
          grade: 'D',
          status: 'needs_improvement',
          namespace_count: 4,
          pod_count: 38,
          issues_count: 15,
          recommendations_count: 22,
        },
        {
          team_name: 'DevOps Team',
          owner: 'James Wilson',
          overall_score: 90,
          resource_efficiency: 88,
          cost_optimization: 92,
          cleanup_score: 90,
          compliance_score: 91,
          best_practices: 89,
          grade: 'A',
          status: 'excellent',
          namespace_count: 7,
          pod_count: 52,
          issues_count: 3,
          recommendations_count: 5,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 50) return 'warning';
    return 'error';
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'success';
      case 'B': return 'info';
      case 'C': return 'warning';
      default: return 'error';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircleIcon color="success" />;
      case 'good': return <CheckCircleIcon color="info" />;
      case 'fair': return <WarningIcon color="warning" />;
      default: return <ErrorIcon color="error" />;
    }
  };

  const avgScore = teams.length > 0
    ? teams.reduce((sum, t) => sum + t.overall_score, 0) / teams.length
    : 0;
  const excellentTeams = teams.filter(t => t.overall_score >= 90).length;
  const needsImprovement = teams.filter(t => t.overall_score < 70).length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Team Optimization Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Performance and efficiency scores by team
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
                Average Score
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={avgScore}
                    size={60}
                    color={getScoreColor(avgScore)}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h6" component="div">
                      {avgScore.toFixed(0)}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Across all teams
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Excellent Teams
              </Typography>
              <Typography variant="h4" color="success.main">
                {excellentTeams}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Score ≥ 90
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Needs Improvement
              </Typography>
              <Typography variant="h4" color="error.main">
                {needsImprovement}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Score {'<'} 70
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Teams
              </Typography>
              <Typography variant="h4" color="primary.main">
                {teams.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Being tracked
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Team Scores Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Team Score Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="center">Overall Score</TableCell>
                <TableCell align="center">Grade</TableCell>
                <TableCell align="center">Resource Efficiency</TableCell>
                <TableCell align="center">Cost Optimization</TableCell>
                <TableCell align="center">Cleanup Score</TableCell>
                <TableCell align="center">Compliance</TableCell>
                <TableCell align="center">Best Practices</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Resources</TableCell>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={team.overall_score}
                          size={50}
                          color={getScoreColor(team.overall_score)}
                        />
                        <Box
                          sx={{
                            top: 0,
                            left: 0,
                            bottom: 0,
                            right: 0,
                            position: 'absolute',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Typography variant="caption" component="div">
                            {team.overall_score}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={team.grade}
                      color={getGradeColor(team.grade)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.resource_efficiency}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.resource_efficiency}
                        color={getScoreColor(team.resource_efficiency)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.cost_optimization}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.cost_optimization}
                        color={getScoreColor(team.cost_optimization)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.cleanup_score}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.cleanup_score}
                        color={getScoreColor(team.cleanup_score)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.compliance_score}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.compliance_score}
                        color={getScoreColor(team.compliance_score)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" gutterBottom>
                        {team.best_practices}%
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={team.best_practices}
                        color={getScoreColor(team.best_practices)}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    {getStatusIcon(team.status)}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {team.namespace_count} NS
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {team.pod_count} pods
                    </Typography>
                    <Typography variant="caption" color="error.main" display="block">
                      {team.issues_count} issues
                    </Typography>
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

export default TeamScore;

// Made with Bob
