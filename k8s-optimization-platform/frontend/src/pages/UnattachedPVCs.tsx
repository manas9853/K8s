import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Storage } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface UnattachedPVC {
  name: string;
  namespace: string;
  cluster: string;
  storage_class: string;
  capacity: string;
  created: string;
  last_attached: string;
  age_days: number;
  monthly_cost: number;
  reason: string;
  status: string;
}

const UnattachedPVCsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [pvcs, setPVCs] = useState<UnattachedPVC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPVCs, setSelectedPVCs] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/unattached-pvcs${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: UnattachedPVC[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        cluster: r.cluster,
        storage_class: r.storage_class ?? 'standard',
        capacity: r.capacity ?? '0Gi',
        created: r.last_used,
        last_attached: r.last_used,
        age_days: r.days_unused ?? 0,
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
        status: r.pvc_status ?? 'Available',
      }));
      setPVCs(items);
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
    const s = new Set(selectedPVCs);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedPVCs(s);
  };
  const handleSelectAll = () => {
    if (selectedPVCs.size === filteredPVCs.length) setSelectedPVCs(new Set());
    else setSelectedPVCs(new Set(filteredPVCs.map(pvc => pvc.name)));
  };

  const filteredPVCs = pvcs.filter(pvc =>
    pvc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pvc.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pvc.storage_class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredPVCs.reduce((sum, pvc) => sum + pvc.monthly_cost, 0);
  const selectedCost = filteredPVCs.filter(pvc => selectedPVCs.has(pvc.name)).reduce((sum, pvc) => sum + pvc.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (pvcs.length === 0) return <NoDataState title="No unattached PVCs found" message="All persistent volume claims in your cluster are attached to active pods." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Unattached PVCs</Typography>
          <Typography variant="body2" color="textSecondary">Identify and remove persistent volume claims not attached to any pods</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Unattached PVCs</Typography><Typography variant="h4">{pvcs.length}</Typography><Typography variant="body2" color="error">Not in use</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Cost</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From unattached PVCs</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Selected</Typography><Typography variant="h4">{selectedPVCs.size}</Typography><Typography variant="body2" color="primary">Ready for cleanup</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From cleanup</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField size="small" placeholder="Search PVCs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedPVCs.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete ({selectedPVCs.size})</Button>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedPVCs.size === filteredPVCs.length && filteredPVCs.length > 0} onChange={handleSelectAll} /></TableCell>
                <TableCell>PVC Name</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Storage Class</TableCell><TableCell>Capacity</TableCell><TableCell>Last Attached</TableCell><TableCell>Age (Days)</TableCell><TableCell>Reason</TableCell><TableCell>Status</TableCell><TableCell align="right">Monthly Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPVCs.map((pvc) => (
                <TableRow key={`${pvc.namespace}/${pvc.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedPVCs.has(pvc.name)} onChange={() => handleSelect(pvc.name)} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Storage fontSize="small" color="action" /><Typography variant="body2" fontWeight="medium">{pvc.name}</Typography></Box></TableCell>
                  <TableCell><Chip label={pvc.namespace} size="small" /></TableCell>
                  <TableCell>{pvc.cluster}</TableCell>
                  <TableCell><Chip label={pvc.storage_class} size="small" color="primary" /></TableCell>
                  <TableCell><strong>{pvc.capacity}</strong></TableCell>
                  <TableCell>{formatDate(pvc.last_attached)}</TableCell>
                  <TableCell><Chip label={`${pvc.age_days} days`} size="small" color={pvc.age_days > 300 ? 'error' : pvc.age_days > 180 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{pvc.reason}</Typography></Box></TableCell>
                  <TableCell><Chip label={pvc.status} size="small" color="warning" /></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(pvc.monthly_cost)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Deleting PVCs will permanently remove the data. Ensure you have backups.</Alert>
          <Typography>Delete {selectedPVCs.size} unattached PVC(s)?</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>Estimated savings: {formatCurrency(selectedCost)}/month</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedPVCs(new Set()); }} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const UnattachedPVCs: React.FC = () => (
  <ClusterGuard><UnattachedPVCsInner /></ClusterGuard>
);

export default UnattachedPVCs;

// Made with Bob
