/**
 * ClusterSelector
 * ───────────────
 * A compact dropdown in the AppBar that lets the user switch the active cluster.
 * Selecting a cluster updates ClusterContext → every page that uses clusterParam
 * in its useEffect deps automatically re-fetches scoped to that cluster.
 *
 * Options:
 *  • "All Clusters" (id = 'all') — aggregate view
 *  • One entry per registered cluster, colour-coded by environment
 */
import React from 'react';
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Chip,
  Typography,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import { Storage as StorageIcon } from '@mui/icons-material';
import { useCluster } from '../contexts/ClusterContext';

function envColor(
  env: string
): 'error' | 'warning' | 'info' | 'default' {
  switch (env) {
    case 'production':
      return 'error';
    case 'staging':
      return 'warning';
    case 'qa':
      return 'info';
    default:
      return 'default';
  }
}

const ClusterSelector: React.FC = () => {
  const { clusters, activeClusterId, selectCluster, loading } = useCluster();

  const handleChange = (e: SelectChangeEvent<string>) => {
    selectCluster(e.target.value);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
      <StorageIcon sx={{ fontSize: 18, color: 'inherit', opacity: 0.7 }} />

      {loading && clusters.length === 0 ? (
        <CircularProgress size={16} color="inherit" />
      ) : (
        <FormControl size="small" sx={{ minWidth: 200 }} variant="outlined">
          <Select
            value={activeClusterId}
            onChange={handleChange}
            displayEmpty
            sx={{
              color: 'inherit',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.3)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.6)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.8)',
              },
              '& .MuiSelect-icon': { color: 'inherit' },
              fontSize: '0.875rem',
              height: 32,
            }}
            renderValue={(selected) => {
              if (selected === 'all') {
                return (
                  <Typography variant="body2" sx={{ color: 'inherit' }}>
                    All Clusters
                  </Typography>
                );
              }
              const cluster = clusters.find((c) => c.id === selected);
              return (
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  {cluster?.name ?? selected}
                </Typography>
              );
            }}
          >
            {/* "All Clusters" option */}
            <MenuItem value="all">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="ALL" size="small" sx={{ fontSize: 10, height: 18 }} />
                <Typography variant="body2">All Clusters</Typography>
              </Box>
            </MenuItem>

            {/* One entry per cluster */}
            {clusters.map((cluster) => (
              <MenuItem key={cluster.id} value={cluster.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={cluster.environment.toUpperCase().slice(0, 4)}
                    size="small"
                    color={envColor(cluster.environment)}
                    sx={{ fontSize: 10, height: 18 }}
                  />
                  <Box>
                    <Typography variant="body2">{cluster.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {cluster.region} · {cluster.nodes} nodes · {cluster.pods} pods
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Box>
  );
};

export default ClusterSelector;

// Made with Bob
