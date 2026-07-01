import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, LinearProgress, Alert, Button, Grid, TextField,
} from '@mui/material';
import { RotateRight as RotateIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';

const RotateSecretsInner: React.FC = () => {
  const [secretName, setSecretName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRotate = () => {
    if (!secretName || !namespace) return;
    setLoading(true);
    setResult(null);
    fetch('/api/v1/attack-investigation/response/rotate-secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: secretName, namespace }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setResult(d); setLoading(false); })
      .catch(() => { setError('Rotation failed'); setLoading(false); });
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <RotateIcon /> Rotate Secrets
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <strong>Secret rotated: {result.secret_name}</strong><br />
          {result.actions_taken?.map((a: string, i: number) => <span key={i}>{a}<br /></span>)}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Emergency Secret Rotation</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Immediately rotates the specified secret, invalidates the old value,
                and restarts all pods using it.
              </Typography>
              <TextField
                fullWidth label="Secret Name" value={secretName}
                onChange={e => setSecretName(e.target.value)}
                placeholder="e.g. database-credentials"
                sx={{ mb: 2 }} size="small"
              />
              <TextField
                fullWidth label="Namespace" value={namespace}
                onChange={e => setNamespace(e.target.value)}
                placeholder="e.g. production"
                sx={{ mb: 3 }} size="small"
              />
              <Button
                variant="contained" color="warning" startIcon={<RotateIcon />}
                onClick={handleRotate} disabled={loading || !secretName || !namespace}
                fullWidth
              >
                {loading ? 'Rotating...' : 'Rotate Secret Now'}
              </Button>
              {loading && <LinearProgress sx={{ mt: 1 }} />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#fff3e0' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>What happens during rotation</Typography>
              <Typography variant="body2" component="ul" color="text.secondary">
                <li>A new secret value is generated</li>
                <li>The old secret is immediately invalidated</li>
                <li>All pods referencing this secret are restarted</li>
                <li>Access logs are reviewed for exposure</li>
                <li>Incident is documented in the audit log</li>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const RotateSecrets: React.FC = () => (
  <ClusterGuard><RotateSecretsInner /></ClusterGuard>
);

export default RotateSecrets;
