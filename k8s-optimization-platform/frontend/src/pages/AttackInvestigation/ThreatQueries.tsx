import React, { useState, useEffect } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Box, Card, CardContent, Typography, Chip, LinearProgress, Alert, Button,
  Accordion, AccordionSummary, AccordionDetails, Table, TableBody,
  TableCell, TableRow,
} from '@mui/material';
import { Search as SearchIcon, ExpandMore as ExpandIcon } from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import NoDataState from '../../components/NoDataState';
import { API_BASE_URL } from '../../config/api';

interface ThreatQuery {
  id: string;
  name: string;
  description: string;
  query: string;
  results: number;
}

interface QueryCategory {
  name: string;
  queries: ThreatQuery[];
}

interface ThreatQueriesData {
  categories: QueryCategory[];
}

const ThreatQueriesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ThreatQueriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/attack-investigation/threat-queries${clusterParam}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return <Box sx={{ width: '100%', mt: 2 }}><LinearProgress /></Box>;
  if (error || !data) return <Alert severity="error">Failed to load threat queries</Alert>;

  const totalQueries = data.categories.reduce((s, c) => s + c.queries.length, 0);
  const totalHits = data.categories.reduce((s, c) => s + c.queries.reduce((sq, q) => sq + q.results, 0), 0);

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon /> Threat Queries
        </Typography>
        <Button variant="contained" onClick={fetchData}>Refresh</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography color="text.secondary">Categories</Typography>
          <Typography variant="h3">{data.categories.length}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography color="text.secondary">Total Queries</Typography>
          <Typography variant="h3">{totalQueries}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1, bgcolor: totalHits > 0 ? '#ffebee' : undefined }}><CardContent>
          <Typography color="text.secondary">Total Hits</Typography>
          <Typography variant="h3" color={totalHits > 0 ? 'error' : 'inherit'}>{totalHits}</Typography>
        </CardContent></Card>
      </Box>

      {data.categories.map((cat, ci) => (
        <Accordion key={ci} defaultExpanded sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandIcon />} sx={{ bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <Typography variant="subtitle1" fontWeight={700}>{cat.name}</Typography>
              <Chip label={`${cat.queries.length} queries`} size="small" />
              <Chip
                label={`${cat.queries.reduce((s, q) => s + q.results, 0)} hits`}
                size="small"
                color={cat.queries.some(q => q.results > 0) ? 'error' : 'success'}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Table size="small">
              <TableBody>
                {cat.queries.map((q, qi) => (
                  <TableRow key={qi} hover sx={{ bgcolor: q.results > 0 ? '#fff5f5' : undefined }}>
                    <TableCell width={80}>
                      <Chip label={q.id} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{q.name}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{q.description}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#1565c0' }}>
                      {q.query}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={`${q.results} hits`}
                        size="small"
                        color={q.results > 0 ? 'error' : 'success'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

const ThreatQueries: React.FC = () => (
  <ClusterGuard><ThreatQueriesInner /></ClusterGuard>
);

export default ThreatQueries;
