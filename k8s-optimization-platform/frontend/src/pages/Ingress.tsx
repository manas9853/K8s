import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  Tooltip,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Language as LanguageIcon,
  Security as SecurityIcon,
  Search as SearchIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PathInfo {
  host: string;
  path: string;
  path_type: string;
  service: string;
  port: number | string | null;
}

interface IngressResource {
  name: string;
  namespace: string;
  hosts: string[];
  paths: PathInfo[];
  tls_enabled: boolean;
  tls_hosts: string[];
  ingress_class: string | null;
  address: string;
  ports: number[];
  age: string;
  labels: Record<string, string>;
  created_at: string;
}

const Ingress: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const { clusters, loading: clustersLoading } = useCluster();
  const [ingresses, setIngresses] = useState<IngressResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<IngressResource | null>(null);

  const fetchIngresses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/network/ingress${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setIngresses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ingresses');
      console.error('Error fetching ingresses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIngresses(); }, [clusterParam]);

  const filtered = ingresses.filter(ing =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ing.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ing.hosts.some(h => h.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const tlsCount  = ingresses.filter(i => i.tls_enabled).length;
  const withClass = ingresses.filter(i => i.ingress_class).length;
  const withAddr  = ingresses.filter(i => i.address).length;

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LanguageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">Ingress Resources</Typography>
        </Box>
        <IconButton onClick={fetchIngresses} color="primary"><RefreshIcon /></IconButton>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>Total</Typography>
            <Typography variant="h4">{ingresses.length}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>TLS Enabled</Typography>
            <Typography variant="h4" color="success.main">{tlsCount}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>With Ingress Class</Typography>
            <Typography variant="h4">{withClass}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography color="textSecondary" gutterBottom>With Address</Typography>
            <Typography variant="h4" color="primary.main">{withAddr}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      {/* Search */}
      <Paper sx={{ mb: 3, p: 2 }}>
        <TextField
          fullWidth variant="outlined" placeholder="Search by name, namespace or host…"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Table — mirrors kubectl get ingress -A -o wide */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Namespace</strong></TableCell>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Class</strong></TableCell>
                  <TableCell><strong>Hosts</strong></TableCell>
                  <TableCell><strong>Address</strong></TableCell>
                  <TableCell><strong>Ports</strong></TableCell>
                  <TableCell><strong>TLS</strong></TableCell>
                  <TableCell><strong>Backends</strong></TableCell>
                  <TableCell><strong>Age</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={24} sx={{ my: 2 }} /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center">
                    <Alert severity="info">No ingress resources found</Alert>
                  </TableCell></TableRow>
                ) : (
                  filtered.map(ing => {
                    // Unique backend services
                    const backends = [...new Set(ing.paths.map(p => p.service).filter(Boolean))];
                    const portStr = ing.ports.length ? ing.ports.join(', ') : '80';

                    return (
                      <TableRow
                        key={`${ing.namespace}-${ing.name}`}
                        hover
                        onClick={() => setSelected(ing)}
                        sx={{ cursor: 'pointer' }}
                      >
                        {/* Namespace */}
                        <TableCell>
                          <Chip label={ing.namespace} size="small" variant="outlined" />
                        </TableCell>

                        {/* Name */}
                        <TableCell sx={{ fontWeight: 500 }}>{ing.name}</TableCell>

                        {/* Class */}
                        <TableCell>
                          {ing.ingress_class ? (
                            <Chip label={ing.ingress_class} size="small" color="default" />
                          ) : (
                            <Typography variant="body2" color="text.disabled">&lt;none&gt;</Typography>
                          )}
                        </TableCell>

                        {/* Hosts */}
                        <TableCell sx={{ maxWidth: 320 }}>
                          {ing.hosts.length === 0 ? (
                            <Typography variant="body2" color="text.disabled">*</Typography>
                          ) : (
                            <Tooltip title={ing.hosts.join('\n')} arrow>
                              <Box>
                                {ing.hosts.slice(0, 2).map((h, i) => (
                                  <Typography key={i} variant="body2" fontFamily="monospace" fontSize="0.78rem"
                                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                                    {h}
                                  </Typography>
                                ))}
                                {ing.hosts.length > 2 && (
                                  <Typography variant="caption" color="text.secondary">+{ing.hosts.length - 2} more</Typography>
                                )}
                              </Box>
                            </Tooltip>
                          )}
                        </TableCell>

                        {/* Address */}
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {ing.address ? (
                            <Typography variant="body2" fontFamily="monospace">{ing.address}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.disabled">&lt;none&gt;</Typography>
                          )}
                        </TableCell>

                        {/* Ports */}
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace">{portStr}</Typography>
                        </TableCell>

                        {/* TLS */}
                        <TableCell>
                          {ing.tls_enabled ? (
                            <Chip icon={<SecurityIcon />} label="TLS" color="success" size="small" />
                          ) : (
                            <Chip icon={<LockIcon />} label="None" size="small" variant="outlined" />
                          )}
                        </TableCell>

                        {/* Backends */}
                        <TableCell sx={{ maxWidth: 200 }}>
                          <Tooltip title={backends.join(', ')} arrow>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {backends.slice(0, 2).map(b => (
                                <Chip key={b} label={b} size="small" variant="outlined"
                                  sx={{ maxWidth: 120, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                              ))}
                              {backends.length > 2 && (
                                <Chip label={`+${backends.length - 2}`} size="small" />
                              )}
                            </Box>
                          </Tooltip>
                        </TableCell>

                        {/* Age */}
                        <TableCell>{ing.age}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {selected && (
        <Dialog open onClose={() => setSelected(null)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box display="flex" alignItems="center" gap={1}>
              <LanguageIcon />
              <Typography variant="h6">{selected.name}</Typography>
              <Chip label={selected.namespace} size="small" variant="outlined" />
              {selected.tls_enabled && <Chip icon={<SecurityIcon />} label="TLS" color="success" size="small" />}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Basic Info</Typography>
                <List dense>
                  <ListItem><ListItemText primary="Ingress Class" secondary={selected.ingress_class || '(none)'} /></ListItem>
                  <ListItem><ListItemText primary="Address" secondary={selected.address || '(none)'} /></ListItem>
                  <ListItem><ListItemText primary="Ports" secondary={selected.ports.join(', ') || '80'} /></ListItem>
                  <ListItem><ListItemText primary="TLS" secondary={selected.tls_enabled ? `Enabled (${selected.tls_hosts.length} host(s))` : 'Disabled'} /></ListItem>
                  <ListItem><ListItemText primary="Age" secondary={selected.age} /></ListItem>
                  <ListItem><ListItemText primary="Created" secondary={selected.created_at} /></ListItem>
                </List>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Hosts</Typography>
                {selected.hosts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">All hosts (*)</Typography>
                ) : (
                  selected.hosts.map((h, i) => (
                    <Typography key={i} variant="body2" fontFamily="monospace" sx={{ mb: 0.5 }}>{h}</Typography>
                  ))
                )}
                {selected.tls_hosts.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>TLS Hosts</Typography>
                    {selected.tls_hosts.map((h, i) => (
                      <Typography key={i} variant="body2" fontFamily="monospace" sx={{ mb: 0.5 }}>{h}</Typography>
                    ))}
                  </>
                )}
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>Path Rules</Typography>
                {selected.paths.length === 0 ? (
                  <Alert severity="info">No path rules defined</Alert>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Host</TableCell>
                          <TableCell>Path</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Service</TableCell>
                          <TableCell>Port</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selected.paths.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{p.host}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{p.path}</TableCell>
                            <TableCell>{p.path_type}</TableCell>
                            <TableCell><Chip label={p.service} size="small" /></TableCell>
                            <TableCell>{p.port ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Grid>
              {Object.keys(selected.labels).length > 0 && (
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" gutterBottom>Labels</Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {Object.entries(selected.labels).map(([k, v]) => (
                      <Chip key={k} label={`${k}=${v}`} size="small" />
                    ))}
                  </Box>
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Ingress;

// Made with Bob
