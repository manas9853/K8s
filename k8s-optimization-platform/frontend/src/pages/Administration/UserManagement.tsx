import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem,
  TextField, Snackbar, Alert, IconButton,
  Tooltip, Badge, Divider, CircularProgress,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as EditIcon,
  Block as SuspendIcon,
  Delete as DeleteIcon,
  PersonAdd as PendingIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const VALID_ROLES = ['admin', 'editor', 'viewer', 'readonly'];
const VALID_TEAMS = [
  'Platform', 'SRE', 'DevOps', 'Security', 'Finance',
  'Compliance', 'Analytics', 'Payments', 'Frontend',
  'Infrastructure', 'ML/AI', 'Data Engineering',
];

interface PlatformUser {
  id: string;
  clerk_user_id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  teams: string[];
  status: 'approved' | 'pending' | 'rejected' | 'suspended';
  mfa_enabled: boolean;
  last_login: string | null;
  registered_at: string;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  org_id: string;
}

const roleColor: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  admin: 'error',
  editor: 'warning',
  viewer: 'info',
  readonly: 'default',
};

const statusColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  suspended: 'default',
};

/* ---------- Edit dialog ---------- */
interface EditDialogProps {
  open: boolean;
  user: PlatformUser | null;
  onClose: () => void;
  onSave: (id: string, role: string, teams: string[], notes: string, org_id: string) => void;
}
const EditDialog: React.FC<EditDialogProps> = ({ open, user, onClose, onSave }) => {
  const [role, setRole] = useState('viewer');
  const [teams, setTeams] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setTeams(user.teams);
      setNotes(user.notes ?? '');
      setOrgId(user.org_id ?? '');
    }
  }, [user]);

  if (!user) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit User — {user.username}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">{user.email}</Typography>

        <TextField
          label="Organisation ID"
          size="small"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          helperText="Cluster access is restricted to this org — must match the cluster's org_id"
          required
        />

        <FormControl fullWidth size="small">
          <InputLabel>Role</InputLabel>
          <Select value={role} label="Role" onChange={(e) => setRole(e.target.value)}>
            {VALID_ROLES.map((r) => (
              <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Teams</InputLabel>
          <Select
            multiple
            value={teams}
            label="Teams"
            onChange={(e) => setTeams(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as string[])}
            renderValue={(selected) => (selected as string[]).join(', ')}
          >
            {VALID_TEAMS.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Notes"
          multiline
          rows={2}
          size="small"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { onSave(user.id, role, teams, notes, orgId); onClose(); }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/* ---------- Approve dialog ---------- */
interface ApproveDialogProps {
  open: boolean;
  user: PlatformUser | null;
  onClose: () => void;
  onApprove: (id: string, role: string, teams: string[], org_id: string) => void;
}
const ApproveDialog: React.FC<ApproveDialogProps> = ({ open, user, onClose, onApprove }) => {
  const [role, setRole] = useState('viewer');
  const [teams, setTeams] = useState<string[]>([]);
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    if (user) {
      setRole(user.role || 'viewer');
      setTeams(user.teams || []);
      setOrgId(user.org_id || '');
    }
  }, [user]);

  if (!user) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Approve User — {user.username}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">{user.email}</Typography>

        <TextField
          label="Organisation ID"
          size="small"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          helperText="User will only see clusters belonging to this org (e.g. xforce-devops)"
          required
        />

        <FormControl fullWidth size="small">
          <InputLabel>Assign Role</InputLabel>
          <Select value={role} label="Assign Role" onChange={(e) => setRole(e.target.value)}>
            {VALID_ROLES.map((r) => (
              <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>{r}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Assign Teams</InputLabel>
          <Select
            multiple
            value={teams}
            label="Assign Teams"
            onChange={(e) => setTeams(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as string[])}
            renderValue={(selected) => (selected as string[]).join(', ')}
          >
            {VALID_TEAMS.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          disabled={!orgId.trim()}
          onClick={() => { onApprove(user.id, role, teams, orgId); onClose(); }}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/* ---------- Main component ---------- */
const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [editTarget, setEditTarget] = useState<PlatformUser | null>(null);
  const [approveTarget, setApproveTarget] = useState<PlatformUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/`);
      setUsers(res.data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const callApprove = async (id: string, newStatus: string, role?: string, teams?: string[], org_id?: string) => {
    try {
      await axios.post(`${API_BASE}/api/v1/users/${id}/approve`, { status: newStatus, role, teams, org_id });
      setToast({ msg: `User ${newStatus} successfully`, severity: 'success' });
      fetchUsers();
    } catch (e: any) {
      setToast({ msg: e.response?.data?.detail || 'Failed to update user status', severity: 'error' });
    }
  };

  const callDelete = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/api/v1/users/${id}`);
      setToast({ msg: 'User deleted successfully', severity: 'success' });
      fetchUsers();
    } catch (e: any) {
      setToast({ msg: e.response?.data?.detail || 'Failed to delete user', severity: 'error' });
    }
  };

  const callUpdate = async (id: string, role: string, teams: string[], notes: string, org_id: string) => {
    try {
      await axios.patch(`${API_BASE}/api/v1/users/${id}`, { role, teams, notes, org_id });
      setToast({ msg: 'User updated successfully', severity: 'success' });
      fetchUsers();
    } catch {
      setToast({ msg: 'Failed to update user', severity: 'error' });
    }
  };

  // Summary metrics
  const total = users.length;
  const approved = users.filter((u) => u.status === 'approved').length;
  const pending = users.filter((u) => u.status === 'pending').length;
  const mfaCount = users.filter((u) => u.mfa_enabled).length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            User Management
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage platform users, approve registrations, assign roles and teams
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {pending > 0 && (
            <Chip
              icon={<PendingIcon />}
              label={`${pending} pending approval`}
              color="warning"
              variant="outlined"
            />
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchUsers} disabled={loading}>
              {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[
          { label: 'Total Users', value: total, color: 'text.primary' },
          { label: 'Active (Approved)', value: approved, color: 'success.main' },
          { label: 'Pending Approval', value: pending, color: 'warning.main' },
          { label: 'MFA Enabled', value: mfaCount, color: 'info.main' },
        ].map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.label}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {c.label}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, color: c.color }}>
                  {c.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Pending approval section */}
      {isAdmin && pending > 0 && (
        <Paper elevation={2} sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'warning.light', bgcolor: '#fffde7' }}>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700, color: 'warning.dark' }}>
            ⚠ Pending Approvals ({pending})
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.filter((u) => u.status === 'pending').map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {new Date(u.registered_at).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{u.notes ?? '—'}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="Approve">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<ApproveIcon />}
                          onClick={() => setApproveTarget(u)}
                        >
                          Approve
                        </Button>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<RejectIcon />}
                          onClick={() => callApprove(u.id, 'rejected')}
                        >
                          Reject
                        </Button>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* All users table */}
      <Paper elevation={2}>
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="h6" fontWeight={700}>All Platform Users</Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell>Username</TableCell>
                <TableCell>Full Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Org ID</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Teams</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                {isAdmin && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                <TableCell>{u.full_name || '—'}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem' }}>{u.email}</TableCell>
                <TableCell>
                  <Chip
                    label={u.org_id || 'unset'}
                    size="small"
                    variant="outlined"
                    color={u.org_id && u.org_id !== 'default' ? 'primary' : 'default'}
                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell>
                    <Chip
                      label={u.role}
                      color={roleColor[u.role] ?? 'default'}
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
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {u.last_login ?? 'Never'}
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Edit role / teams">
                          <IconButton size="small" onClick={() => setEditTarget(u)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {u.status === 'pending' && (
                          <Tooltip title="Approve">
                            <IconButton size="small" color="success" onClick={() => setApproveTarget(u)}>
                              <ApproveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {u.status === 'approved' && (
                          <Tooltip title="Suspend">
                            <IconButton size="small" color="error" onClick={() => callApprove(u.id, 'suspended')}>
                              <SuspendIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {u.status === 'suspended' && (
                          <Tooltip title="Re-activate">
                            <IconButton size="small" color="success" onClick={() => callApprove(u.id, 'approved')}>
                              <ApproveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* BUG-F01: removed hardcoded email guard — deletion is now available for all non-current-user accounts */}
                        {(
                          <Tooltip title="Delete user permanently">
                            <IconButton size="small" color="error" onClick={() => callDelete(u.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialogs */}
      <ApproveDialog
        open={!!approveTarget}
        user={approveTarget}
        onClose={() => setApproveTarget(null)}
        onApprove={(id, role, teams, org_id) => callApprove(id, 'approved', role, teams, org_id)}
      />
      <EditDialog
        open={!!editTarget}
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={callUpdate}
      />

      {/* Toast */}
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

export default UserManagement;
// Made with Bob
