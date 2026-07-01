import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  LinearProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Park as EcoIcon,
  TrendingDown as TrendingDownIcon,
  Bolt as EnergyIcon,
} from '@mui/icons-material';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { API_BASE_URL } from '../config/api';

const Carbon: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [summary, setSummary] = useState<any>(null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchData();
  }, [clusterParam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchClusters(),
        fetchTrends(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/carbon/summary${clusterParam}`);
    const data = await response.json();
    setSummary(data);
  };

  const fetchClusters = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/carbon/clusters${clusterParam}`);
    const data = await response.json();
    setClusters(data);
  };

  const fetchTrends = async () => {
    const response = await fetch(`${API_BASE_URL}/v1/carbon/trends${clusterParam}`);
    const data = await response.json();
    setTrends(data);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Carbon Footprint Dashboard
        </Typography>
        <IconButton onClick={fetchData} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {summary && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card sx={{ bgcolor: 'success.light' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <EcoIcon sx={{ mr: 1 }} />
                  <Typography color="textSecondary" gutterBottom>
                    Carbon Saved
                  </Typography>
                </Box>
                <Typography variant="h4">{summary.total_carbon_saved_kg} kg</Typography>
                <Typography variant="caption">CO₂ equivalent</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <EnergyIcon sx={{ mr: 1 }} />
                  <Typography color="textSecondary" gutterBottom>
                    Energy Saved
                  </Typography>
                </Box>
                <Typography variant="h4">{summary.total_energy_saved_kwh} kWh</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <TrendingDownIcon sx={{ mr: 1 }} />
                  <Typography color="textSecondary" gutterBottom>
                    Cost Saved
                  </Typography>
                </Box>
                <Typography variant="h4">${summary.total_cost_saved.toLocaleString()}</Typography>
                <Typography variant="caption">Monthly</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Reduction Rate
                </Typography>
                <Typography variant="h4" color="success.main">
                  {summary.reduction_percentage}%
                </Typography>
                <Typography variant="caption">vs last month</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Carbon Footprint Trend
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="carbon_kg" stroke="#4caf50" name="Carbon (kg)" />
                <Line type="monotone" dataKey="energy_kwh" stroke="#2196f3" name="Energy (kWh)" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Savings by Cluster
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clusters}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cluster" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="carbon_saved_kg" fill="#4caf50" name="Carbon Saved (kg)" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Paper>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="Cluster Details" />
          <Tab label="Environmental Impact" />
        </Tabs>

        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Carbon Saved (kg)</TableCell>
                    <TableCell>Energy Saved (kWh)</TableCell>
                    <TableCell>Cost Saved</TableCell>
                    <TableCell>Efficiency</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusters.map((cluster) => (
                    <TableRow key={cluster.cluster}>
                      <TableCell>{cluster.cluster}</TableCell>
                      <TableCell>{cluster.carbon_saved_kg}</TableCell>
                      <TableCell>{cluster.energy_saved_kwh}</TableCell>
                      <TableCell>${cluster.cost_saved.toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip
                          label={`${cluster.efficiency_score}/100`}
                          color={cluster.efficiency_score > 80 ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tabValue === 1 && summary && (
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Environmental Equivalents
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        🌳 Trees planted equivalent: <strong>{summary.trees_equivalent}</strong>
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        🚗 Miles not driven: <strong>{summary.miles_not_driven.toLocaleString()}</strong>
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        💡 Homes powered for a day: <strong>{summary.homes_powered}</strong>
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Sustainability Goals
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        Monthly Target: <strong>500 kg CO₂</strong>
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(summary.total_carbon_saved_kg / 500) * 100}
                        sx={{ mb: 2 }}
                      />
                      <Typography variant="body2" color="success.main">
                        {((summary.total_carbon_saved_kg / 500) * 100).toFixed(0)}% of monthly goal achieved
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>

      {loading && <LinearProgress />}
    </Box>
  );
};

export default Carbon;

// Made with Bob
