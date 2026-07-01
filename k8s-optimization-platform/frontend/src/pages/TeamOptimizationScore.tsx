import React, { useState } from 'react';
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
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Group as GroupIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  EmojiEvents as TrophyIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';

interface TeamOptRow {
  team_name: string;
  score: number;
  grade: string;
  cpu_efficiency: number;
  memory_efficiency: number;
  issues_count: number;
  trend: 'up' | 'down' | 'stable';
}

const DUMMY_DATA: TeamOptRow[] = [
  { team_name: 'Infrastructure Team', score: 94, grade: 'A', cpu_efficiency: 92, memory_efficiency: 91, issues_count:  2, trend: 'up'     },
  { team_name: 'DevOps Team',         score: 90, grade: 'A', cpu_efficiency: 88, memory_efficiency: 87, issues_count:  3, trend: 'stable' },
  { team_name: 'Frontend Team',       score: 88, grade: 'B', cpu_efficiency: 85, memory_efficiency: 84, issues_count:  4, trend: 'up'     },
  { team_name: 'Payments Team',       score: 82, grade: 'B', cpu_efficiency: 80, memory_efficiency: 79, issues_count:  5, trend: 'stable' },
  { team_name: 'Security Team',       score: 79, grade: 'C', cpu_efficiency: 76, memory_efficiency: 75, issues_count:  8, trend: 'up'     },
  { team_name: 'Analytics Team',      score: 65, grade: 'C', cpu_efficiency: 62, memory_efficiency: 60, issues_count: 12, trend: 'down'   },
  { team_name: 'Data Engineering',    score: 61, grade: 'D', cpu_efficiency: 58, memory_efficiency: 57, issues_count: 14, trend: 'stable' },
  { team_name: 'ML/AI Team',          score: 54, grade: 'D', cpu_efficiency: 52, memory_efficiency: 49, issues_count: 18, trend: 'down'   },
];

const TeamOptimizationScore: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data] = useState<TeamOptRow[]>(DUMMY_DATA);
  const [loading] = useState(false);

  const avgScore       = data.reduce((s, r) => s + r.score, 0) / data.length;
  const topTeams       = data.filter((r) => r.grade === 'A').length;
  const atRiskTeams    = data.filter((r) => r.score < 70).length;
  const totalIssues    = data.reduce((s, r) => s + r.issues_count, 0);

  const getScoreColor = (score: number): 'success' | 'info' | 'warning' | 'error' => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 50) return 'warning';
    return 'error';
  };

  const getGradeColor = (grade: string): 'success' | 'info' | 'warning' | 'error' => {
    if (grade === 'A') return 'success';
    if (grade === 'B') return 'info';
    if (grade === 'C') return 'warning';
    return 'error';
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up')     return <TrendingUpIcon   color="success" fontSize="small" />;
    if (trend === 'down')   return <TrendingDownIcon color="error"   fontSize="small" />;
    return                         <TrendingFlatIcon color="action"  fontSize="small" />;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Team Optimization Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Optimization scores and efficiency ratings per team — {activeClusterName}
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
              <Typography color="text.secondary" gutterBottom>
                Platform Average Score
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
                      top: 0, left: 0, bottom: 0, right: 0,
                      position: 'absolute',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h6">{avgScore.toFixed(0)}</Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Across {data.length} teams
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrophyIcon color="success" />
                <Typography color="text.secondary">Grade A Teams</Typography>
              </Box>
              <Typography variant="h4" color="success.main">{topTeams}</Typography>
              <Typography variant="body2" color="text.secondary">Score ≥ 90</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <WarningIcon color="error" />
                <Typography color="text.secondary">At-Risk Teams</Typography>
              </Box>
              <Typography variant="h4" color="error.main">{atRiskTeams}</Typography>
              <Typography variant="body2" color="text.secondary">Score {'<'} 70</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Open Issues</Typography>
              <Typography variant="h4" color="warning.main">{totalIssues}</Typography>
              <Typography variant="body2" color="text.secondary">Across all teams</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Team Optimization Scores
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team Name</TableCell>
                <TableCell align="center">Score (0–100)</TableCell>
                <TableCell align="center">Grade</TableCell>
                <TableCell align="center">CPU Efficiency (%)</TableCell>
                <TableCell align="center">Memory Efficiency (%)</TableCell>
                <TableCell align="center">Issues Count</TableCell>
                <TableCell align="center">Trend</TableCell>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <CircularProgress
                          variant="determinate"
                          value={row.score}
                          size={48}
                          color={getScoreColor(row.score)}
                        />
                        <Box
                          sx={{
                            top: 0, left: 0, bottom: 0, right: 0,
                            position: 'absolute',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Typography variant="caption" fontWeight="bold">
                            {row.score}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={row.grade} color={getGradeColor(row.grade)} size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Box>
                      <Typography variant="body2" gutterBottom>{row.cpu_efficiency}%</Typography>
                      <LinearProgress
                        variant="determinate"
                        value={row.cpu_efficiency}
                        color={getScoreColor(row.cpu_efficiency)}
                        sx={{ borderRadius: 1 }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Box>
                      <Typography variant="body2" gutterBottom>{row.memory_efficiency}%</Typography>
                      <LinearProgress
                        variant="determinate"
                        value={row.memory_efficiency}
                        color={getScoreColor(row.memory_efficiency)}
                        sx={{ borderRadius: 1 }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={row.issues_count}
                      color={row.issues_count > 10 ? 'error' : row.issues_count > 5 ? 'warning' : 'success'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <TrendIcon trend={row.trend} />
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

export default TeamOptimizationScore;

// Made with Bob
