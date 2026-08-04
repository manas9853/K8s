import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors } from '../../theme/colors';

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
  critical: colors.danger,
  high: colors.warning,
  medium: colors.info,
  low: colors.success,
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

  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/attack-investigation/threat-queries${clusterParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: ThreatQueriesData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threat queries');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" sx={{ bgcolor: colors.background }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh' }}>
        <Alert severity="error">Failed to load threat queries</Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: colors.background, minHeight: '100vh', color: colors.textPrimary }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <SearchIcon sx={{ fontSize: 32, color: colors.info }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ color: colors.textPrimary }}>
              Threat Queries
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Real security query results for {data.cluster_name || 'cluster'} · Last updated {formatTimestamp(data.last_updated)}
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" onClick={() => fetchData(true)} sx={{ bgcolor: colors.info, '&:hover': { bgcolor: colors.info } }}>
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Categories', value: data.categories.length, color: colors.info },
          { label: 'Total Queries', value: totalQueries, color: colors.info },
          { label: 'Total Hits', value: totalHits, color: totalHits > 0 ? colors.danger : colors.success },
          { label: 'Critical Hits', value: criticalHits, color: criticalHits > 0 ? colors.danger : colors.success },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Card sx={{ bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>{item.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {hittingQueries.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: colors.textPrimary, mb: 1.5 }}>
            Active Violations — What the queries found
          </Typography>
          <Stack spacing={1.5}>
            {hittingQueries.map((query) => (
              <Box key={query.id} sx={{ p: 2, borderRadius: 1, bgcolor: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1} mb={0.5}>
                  <Box display="flex" gap={1} alignItems="center">
                    <Chip label={query.id} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: colors.textPrimary }}>
                      {query.name}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Chip
                      label={query.severity.toUpperCase()}
                      size="small"
                      sx={{ bgcolor: colors.border, color: SEV_COLOR[query.severity] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }}
                    />
                    <Chip
                      label={`${query.results} hit${query.results !== 1 ? 's' : ''}`}
                      size="small"
                      sx={{ bgcolor: colors.border, color: colors.danger, fontWeight: 'bold', fontSize: 10 }}
                    />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: colors.textMuted, lineHeight: 1.7 }}>
                  {buildQueryReason(query)}
                </Typography>
                <Typography variant="caption" sx={{ color: colors.textSecondary, fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
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
                bgcolor: colors.surface,
                border: `1px solid ${colors.border}`,
                boxShadow: 'none',
                '&:before': { display: 'none' },
                '& .MuiAccordionSummary-root': { borderBottom: `1px solid ${colors.border}` },
              }}
            >
              <AccordionSummary expandIcon={<ExpandIcon sx={{ color: colors.textSecondary }} />}>
                <Box display="flex" alignItems="center" gap={1.5} width="100%">
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: colors.textPrimary }}>
                    {category.name}
                  </Typography>
                  <Chip label={`${category.queries.length} queries`} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
                  <Chip
                    label={`${categoryHits} hit${categoryHits !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ bgcolor: colors.border, color: categoryHits > 0 ? colors.danger : colors.success, fontWeight: 'bold', fontSize: 10 }}
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
                        sx={{ '&:hover': { bgcolor: colors.surfaceHover }, bgcolor: colors.surfaceAlt }}
                      >
                        <TableCell sx={{ width: 70, borderColor: colors.border }}>
                          <Chip label={query.id} size="small" sx={{ bgcolor: colors.border, color: colors.textSecondary, fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, color: colors.textPrimary, borderColor: colors.border, minWidth: 200 }}>
                          {query.name}
                        </TableCell>
                        <TableCell sx={{ borderColor: colors.border }}>
                          <Chip
                            label={query.severity.toUpperCase()}
                            size="small"
                            sx={{ bgcolor: colors.border, color: SEV_COLOR[query.severity] || colors.textSecondary, fontWeight: 'bold', fontSize: 10 }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: colors.textSecondary, fontSize: 12, borderColor: colors.border, maxWidth: 260 }}>
                          {query.description}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: colors.info, borderColor: colors.border, maxWidth: 300, wordBreak: 'break-word' }}>
                          {query.query}
                        </TableCell>
                        <TableCell sx={{ borderColor: colors.border, minWidth: 90 }}>
                          <Chip
                            label={`${query.results} hit${query.results !== 1 ? 's' : ''}`}
                            size="small"
                            sx={{
                              bgcolor: colors.border,
                              color: query.results > 0 ? colors.danger : colors.success,
                              fontWeight: 'bold',
                              fontSize: 10,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderColor: colors.border, maxWidth: 320 }}>
                          <Typography variant="body2" sx={{ color: colors.textSecondary, fontSize: 11, lineHeight: 1.5 }}>
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
