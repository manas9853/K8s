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
  AttachMoney as AttachMoneyIcon,
  Savings as SavingsIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface TeamCostRow {
  team_name: string;
  namespace_count: number;
  pod_count: number;
  monthly_cost: number;
  wasted_cost: number;
  savings_opportunity: number;
}

/** Maps the /api/v1/team-accountability/teams response shape onto TeamCostRow */
function mapTeamCost(raw: Record<string, unknown>): TeamCostRow {
  const total = Number(raw.total_cost ?? 0);
  const waste = Number(raw.waste ?? 0);
  const savings = Number(raw.potential_savings ?? 0);
  const savingsPct = total > 0 ? Math.round((savings / total) * 100) : 0;
  return {
    team_name: String(raw.team_name ?? '—'),
    namespace_count: Number(raw.namespace_count ?? 0),
    pod_count: Number(raw.resource_count ?? 0),
    monthly_cost: total,
    wasted_cost: waste,
    savings_opportunity: savingsPct,
  };
}

const TeamCostAnalysis: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<TeamCostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/team-accountability/teams`);
      const rows: TeamCostRow[] = (res.data as Record<string, unknown>[]).map(mapTeamCost);
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

  const totalMonthly = data.reduce((s, r) => s + r.monthly_cost, 0);
  const totalWasted = data.reduce((s, r) => s + r.wasted_cost, 0);
  const totalSavings = data.reduce((s, r) => s + r.wasted_cost * (r.savings_opportunity / 100), 0);
  const avgSavingsOpportunity =
    data.length > 0 ? data.reduce((s, r) => s + r.savings_opportunity, 0) / data.length : 0;

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
                {totalMonthly > 0 ? ((totalWasted / totalMonthly) * 100).toFixed(1) : '0.0'}% of total spend
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
        {data.length === 0 && !loading && !error && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No team cost data available. Ensure the K8s agent is reporting metrics.
          </Typography>
        )}
        {data.length > 0 && (
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
        )}
      </Paper>
    </Box>
  );
};

export default TeamCostAnalysis;

// Made with Bob
