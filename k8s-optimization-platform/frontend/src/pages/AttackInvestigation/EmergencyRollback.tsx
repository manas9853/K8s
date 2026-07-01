import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, LinearProgress, Alert, Button, Grid,
  TextField, MenuItem,
} from '@mui/material';
import { Replay as RollbackIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';

const EmergencyRollbackInner: React.FC = () => {
  const [resourceType, setResourceType] = useState('deployment');
  const [resourceName, setResourceName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRollback = () => {
    if (!resourceName || !namespace) return;
    setLoading(true);
    setResult(null);
    fetch('/api/v1/attack-investigation/response/emergency-rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: resourceType, name: resourceName, namespace }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setResult(d); setLoading(false); })
      .catch(() => { setError('Rollback failed'); setLoading(false); });
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <RollbackIcon /> Emergency Rollback
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <strong>Rollback initiated: {result.resource_name}</strong><br />
          {result.actions_taken?.map((a: string, i: number) => <span key={i}>{a}<br /></span>)}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Emergency Rollback</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Immediately rolls back a deployment to its previous known-good state.
              </Typography>
              <TextField
                select fullWidth label="Resource Type" value={resourceType}
                onChange={e => setResourceType(e.target.value)}
                sx={{ mb: 2 }} size="small"
              >
                <MenuItem value="deployment">Deployment</MenuItem>
                <MenuItem value="statefulset">StatefulSet</MenuItem>
                <MenuItem value="daemonset">DaemonSet</MenuItem>
              </TextField>
              <TextField
                fullWidth label="Resource Name" value={resourceName}
                onChange={e => setResourceName(e.target.value)}
                placeholder="e.g. api-server"
                sx={{ mb: 2 }} size="small"
              />
              <TextField
                fullWidth label="Namespace" value={namespace}
                onChange={e => setNamespace(e.target.value)}
                placeholder="e.g. production"
                sx={{ mb: 3 }} size="small"
              />
              <Button
                variant="contained" color="error" startIcon={<RollbackIcon />}
                onClick={handleRollback} disabled={loading || !resourceName || !namespace}
                fullWidth
              >
                {loading ? 'Rolling back...' : 'Execute Emergency Rollback'}
              </Button>
              {loading && <LinearProgress sx={{ mt: 1 }} />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#ffebee' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="error">⚠ Destructive Action</Typography>
              <Typography variant="body2" component="ul" color="text.secondary">
                <li>Running pods will be terminated immediately</li>
                <li>Deployment will be rolled back to the previous revision</li>
                <li>Traffic will be temporarily interrupted during rollout</li>
                <li>All changes since the last deployment will be lost</li>
                <li>Action is irreversible without a new deployment</li>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const EmergencyRollback: React.FC = () => (
  <ClusterGuard><EmergencyRollbackInner /></ClusterGuard>
);

export default EmergencyRollback;
