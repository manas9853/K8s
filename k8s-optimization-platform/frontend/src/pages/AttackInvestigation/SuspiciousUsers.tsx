import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  PersonSearch as UserIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface SuspiciousUser {
  username: string;
  type: string;
  namespace: string;
  risk_score: number;
  suspicious_activities: string[];
  last_activity: string;
  first_detected: string;
  permissions: string[];
  pods_using?: string[];
}

interface UserData {
  total_suspicious: number;
  suspicious_users: SuspiciousUser[];
  cluster_name?: string;
  last_updated?: string;
}

const RISK_COLOR = (score: number) => {
  if (score >= 80) return '#ef5350';
  if (score >= 60) return '#ffa726';
  if (score >= 40) return '#90caf9';
  return '#a5d6a7';
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildReason(user: SuspiciousUser): string[] {
  const reasons: string[] = [];

  if (user.type === 'service_account') {
    reasons.push(
      `This is the default service account for namespace "${user.namespace}". Default service accounts are not scoped to a single workload, so any pod using them can inherit the same API access.`,
    );
  }

  if (user.pods_using && user.pods_using.length > 0) {
    reasons.push(
      `${user.pods_using.length} pod${user.pods_using.length > 1 ? 's are' : ' is'} currently using this identity: ${user.pods_using.slice(0, 3).join(', ')}${user.pods_using.length > 3 ? ` +${user.pods_using.length - 3} more` : ''}.`,
    );
  }

  if (user.permissions.includes('cluster-admin')) {
    reasons.push(`Has cluster-admin permission — unrestricted access to all cluster resources.`);
  } else if (user.permissions.length > 0) {
    reasons.push(`Permissions granted: ${user.permissions.join(', ')}.`);
  }

  if (user.suspicious_activities.length > 0) {
    reasons.push(...user.suspicious_activities);
  }

  reasons.push(
    `Risk score ${user.risk_score} — first detected ${formatTimestamp(user.first_detected)}, last active ${formatTimestamp(user.last_activity)}.`,
  );

  return reasons;
}

const UserRow: React.FC<{ user: SuspiciousUser }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const riskColor = RISK_COLOR(user.risk_score);
  const reasons = buildReason(user);

  return (
    <>
      <TableRow hover sx={{ '&:hover': { bgcolor: '#232d3f' } }}>
        <TableCell sx={{ color: '#e8eaf0', borderColor: '#2a3245', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
          {user.username}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip
            label={user.type}
            size="small"
            sx={{ bgcolor: '#2a3245', color: user.type === 'service_account' ? '#90caf9' : '#8892a4', fontSize: 10 }}
          />
        </TableCell>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', fontFamily: 'monospace', fontSize: 12 }}>
          {user.namespace}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Chip label={String(user.risk_score)} size="small" sx={{ bgcolor: '#2a3245', color: riskColor, fontWeight: 'bold' }} />
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {user.permissions.slice(0, 2).map((permission) => (
              <Chip
                key={permission}
                label={permission}
                size="small"
                sx={{ bgcolor: '#2a3245', color: permission === 'cluster-admin' ? '#ef5350' : '#8892a4', fontSize: 10, height: 20 }}
              />
            ))}
            {user.permissions.length > 2 && (
              <Chip label={`+${user.permissions.length - 2}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap', fontSize: 11 }}>
          {formatTimestamp(user.last_activity)}
        </TableCell>
        <TableCell sx={{ color: '#8892a4', borderColor: '#2a3245', whiteSpace: 'nowrap', fontSize: 11 }}>
          {formatTimestamp(user.first_detected)}
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <Box display="flex" flexWrap="wrap" gap={0.5}>
            {user.suspicious_activities.slice(0, 1).map((activity) => (
              <Chip key={activity} label={activity} size="small" sx={{ bgcolor: '#2a3245', color: '#ffa726', fontSize: 10, height: 20, maxWidth: 200 }} />
            ))}
            {user.suspicious_activities.length > 1 && (
              <Chip label={`+${user.suspicious_activities.length - 1}`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10, height: 20 }} />
            )}
          </Box>
        </TableCell>
        <TableCell sx={{ borderColor: '#2a3245' }}>
          <IconButton size="small" onClick={() => setOpen((v) => !v)} sx={{ color: '#90caf9' }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: '#131d2e' }}>
        <TableCell colSpan={9} sx={{ p: 0, borderColor: open ? '#2a3245' : 'transparent' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#ffa726', mb: 1.5 }}>
                Why "{user.username}" is flagged as suspicious
              </Typography>
              <Stack spacing={1} mb={2}>
                {reasons.map((reason) => (
                  <Typography key={reason} variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                    • {reason}
                  </Typography>
                ))}
              </Stack>

              {user.pods_using && user.pods_using.length > 0 && (
                <Box sx={{ p: 1.5, bgcolor: '#1e2433', border: '1px solid #2a3245', borderRadius: 1 }}>
                  <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 700, display: 'block', mb: 0.75 }}>
                    Pods using this identity
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75}>
                    {user.pods_using.map((pod) => (
                      <Chip key={pod} label={pod} size="small" sx={{ bgcolor: '#2a3245', color: '#90caf9', fontSize: 10 }} />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const SuspiciousUsersInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-hunting/suspicious-users${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: UserData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suspicious users');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const users = useMemo(() => (Array.isArray(data?.suspicious_users) ? data!.suspicious_users : []), [data]);
  const criticalCount = useMemo(() => users.filter((u) => u.risk_score >= 80).length, [users]);
  const serviceAccountCount = useMemo(() => users.filter((u) => u.type === 'service_account').length, [users]);
  const highRisk = useMemo(() => users.filter((u) => u.risk_score >= 60), [users]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load suspicious users</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <UserIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Suspicious Users
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real threat-hunting output for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Suspicious', value: data.total_suspicious, color: '#ef5350' },
          { label: 'Critical Risk (≥80)', value: criticalCount, color: '#ef5350' },
          { label: 'Service Accounts', value: serviceAccountCount, color: '#90caf9' },
          { label: 'High Risk (≥60)', value: highRisk.length, color: '#ffa726' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {highRisk.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            High-Risk Identities — Why They Were Flagged
          </Typography>
          <Stack spacing={1.5}>
            {highRisk.slice(0, 4).map((user) => (
              <Box key={`${user.namespace}-${user.username}`} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0', fontFamily: 'monospace' }}>
                    {user.username}
                  </Typography>
                  <Chip label={`Risk ${user.risk_score}`} size="small" sx={{ bgcolor: '#2a3245', color: RISK_COLOR(user.risk_score), fontWeight: 'bold', fontSize: 10 }} />
                </Box>
                <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                  {buildReason(user)[0]}
                </Typography>
                <Typography variant="caption" sx={{ color: '#8892a4' }}>
                  Namespace: {user.namespace} · Type: {user.type} · Permissions: {user.permissions.join(', ') || 'N/A'}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
        <Box p={2}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
            Detected Suspicious Users ({users.length})
          </Typography>
          <Typography variant="caption" sx={{ color: '#8892a4' }}>
            Derived from default service accounts used by suspicious pods. Expand a row for the full reason and pods list.
          </Typography>
        </Box>
        {users.length === 0 ? (
          <Box p={4}>
            <Paper elevation={0} sx={{ maxWidth: 600, mx: 'auto', p: 4, border: '1px solid #2a3245', borderRadius: 2, bgcolor: '#131d2e', textAlign: 'center' }}>
              <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1 }}>
                No suspicious users found
              </Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.7 }}>
                Suspicious identities are derived from pods using the default service account. The current cluster scan found no pods matching that condition.
              </Typography>
            </Paper>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Username', 'Type', 'Namespace', 'Risk', 'Permissions', 'Last Activity', 'First Detected', 'Activities', 'Why'].map((heading) => (
                    <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 12, color: '#8892a4', bgcolor: '#131d2e', borderColor: '#2a3245', whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => <UserRow key={`${user.namespace}-${user.username}`} user={user} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

const SuspiciousUsers: React.FC = () => (
  <ClusterGuard>
    <SuspiciousUsersInner />
  </ClusterGuard>
);

export default SuspiciousUsers;
