import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Schedule } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface ZombieResource {
  name: string;
  namespace: string;
  type: string;
  cluster: string;
  last_seen: string;
  reason: string;
  monthly_cost: number;
  status: string;
  age_days: number;
}

const ZombieResourcesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [resources, setResources] = useState<ZombieResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/zombie-resources${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: ZombieResource[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        namespace: r.namespace,
        type: r.resource_type,
        cluster: r.cluster,
        last_seen: r.last_used,
        reason: r.reason,
        monthly_cost: r.monthly_cost ?? 0,
        status: r.risk_level || 'zombie',
        age_days: r.days_unused ?? 0,
      }));
      setResources(items);
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

  const handleSelectResource = (resourceName: string) => {
    const newSelected = new Set(selectedResources);
    if (newSelected.has(resourceName)) newSelected.delete(resourceName);
    else newSelected.add(resourceName);
    setSelectedResources(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedResources.size === filteredResources.length) setSelectedResources(new Set());
    else setSelectedResources(new Set(filteredResources.map(r => r.name)));
  };

  const filteredResources = resources.filter(resource =>
    resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.namespace.toLowerCase().includes(searchTerm.toLowerCase()) ||
    resource.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredResources.reduce((sum, r) => sum + r.monthly_cost, 0);
  const selectedCost = filteredResources.filter(r => selectedResources.has(r.name)).reduce((sum, r) => sum + r.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (resources.length === 0) return <NoDataState title="No zombie resources found" message="Your cluster is clean. No abandoned or inactive resources were detected." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Zombie Resources</Typography>
          <Typography variant="body2" color="textSecondary">Identify and clean up abandoned or inactive resources</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Total Zombie Resources</Typography><Typography variant="h4">{resources.length}</Typography><Typography variant="body2" color="error">Requiring cleanup</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Waste</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From zombie resources</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Selected Resources</Typography><Typography variant="h4">{selectedResources.size}</Typography><Typography variant="body2" color="primary">Ready for cleanup</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From selected items</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <TextField size="small" placeholder="Search resources..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" color="warning" startIcon={<Schedule />} disabled={selectedResources.size === 0} onClick={() => setScheduleDialogOpen(true)}>Schedule Delete</Button>
            <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedResources.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete Selected ({selectedResources.size})</Button>
          </Box>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedResources.size === filteredResources.length && filteredResources.length > 0} indeterminate={selectedResources.size > 0 && selectedResources.size < filteredResources.length} onChange={handleSelectAll} /></TableCell>
                <TableCell>Resource Name</TableCell><TableCell>Type</TableCell><TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Last Seen</TableCell><TableCell>Age (Days)</TableCell><TableCell>Reason</TableCell><TableCell align="right">Monthly Cost</TableCell><TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredResources.map((resource) => (
                <TableRow key={`${resource.namespace}/${resource.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedResources.has(resource.name)} onChange={() => handleSelectResource(resource.name)} /></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="medium">{resource.name}</Typography></TableCell>
                  <TableCell><Chip label={resource.type} size="small" /></TableCell>
                  <TableCell>{resource.namespace}</TableCell>
                  <TableCell>{resource.cluster}</TableCell>
                  <TableCell>{formatDate(resource.last_seen)}</TableCell>
                  <TableCell><Chip label={`${resource.age_days} days`} size="small" color={resource.age_days > 150 ? 'error' : resource.age_days > 90 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{resource.reason}</Typography></Box></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(resource.monthly_cost)}</Typography></TableCell>
                  <TableCell><Chip label="Zombie" size="small" color="error" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Deletion</Box></DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete {selectedResources.size} zombie resource(s)?</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>This action cannot be undone. Estimated monthly savings: {formatCurrency(selectedCost)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedResources(new Set()); }} color="error" variant="contained" startIcon={<Delete />}>Delete Now</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)}>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Schedule color="warning" />Schedule Deletion</Box></DialogTitle>
        <DialogContent>
          <Typography>Schedule deletion of {selectedResources.size} zombie resource(s)</Typography>
          <TextField fullWidth type="datetime-local" label="Deletion Time" sx={{ mt: 2 }} InputLabelProps={{ shrink: true }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setScheduleDialogOpen(false); setSelectedResources(new Set()); }} color="warning" variant="contained" startIcon={<Schedule />}>Schedule</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const ZombieResources: React.FC = () => (
  <ClusterGuard><ZombieResourcesInner /></ClusterGuard>
);

export default ZombieResources;

// Made with Bob
