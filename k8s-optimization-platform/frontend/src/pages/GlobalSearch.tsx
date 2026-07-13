import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, InputAdornment, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, LinearProgress, Alert, Tabs, Tab, Grid, Card, CardContent,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface SearchResult {
  kind: string;
  name: string;
  namespace: string;
  status?: string;
  details?: string;
}

const GlobalSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pods, setPods] = useState<SearchResult[]>([]);
  const [workloads, setWorkloads] = useState<SearchResult[]>([]);
  const [recommendations, setRecommendations] = useState<SearchResult[]>([]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setPods([]);
    setWorkloads([]);
    setRecommendations([]);
    const q = query.trim().toLowerCase();

    try {
      const [podsRes, workloadsRes, recsRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/v1/pods`),
        axios.get(`${API_BASE}/api/v1/workloads/`),
        axios.get(`${API_BASE}/api/v1/recommendations/`),
      ]);

      if (podsRes.status === 'fulfilled') {
        const raw: Record<string, unknown>[] = Array.isArray(podsRes.value.data) ? podsRes.value.data : [];
        setPods(
          raw
            .filter((p) =>
              String(p.pod_name ?? '').toLowerCase().includes(q) ||
              String(p.namespace ?? '').toLowerCase().includes(q)
            )
            .map((p) => ({
              kind: 'Pod',
              name: String(p.pod_name ?? '—'),
              namespace: String(p.namespace ?? '—'),
              status: String(p.status ?? '—'),
              details: `Node: ${p.node_name ?? '—'}`,
            }))
        );
      }

      if (workloadsRes.status === 'fulfilled') {
        const raw: Record<string, unknown>[] = Array.isArray(workloadsRes.value.data) ? workloadsRes.value.data : [];
        setWorkloads(
          raw
            .filter((w) =>
              String(w.name ?? '').toLowerCase().includes(q) ||
              String(w.namespace ?? '').toLowerCase().includes(q)
            )
            .map((w) => ({
              kind: String(w.kind ?? 'Workload'),
              name: String(w.name ?? '—'),
              namespace: String(w.namespace ?? '—'),
              status: String(w.status ?? '—'),
              details: `Replicas: ${w.replicas_ready ?? '—'}/${w.replicas_desired ?? '—'}`,
            }))
        );
      }

      if (recsRes.status === 'fulfilled') {
        const raw: Record<string, unknown>[] = Array.isArray(recsRes.value.data) ? recsRes.value.data : [];
        setRecommendations(
          raw
            .filter((r) =>
              String(r.resource_name ?? '').toLowerCase().includes(q) ||
              String(r.namespace ?? '').toLowerCase().includes(q) ||
              String(r.recommendation ?? '').toLowerCase().includes(q)
            )
            .map((r) => ({
              kind: 'Recommendation',
              name: String(r.resource_name ?? '—'),
              namespace: String(r.namespace ?? '—'),
              status: String(r.priority ?? '—'),
              details: String(r.recommendation ?? '—'),
            }))
        );
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') runSearch();
  };

  const totalResults = pods.length + workloads.length + recommendations.length;
  const tabData = [pods, workloads, recommendations];
  const tabLabels = ['Pods', 'Workloads', 'Recommendations'];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Global Search</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Search across pods, workloads, and recommendations
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            fullWidth
            placeholder="Search by name, namespace, or keyword…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Button variant="contained" onClick={runSearch} disabled={loading || !query.trim()}>
            Search
          </Button>
        </Box>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {totalResults > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {tabLabels.map((label, i) => (
            <Grid item xs={12} md={4} key={label}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">{label}</Typography>
                  <Typography variant="h5">{tabData[i].length}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {totalResults === 0 && !loading && query.trim() && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary" textAlign="center">
            No results found for "{query}". Try a different namespace or resource name.
          </Typography>
        </Paper>
      )}

      {totalResults > 0 && (
        <Paper>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            {tabLabels.map((label, i) => (
              <Tab key={label} label={`${label} (${tabData[i].length})`} />
            ))}
          </Tabs>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Kind</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Namespace</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tabData[tab].map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Chip label={row.kind} size="small" /></TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.namespace}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell sx={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.details}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default GlobalSearch;
