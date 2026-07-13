/**
 * FinOps Reports
 * Parallel-fetches cost-management, savings-tracker, and sustainability-score,
 * then renders a consolidated report view.  Dark GitHub theme.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Button, IconButton,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RefreshIcon from '@mui/icons-material/Refresh';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import ClusterGuard from '../components/ClusterGuard';

// ── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN   = '#3fb950';
const AMBER   = '#d29922';
const RED     = '#f85149';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `$${Number(n ?? 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

const priorityColor = (p: string): string =>
  p === 'high' ? RED : p === 'medium' ? AMBER : GREEN;

const gradeColor = (g: string): string =>
  g?.startsWith('A') ? GREEN : g?.startsWith('B') ? ACCENT : AMBER;

// mini bar — fills a cell inline
const MiniBar: React.FC<{ pct: number }> = ({ pct }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
    <Box sx={{
      flex: 1, height: 6, bgcolor: DK.surface2, borderRadius: 3, overflow: 'hidden',
    }}>
      <Box sx={{
        width: `${Math.min(pct, 100)}%`, height: '100%',
        bgcolor: pct > 60 ? RED : pct > 30 ? AMBER : ACCENT, borderRadius: 3,
      }} />
    </Box>
    <Typography sx={{ fontSize: '0.7rem', color: DK.muted, minWidth: 30 }}>{pct}%</Typography>
  </Box>
);

// shared card style
const card = (accent?: string) => ({
  bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 2.5,
  ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
});

// ── Component ────────────────────────────────────────────────────────────────
const FinOpsReportsInner: React.FC = () => {
  const navigate = useNavigate();
  const { clusterParam, activeClusterId, activeClusterName } = useActiveCluster();

  const [costData,   setCostData]   = useState<any>(null);
  const [savingsData, setSavingsData] = useState<any>(null);
  const [sustainData, setSustainData] = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [costRes, savRes, susRes] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/finops/cost-management${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/savings-tracker${clusterParam}`),
        fetch(`${API_BASE_URL}/v1/finops/sustainability-score${clusterParam}`),
      ]);
      const [cost, sav, sus] = await Promise.all([
        costRes.ok ? costRes.json() : null,
        savRes.ok  ? savRes.json()  : null,
        susRes.ok  ? susRes.json()  : null,
      ]);
      setCostData(cost);
      setSavingsData(sav);
      setSustainData(sus);
      setGeneratedAt(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: ACCENT }} />
      </Box>
    );
  }
  if (error) {
    return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  }

  // ── derived shortcuts ────────────────────────────────────────────────────
  const isAccurate    = costData?.accuracy === 'invoice';
  const dataFrom      = costData?.data_from ?? null;
  const monthlyTotal  = costData?.total_monthly_cost  ?? 0;
  const annualTotal   = costData?.total_annual_cost   ?? monthlyTotal * 12;
  const savPotential  = savingsData?.total_savings?.monthly_potential ?? 0;
  const optRate       = savingsData?.optimization_rate ?? 0;
  const sustainScore  = sustainData?.overall_score ?? '—';
  const sustainGrade  = sustainData?.grade ?? '—';
  const sustainTrend  = sustainData?.trend ?? '—';
  const resourceTypes: any[] = costData?.cost_by_resource_type ?? [];
  const namespaces:    any[] = costData?.cost_allocation ?? [];
  const categories:    any[] = savingsData?.savings_by_category ?? [];
  const recommendations: any[] = (sustainData?.recommendations ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const rank = (p: string) => p === 'high' ? 0 : p === 'medium' ? 1 : 2;
      return rank(a.priority) - rank(b.priority);
    });

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh', color: DK.text }}>

      {/* ── 1. Page header ── */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AssessmentIcon sx={{ fontSize: 36, color: ACCENT }} />
          <Box>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color: DK.text, lineHeight: 1.2 }}>
              FinOps Reports
            </Typography>
            <Typography sx={{ fontSize: '0.83rem', color: DK.muted, mt: 0.25 }}>
              Comprehensive cost &amp; sustainability summary for{' '}
              <span style={{ color: DK.text, fontWeight: 600 }}>{activeClusterName}</span>
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton onClick={fetchAll} size="small" sx={{ color: DK.muted, '&:hover': { color: DK.text } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={() => navigate('/reports/pdf-export')}
            sx={{ borderColor: DK.border, color: DK.text, textTransform: 'none', fontSize: '0.78rem' }}
          >
            Export PDF
          </Button>
        </Box>
      </Box>

      {/* ── 2. Cost accuracy banner ── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── 3. Report header card ── */}
      <Box sx={{ ...card(), mb: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: '0.7rem', color: DK.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Report generated
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: DK.text, fontWeight: 600, mt: 0.25 }}>
              {generatedAt || '—'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: '0.7rem', color: DK.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Cluster
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: DK.text, fontWeight: 600, mt: 0.25 }}>
              {activeClusterName}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: '0.7rem', color: DK.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Cost source
            </Typography>
            <Box mt={0.5}>
              {isAccurate ? (
                <Chip label="✓ Invoice-Accurate" size="small"
                  sx={{ bgcolor: `${GREEN}22`, color: GREEN, border: `1px solid ${GREEN}44`, fontWeight: 700, fontSize: '0.72rem' }} />
              ) : (
                <Chip label="~ Estimated" size="small"
                  sx={{ bgcolor: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}44`, fontWeight: 700, fontSize: '0.72rem' }} />
              )}
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography sx={{ fontSize: '0.7rem', color: DK.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Data available from
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: dataFrom ? ACCENT : DK.muted, fontWeight: 600, mt: 0.25 }}>
              {dataFrom ?? 'Agent onboarding date'}
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {/* ── 4. Executive summary ── */}
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
        Executive Summary
      </Typography>
      <Box sx={{ ...card(ACCENT), mb: 2.5 }}>
        <Grid container spacing={0}>

          {/* Cost overview col */}
          <Grid item xs={12} md={4} sx={{ pr: { md: 3 }, borderRight: { md: `1px solid ${DK.border}` } }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
              Cost Overview
            </Typography>
            {[
              ['Total Monthly Cost',  fmt(monthlyTotal)],
              ['Annual Projection',   fmt(annualTotal)],
              ['Cost Source',         isAccurate ? 'Invoice-Accurate' : 'Estimated'],
            ].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: `1px solid ${DK.border}` }}>
                <Typography sx={{ fontSize: '0.8rem', color: DK.muted }}>{k}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: DK.text, fontWeight: 600 }}>{v}</Typography>
              </Box>
            ))}
          </Grid>

          {/* Savings col */}
          <Grid item xs={12} md={4} sx={{ px: { md: 3 }, mt: { xs: 2, md: 0 }, borderRight: { md: `1px solid ${DK.border}` } }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
              Savings
            </Typography>
            {[
              ['Monthly Potential', fmt(savPotential)],
              ['Optimization Rate', `${optRate}%`],
            ].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: `1px solid ${DK.border}` }}>
                <Typography sx={{ fontSize: '0.8rem', color: DK.muted }}>{k}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: DK.text, fontWeight: 600 }}>{v}</Typography>
              </Box>
            ))}
          </Grid>

          {/* Sustainability col */}
          <Grid item xs={12} md={4} sx={{ pl: { md: 3 }, mt: { xs: 2, md: 0 } }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: gradeColor(sustainGrade), textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
              Sustainability
            </Typography>
            {[
              ['Overall Score', `${sustainScore} / 100`],
              ['Grade',         sustainGrade],
              ['Trend',         sustainTrend],
            ].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: `1px solid ${DK.border}` }}>
                <Typography sx={{ fontSize: '0.8rem', color: DK.muted }}>{k}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: DK.text, fontWeight: 600 }}>{v}</Typography>
              </Box>
            ))}
          </Grid>
        </Grid>
      </Box>

      {/* ── 5. Cost breakdown by resource type ── */}
      {resourceTypes.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Cost Breakdown
          </Typography>
          <Box sx={{ ...card(), mb: 2.5 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Resource Type', 'Monthly Cost', '% of Total', 'Share'].map(h => (
                      <TableCell key={h} sx={{ color: DK.muted, fontSize: '0.72rem', borderColor: DK.border, pb: 1 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resourceTypes.map((r: any, i: number) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                      <TableCell sx={{ color: DK.text, fontWeight: 600, fontSize: '0.82rem', borderColor: DK.border }}>
                        {r.type}
                      </TableCell>
                      <TableCell sx={{ color: GREEN, fontWeight: 700, fontSize: '0.82rem', borderColor: DK.border }}>
                        {fmt(r.cost)}
                      </TableCell>
                      <TableCell sx={{ color: DK.muted, fontSize: '0.82rem', borderColor: DK.border }}>
                        {r.percentage ?? Math.round((r.cost / (monthlyTotal || 1)) * 100)}%
                      </TableCell>
                      <TableCell sx={{ borderColor: DK.border }}>
                        <MiniBar pct={r.percentage ?? Math.round((r.cost / (monthlyTotal || 1)) * 100)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* ── 6. Top namespaces by cost ── */}
      {namespaces.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Top Namespaces by Cost
          </Typography>
          <Box sx={{ ...card(), mb: 2.5 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Namespace', 'Monthly Cost', 'Team / Owner'].map(h => (
                      <TableCell key={h} sx={{ color: DK.muted, fontSize: '0.72rem', borderColor: DK.border, pb: 1 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {namespaces.slice(0, 8).map((ns: any, i: number) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                      <TableCell sx={{ color: ACCENT, fontWeight: 600, fontSize: '0.82rem', borderColor: DK.border }}>
                        {ns.namespace}
                      </TableCell>
                      <TableCell sx={{ color: DK.text, fontWeight: 600, fontSize: '0.82rem', borderColor: DK.border }}>
                        {fmt(ns.cost ?? ns.monthly_cost ?? 0)}
                      </TableCell>
                      <TableCell sx={{ color: DK.muted, fontSize: '0.82rem', borderColor: DK.border }}>
                        {ns.team ?? ns.owner ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* ── 7. Savings opportunities ── */}
      {categories.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Savings Opportunities
          </Typography>
          <Box sx={{ ...card(), mb: 2.5 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Category', 'Potential Savings', 'Completion'].map(h => (
                      <TableCell key={h} sx={{ color: DK.muted, fontSize: '0.72rem', borderColor: DK.border, pb: 1 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {categories.map((c: any, i: number) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: DK.surface2 } }}>
                      <TableCell sx={{ color: DK.text, fontWeight: 600, fontSize: '0.82rem', borderColor: DK.border }}>
                        {c.category}
                      </TableCell>
                      <TableCell sx={{ color: GREEN, fontWeight: 700, fontSize: '0.82rem', borderColor: DK.border }}>
                        {fmt(c.potential ?? c.remaining_potential ?? 0)}
                      </TableCell>
                      <TableCell sx={{ borderColor: DK.border, minWidth: 160 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={c.completion_rate ?? 0}
                            sx={{
                              flex: 1, height: 6, borderRadius: 3, bgcolor: DK.surface2,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: (c.completion_rate ?? 0) > 50 ? GREEN : AMBER,
                              },
                            }}
                          />
                          <Typography sx={{ fontSize: '0.72rem', color: DK.muted, minWidth: 28 }}>
                            {c.completion_rate ?? 0}%
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}

      {/* ── 8. Sustainability recommendations ── */}
      {recommendations.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: DK.muted, textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Recommendations
          </Typography>
          <Box sx={{ ...card(), mb: 2.5 }}>
            {recommendations.map((r: any, i: number) => (
              <Box
                key={i}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1.25,
                  borderBottom: i < recommendations.length - 1 ? `1px solid ${DK.border}` : 'none',
                }}
              >
                <Chip
                  label={r.priority?.toUpperCase() ?? 'LOW'}
                  size="small"
                  sx={{
                    bgcolor: `${priorityColor(r.priority)}22`,
                    color: priorityColor(r.priority),
                    border: `1px solid ${priorityColor(r.priority)}44`,
                    fontWeight: 700, fontSize: '0.68rem', flexShrink: 0, mt: 0.1,
                  }}
                />
                <Typography sx={{ flex: 1, fontSize: '0.83rem', color: DK.text }}>
                  {r.recommendation}
                </Typography>
                {r.impact_on_score != null && (
                  <Chip
                    label={`+${r.impact_on_score} pts`}
                    size="small"
                    sx={{
                      bgcolor: `${GREEN}22`, color: GREEN,
                      border: `1px solid ${GREEN}44`, fontWeight: 700, fontSize: '0.68rem', flexShrink: 0,
                    }}
                  />
                )}
                {r.effort && (
                  <Typography sx={{ fontSize: '0.72rem', color: DK.muted, flexShrink: 0, alignSelf: 'center' }}>
                    {r.effort} effort
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* ── 9. Report footer ── */}
      <Box sx={{
        bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2,
        px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
      }}>
        <Typography sx={{ fontSize: '0.76rem', color: DK.muted, flex: 1 }}>
          <strong style={{ color: DK.text }}>Data period:</strong>{' '}
          {dataFrom
            ? <><span style={{ color: ACCENT }}>{dataFrom}</span> → <span style={{ color: ACCENT }}>{today()}</span></>
            : <span style={{ color: AMBER }}>Agent onboarding date → {today()}</span>
          }
        </Typography>
        {!isAccurate && (
          <Typography sx={{ fontSize: '0.72rem', color: AMBER }}>
            ⚠ Costs are estimates based on public on-demand rates. Connect your cloud account for invoice-accurate data.
          </Typography>
        )}
      </Box>

    </Box>
  );
};

const FinOpsReports: React.FC = () => (
  <ClusterGuard>
    <FinOpsReportsInner />
  </ClusterGuard>
);

export default FinOpsReports;

// Made with Bob
