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
  environment: 'Production' | 'Staging' | 'Development';
  last_updated: string;
}

// Static K8s resource map — owner_team links to registered users
const BASE_RESOURCES: Omit<OwnershipRow, 'owner_contact' | 'owner_name'>[] = [
  { resource_name: 'payments-prod',     resource_type: 'Namespace',   owner_team: 'Payments',        environment: 'Production',  last_updated: '2024-07-10' },
  { resource_name: 'payment-gateway',   resource_type: 'Deployment',  owner_team: 'Payments',        environment: 'Production',  last_updated: '2024-07-12' },
  { resource_name: 'payment-svc',       resource_type: 'Service',     owner_team: 'Payments',        environment: 'Production',  last_updated: '2024-07-12' },
  { resource_name: 'analytics-prod',    resource_type: 'Namespace',   owner_team: 'Analytics',       environment: 'Production',  last_updated: '2024-07-08' },
  { resource_name: 'data-pipeline',     resource_type: 'Deployment',  owner_team: 'Analytics',       environment: 'Production',  last_updated: '2024-07-09' },
  { resource_name: 'analytics-staging', resource_type: 'Namespace',   owner_team: 'Analytics',       environment: 'Staging',     last_updated: '2024-07-01' },
  { resource_name: 'frontend-prod',     resource_type: 'Namespace',   owner_team: 'Frontend',        environment: 'Production',  last_updated: '2024-07-11' },
  { resource_name: 'web-app',           resource_type: 'Deployment',  owner_team: 'Frontend',        environment: 'Production',  last_updated: '2024-07-13' },
  { resource_name: 'ml-training',       resource_type: 'Namespace',   owner_team: 'ML/AI',           environment: 'Production',  last_updated: '2024-06-28' },
  { resource_name: 'model-training-job',resource_type: 'Deployment',  owner_team: 'ML/AI',           environment: 'Development', last_updated: '2024-07-05' },
  { resource_name: 'monitoring',        resource_type: 'Namespace',   owner_team: 'Infrastructure',  environment: 'Production',  last_updated: '2024-07-14' },
  { resource_name: 'prometheus',        resource_type: 'Deployment',  owner_team: 'Infrastructure',  environment: 'Production',  last_updated: '2024-07-14' },
  { resource_name: 'ci-cd',            resource_type: 'Namespace',   owner_team: 'DevOps',          environment: 'Production',  last_updated: '2024-07-13' },
  { resource_name: 'argo-cd',          resource_type: 'Deployment',  owner_team: 'DevOps',          environment: 'Production',  last_updated: '2024-07-13' },
  { resource_name: 'data-eng-dev',     resource_type: 'Namespace',   owner_team: 'Data Engineering',environment: 'Development', last_updated: '2024-07-06' },
  { resource_name: 'kafka-cluster-svc',resource_type: 'Service',     owner_team: 'Data Engineering',environment: 'Production',  last_updated: '2024-07-10' },
  { resource_name: 'security-staging', resource_type: 'Namespace',   owner_team: 'Security',        environment: 'Staging',     last_updated: '2024-07-12' },
  { resource_name: 'sre-tooling',      resource_type: 'Namespace',   owner_team: 'SRE',             environment: 'Production',  last_updated: '2024-07-11' },
];

// Fallback contacts when no registered user found for a team
const FALLBACK_CONTACTS: Record<string, { name: string; email: string }> = {
  Payments:          { name: 'michael.chen',   email: 'michael.chen@company.com' },
  Analytics:         { name: 'sarah.johnson',  email: 'sarah.johnson@company.com' },
  Frontend:          { name: 'emily.r',        email: 'emily.r@company.com' },
  'ML/AI':           { name: 'lisa.wang',      email: 'lisa.wang@company.com' },
  Infrastructure:    { name: 'david.kim',      email: 'david.kim@company.com' },
  DevOps:            { name: 'james.wilson',   email: 'james.wilson@company.com' },
  'Data Engineering':{ name: 'raj.patel',      email: 'raj.patel@company.com' },
  Security:          { name: 'alex.morgan',    email: 'alex.morgan@company.com' },
  SRE:               { name: 'ops.lead',       email: 'sre@company.com' },
};

const RESOURCE_TYPE_ICONS: Record<OwnershipRow['resource_type'], React.ReactElement> = {
  Namespace:  <StorageIcon   fontSize="small" color="primary" />,
  Deployment: <CloudQueueIcon fontSize="small" color="secondary" />,
  Service:    <LinkIcon       fontSize="small" color="action" />,
};

const OwnershipMapping: React.FC = () => {
  const { activeClusterName } = useActiveCluster();
  const [data, setData] = useState<OwnershipRow[]>([]);
  const [loading, setLoading] = useState(false);

  const buildRows = useCallback(async () => {
    setLoading(true);
    let users: PlatformUser[] = [];
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/?status_filter=approved`);
      users = res.data;
    } catch {
      // backend unreachable — no live users, fallback contacts will be used
    }

    // Build a team → primary contact map from registered users
    const teamContact: Record<string, { name: string; email: string }> = {};
    users.forEach((u) => {
      u.teams.forEach((team) => {
        if (!teamContact[team]) {
          teamContact[team] = { name: u.username, email: u.email };
        }
      });
    });

    const rows: OwnershipRow[] = BASE_RESOURCES.map((r) => {
      const contact = teamContact[r.owner_team] ?? FALLBACK_CONTACTS[r.owner_team] ?? { name: 'unassigned', email: '' };
      return { ...r, owner_contact: contact.email, owner_name: contact.name };
    });

    setData(rows);
    setLoading(false);
  }, []);

  useEffect(() => { buildRows(); }, [buildRows]);

  const namespaceCount  = data.filter((r) => r.resource_type === 'Namespace').length;
  const deploymentCount = data.filter((r) => r.resource_type === 'Deployment').length;
  const serviceCount    = data.filter((r) => r.resource_type === 'Service').length;
  const uniqueTeams     = new Set(data.map((r) => r.owner_team)).size;

  const getEnvColor = (env: OwnershipRow['environment']): 'error' | 'warning' | 'info' => {
    if (env === 'Production')  return 'error';
    if (env === 'Staging')     return 'warning';
    return 'info';
  };

  const getTypeColor = (type: OwnershipRow['resource_type']): 'primary' | 'secondary' | 'default' => {
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
            Resource ownership registry — contacts come from registered platform users — {activeClusterName}
          </Typography>
        </Box>
        <IconButton disabled={loading} onClick={buildRows}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

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
                      {RESOURCE_TYPE_ICONS[row.resource_type]}
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
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {row.owner_name}
                      </Typography>
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
      </Paper>
    </Box>
  );
};

export default OwnershipMapping;

// Made with Bob
