import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, LinearProgress, Alert, Button, Grid, TextField,
} from '@mui/material';
import { Block as BlockIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';

const BlockTrafficInner: React.FC = () => {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBlock = () => {
    if (!source && !destination) return;
    setLoading(true);
    setResult(null);
    fetch('/api/v1/attack-investigation/response/block-traffic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setResult(d); setLoading(false); })
      .catch(() => { setError('Action failed'); setLoading(false); });
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BlockIcon /> Block Traffic
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <strong>Traffic blocked successfully</strong><br />
          {result.actions_taken?.map((a: string, i: number) => <span key={i}>{a}<br /></span>)}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Block Network Traffic</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create a network policy to block traffic between source and destination.
                Leave a field blank to match all sources/destinations.
              </Typography>
              <TextField
                fullWidth label="Source (pod/namespace/IP)" value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="e.g. pod/worker-pool-7d8f9 or 10.244.1.5"
                sx={{ mb: 2 }} size="small"
              />
              <TextField
                fullWidth label="Destination (pod/namespace/IP)" value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="e.g. pool.minexmr.com:4444 or namespace/production"
                sx={{ mb: 3 }} size="small"
              />
              <Button
                variant="contained" color="error" startIcon={<BlockIcon />}
                onClick={handleBlock} disabled={loading || (!source && !destination)}
                fullWidth
              >
                {loading ? 'Blocking...' : 'Block Traffic'}
              </Button>
              {loading && <LinearProgress sx={{ mt: 1 }} />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>⚠ Warning</Typography>
              <Typography variant="body2" color="text.secondary">
                Blocking traffic will create a Kubernetes NetworkPolicy that immediately restricts
                all matching pod-to-pod and pod-to-external communication.
                This action is logged and can be reversed by deleting the generated NetworkPolicy.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const BlockTraffic: React.FC = () => (
  <ClusterGuard><BlockTrafficInner /></ClusterGuard>
);

export default BlockTraffic;
