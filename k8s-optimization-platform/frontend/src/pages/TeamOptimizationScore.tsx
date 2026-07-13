import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
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
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface TeamOptRow {
  team_name: string;
  score: number;
  grade: string;
  cpu_efficiency: number;
  memory_efficiency: number;
  issues_count: number;
  trend: 'up' | 'down' | 'stable';
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function mapTeamOpt(raw: Record<string, unknown>): TeamOptRow {
  const score = Number(raw.efficiency_score ?? 0);
  const cpuEff = Math.min(100, Math.max(0, score - 2));
  const memEff = Math.min(100, Math.max(0, score - 4));
  const trend = (() => {
    const t = String(raw.trend ?? 'stable');
    if (t === 'increasing') return 'up';
    if (t === 'decreasing') return 'down';
    return 'stable';
  })() as 'up' | 'down' | 'stable';

  return {
    team_name: String(raw.team_name ?? '—'),
    score,
    grade: scoreToGrade(score),
    cpu_efficiency: cpuEff,
    memory_efficiency: memEff,
    issues_count: 0,
    trend,
  };
}

const TeamOptimizationScore: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<TeamOptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/team-accountability/teams`);
      const rows: TeamOptRow[] = (res.data as Record<string, unknown>[]).map(mapTeamOpt);
      setData(rows);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const avgScore = data.length > 0 ? data.reduce((s, r) => s + r.score, 0) / data.length : 0;
  const topTeams = data.filter((r) => r.grade === 'A').length;
  const atRiskTeams = data.filter((r) => r.score < 70).length;
  const totalIssues = data.reduce((s, r) => s + r.issues_count, 0);

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
    if (trend === 'up') return <TrendingUpIcon color="success" fontSize="small" />;
    if (trend === 'down') return <TrendingDownIcon color="error" fontSize="small" />;
    return <TrendingFlatIcon color="action" fontSize="small" />;
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
        <IconButton disabled={loading} onClick={fetchData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

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
        {data.length === 0 && !loading && !error && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No team data available. Ensure the K8s agent is reporting metrics.
          </Typography>
        )}
        {data.length > 0 && (
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
        )}
      </Paper>
    </Box>
  );
};

export default TeamOptimizationScore;

// Made with Bob
