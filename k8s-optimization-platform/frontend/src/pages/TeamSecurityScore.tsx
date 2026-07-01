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
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Group as GroupIcon,
  Shield as ShieldIcon,
  BugReport as BugIcon,
  Security as SecurityIcon,
  GppBad as GppBadIcon,
} from '@mui/icons-material';

interface TeamSecurityRow {
  team_name: string;
  security_score: number;
  grade: string;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  last_scan: string;
}

const DUMMY_DATA: TeamSecurityRow[] = [
  { team_name: 'Infrastructure Team', security_score: 96, grade: 'A', critical_issues: 0, high_issues: 1, medium_issues:  3, last_scan: '2024-07-14 08:30' },
  { team_name: 'DevOps Team',         security_score: 91, grade: 'A', critical_issues: 0, high_issues: 2, medium_issues:  5, last_scan: '2024-07-14 07:15' },
  { team_name: 'Payments Team',       security_score: 87, grade: 'B', critical_issues: 1, high_issues: 3, medium_issues:  6, last_scan: '2024-07-13 22:00' },
  { team_name: 'Frontend Team',       security_score: 83, grade: 'B', critical_issues: 0, high_issues: 4, medium_issues:  9, last_scan: '2024-07-13 21:45' },
  { team_name: 'Security Team',       security_score: 80, grade: 'B', critical_issues: 1, high_issues: 4, medium_issues: 10, last_scan: '2024-07-14 06:00' },
  { team_name: 'Data Engineering',    security_score: 68, grade: 'C', critical_issues: 2, high_issues: 7, medium_issues: 14, last_scan: '2024-07-13 18:30' },
  { team_name: 'Analytics Team',      security_score: 61, grade: 'D', critical_issues: 3, high_issues: 9, medium_issues: 18, last_scan: '2024-07-13 12:00' },
  { team_name: 'ML/AI Team',          security_score: 52, grade: 'F', critical_issues: 5, high_issues: 12, medium_issues: 22, last_scan: '2024-07-12 09:00' },
];

const TeamSecurityScore: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data] = useState<TeamSecurityRow[]>(DUMMY_DATA);
  const [loading] = useState(false);

  const avgScore       = data.reduce((s, r) => s + r.security_score, 0) / data.length;
  const totalCritical  = data.reduce((s, r) => s + r.critical_issues, 0);
  const totalHigh      = data.reduce((s, r) => s + r.high_issues,     0);
  const secureTeams    = data.filter((r) => r.security_score >= 90).length;

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
            Security posture ratings and vulnerability summary per team — {activeClusterName}
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
                <Typography color="text.secondary">Secure Teams</Typography>
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
          Team Security Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team Name</TableCell>
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
      </Paper>
    </Box>
  );
};

export default TeamSecurityScore;

// Made with Bob
