import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment
} from '@mui/material';
import { Refresh, Delete, Warning, Search, CleaningServices } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface OldReplicaSet {
  name: string;
  namespace: string;
  cluster: string;
  deployment: string;
  replicas: number;
  created: string;
  age_days: number;
  monthly_cost: number;
  reason: string;
}

const OldReplicaSetsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [replicaSets, setReplicaSets] = useState<OldReplicaSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRS, setSelectedRS] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/old-replicasets${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: OldReplicaSet[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        cluster: r.cluster,
        deployment: r.owner_name ?? r.resource_name.replace(/-[a-z0-9]+$/, ''),
        replicas: 0,
        created: r.last_used,
        age_days: r.days_unused ?? 0,
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
      }));
      setReplicaSets(items);
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
    const s = new Set(selectedRS);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedRS(s);
  };
  const handleSelectAll = () => {
    if (selectedRS.size === filteredRS.length) setSelectedRS(new Set());
    else setSelectedRS(new Set(filteredRS.map(rs => rs.name)));
  };

  const filteredRS = replicaSets.filter(rs =>
    rs.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rs.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rs.deployment.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredRS.reduce((sum, rs) => sum + rs.monthly_cost, 0);
  const selectedCost = filteredRS.filter(rs => selectedRS.has(rs.name)).reduce((sum, rs) => sum + rs.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (replicaSets.length === 0) return <NoDataState title="No old ReplicaSets found" message="Your cluster is clean. No superseded ReplicaSets with zero replicas were detected." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Old ReplicaSets</Typography>
          <Typography variant="body2" color="textSecondary">Clean up superseded ReplicaSets from old deployments</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Old ReplicaSets</Typography><Typography variant="h4">{replicaSets.length}</Typography><Typography variant="body2" color="error">Zero replicas</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Avg Age</Typography><Typography variant="h4">{replicaSets.length > 0 ? Math.round(replicaSets.reduce((sum, rs) => sum + rs.age_days, 0) / replicaSets.length) : 0} days</Typography><Typography variant="body2" color="textSecondary">Average age</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Cost</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From old ReplicaSets</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From cleanup</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField size="small" placeholder="Search ReplicaSets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<CleaningServices />}>Clean All Safe</Button>
            <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedRS.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete ({selectedRS.size})</Button>
          </Box>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedRS.size === filteredRS.length && filteredRS.length > 0} onChange={handleSelectAll} /></TableCell>
                <TableCell>ReplicaSet Name</TableCell><TableCell>Deployment</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell align="center">Replicas</TableCell><TableCell>Created</TableCell><TableCell>Age (Days)</TableCell><TableCell>Reason</TableCell><TableCell align="right">Monthly Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRS.map((rs) => (
                <TableRow key={`${rs.namespace}/${rs.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedRS.has(rs.name)} onChange={() => handleSelect(rs.name)} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="medium">{rs.name}</Typography></TableCell>
                  <TableCell><Chip label={rs.deployment} size="small" color="primary" /></TableCell>
                  <TableCell><Chip label={rs.namespace} size="small" /></TableCell>
                  <TableCell>{rs.cluster}</TableCell>
                  <TableCell align="center"><Chip label={rs.replicas} size="small" color="error" /></TableCell>
                  <TableCell>{formatDate(rs.created)}</TableCell>
                  <TableCell><Chip label={`${rs.age_days} days`} size="small" color={rs.age_days > 300 ? 'error' : rs.age_days > 180 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{rs.reason}</Typography></Box></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(rs.monthly_cost)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Typography>Delete {selectedRS.size} old ReplicaSet(s)?</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>These ReplicaSets have zero replicas and are safe to delete. Estimated savings: {formatCurrency(selectedCost)}/month</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedRS(new Set()); }} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const OldReplicaSets: React.FC = () => (
  <ClusterGuard><OldReplicaSetsInner /></ClusterGuard>
);

export default OldReplicaSets;

// Made with Bob
