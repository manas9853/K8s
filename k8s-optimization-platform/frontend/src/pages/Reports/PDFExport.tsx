import React, { useState } from 'react';
import {
  Box, Typography, Paper, Button, Alert, LinearProgress,
  Card, CardContent, Grid, Divider, Chip,
} from '@mui/material';
import { PictureAsPdf as PdfIcon, Download as DownloadIcon } from '@mui/icons-material';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const REPORT_TYPES = [
  { type: 'executive', label: 'Executive Summary', description: 'High-level cost, savings, and security overview' },
  { type: 'weekly', label: 'Weekly Report', description: 'Weekly cluster activity and recommendations' },
  { type: 'monthly', label: 'Monthly Report', description: 'Monthly trends, cost analysis, and optimization progress' },
  { type: 'detailed', label: 'Detailed Analysis', description: 'Full workload breakdown and pod-level recommendations' },
];

interface QueuedReport {
  reportType: string;
  taskId: string;
  statusUrl: string;
}

const PDFExport: React.FC = () => {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedReport[]>([]);

  const handleGenerate = async (reportType: string) => {
    setLoading((prev) => ({ ...prev, [reportType]: true }));
    setError(null);
    try {
      const res = await axios.post(
        `${API_BASE}/api/v1/reports/generate/${reportType}`,
        null,
        { params: { format: 'json' } }
      );
      const data = res.data as Record<string, string>;
      setQueued((prev) => [
        { reportType, taskId: data.task_id, statusUrl: data.status_url },
        ...prev,
      ]);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.detail ?? err.message
        : String(err);
      setError(String(msg));
    } finally {
      setLoading((prev) => ({ ...prev, [reportType]: false }));
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <PdfIcon color="error" sx={{ fontSize: 36 }} />
        <Typography variant="h4">PDF Export</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Generate PDF reports. Reports are queued as background tasks — poll the status URL for completion.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {REPORT_TYPES.map(({ type, label, description }) => (
          <Grid item xs={12} md={6} key={type}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>{label}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {description}
                </Typography>
                {loading[type] && <LinearProgress sx={{ mb: 1 }} />}
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleGenerate(type)}
                  disabled={loading[type]}
                  color="error"
                >
                  Generate PDF
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {queued.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Queued Reports</Typography>
          <Divider sx={{ mb: 2 }} />
          {queued.map((q, idx) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Chip label={q.reportType} size="small" color="error" />
              <Typography variant="body2" color="text.secondary">Task: {q.taskId}</Typography>
              <Typography variant="caption" color="text.secondary">→ {q.statusUrl}</Typography>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default PDFExport;
