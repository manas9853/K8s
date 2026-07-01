import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

const Audit: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/audit/logs${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/audit/summary${clusterParam}`),
      ]);
      setLogs(await logsRes.json());
      setSummary(await summaryRes.json());
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log =>
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resource.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Audit & Compliance</Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>Total Actions</Typography>
                <Typography variant="h4">{summary.total_actions}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>Today</Typography>
                <Typography variant="h4">{summary.actions_today}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>Active Users</Typography>
                <Typography variant="h4">{summary.active_users}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>Savings Generated</Typography>
                <Typography variant="h4">${summary.total_savings.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          label="Search audit logs"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by action, user, or resource..."
        />
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Savings</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.log_id}>
                  <TableCell>
                    <Typography variant="caption">
                      {new Date(log.timestamp).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                      {log.user}
                    </Box>
                  </TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.resource}</TableCell>
                  <TableCell>{log.cluster}</TableCell>
                  <TableCell>
                    <Chip
                      icon={<CheckCircleIcon />}
                      label={log.status.toUpperCase()}
                      color={log.status === 'success' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {log.savings_generated > 0 && (
                      <Chip
                        label={`$${log.savings_generated}`}
                        color="success"
                        size="small"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {loading && <LinearProgress />}
    </Box>
  );
};

export default Audit;

// Made with Bob
