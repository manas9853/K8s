import React, { useEffect, useMemo, useState } from 'react';
import { useActiveCluster } from '../../hooks/useActiveCluster';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import ClusterGuard from '../../components/ClusterGuard';
import { API_BASE_URL } from '../../config/api';

interface ThreatQuery {
  id: string;
  name: string;
  description: string;
  query: string;
  results: number;
  severity: string;
}

interface QueryCategory {
  name: string;
  queries: ThreatQuery[];
}

interface ThreatQueriesData {
  categories: QueryCategory[];
  cluster_name?: string;
  last_updated?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef5350',
  high: '#ffa726',
  medium: '#90caf9',
  low: '#a5d6a7',
};

function formatTimestamp(value?: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function buildQueryReason(query: ThreatQuery): string {
  const count = query.results;

  if (count === 0) {
    return `No violations detected for this query. The cluster has no pods matching the condition: ${query.query}.`;
  }

  const base: Record<string, string> = {
    Q001: `${count} container${count > 1 ? 's are' : ' is'} running with privileged: true, giving them full host kernel access. This is a critical violation of container isolation.`,
    Q002: `${count} container${count > 1 ? 's are' : ' is'} running as UID 0 (root). Root processes inside a container can exploit kernel vulnerabilities to break out to the host.`,
    Q003: `${count} pod${count > 1 ? 's share' : ' shares'} the host's network namespace, meaning they can see and interact with all host-level network traffic and interfaces.`,
    Q004: `${count} pod${count > 1 ? 's use' : ' uses'} the default service account, which is shared across workloads and may have broader API permissions than any individual workload needs.`,
    Q005: `${count} container${count > 1 ? 's have' : ' has'} a writable root filesystem, which allows attackers to modify binaries or drop backdoor files inside a container after compromise.`,
  };

  return base[query.id] || `${count} pod${count > 1 ? 's matched' : ' matched'} the condition: ${query.query}.`;
}

const ThreatQueriesInner: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [data, setData] = useState<ThreatQueriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-queries${clusterParam}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: ThreatQueriesData = await response.json();
        if (!mounted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load threat queries');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [clusterParam]);

  const totalQueries = useMemo(() => data?.categories.reduce((sum, cat) => sum + cat.queries.length, 0) ?? 0, [data]);
  const totalHits = useMemo(() => data?.categories.reduce((sum, cat) => sum + cat.queries.reduce((s, q) => s + q.results, 0), 0) ?? 0, [data]);
  const criticalHits = useMemo(
    () => data?.categories.reduce((sum, cat) => sum + cat.queries.filter((q) => q.severity === 'critical' && q.results > 0).reduce((s, q) => s + q.results, 0), 0) ?? 0,
    [data],
  );
  const hittingQueries = useMemo(
    () => data?.categories.flatMap((cat) => cat.queries.filter((q) => q.results > 0)) ?? [],
    [data],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: '#0f1724' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh' }}>
        <Alert severity="error">Failed to load threat queries</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: '#0f1724', minHeight: '100vh', color: '#e8eaf0' }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchIcon sx={{ fontSize: 32, color: '#90caf9' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
              Threat Queries
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4' }}>
              Real security query results for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#1976d2', '&:hover': { bgcolor: '#1565c0' } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Categories', value: data.categories.length, color: '#90caf9' },
          { label: 'Total Queries', value: totalQueries, color: '#90caf9' },
          { label: 'Total Hits', value: totalHits, color: totalHits > 0 ? '#ef5350' : '#a5d6a7' },
          { label: 'Critical Hits', value: criticalHits, color: criticalHits > 0 ? '#ef5350' : '#a5d6a7' },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: '#8892a4', fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {hittingQueries.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: '#1e2433', border: '1px solid #2a3245' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#e8eaf0', mb: 1.5 }}>
            Active Violations — What the queries found
          </Typography>
          <Stack spacing={1.5}>
            {hittingQueries.map((query) => (
              <Box key={query.id} sx={{ p: 2, borderRadius: 1, bgcolor: '#131d2e', border: '1px solid #2a3245' }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box display="flex" gap={1} alignItems="center">
                    <Chip label={query.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#e8eaf0' }}>
                      {query.name}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip
                      label={query.severity.toUpperCase()}
                      size="small"
                      sx={{ bgcolor: '#2a3245', color: SEV_COLOR[query.severity] || '#8892a4', fontWeight: 'bold', fontSize: 10 }}
                    />
                    <Chip
                      label={`${query.results} hit${query.results !== 1 ? 's' : ''}`}
                      size="small"
                      sx={{ bgcolor: '#2a3245', color: '#ef5350', fontWeight: 'bold', fontSize: 10 }}
                    />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: '#c8d0dc', lineHeight: 1.7 }}>
                  {buildQueryReason(query)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
                  Query: {query.query}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      <Stack spacing={1}>
        {data.categories.map((category) => {
          const categoryHits = category.queries.reduce((sum, q) => sum + q.results, 0);
          return (
            <Accordion
              key={category.name}
              defaultExpanded
              sx={{
                bgcolor: '#1e2433',
                border: '1px solid #2a3245',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': { borderBottom: '1px solid #2a3245' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandIcon sx={{ color: '#8892a4' }} />}>
                <Box display="flex" alignItems="center" gap={1.5} width="100%">
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#e8eaf0' }}>
                    {category.name}
                  </Typography>
                  <Chip label={`${category.queries.length} queries`} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                  <Chip
                    label={`${categoryHits} hit${categoryHits !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ bgcolor: '#2a3245', color: categoryHits > 0 ? '#ef5350' : '#a5d6a7', fontWeight: 'bold', fontSize: 10 }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Table size="small">
                  <TableBody>
                    {category.queries.map((query) => (
                      <TableRow
                        key={query.id}
                        hover
                        sx={{ '&:hover': { bgcolor: '#232d3f' }, bgcolor: '#131d2e' }}
                      >
                        <TableCell sx={{ width: 70, borderColor: '#2a3245' }}>
                          <Chip label={query.id} size="small" sx={{ bgcolor: '#2a3245', color: '#8892a4', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#e8eaf0', borderColor: '#2a3245', minWidth: 200 }}>
                          {query.name}
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245' }}>
                          <Chip
                            label={query.severity.toUpperCase()}
                            size="small"
                            sx={{ bgcolor: '#2a3245', color: SEV_COLOR[query.severity] || '#8892a4', fontWeight: 'bold', fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: '#8892a4', fontSize: 12, borderColor: '#2a3245', maxWidth: 260 }}>
                          {query.description}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa', borderColor: '#2a3245', maxWidth: 300, wordBreak: 'break-word' }}>
                          {query.query}
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245', minWidth: 90 }}>
                          <Chip
                            label={`${query.results} hit${query.results !== 1 ? 's' : ''}`}
                            size="small"
                            sx={{
                              bgcolor: '#2a3245',
                              color: query.results > 0 ? '#ef5350' : '#a5d6a7',
                              fontWeight: 'bold',
                              fontSize: 10,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: '#2a3245', maxWidth: 320 }}>
                          <Typography variant="body2" sx={{ color: '#8892a4', fontSize: 11, lineHeight: 1.5 }}>
                            {buildQueryReason(query)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </Box>
  );
};

const ThreatQueries: React.FC = () => (
  <ClusterGuard>
    <ThreatQueriesInner />
  </ClusterGuard>
);

export default ThreatQueries;
