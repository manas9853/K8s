import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment, Tooltip
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Info } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface UnusedDeployment {
  name: string;
  namespace: string;
  cluster: string;
  replicas: number;
  ready_replicas: number;
  last_scaled: string;
  cpu_usage: number;
  memory_usage: number;
  monthly_cost: number;
  reason: string;
  idle_days: number;
  recommendation: string;
}

const UnusedDeploymentsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [deployments, setDeployments] = useState<UnusedDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeployments, setSelectedDeployments] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/unused-deployments${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: UnusedDeployment[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        cluster: r.cluster,
        replicas: r.replicas ?? 0,
        ready_replicas: r.ready_replicas ?? 0,
        last_scaled: r.last_used,
        cpu_usage: r.cpu_usage ?? 0,
        memory_usage: r.memory_usage ?? 0,
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
        idle_days: r.days_unused ?? 0,
        recommendation: r.can_delete ? 'Safe to delete' : 'Review dependencies before deletion',
      }));
      setDeployments(items);
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
    const s = new Set(selectedDeployments);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedDeployments(s);
  };
  const handleSelectAll = () => {
    if (selectedDeployments.size === filteredDeployments.length) setSelectedDeployments(new Set());
    else setSelectedDeployments(new Set(filteredDeployments.map(d => d.name)));
  };

  const filteredDeployments = deployments.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.cluster.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredDeployments.reduce((sum, d) => sum + d.monthly_cost, 0);
  const selectedCost = filteredDeployments.filter(d => selectedDeployments.has(d.name)).reduce((sum, d) => sum + d.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (deployments.length === 0) return <NoDataState title="No unused deployments found" message="All deployments in your cluster are active and receiving traffic." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Unused Deployments</Typography>
          <Typography variant="body2" color="textSecondary">Identify and remove deployments with zero traffic or activity</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Unused Deployments</Typography><Typography variant="h4">{deployments.length}</Typography><Typography variant="body2" color="error">Zero activity</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Total Idle Replicas</Typography><Typography variant="h4">{deployments.reduce((sum, d) => sum + d.replicas, 0)}</Typography><Typography variant="body2" color="textSecondary">Consuming resources</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Waste</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From unused deployments</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From selected items</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <TextField size="small" placeholder="Search deployments..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedDeployments.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete Selected ({selectedDeployments.size})</Button>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedDeployments.size === filteredDeployments.length && filteredDeployments.length > 0} indeterminate={selectedDeployments.size > 0 && selectedDeployments.size < filteredDeployments.length} onChange={handleSelectAll} /></TableCell>
                <TableCell>Deployment Name</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell align="center">Idle Days</TableCell><TableCell>Last Scaled</TableCell><TableCell>Reason</TableCell><TableCell align="right">Monthly Cost</TableCell><TableCell>Recommendation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDeployments.map((d) => (
                <TableRow key={`${d.namespace}/${d.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedDeployments.has(d.name)} onChange={() => handleSelect(d.name)} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="medium">{d.name}</Typography></TableCell>
                  <TableCell><Chip label={d.namespace} size="small" /></TableCell>
                  <TableCell>{d.cluster}</TableCell>
                  <TableCell align="center"><Chip label={`${d.idle_days} days`} size="small" color={d.idle_days > 180 ? 'error' : d.idle_days > 90 ? 'warning' : 'default'} /></TableCell>
                  <TableCell>{formatDate(d.last_scaled)}</TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{d.reason}</Typography></Box></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(d.monthly_cost)}</Typography></TableCell>
                  <TableCell><Tooltip title={d.recommendation}><Chip label={d.recommendation.includes('Safe') ? 'Safe to Delete' : 'Review First'} size="small" color={d.recommendation.includes('Safe') ? 'success' : 'warning'} icon={<Info />} /></Tooltip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>This will permanently delete {selectedDeployments.size} deployment(s).</Alert>
          <Typography variant="body2" color="success.main" fontWeight="medium">Estimated monthly savings: {formatCurrency(selectedCost)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedDeployments(new Set()); }} color="error" variant="contained" startIcon={<Delete />}>Delete Deployments</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const UnusedDeployments: React.FC = () => (
  <ClusterGuard><UnusedDeploymentsInner /></ClusterGuard>
);

export default UnusedDeployments;

// Made with Bob
