import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Tooltip, IconButton,
  CircularProgress, Tab, Tabs, Divider,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PlatformUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  teams: string[];
  status: string;
}

const RBAC_ROLES = [
  { roleName: 'admin',     label: 'Admin',    scope: 'Cluster',   description: 'Full platform access. Can manage users, clusters, and all resources.', permissions: ['read', 'write', 'delete', 'approve_users', 'manage_rbac'] },
  { roleName: 'editor',    label: 'Editor',   scope: 'Namespace', description: 'Can view and modify resources. Cannot manage users or RBAC.', permissions: ['read', 'write'] },
  { roleName: 'viewer',    label: 'Viewer',   scope: 'Namespace', description: 'Read-only access to dashboards and reports.', permissions: ['read'] },
  { roleName: 'readonly',  label: 'ReadOnly', scope: 'Cluster',   description: 'Minimal read-only access. Cannot modify any settings.', permissions: ['read'] },
];

const SEED_USERS: PlatformUser[] = [
  { id: '1', username: 'alice.chen', email: 'alice.chen@corp.io', full_name: 'Alice Chen', role: 'admin', teams: ['Platform', 'SRE'], status: 'approved' },
  { id: '2', username: 'bob.martin', email: 'bob.martin@corp.io', full_name: 'Bob Martin', role: 'editor', teams: ['DevOps'], status: 'approved' },
  { id: '3', username: 'carol.james', email: 'carol.james@corp.io', full_name: 'Carol James', role: 'viewer', teams: ['Security'], status: 'pending' },
  { id: '4', username: 'david.kim', email: 'david.kim@corp.io', full_name: 'David Kim', role: 'readonly', teams: ['Finance'], status: 'pending' },
  { id: '5', username: 'emma.rodriguez', email: 'emma.rodriguez@corp.io', full_name: 'Emma Rodriguez', role: 'editor', teams: ['Platform', 'DevOps'], status: 'approved' },
  { id: '6', username: 'frank.nguyen', email: 'frank.nguyen@corp.io', full_name: 'Frank Nguyen', role: 'viewer', teams: ['SRE'], status: 'suspended' },
];

const roleChipColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  admin: 'error', editor: 'warning', viewer: 'info', readonly: 'default',
};
const statusColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success', pending: 'warning', rejected: 'error', suspended: 'default',
};

const RBACAdmin: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/`);
      setUsers(res.data);
    } catch {
      setUsers(SEED_USERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const byRole = (role: string) => users.filter((u) => u.role === role && u.status === 'approved');

  const totalRoles = RBAC_ROLES.length;
  const clusterRoles = RBAC_ROLES.filter((r) => r.scope === 'Cluster').length;
  const approvedUsers = users.filter((u) => u.status === 'approved').length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>RBAC Administration</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Role definitions and user-to-role assignments across the platform
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchUsers} disabled={loading}>
            {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Total Roles', value: totalRoles, color: 'text.primary' },
          { label: 'Cluster-Scoped Roles', value: clusterRoles, color: 'primary.main' },
          { label: 'Active Assigned Users', value: approvedUsers, color: 'success.main' },
          { label: 'Total Users', value: users.length, color: 'warning.main' },
        ].map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.label}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{c.label}</Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, color: c.color }}>{c.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Role Definitions" />
        <Tab label="User → Role Mapping" />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      {/* Tab 0: Role definitions */}
      {tab === 0 && (
        <Paper elevation={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Role</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell align="center">Assigned Users</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {RBAC_ROLES.map((r) => (
                  <TableRow key={r.roleName} hover>
                    <TableCell>
                      <Chip label={r.label} color={roleChipColor[r.roleName]} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={r.scope}
                        color={r.scope === 'Cluster' ? 'primary' : 'secondary'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2">{r.description}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {r.permissions.map((p) => (
                          <Chip key={p} label={p} size="small" variant="outlined" color="default"
                            sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="h6" fontWeight={700}>{byRole(r.roleName).length}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab 1: User → Role mapping */}
      {tab === 1 && (
        <Paper elevation={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Username</TableCell>
                  <TableCell>Full Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Teams</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{u.username}</TableCell>
                    <TableCell>{u.full_name || '—'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{u.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={u.role}
                        color={roleChipColor[u.role] ?? 'default'}
                        size="small"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {u.teams.length === 0
                          ? <Typography variant="body2" color="text.secondary">—</Typography>
                          : u.teams.map((t) => <Chip key={t} label={t} size="small" variant="outlined" />)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.status}
                        color={statusColor[u.status] ?? 'default'}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default RBACAdmin;
// Made with Bob
