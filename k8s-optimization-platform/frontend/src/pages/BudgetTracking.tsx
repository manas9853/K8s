import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, CircularProgress, Alert, Chip, Paper,
  LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import CostAccuracyBanner from '../components/CostAccuracyBanner';
import ClusterGuard from '../components/ClusterGuard';
import { API_BASE_URL } from '../config/api';

// ── Design tokens ────────────────────────────────────────────────────────────
const DK = {
  bg: '#0d1117', surface: '#161b22', surface2: '#1c2128',
  border: '#30363d', text: '#e6edf3', muted: '#8b949e',
};
const ACCENT = '#58a6ff';
const GREEN  = '#3fb950';
const AMBER  = '#d29922';
const RED    = '#f85149';

// ── Types ────────────────────────────────────────────────────────────────────
interface OverallBudget {
  annual_budget?: number;
  monthly_budget?: number;
  ytd_budget?: number;
  ytd_actual?: number;
  ytd_variance?: number;
  variance_percentage?: number;
  current_spend: number;
  status: string;
}

interface MonthlyTracking {
  month: string;
  budget?: number;
  actual: number;
  variance?: number;
  status: string;
}

interface BudgetAlert {
  severity: string;
  team?: string;
  message: string;
  action_required?: string;
}

interface Forecast {
  end_of_month: number;
  end_of_quarter?: number;
  end_of_year?: number;
  confidence: number;
  method?: string;
}

interface BudgetData {
  overall_budget: OverallBudget;
  monthly_tracking: MonthlyTracking[];
  team_budgets?: any[];
  budget_alerts?: BudgetAlert[];
  forecast: Forecast;
  cost_source: string;
  data_from: string;
  last_updated: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtOrDash = (n?: number) => (n == null ? '—' : fmt(n));

const alertSeverityStyle = (sev: string): { color: string; bg: string; border: string } => {
  if (sev === 'critical' || sev === 'error') return { color: RED,   bg: '#f8514912', border: `1px solid ${RED}44`   };
  if (sev === 'warning')                     return { color: AMBER, bg: '#d2992212', border: `1px solid ${AMBER}44` };
  return                                            { color: ACCENT, bg: '#58a6ff12', border: `1px solid ${ACCENT}44` };
};

const barColor = (status: string) =>
  status === 'over_budget' || status === 'over' ? RED : GREEN;

const sx = {
  card: {
    bgcolor: DK.surface,
    border: `1px solid ${DK.border}`,
    borderRadius: 2,
    p: 2.5,
  },
  label: {
    color: DK.muted, fontSize: '0.75rem', fontWeight: 600, mb: 0.5,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  value: { color: DK.text, fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.2 },
};

// ── Inner page ───────────────────────────────────────────────────────────────
const BudgetTrackingInner: React.FC = () => {
  const { clusterParam, activeClusterId } = useActiveCluster();
  const [data, setData]       = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/v1/finops/budget-tracking${clusterParam}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [clusterParam]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
      <CircularProgress sx={{ color: ACCENT }} />
    </Box>
  );
  if (error) return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  if (!data)  return null;

  const ob       = data.overall_budget;
  const forecast = data.forecast;
  const tracking = data.monthly_tracking ?? [];
  const alerts   = data.budget_alerts ?? [];
  const noBudget = ob.monthly_budget == null;

  return (
    <Box sx={{ p: 3, bgcolor: DK.bg, minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1.5} mb={2} flexWrap="wrap">
        <AccountBalanceWalletIcon sx={{ fontSize: 32, color: ACCENT }} />
        <Box flex={1}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1.45rem' }}>
            Budget Tracking
          </Typography>
          <Typography sx={{ color: DK.muted, fontSize: '0.8rem' }}>
            {data.cost_source} · Updated {new Date(data.last_updated).toLocaleString()}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} size="small" sx={{ color: DK.muted, '&:hover': { color: ACCENT } }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Cost accuracy banner ────────────────────────────────────────────── */}
      <CostAccuracyBanner clusterName={activeClusterId} />

      {/* ── No-budget info box ─────────────────────────────────────────────── */}
      {noBudget && (
        <Box sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1.5,
          bgcolor: `${ACCENT}0e`, border: `1px solid ${ACCENT}33`,
          borderRadius: 2, p: 2, mb: 3,
        }}>
          <InfoOutlinedIcon sx={{ color: ACCENT, fontSize: 18, mt: '1px', flexShrink: 0 }} />
          <Typography sx={{ color: DK.muted, fontSize: '0.85rem', lineHeight: 1.6 }}>
            No budget configured. Costs are tracked from{' '}
            <Typography component="span" sx={{ color: DK.text, fontWeight: 600 }}>
              {data.data_from}
            </Typography>
            . Set a budget in your team settings to enable variance tracking.
          </Typography>
        </Box>
      )}

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Current Spend',       value: fmt(ob.current_spend),            color: ACCENT },
          { label: 'Monthly Budget',      value: fmtOrDash(ob.monthly_budget),     color: noBudget ? DK.muted : DK.text },
          { label: 'YTD Actual',          value: fmtOrDash(ob.ytd_actual),         color: DK.text },
          { label: 'Forecast (EOM)',      value: fmt(forecast.end_of_month),       color: GREEN  },
        ].map((k) => (
          <Grid item xs={12} sm={6} md={3} key={k.label}>
            <Box sx={sx.card}>
              <Typography sx={sx.label}>{k.label}</Typography>
              <Typography sx={{ ...sx.value, color: k.color }}>{k.value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── Monthly chart + Forecast panel ────────────────────────────────── */}
      <Grid container spacing={3} mb={3}>

        {/* ComposedChart */}
        <Grid item xs={12} md={tracking.length === 0 ? 12 : 7}>
          <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3 }}>
            <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
              Monthly Budget vs Actual
            </Typography>

            {/* ── Empty state ──────────────────────────────────────────────── */}
            {tracking.length === 0 ? (
              <Box sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 1, py: 6,
                color: DK.muted, textAlign: 'center',
              }}>
                <InfoOutlinedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
                <Typography sx={{ color: DK.muted, fontSize: '0.9rem' }}>
                  Collecting cost data since{' '}
                  <Typography component="span" sx={{ color: DK.text, fontWeight: 600 }}>
                    {data.data_from}
                  </Typography>
                  . Check back soon.
                </Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <ComposedChart data={tracking} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={DK.border} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: DK.muted, fontSize: 11 }}
                    axisLine={{ stroke: DK.border }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: DK.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartTooltip
                    formatter={(v: number, name: string) => [fmt(v), name]}
                    contentStyle={{ bgcolor: DK.surface2, border: `1px solid ${DK.border}`, borderRadius: 8, color: DK.text }}
                    labelStyle={{ color: DK.text, fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ color: DK.muted, fontSize: 12 }} />
                  <Bar dataKey="actual" name="Actual" maxBarSize={40} radius={[4, 4, 0, 0]}>
                    {tracking.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry.status)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                  {/* Only render budget line if at least one entry has a budget value */}
                  {tracking.some((m) => m.budget != null) && (
                    <Line
                      type="monotone"
                      dataKey="budget"
                      name="Budget"
                      stroke={ACCENT}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Forecast panel */}
        {tracking.length > 0 && (
          <Grid item xs={12} md={5}>
            <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3, height: '100%' }}>
              <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
                Spend Forecast
              </Typography>
              <Box display="flex" flexDirection="column" gap={0}>
                {([
                  { label: 'End of Month',   value: fmt(forecast.end_of_month)            },
                  { label: 'End of Quarter', value: fmtOrDash(forecast.end_of_quarter)    },
                  { label: 'End of Year',    value: fmtOrDash(forecast.end_of_year)       },
                  { label: 'Confidence',     value: `${forecast.confidence}%`             },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <Box
                    key={label}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ borderBottom: `1px solid ${DK.border}`, py: 1.25 }}
                  >
                    <Typography sx={{ color: DK.muted, fontSize: '0.85rem' }}>{label}</Typography>
                    <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '0.9rem' }}>{value}</Typography>
                  </Box>
                ))}
                {forecast.method && (
                  <Box sx={{ pt: 1.5 }}>
                    <Chip
                      label={forecast.method.replace(/_/g, ' ')}
                      size="small"
                      sx={{ bgcolor: DK.surface2, color: DK.muted, border: `1px solid ${DK.border}`, fontSize: '0.72rem' }}
                    />
                  </Box>
                )}
              </Box>

              {/* Insufficient data note */}
              {forecast.method === 'flat_insufficient_data' && (
                <Box sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1,
                  bgcolor: `${AMBER}0e`, border: `1px solid ${AMBER}33`,
                  borderRadius: 1.5, p: 1.5, mt: 2,
                }}>
                  <WarningAmberIcon sx={{ color: AMBER, fontSize: 16, mt: '1px', flexShrink: 0 }} />
                  <Typography sx={{ color: AMBER, fontSize: '0.75rem', lineHeight: 1.5 }}>
                    Forecast based on current rate. More data needed for trend analysis.
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* ── Budget alerts ──────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <Box mb={3}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
            Budget Alerts
          </Typography>
          <Box display="flex" flexDirection="column" gap={1.5}>
            {alerts.map((a, i) => {
              const style = alertSeverityStyle(a.severity);
              return (
                <Box
                  key={i}
                  sx={{
                    bgcolor: style.bg,
                    border: style.border,
                    borderLeft: `3px solid ${style.color}`,
                    borderRadius: 2, p: 2,
                    display: 'flex', alignItems: 'flex-start', gap: 1.25,
                  }}
                >
                  <WarningAmberIcon sx={{ color: style.color, fontSize: 17, mt: '1px', flexShrink: 0 }} />
                  <Box flex={1}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.25}>
                      {a.team && (
                        <Typography component="span" sx={{ color: style.color, fontWeight: 700, fontSize: '0.8rem' }}>
                          {a.team}
                        </Typography>
                      )}
                      <Chip
                        label={a.severity}
                        size="small"
                        sx={{
                          bgcolor: `${style.color}22`, color: style.color,
                          border: `1px solid ${style.color}44`,
                          fontSize: '0.65rem', fontWeight: 700, height: 18,
                        }}
                      />
                    </Box>
                    <Typography sx={{ color: DK.text, fontSize: '0.875rem', mb: 0.5 }}>
                      {a.message}
                    </Typography>
                    {a.action_required && a.action_required !== 'None' && (
                      <Typography sx={{ color: DK.muted, fontSize: '0.78rem', fontStyle: 'italic' }}>
                        → {a.action_required}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── YTD variance summary (only when budget exists) ─────────────────── */}
      {!noBudget && ob.ytd_actual != null && (
        <Paper sx={{ bgcolor: DK.surface, border: `1px solid ${DK.border}`, borderRadius: 2, p: 3 }}>
          <Typography sx={{ color: DK.text, fontWeight: 700, fontSize: '1rem', mb: 2 }}>
            YTD Summary
          </Typography>
          <Grid container spacing={3}>
            {[
              { label: 'YTD Budget',      value: fmtOrDash(ob.ytd_budget),       color: ACCENT },
              { label: 'YTD Actual',      value: fmtOrDash(ob.ytd_actual),       color: DK.text },
              { label: 'YTD Variance',    value: fmtOrDash(ob.ytd_variance),     color: (ob.ytd_variance ?? 0) < 0 ? GREEN : RED },
              { label: 'Variance %',      value: ob.variance_percentage != null ? `${ob.variance_percentage.toFixed(1)}%` : '—',
                color: (ob.variance_percentage ?? 0) < 0 ? GREEN : RED },
            ].map((k) => (
              <Grid item xs={6} sm={3} key={k.label}>
                <Typography sx={sx.label}>{k.label}</Typography>
                <Typography sx={{ color: k.color, fontWeight: 700, fontSize: '1.25rem' }}>{k.value}</Typography>
              </Grid>
            ))}
          </Grid>
          {ob.ytd_budget != null && ob.ytd_actual != null && (
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>Budget utilisation</Typography>
                <Typography sx={{ color: DK.muted, fontSize: '0.75rem' }}>
                  {Math.min(Math.round((ob.ytd_actual / ob.ytd_budget) * 100), 100)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(Math.round((ob.ytd_actual / ob.ytd_budget) * 100), 100)}
                sx={{
                  height: 6, borderRadius: 3,
                  bgcolor: `${ACCENT}18`,
                  '& .MuiLinearProgress-bar': {
                    bgcolor: ob.ytd_actual > ob.ytd_budget ? RED : GREEN,
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          )}
        </Paper>
      )}

    </Box>
  );
};

// ── Export (wrapped with ClusterGuard) ───────────────────────────────────────
const BudgetTracking: React.FC = () => (
  <ClusterGuard><BudgetTrackingInner /></ClusterGuard>
);

export default BudgetTracking;

// Made with Bob
