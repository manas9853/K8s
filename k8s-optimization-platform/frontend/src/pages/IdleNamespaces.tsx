import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Container, Typography, Paper, Box, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Checkbox, TextField,
  InputAdornment, LinearProgress
} from '@mui/material';
import { Refresh, Delete, Warning, Search, Folder } from '@mui/icons-material';
import ClusterGuard from '../components/ClusterGuard';
import NoDataState from '../components/NoDataState';
import { API_BASE_URL } from '../config/api';

interface IdleNamespace {
  name: string;
  cluster: string;
  created: string;
  last_activity: string;
  idle_days: number;
  pod_count: number;
  deployment_count: number;
  service_count: number;
  pvc_count: number;
  monthly_cost: number;
  reason: string;
  risk_level: 'low' | 'medium' | 'high';
}

const IdleNamespacesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [namespaces, setNamespaces] = useState<IdleNamespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNS, setSelectedNS] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => { fetchData(); }, [clusterParam]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/cleanup/idle-namespaces${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items: IdleNamespace[] = (data.resources || []).map((r: any) => ({
        name: r.resource_name,
        cluster: r.cluster,
        created: r.last_used,
        last_activity: r.last_used,
        idle_days: r.days_unused ?? 0,
        pod_count: r.pod_count ?? 0,
        deployment_count: r.deployment_count ?? 0,
        service_count: r.service_count ?? 0,
        pvc_count: r.pvc_count ?? 0,
        monthly_cost: r.monthly_cost ?? 0,
        reason: r.reason,
        risk_level: r.risk_level === 'High' ? 'high' : r.risk_level === 'Medium' ? 'medium' : 'low',
      }));
      setNamespaces(items);
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

  const getRiskColor = (risk: string) => {
    switch (risk) { case 'low': return 'success'; case 'medium': return 'warning'; case 'high': return 'error'; default: return 'default'; }
  };

  const handleSelect = (name: string) => {
    const s = new Set(selectedNS);
    if (s.has(name)) s.delete(name); else s.add(name);
    setSelectedNS(s);
  };
  const handleSelectAll = () => {
    if (selectedNS.size === filteredNS.length) setSelectedNS(new Set());
    else setSelectedNS(new Set(filteredNS.map(ns => ns.name)));
  };

  const filteredNS = namespaces.filter(ns =>
    ns.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ns.cluster.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCost = filteredNS.reduce((sum, ns) => sum + ns.monthly_cost, 0);
  const selectedCost = filteredNS.filter(ns => selectedNS.has(ns.name)).reduce((sum, ns) => sum + ns.monthly_cost, 0);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', minHeight: '400px', alignItems: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}><Alert severity="error">{error}</Alert></Container>;
  if (namespaces.length === 0) return <NoDataState title="No idle namespaces found" message="All namespaces in your cluster have recent activity and running workloads." />;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Idle Namespaces</Typography>
          <Typography variant="body2" color="textSecondary">Identify and remove namespaces with no activity</Typography>
        </Box>
        <IconButton onClick={fetchData} color="primary"><Refresh /></IconButton>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Idle Namespaces</Typography><Typography variant="h4">{namespaces.length}</Typography><Typography variant="body2" color="error">No activity</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Total Resources</Typography><Typography variant="h4">{filteredNS.reduce((sum, ns) => sum + ns.deployment_count + ns.service_count + ns.pvc_count, 0)}</Typography><Typography variant="body2" color="textSecondary">Deployments, Services, PVCs</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Typography color="textSecondary" gutterBottom>Monthly Cost</Typography><Typography variant="h4" color="error">{formatCurrency(totalCost)}</Typography><Typography variant="body2" color="textSecondary">From idle namespaces</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}><CardContent><Typography gutterBottom>Potential Savings</Typography><Typography variant="h4">{formatCurrency(selectedCost)}</Typography><Typography variant="body2">From cleanup</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField size="small" placeholder="Search namespaces..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ minWidth: 300 }} />
          <Button variant="contained" color="error" startIcon={<Delete />} disabled={selectedNS.size === 0} onClick={() => setDeleteDialogOpen(true)}>Delete ({selectedNS.size})</Button>
        </Box>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Checkbox checked={selectedNS.size === filteredNS.length && filteredNS.length > 0} onChange={handleSelectAll} /></TableCell>
                <TableCell>Namespace</TableCell><TableCell>Cluster</TableCell><TableCell>Last Activity</TableCell><TableCell>Idle Days</TableCell><TableCell>Resources</TableCell><TableCell>Reason</TableCell><TableCell>Risk Level</TableCell><TableCell align="right">Monthly Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredNS.map((ns) => (
                <TableRow key={`${ns.cluster}/${ns.name}`} hover>
                  <TableCell padding="checkbox"><Checkbox checked={selectedNS.has(ns.name)} onChange={() => handleSelect(ns.name)} /></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Folder fontSize="small" color="action" /><Typography variant="body2" fontWeight="medium">{ns.name}</Typography></Box></TableCell>
                  <TableCell>{ns.cluster}</TableCell>
                  <TableCell>{formatDate(ns.last_activity)}</TableCell>
                  <TableCell><Chip label={`${ns.idle_days} days`} size="small" color={ns.idle_days > 240 ? 'error' : ns.idle_days > 180 ? 'warning' : 'default'} /></TableCell>
                  <TableCell><Box><Typography variant="caption" display="block">Deployments: {ns.deployment_count} | Services: {ns.service_count}</Typography><Typography variant="caption" display="block">PVCs: {ns.pvc_count} | Pods: {ns.pod_count}</Typography></Box></TableCell>
                  <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning fontSize="small" color="warning" /><Typography variant="body2">{ns.reason}</Typography></Box></TableCell>
                  <TableCell><Chip label={ns.risk_level.toUpperCase()} size="small" color={getRiskColor(ns.risk_level) as any} /></TableCell>
                  <TableCell align="right"><Typography variant="body2" color="error" fontWeight="medium">{formatCurrency(ns.monthly_cost)}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Warning color="error" />Confirm Namespace Deletion</Box></DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>This will permanently delete {selectedNS.size} namespace(s) and ALL resources within them!</Alert>
          <Typography variant="body2" color="success.main" fontWeight="medium">Estimated savings: {formatCurrency(selectedCost)}/month</Typography>
          <LinearProgress variant="determinate" value={0} sx={{ mt: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setDeleteDialogOpen(false); setSelectedNS(new Set()); }} color="error" variant="contained">Delete Namespaces</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

const IdleNamespaces: React.FC = () => (
  <ClusterGuard><IdleNamespacesInner /></ClusterGuard>
);

export default IdleNamespaces;

// Made with Bob
