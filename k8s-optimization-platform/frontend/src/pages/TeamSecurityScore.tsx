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
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Group as GroupIcon,
  Shield as ShieldIcon,
  BugReport as BugIcon,
  Security as SecurityIcon,
  GppBad as GppBadIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface TeamSecurityRow {
  team_name: string;
  security_score: number;
  grade: string;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  last_scan: string;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Maps /api/v1/scoring/namespace (per-namespace security) into per-team rows.
 * Falls back to /api/v1/team-accountability/teams if the scoring endpoint is empty.
 */
function mapScoringRow(raw: Record<string, unknown>): TeamSecurityRow {
  const score = Number(raw.security_score ?? raw.score ?? 0);
  const ns = String(raw.namespace ?? raw.team_name ?? '—');
  return {
    team_name: ns,
    security_score: score,
    grade: scoreToGrade(score),
    critical_issues: Number(raw.critical_issues ?? 0),
    high_issues: Number(raw.high_issues ?? 0),
    medium_issues: Number(raw.medium_issues ?? 0),
    last_scan: String(raw.last_updated ?? raw.last_scan ?? new Date().toISOString()),
  };
}

const TeamSecurityScore: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<TeamSecurityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary: per-namespace security scores from scoring API
      const res = await axios.get(`${API_BASE}/api/v1/scoring/namespace`);
      const rows: TeamSecurityRow[] = (res.data as Record<string, unknown>[]).map(mapScoringRow);
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

  const avgScore = data.length > 0 ? data.reduce((s, r) => s + r.security_score, 0) / data.length : 0;
  const totalCritical = data.reduce((s, r) => s + r.critical_issues, 0);
  const totalHigh = data.reduce((s, r) => s + r.high_issues, 0);
  const secureTeams = data.filter((r) => r.security_score >= 90).length;

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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Team Security Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Security posture ratings and vulnerability summary per namespace — {activeClusterName}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SecurityIcon color="primary" />
                <Typography color="text.secondary">Avg Security Score</Typography>
              </Box>
              <Typography variant="h4" color={`${getScoreColor(avgScore)}.main`}>
                {avgScore.toFixed(1)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Platform-wide average
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ShieldIcon color="success" />
                <Typography color="text.secondary">Secure Namespaces</Typography>
              </Box>
              <Typography variant="h4" color="success.main">{secureTeams}</Typography>
              <Typography variant="body2" color="text.secondary">Score ≥ 90</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <GppBadIcon color="error" />
                <Typography color="text.secondary">Critical Issues</Typography>
              </Box>
              <Typography variant="h4" color="error.main">{totalCritical}</Typography>
              <Typography variant="body2" color="text.secondary">Requires immediate action</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <BugIcon color="warning" />
                <Typography color="text.secondary">High Issues</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">{totalHigh}</Typography>
              <Typography variant="body2" color="text.secondary">Requires attention soon</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Namespace Security Details
        </Typography>
        {data.length === 0 && !loading && !error && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No security score data available. Ensure the K8s agent is reporting metrics.
          </Typography>
        )}
        {data.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Namespace / Team</TableCell>
                  <TableCell align="center">Security Score (0–100)</TableCell>
                  <TableCell align="center">Grade</TableCell>
                  <TableCell align="center">Critical Issues</TableCell>
                  <TableCell align="center">High Issues</TableCell>
                  <TableCell align="center">Medium Issues</TableCell>
                  <TableCell>Last Scan</TableCell>
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
                      <Box>
                        <Typography variant="body2" gutterBottom fontWeight="bold">
                          {row.security_score}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={row.security_score}
                          color={getScoreColor(row.security_score)}
                          sx={{ borderRadius: 1 }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={row.grade} color={getGradeColor(row.grade)} size="small" />
                    </TableCell>
                    <TableCell align="center">
                      {row.critical_issues > 0 ? (
                        <Chip label={row.critical_issues} color="error" size="small" />
                      ) : (
                        <Chip label="0" color="success" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {row.high_issues > 5 ? (
                        <Chip label={row.high_issues} color="error" size="small" variant="outlined" />
                      ) : row.high_issues > 0 ? (
                        <Chip label={row.high_issues} color="warning" size="small" variant="outlined" />
                      ) : (
                        <Chip label="0" color="success" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.medium_issues}
                        color={row.medium_issues > 15 ? 'warning' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.last_scan}
                      </Typography>
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

export default TeamSecurityScore;

// Made with Bob
