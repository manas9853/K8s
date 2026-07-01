import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Lock } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface StaleSecret {
  name: string;
  namespace: string;
  cluster: string;
  type: string;
  created: string;
  last_used: string;
  age_days: number;
  referenced_by: string[];
  monthly_cost: number;
  reason: string;
}

const StaleSecretsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [secrets, setSecrets] = useState<StaleSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSecrets, setSelectedSecrets] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/stale-secrets${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: StaleSecret[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        cluster: r.cluster,
        type: r.secret_type ?? 'Opaque',
        created: r.last_used,
        last_used: r.last_used,
        age_days: r.days_unused ?? 0,
        referenced_by: [],
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
      }));
      setSecrets(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (dateString: string) => {
    if (!dateString || dateString === 'Unknown') return 'Unknown';
    try { return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return dateString; }
  };

  const handleSelect = (name: string) => {
    const s = new Set(selectedSecrets);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedSecrets(s);
  };
  const handleSelectAll = () => {
    if (selectedSecrets.size === filteredSecrets.length) setSelectedSecrets(new Set());
    else setSelectedSecrets(new Set(filteredSecrets.map(s => s.name)));
  };

  const filteredSecrets = secrets.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredSecrets.reduce((sum, s) => sum + s.monthly_cost, 0);
  const selectedCost = filteredSecrets.filter(s => selectedSecrets.has(s.name)).reduce((sum, s) => sum + s.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (secrets.length === 0) return <NoDataState title="No stale secrets found" message="All secrets in your cluster are actively in use. No orphaned credentials detected." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Stale Secrets</Typography>
          <Typography variant="body2" color="textSecondary">Identify and remove unused secrets and credentials</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Stale Secrets</Typography><Typography variant="h4">{secrets.length}</Typography><Typography variant="body2" color="error">Not referenced</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Security Risk</Typography><Typography variant="h4" color="warning.main">Medium</Typography><Typography variant="body2" color="textSecondary">Unused credentials</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Cost</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From stale secrets</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From cleanup</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField size="small" placeholder="Search secrets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedSecrets.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete ({selectedSecrets.size})</Button>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedSecrets.size === filteredSecrets.length && filteredSecrets.length > 0} onChange={handleSelectAll} /></TableCell>
                <TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Last Used</TableCell><TableCell>Age (Days)</TableCell><TableCell>Reason</TableCell><TableCell align="right">Monthly Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSecrets.map((secret) => (
                <TableRow key={`${secret.namespace}/${secret.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedSecrets.has(secret.name)} onChange={() => handleSelect(secret.name)} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Lock fontSize="small" color="action" /><Typography variant="body2" fontWeight="medium">{secret.name}</Typography></Box></TableCell>
                  <TableCell><Chip label={secret.type} size="small" color="primary" /></TableCell>
                  <TableCell><Chip label={secret.namespace} size="small" /></TableCell>
                  <TableCell>{secret.cluster}</TableCell>
                  <TableCell>{formatDate(secret.last_used)}</TableCell>
                  <TableCell><Chip label={`${secret.age_days} days`} size="small" color={secret.age_days > 300 ? 'error' : secret.age_days > 180 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{secret.reason}</Typography></Box></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(secret.monthly_cost)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Deleting secrets is irreversible. Ensure no applications depend on these credentials.</Alert>
          <Typography>Delete {selectedSecrets.size} stale secret(s)?</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>Estimated savings: {formatCurrency(selectedCost)}/month</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedSecrets(new Set()); }} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const StaleSecrets: React.FC = () => (
  <ClusterGuard><StaleSecretsInner /></ClusterGuard>
);

export default StaleSecrets;

// Made with Bob
