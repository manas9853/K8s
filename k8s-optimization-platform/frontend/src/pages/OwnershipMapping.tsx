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
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  AccountTree as AccountTreeIcon,
  Storage as StorageIcon,
  CloudQueue as CloudQueueIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PlatformUser {
  username: string;
  email: string;
  full_name: string;
  teams: string[];
  role: string;
  status: string;
}

interface OwnershipRow {
  resource_name: string;
  resource_type: 'Namespace' | 'Deployment' | 'Service';
  owner_team: string;
  owner_contact: string;
  owner_name: string;
  environment: string;
  last_updated: string;
}

/** Derive environment from namespace labels or name convention */
function inferEnvironment(ns: Record<string, unknown>): string {
  const labels = (ns.labels as Record<string, string>) || {};
  const env =
    labels['environment'] ||
    labels['env'] ||
    labels['app.kubernetes.io/environment'] ||
    '';
  if (env) return env;
  const name = String(ns.name || ns.namespace || '');
  if (name.includes('prod')) return 'Production';
  if (name.includes('staging') || name.includes('stg')) return 'Staging';
  if (name.includes('dev') || name.includes('development')) return 'Development';
  return 'Production';
}

/** Extract team from namespace labels */
function inferTeam(ns: Record<string, unknown>): string {
  const labels = (ns.labels as Record<string, string>) || {};
  return (
    labels['app.kubernetes.io/part-of'] ||
    labels['team'] ||
    labels['owner'] ||
    String(ns.name || ns.namespace || 'platform')
  );
}

const RESOURCE_TYPE_ICONS: Record<string, React.ReactElement> = {
  Namespace: <StorageIcon fontSize="small" color="primary" />,
  Deployment: <CloudQueueIcon fontSize="small" color="secondary" />,
  Service: <LinkIcon fontSize="small" color="action" />,
};

const OwnershipMapping: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<OwnershipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch live resources in parallel
      const [usersRes, workloadsRes, namespacesRes] = await Promise.allSettled([
        axios.get<PlatformUser[]>(`${API_BASE}/api/v1/users/?status_filter=approved`),
        axios.get<Record<string, unknown>[]>(`${API_BASE}/api/v1/workloads/?cluster_id=${encodeURIComponent(activeClusterName || '')}`),
        axios.get<Record<string, unknown>[]>(`${API_BASE}/api/v1/clusters/namespaces?cluster_id=${encodeURIComponent(activeClusterName || '')}`),
      ]);

      // Build team → contact map from registered users
      const teamContact: Record<string, { name: string; email: string }> = {};
      if (usersRes.status === 'fulfilled') {
        usersRes.value.data.forEach((u) => {
          u.teams.forEach((team) => {
            if (!teamContact[team]) {
              teamContact[team] = { name: u.username, email: u.email };
            }
          });
        });
      }

      const rows: OwnershipRow[] = [];

      // Add namespace rows from live cluster data
      if (namespacesRes.status === 'fulfilled') {
        const namespaces = namespacesRes.value.data;
        namespaces.forEach((ns) => {
          const name = String(ns.name || ns.namespace || '');
          if (!name || name.startsWith('kube-')) return;
          const team = inferTeam(ns);
          const contact = teamContact[team] ?? { name: 'unassigned', email: '' };
          rows.push({
            resource_name: name,
            resource_type: 'Namespace',
            owner_team: team,
            owner_contact: contact.email,
            owner_name: contact.name,
            environment: inferEnvironment(ns),
            last_updated: String(ns.created_at || ns.created || '—'),
          });
        });
      }

      // Add deployment rows from workloads API
      if (workloadsRes.status === 'fulfilled') {
        const deployments = workloadsRes.value.data;
        deployments.forEach((dep) => {
          const name = String(dep.name || '');
          const ns = String(dep.namespace || 'default');
          if (!name) return;
          const nsLabels = (dep.labels as Record<string, string>) || {};
          const team =
            nsLabels['app.kubernetes.io/part-of'] ||
            nsLabels['team'] ||
            nsLabels['owner'] ||
            ns.split('-')[0];
          const contact = teamContact[team] ?? { name: 'unassigned', email: '' };
          rows.push({
            resource_name: name,
            resource_type: 'Deployment',
            owner_team: team,
            owner_contact: contact.email,
            owner_name: contact.name,
            environment: ns.includes('prod') ? 'Production' : ns.includes('staging') ? 'Staging' : 'Development',
            last_updated: String(dep.created_at || dep.created || '—'),
          });
        });
      }

      setData(rows);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [activeClusterName]);

  useEffect(() => { buildRows(); }, [buildRows]);

  const namespaceCount  = data.filter((r) => r.resource_type === 'Namespace').length;
  const deploymentCount = data.filter((r) => r.resource_type === 'Deployment').length;
  const serviceCount    = data.filter((r) => r.resource_type === 'Service').length;
  const uniqueTeams     = new Set(data.map((r) => r.owner_team)).size;

  const getEnvColor = (env: string): 'error' | 'warning' | 'info' | 'default' => {
    if (env === 'Production')  return 'error';
    if (env === 'Staging')     return 'warning';
    if (env === 'Development') return 'info';
    return 'default';
  };

  const getTypeColor = (type: string): 'primary' | 'secondary' | 'default' => {
    if (type === 'Namespace')  return 'primary';
    if (type === 'Deployment') return 'secondary';
    return 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Ownership Mapping
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Resource ownership registry — contacts from registered platform users — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={buildRows}>
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
                <AccountTreeIcon color="primary" />
                <Typography color="text.secondary">Total Resources</Typography>
              </Box>
              <Typography variant="h4" color="primary.main">{data.length}</Typography>
              <Typography variant="body2" color="text.secondary">Mapped resources</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <StorageIcon color="secondary" />
                <Typography color="text.secondary">Namespaces</Typography>
              </Box>
              <Typography variant="h4" color="secondary.main">{namespaceCount}</Typography>
              <Typography variant="body2" color="text.secondary">
                + {deploymentCount} deployments · {serviceCount} services
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CloudQueueIcon color="action" />
                <Typography color="text.secondary">Owning Teams</Typography>
              </Box>
              <Typography variant="h4" color="text.primary">{uniqueTeams}</Typography>
              <Typography variant="body2" color="text.secondary">Distinct teams with ownership</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LinkIcon color="error" />
                <Typography color="text.secondary">Production Resources</Typography>
              </Box>
              <Typography variant="h4" color="error.main">
                {data.filter((r) => r.environment === 'Production').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Live environment</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Resource Ownership Registry
        </Typography>
        {data.length === 0 && !loading && !error && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No resources found. Ensure the K8s agent is connected and reporting.
          </Typography>
        )}
        {data.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Resource Name</TableCell>
                  <TableCell>Resource Type</TableCell>
                  <TableCell>Owner Team</TableCell>
                  <TableCell>Owner (Registered User)</TableCell>
                  <TableCell>Contact Email</TableCell>
                  <TableCell align="center">Environment</TableCell>
                  <TableCell>Last Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={`${row.resource_name}-${idx}`} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {RESOURCE_TYPE_ICONS[row.resource_type] ?? RESOURCE_TYPE_ICONS.Namespace}
                        <Typography variant="body2" fontWeight="medium">
                          {row.resource_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.resource_type}
                        color={getTypeColor(row.resource_type)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.owner_team}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: 'primary.light' }}>
                          {row.owner_name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Tooltip title={row.owner_name}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {row.owner_name}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="primary.main" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {row.owner_contact || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.environment}
                        color={getEnvColor(row.environment)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.last_updated}
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

export default OwnershipMapping;

// Made with Bob
