import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Archive } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface StaleConfigMap {
  name: string;
  namespace: string;
  cluster: string;
  created: string;
  last_used: string;
  age_days: number;
  size_kb: number;
  referenced_by: string[];
  monthly_cost: number;
  reason: string;
}

const StaleConfigMapsInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [configMaps, setConfigMaps] = useState<StaleConfigMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConfigMaps, setSelectedConfigMaps] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/stale-configmaps${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: StaleConfigMap[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        cluster: r.cluster,
        created: r.last_used,
        last_used: r.last_used,
        age_days: r.days_unused ?? 0,
        size_kb: r.size_kb ?? 0,
        referenced_by: [],
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
      }));
      setConfigMaps(items);
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
    const s = new Set(selectedConfigMaps);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedConfigMaps(s);
  };
  const handleSelectAll = () => {
    if (selectedConfigMaps.size === filteredConfigMaps.length) setSelectedConfigMaps(new Set());
    else setSelectedConfigMaps(new Set(filteredConfigMaps.map(c => c.name)));
  };

  const filteredConfigMaps = configMaps.filter(cm =>
    cm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cm.namespace.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredConfigMaps.reduce((sum, c) => sum + c.monthly_cost, 0);
  const selectedCost = filteredConfigMaps.filter(c => selectedConfigMaps.has(c.name)).reduce((sum, c) => sum + c.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (configMaps.length === 0) return <NoDataState title="No stale ConfigMaps found" message="All ConfigMaps in your cluster are actively referenced by running workloads." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Stale ConfigMaps</Typography>
          <Typography variant="body2" color="textSecondary">Identify and remove unused configuration maps</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Stale ConfigMaps</Typography><Typography variant="h4">{configMaps.length}</Typography><Typography variant="body2" color="error">Not referenced</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Total Size</Typography><Typography variant="h4">{configMaps.reduce((sum, c) => sum + c.size_kb, 0)} KB</Typography><Typography variant="body2" color="textSecondary">Wasted storage</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Cost</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From stale configs</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From cleanup</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField size="small" placeholder="Search ConfigMaps..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<Archive />}>Archive Selected</Button>
            <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedConfigMaps.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete ({selectedConfigMaps.size})</Button>
          </Box>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedConfigMaps.size === filteredConfigMaps.length && filteredConfigMaps.length > 0} onChange={handleSelectAll} /></TableCell>
                <TableCell>Name</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Last Used</TableCell><TableCell>Age (Days)</TableCell><TableCell>Reason</TableCell><TableCell align="right">Monthly Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredConfigMaps.map((cm) => (
                <TableRow key={`${cm.namespace}/${cm.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedConfigMaps.has(cm.name)} onChange={() => handleSelect(cm.name)} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="medium">{cm.name}</Typography></TableCell>
                  <TableCell><Chip label={cm.namespace} size="small" /></TableCell>
                  <TableCell>{cm.cluster}</TableCell>
                  <TableCell>{formatDate(cm.last_used)}</TableCell>
                  <TableCell><Chip label={`${cm.age_days} days`} size="small" color={cm.age_days > 300 ? 'error' : cm.age_days > 180 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{cm.reason}</Typography></Box></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(cm.monthly_cost)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Typography>Delete {selectedConfigMaps.size} stale ConfigMap(s)?</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>Estimated savings: {formatCurrency(selectedCost)}/month</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedConfigMaps(new Set()); }} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const StaleConfigMaps: React.FC = () => (
  <ClusterGuard><StaleConfigMapsInner /></ClusterGuard>
);

export default StaleConfigMaps;

// Made with Bob
