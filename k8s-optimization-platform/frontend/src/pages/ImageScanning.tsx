import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Chip, CircularProgress,
  Alert, Button, Stack, Tooltip, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, InputAdornment,
  Collapse, IconButton, LinearProgress
} from '@mui/material';
import {
  BugReport as BugIcon, Search as SearchIcon, CheckCircle as CheckIcon,
  Cancel as CancelIcon, ArrowForward as ArrowIcon, ExpandMore, ExpandLess,
  Refresh as RefreshIcon, OpenInNew as ExternalIcon, Block as SkipIcon
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

// ── severity helpers ────────────────────────────────────────────────────────
const SEV: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fdecea', color: '#d32f2f' },
  high:     { bg: '#fff3e0', color: '#f57c00' },
  medium:   { bg: '#e3f2fd', color: '#1976d2' },
  low:      { bg: '#e8f5e9', color: '#388e3c' },
  clean:    { bg: '#e8f5e9', color: '#388e3c' },
  skipped:  { bg: '#f5f5f5', color: '#757575' },
  error:    { bg: '#fce4ec', color: '#880e4f' },
  unknown:  { bg: '#f5f5f5', color: '#757575' },
};

const sevOrder: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4
};

const CVSSBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 9 ? '#d32f2f' : score >= 7 ? '#f57c00' : score >= 4 ? '#1976d2' : '#388e3c';
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" fontWeight="bold" sx={{ color }}>{score.toFixed(1)}</Typography>
    </Box>
  );
};

// ── vuln row ────────────────────────────────────────────────────────────────
interface Vuln {
  vuln_id: string; pkg_name: string; installed_version: string;
  fixed_version: string; severity: string; title: string;
  cvss_score: number; primary_url: string; has_fix: boolean;
}

const VulnTable: React.FC<{ vulns: Vuln[]; limit?: number }> = ({ vulns, limit = 50 }) => {
  const sorted = useMemo(() => [...vulns].sort(
    (a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4) || b.cvss_score - a.cvss_score
  ), [vulns]);
  const shown = sorted.slice(0, limit);

  if (shown.length === 0) return (
    <Box p={2}><Alert severity="success" icon={<CheckIcon />}>No vulnerabilities found in this image.</Alert></Box>
  );

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
            {['CVE ID', 'Severity', 'CVSS', 'Package', 'Installed', 'Fixed Version', 'Title', ''].map(h => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, py: 0.75 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {shown.map((v, i) => {
            const s = SEV[v.severity.toLowerCase()] ?? SEV.unknown;
            return (
              <TableRow key={i} hover>
                <TableCell sx={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>
                  {v.vuln_id}
                </TableCell>
                <TableCell>
                  <Chip label={v.severity} size="small"
                    sx={{ bgcolor: s.bg, color: s.color, fontWeight: 'bold', fontSize: 10 }} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {v.cvss_score > 0 ? <CVSSBadge score={v.cvss_score} /> : <Typography variant="caption" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{v.pkg_name}</TableCell>
                <TableCell sx={{ fontSize: 11, fontFamily: 'monospace', color: '#555' }}>{v.installed_version}</TableCell>
                <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {v.fixed_version
                    ? <Typography variant="caption" fontFamily="monospace" color="success.dark" fontWeight="bold">{v.fixed_version}</Typography>
                    : <Typography variant="caption" color="text.secondary">no fix</Typography>
                  }
                </TableCell>
                <TableCell>
                  <Tooltip title={v.title}><Typography variant="caption" noWrap sx={{ maxWidth: 220, display: 'block' }}>{v.title}</Typography></Tooltip>
                </TableCell>
                <TableCell>
                  <Tooltip title="Open in AVD">
                    <IconButton size="small" href={v.primary_url} target="_blank" rel="noopener">
                      <ExternalIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ── expandable image row ─────────────────────────────────────────────────────
const ImageRow: React.FC<{ img: any }> = ({ img }) => {
  const [open, setOpen] = useState(false);
  const risk = img.risk_level ?? (img.critical > 0 ? 'critical' : img.high > 0 ? 'high' : img.medium > 0 ? 'medium' : img.low > 0 ? 'low' : 'clean');
  const { bg, color } = SEV[risk] ?? SEV.clean;
  const isSkipped = img.scan_status === 'skipped';
  const isError   = img.scan_status === 'error';

  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' } }} onClick={() => setOpen(o => !o)}>
        <TableCell>
          <IconButton size="small" sx={{ mr: 0.5, p: 0.25 }}>{open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}</IconButton>
        </TableCell>
        <TableCell sx={{ maxWidth: 260 }}>
          <Tooltip title={img.name ?? img.image}>
            <Typography variant="caption" fontFamily="monospace" noWrap sx={{ maxWidth: 240, display: 'block', fontWeight: 600 }}>
              {img.image_name ?? img.name ?? img.image}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">{img.image_tag}</Typography>
        </TableCell>
        <TableCell>
          {isSkipped
            ? <Chip label="SKIPPED" size="small" sx={{ bgcolor: '#f5f5f5', color: '#757575', fontSize: 10 }} />
            : isError
              ? <Chip label="ERROR" size="small" sx={{ bgcolor: '#fce4ec', color: '#880e4f', fontSize: 10 }} />
              : <Chip label={risk.toUpperCase()} size="small" sx={{ bgcolor: bg, color, fontWeight: 'bold', fontSize: 10 }} />
          }
        </TableCell>
        <TableCell sx={{ textAlign: 'center' }}>
          {(img.critical ?? 0) > 0
            ? <Chip label={img.critical} size="small" sx={{ bgcolor: '#fdecea', color: '#d32f2f', fontWeight: 'bold', fontSize: 11 }} />
            : <Typography variant="caption" color="text.secondary">—</Typography>}
        </TableCell>
        <TableCell sx={{ textAlign: 'center' }}>
          {(img.high ?? 0) > 0
            ? <Chip label={img.high} size="small" sx={{ bgcolor: '#fff3e0', color: '#f57c00', fontWeight: 'bold', fontSize: 11 }} />
            : <Typography variant="caption" color="text.secondary">—</Typography>}
        </TableCell>
        <TableCell sx={{ textAlign: 'center', fontSize: 12, color: (img.medium ?? 0) > 0 ? '#1976d2' : '#999' }}>{img.medium ?? 0}</TableCell>
        <TableCell sx={{ textAlign: 'center', fontSize: 12, color: '#777' }}>{img.low ?? 0}</TableCell>
        <TableCell sx={{ textAlign: 'center' }}>
          {img.has_fix || (img.patchable ?? 0) > 0
            ? <Chip label={img.patchable ?? '✓'} size="small" sx={{ bgcolor: '#e8f5e9', color: '#388e3c', fontSize: 10 }} />
            : <Typography variant="caption" color="text.secondary">—</Typography>}
        </TableCell>
        <TableCell sx={{ fontSize: 11, color: '#555' }}>{img.registry ?? '—'}</TableCell>
        <TableCell sx={{ fontSize: 11, color: '#555' }}>{img.base_image ?? '—'}</TableCell>
        <TableCell sx={{ fontSize: 11, color: '#555' }}>
          {img.namespaces?.slice(0, 2).join(', ') ?? '—'}
          {(img.namespaces?.length ?? 0) > 2 && ` +${img.namespaces.length - 2}`}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={11} sx={{ p: 0, border: open ? undefined : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ bgcolor: '#fafafa', borderTop: '1px solid #e0e0e0' }}>
              {isSkipped && (
                <Box p={2}><Alert severity="info" icon={<SkipIcon />}>{img.skip_reason || 'Private registry — skipped.'}</Alert></Box>
              )}
              {isError && (
                <Box p={2}><Alert severity="error">Scan failed: {img.error_message}</Alert></Box>
              )}
              {!isSkipped && !isError && (
                <VulnTable vulns={img.vulnerabilities ?? []} />
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ── main page ────────────────────────────────────────────────────────────────
const ImageScanning: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sevFilter, setSevFilter] = useState<string | null>(null);

  const fetchData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/security/image-scanning${clusterParam}`);
      setData(await res.json());
    } catch { /* keep existing */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, [clusterParam]);

  if (loading) return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="60vh" gap={2}>
      <CircularProgress size={48} />
      <Typography color="text.secondary">Running Trivy scans across all cluster images…</Typography>
      <Typography variant="caption" color="text.secondary">First scan downloads the vulnerability DB — may take 60–90 s</Typography>
    </Box>
  );

  if (!data) return <Box p={3}><Alert severity="error">Failed to load image scanning data</Alert></Box>;

  const images: any[] = data.images ?? data.scan_results ?? [];

  const filtered = images.filter(img => {
    const matchText = !searchTerm ||
      (img.name ?? img.image ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (img.image_name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const risk = img.risk_level ?? 'clean';
    const matchSev = !sevFilter || risk === sevFilter ||
      (sevFilter === 'patchable' && (img.patchable ?? 0) > 0);
    return matchText && matchSev;
  });

  const critical_images = images.filter(img => (img.critical ?? 0) > 0);
  const totalVulns = images.reduce((s, img) => s + (img.total_vulnerabilities ?? 0), 0);
  const totalCrit  = images.reduce((s, img) => s + (img.critical  ?? 0), 0);
  const totalHigh  = images.reduce((s, img) => s + (img.high  ?? 0), 0);
  const totalPatch = images.reduce((s, img) => s + (img.patchable ?? 0), 0);
  const skipped = images.filter(img => img.scan_status === 'skipped').length;
  const scanned = images.length - skipped;

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <BugIcon sx={{ fontSize: 36, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">Image Scanning</Typography>
            <Typography variant="caption" color="text.secondary">
              Powered by <strong>Trivy {data.scanner ?? ''}</strong> ·
              {scanned} scanned · {skipped} skipped (private registry) ·
              last scan {data.last_scan ? new Date(data.last_scan).toLocaleString() : '—'}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Re-scan now (uses cache if fresh)">
          <IconButton onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary stats */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Images',   count: images.length,  color: '#1976d2', bg: '#e3f2fd' },
          { label: 'With Critical',  count: data.critical_images ?? critical_images.length, color: '#d32f2f', bg: '#fdecea' },
          { label: 'Total Critical CVEs', count: totalCrit, color: '#d32f2f', bg: '#fdecea' },
          { label: 'Total High CVEs',     count: totalHigh, color: '#f57c00', bg: '#fff3e0' },
          { label: 'Total Vulns',    count: totalVulns,     color: '#7b1fa2', bg: '#f3e5f5' },
          { label: 'Patchable',      count: totalPatch,     color: '#388e3c', bg: '#e8f5e9' },
        ].map(({ label, count, color, bg }) => (
          <Grid item xs={6} md={2} key={label}>
            <Card sx={{ bgcolor: bg }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color }}>{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Critical images spotlight */}
      {critical_images.length > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, border: '1px solid #ef9a9a', bgcolor: '#fff8f8' }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <BugIcon sx={{ color: '#d32f2f' }} />
            <Typography variant="h6" fontWeight="bold" color="error.dark">Images with Critical CVEs</Typography>
            <Chip label={critical_images.length} size="small" color="error" sx={{ ml: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Click any row below to see full CVE list
            </Typography>
          </Box>
          <Stack spacing={1}>
            {critical_images.slice(0, 5).map((img: any, i: number) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #ffcdd2' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight="bold" fontFamily="monospace">
                      {img.image_name ?? img.name ?? img.image}:{img.image_tag}
                    </Typography>
                    <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
                      <Chip label={`${img.critical} Critical`} size="small" sx={{ bgcolor: '#fdecea', color: '#d32f2f', fontWeight: 'bold', fontSize: 10 }} />
                      {(img.high ?? 0) > 0 && <Chip label={`${img.high} High`} size="small" sx={{ bgcolor: '#fff3e0', color: '#f57c00', fontSize: 10 }} />}
                      {(img.patchable ?? 0) > 0 && <Chip label={`${img.patchable} patchable`} size="small" sx={{ bgcolor: '#e8f5e9', color: '#388e3c', fontSize: 10 }} />}
                      {img.base_image && <Chip label={img.base_image} size="small" variant="outlined" sx={{ fontSize: 10 }} />}
                    </Box>
                    {/* Top 2 critical CVEs inline */}
                    {(img.vulnerabilities ?? []).filter((v: Vuln) => v.severity === 'CRITICAL').slice(0, 2).map((v: Vuln) => (
                      <Box key={v.vuln_id} display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                        <Typography variant="caption" fontFamily="monospace" color="error.dark" fontWeight="bold">{v.vuln_id}</Typography>
                        {v.cvss_score > 0 && <CVSSBadge score={v.cvss_score} />}
                        <Typography variant="caption" color="text.secondary">{v.pkg_name} {v.installed_version}</Typography>
                        {v.fixed_version && (
                          <Typography variant="caption" color="success.dark">→ fix: {v.fixed_version}</Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                  <Button size="small" variant="contained" color="error"
                    onClick={() => navigate('/patch-recommendations')} sx={{ fontSize: 11 }}>
                    View Patch
                  </Button>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Filter bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField size="small" placeholder="Search images…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 260 }} />
          <Box display="flex" gap={1} flexWrap="wrap">
            {[
              { val: null,         label: 'All' },
              { val: 'critical',   label: 'Critical' },
              { val: 'high',       label: 'High' },
              { val: 'medium',     label: 'Medium' },
              { val: 'low',        label: 'Low' },
              { val: 'clean',      label: 'Clean' },
              { val: 'skipped',    label: 'Skipped' },
              { val: 'patchable',  label: 'Has Fix' },
            ].map(({ val, label }) => (
              <Button key={label} size="small"
                variant={sevFilter === val ? 'contained' : 'outlined'}
                color={val === 'critical' ? 'error' : val === 'high' ? 'warning' : 'primary'}
                onClick={() => setSevFilter(val)}
                sx={{ fontSize: 11, textTransform: 'capitalize' }}>
                {label}
              </Button>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {filtered.length} / {images.length} images · click row to expand CVEs
          </Typography>
        </Box>
      </Paper>

      {/* Main table with expandable rows */}
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ width: 36 }} />
                {['Image', 'Risk', 'Critical', 'High', 'Med', 'Low', 'Patchable', 'Registry', 'OS', 'Namespaces'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Box p={3}><Alert severity="info">No images match the current filter.</Alert></Box>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((img: any, i: number) => <ImageRow key={i} img={img} />)
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Cache info footer */}
      {data.cache && (
        <Box mt={1}>
          <Typography variant="caption" color="text.secondary">
            Cache: {data.cache.fresh_entries}/{data.cache.total_cached} entries fresh (TTL {Math.round(data.cache.cache_ttl_seconds / 3600)}h)
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ImageScanning;
// Made with Bob
