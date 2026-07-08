import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Grid,
  TextField,
  Typography,
} from '@mui/material';
import { Block as BlockIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface BlockTrafficResponse {
  action: string;
  source?: string;
  destination?: string;
  status: string;
  message: string;
  actions_taken: string[];
  timestamp: string;
}

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const BlockTrafficInner: React.FC = () => {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BlockTrafficResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBlock = async () => {
    if (!source && !destination) return;
    try {
      setLoading(true);
      setResult(null);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/response/block-traffic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: BlockTrafficResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#e8eaf0' }}>
          <BlockIcon sx={{ color: '#90caf9' }} /> Block Traffic
        </Typography>
        <Button variant="contained" onClick={() => { setSource(''); setDestination(''); setResult(null); setError(null); }} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Reset
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{result.message}</Typography>
          <Typography variant="body2">Status: {result.status}</Typography>
          <Typography variant="body2">Queued at: {formatTimestamp(result.timestamp)}</Typography>
          {result.actions_taken?.length > 0 && (
            <Box sx={{ mt: 1 }}>
              {result.actions_taken.map((action, index) => (
                <Typography key={index} variant="body2">• {action}</Typography>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#e8eaf0' }}>Block Network Traffic</Typography>
              <Typography variant="body2" sx={{ color: '#8892a4', mb: 3 }}>
                Send a real block-traffic request to the backend queue. The backend currently queues the action and returns status, source, destination, actions taken, and timestamp.
              </Typography>
              <TextField
                fullWidth
                label="Source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="pod name, namespace, or IP"
                sx={{ mb: 2 }}
                size="small"
                InputLabelProps={{ style: { color: '#8892a4' } }}
                InputProps={{ sx: { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }}
              />
              <TextField
                fullWidth
                label="Destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="pod name, namespace, service, or IP:port"
                sx={{ mb: 3 }}
                size="small"
                InputLabelProps={{ style: { color: '#8892a4' } }}
                InputProps={{ sx: { color: '#e8eaf0', '& fieldset': { borderColor: '#2a3245' } } }}
              />
              <Button
                variant="contained"
                color="error"
                startIcon={<BlockIcon />}
                onClick={handleBlock}
                disabled={loading || (!source && !destination)}
                fullWidth
              >
                {loading ? 'Blocking...' : 'Block Traffic'}
              </Button>
              {loading && <LinearProgress sx={{ mt: 1 }} />}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#e8eaf0' }}>Current backend behavior</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip label="Real API wired" size="small" sx={{ bgcolor: '#131d2e', color: '#90caf9', border: '1px solid #2a3245' }} />
                <Chip label="Queued action" size="small" sx={{ bgcolor: '#131d2e', color: '#ffa726', border: '1px solid #2a3245' }} />
              </Box>
              <Typography variant="body2" sx={{ color: '#8892a4', lineHeight: 1.75 }}>
                The backend response confirms the request was accepted and queued, but the action still depends on cluster network policy access. This page is now functional because it uses the live backend endpoint instead of a broken local path.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

const BlockTraffic: React.FC = () => (
  <ClusterGuard>
    <BlockTrafficInner />
  </ClusterGuard>
);

export default BlockTraffic;
