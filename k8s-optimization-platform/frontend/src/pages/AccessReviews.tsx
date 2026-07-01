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
  Button,
  Snackbar,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  HourglassTop as HourglassIcon,
  Block as BlockIcon,
  VerifiedUser as VerifiedUserIcon,
  PersonSearch as PersonSearchIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PlatformUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  teams: string[];
  status: 'approved' | 'pending' | 'rejected' | 'suspended';
  registered_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

interface AccessReviewRow {
  user_id: string;
  user: string;
  email: string;
  role: string;
  teams: string[];
  platform_status: 'approved' | 'pending' | 'rejected' | 'suspended';
  last_review_date: string;
  access_status: 'Approved' | 'Pending' | 'Revoked';
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
}

function deriveRiskLevel(role: string): 'Low' | 'Medium' | 'High' | 'Critical' {
  if (role === 'admin') return 'Critical';
  if (role === 'editor') return 'High';
  if (role === 'viewer') return 'Low';
  return 'Low';
}

function deriveAccessStatus(
  platformStatus: string,
): 'Approved' | 'Pending' | 'Revoked' {
  if (platformStatus === 'approved') return 'Approved';
  if (platformStatus === 'pending') return 'Pending';
  return 'Revoked';
}

const TeamAccessReviews: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<AccessReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/access-review`);
      const users: PlatformUser[] = res.data;
      const rows: AccessReviewRow[] = users.map((u) => ({
        user_id: u.id,
        user: u.username,
        email: u.email,
        role: u.role,
        teams: u.teams,
        platform_status: u.status,
        last_review_date: (u.approved_at ?? u.registered_at).split('T')[0],
        access_status: deriveAccessStatus(u.status),
        risk_level: deriveRiskLevel(u.role),
      }));
      setData(rows);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRevokeAccess = useCallback(async (userId: string, username: string) => {
    try {
      await axios.post(`${API_BASE}/api/v1/users/${userId}/approve`, { status: 'suspended' });
      setToast({ msg: `Access revoked for ${username}`, severity: 'success' });
      fetchData();
    } catch {
      setToast({ msg: `Failed to revoke access for ${username}`, severity: 'error' });
    }
  }, [fetchData]);

  const approved = data.filter((r) => r.access_status === 'Approved').length;
  const pending  = data.filter((r) => r.access_status === 'Pending').length;
  const revoked  = data.filter((r) => r.access_status === 'Revoked').length;
  const critical = data.filter((r) => r.risk_level === 'Critical').length;

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    if (status === 'Approved') return 'success';
    if (status === 'Pending')  return 'warning';
    return 'error';
  };

  const getRiskColor = (risk: string): 'success' | 'info' | 'warning' | 'error' => {
    if (risk === 'Critical') return 'error';
    if (risk === 'High')     return 'warning';
    if (risk === 'Medium')   return 'info';
    return 'success';
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'Approved') return <CheckCircleIcon color="success" fontSize="small" />;
    if (status === 'Pending')  return <HourglassIcon   color="warning" fontSize="small" />;
    return                            <BlockIcon        color="error"   fontSize="small" />;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Access Reviews
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Platform user access review — live from registered users — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={fetchData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <VerifiedUserIcon color="primary" />
                <Typography color="text.secondary">Total Users</Typography>
              </Box>
              <Typography variant="h4" color="primary.main">{data.length}</Typography>
              <Typography variant="body2" color="text.secondary">Registered users</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon color="success" />
                <Typography color="text.secondary">Approved</Typography>
              </Box>
              <Typography variant="h4" color="success.main">{approved}</Typography>
              <Typography variant="body2" color="text.secondary">
                {data.length > 0 ? ((approved / data.length) * 100).toFixed(0) : 0}% of total
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <HourglassIcon color="warning" />
                <Typography color="text.secondary">Pending Review</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">{pending}</Typography>
              <Typography variant="body2" color="text.secondary">
                {revoked} revoked · requires action
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PersonSearchIcon color="error" />
                <Typography color="text.secondary">Critical Risk</Typography>
              </Box>
              <Typography variant="h4" color="error.main">{critical}</Typography>
              <Typography variant="body2" color="text.secondary">High-privilege entries</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Access Review Details
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Teams</TableCell>
                <TableCell>Last Review / Registered</TableCell>
                <TableCell align="center">Access Status</TableCell>
                <TableCell align="center">Risk Level</TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={`${row.user}-${idx}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium" sx={{ fontFamily: 'monospace' }}>
                      {row.user}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{row.email}</TableCell>
                  <TableCell>
                    <Chip label={row.role} size="small" variant="outlined"
                      color={row.role === 'admin' ? 'error' : row.role === 'editor' ? 'warning' : 'default'}
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {row.teams.length === 0
                        ? <Typography variant="body2" color="text.secondary">—</Typography>
                        : row.teams.map((t) => <Chip key={t} label={t} size="small" variant="outlined" />)}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {row.last_review_date}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <StatusIcon status={row.access_status} />
                      <Chip
                        label={row.access_status}
                        color={getStatusColor(row.access_status)}
                        size="small"
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={row.risk_level}
                      color={getRiskColor(row.risk_level)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    {row.access_status === 'Approved' && (
                      <Tooltip title="Revoke access">
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleRevokeAccess(row.user_id, row.user)}
                        >
                          Revoke
                        </Button>
                      </Tooltip>
                    )}
                    {row.access_status === 'Pending' && (
                      <Chip label="Awaiting admin" size="small" color="warning" variant="outlined" />
                    )}
                    {row.access_status === 'Revoked' && (
                      <Chip label="Revoked" size="small" color="error" variant="outlined" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)} variant="filled">
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TeamAccessReviews;

// Made with Bob
