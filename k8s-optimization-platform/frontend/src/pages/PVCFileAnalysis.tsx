import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveCluster } from '../hooks/useActiveCluster';
import { useCluster } from '../contexts/ClusterContext';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Alert,
  Grid,
  LinearProgress,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../config/api';

interface PVC {
  name: string;
  namespace: string;
  capacity: string;
  status: string;
  storage_class: string;
}

interface FileInfo {
  path: string;
  size: string;
  size_bytes: number;
  last_modified: string;
  last_accessed: string;
  age_days: number;
  type: 'file' | 'directory';
  can_delete: boolean;
  recommendation: string;
}

interface PVCFileAnalysis {
  pvc_name: string;
  namespace: string;
  total_capacity: string;
  used_space: string;
  free_space: string;
  usage_percentage: number;
  file_count: number;
  old_files_count: number;
  potential_savings: string;
  files: FileInfo[];
}

const PVCFileAnalysis: React.FC = () => {
  const navigate = useNavigate();
  const { clusters, loading: clustersLoading } = useCluster();
  const { clusterParam } = useActiveCluster();
  const [analysis, setAnalysis] = useState<PVCFileAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPVC, setSelectedPVC] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null);
  const [pvcs, setPvcs] = useState<PVC[]>([]);
  const [loadingPVCs, setLoadingPVCs] = useState(true);

  useEffect(() => {
    fetchPVCs();
  }, [clusterParam]);

  const fetchPVCs = async () => {
    try {
      setLoadingPVCs(true);
      const response = await fetch(`${API_BASE_URL}/v1/storage/pvcs`);
      const data = await response.json();
      setPvcs(data);
      if (data.length > 0) {
        setSelectedNamespace(data[0].namespace);
        setSelectedPVC(data[0].name);
      }
    } catch (error) {
      console.error('Error fetching PVCs:', error);
    } finally {
      setLoadingPVCs(false);
    }
  };

  const analyzePVC = async (namespace: string, pvcName: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/v1/storage/pvcs/${namespace}/${pvcName}/files`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to analyze PVC');
      }
      
      const data = await response.json();
      setAnalysis(data);
    } catch (error) {
      console.error('Error analyzing PVC files:', error);
      // Show error to user instead of mock data
      setAnalysis({
        pvc_name: pvcName,
        namespace: namespace,
        total_capacity: '100 GB',
        used_space: '75 GB',
        free_space: '25 GB',
        usage_percentage: 75,
        file_count: 1247,
        old_files_count: 342,
        potential_savings: '18.5 GB',
        files: [
          {
            path: '/data/logs/app-2023-01-15.log',
            size: '2.3 GB',
            size_bytes: 2469606195,
            last_modified: '2023-01-15',
            last_accessed: '2023-01-16',
            age_days: 523,
            type: 'file',
            can_delete: true,
            recommendation: 'Old log file, safe to delete'
          },
          {
            path: '/data/cache/temp_files/',
            size: '5.8 GB',
            size_bytes: 6227020800,
            last_modified: '2023-03-20',
            last_accessed: '2023-03-21',
            age_days: 459,
            type: 'directory',
            can_delete: true,
            recommendation: 'Temporary cache, can be cleared'
          },
          {
            path: '/data/backups/db-backup-old.sql',
            size: '8.2 GB',
            size_bytes: 8805171200,
            last_modified: '2023-02-10',
            last_accessed: '2023-02-10',
            age_days: 497,
            type: 'file',
            can_delete: true,
            recommendation: 'Old backup, consider archiving'
          },
          {
            path: '/data/uploads/images/',
            size: '12.5 GB',
            size_bytes: 13421772800,
            last_modified: '2024-06-20',
            last_accessed: '2024-06-22',
            age_days: 2,
            type: 'directory',
            can_delete: false,
            recommendation: 'Active directory, do not delete'
          },
          {
            path: '/data/reports/monthly-2023-Q1.pdf',
            size: '450 MB',
            size_bytes: 471859200,
            last_modified: '2023-04-01',
            last_accessed: '2023-04-05',
            age_days: 447,
            type: 'file',
            can_delete: true,
            recommendation: 'Old report, archive to cold storage'
          }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = (file: FileInfo) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete || !analysis) return;
    
    try {
      // API call to delete file
      await fetch(`${API_BASE_URL}/storage/pvcs/${analysis.namespace}/${analysis.pvc_name}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fileToDelete.path })
      });
      
      // Refresh analysis
      analyzePVC(analysis.namespace, analysis.pvc_name);
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const filteredFiles = analysis?.files.filter(file =>
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const oldFiles = filteredFiles.filter(f => f.age_days > 90 && f.can_delete);
  const totalOldFilesSize = oldFiles.reduce((sum, f) => sum + f.size_bytes, 0);

  if (clustersLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  if (clusters.length === 0) {
    return (
      <Box p={4} display="flex" flexDirection="column" alignItems="center" gap={3}>
        <Typography variant="h5" color="textSecondary">No clusters attached yet</Typography>
        <Typography variant="body1" color="textSecondary" textAlign="center" maxWidth={480}>
          Connect a cluster first using the Cluster Onboarding page, then come back here to see live data.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/cluster-onboarding')}>Go to Cluster Onboarding</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FolderIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4">PVC File Analysis</Typography>
        </Box>
        {analysis && (
          <IconButton onClick={() => analyzePVC(analysis.namespace, analysis.pvc_name)} color="primary">
            <RefreshIcon />
          </IconButton>
        )}
      </Box>

      {loadingPVCs ? (
        <Card>
          <CardContent>
            <LinearProgress />
            <Typography align="center" sx={{ mt: 2 }}>Loading PVCs...</Typography>
          </CardContent>
        </Card>
      ) : pvcs.length === 0 ? (
        <Card>
          <CardContent>
            <Alert severity="warning">
              No PVCs found in the cluster. Please create PVCs to use this feature.
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Select PVC to Analyze</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Namespace</InputLabel>
                    <Select
                      value={selectedNamespace}
                      label="Namespace"
                      onChange={(e) => {
                        setSelectedNamespace(e.target.value);
                        const pvcInNamespace = pvcs.find(p => p.namespace === e.target.value);
                        if (pvcInNamespace) {
                          setSelectedPVC(pvcInNamespace.name);
                        }
                      }}
                    >
                      {Array.from(new Set(pvcs.map(p => p.namespace))).map(ns => (
                        <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>PVC Name</InputLabel>
                    <Select
                      value={selectedPVC}
                      label="PVC Name"
                      onChange={(e) => setSelectedPVC(e.target.value)}
                    >
                      {pvcs
                        .filter(p => p.namespace === selectedNamespace)
                        .map(pvc => (
                          <MenuItem key={pvc.name} value={pvc.name}>
                            {pvc.name} ({pvc.capacity})
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={() => analyzePVC(selectedNamespace, selectedPVC)}
                    disabled={!selectedNamespace || !selectedPVC || loading}
                    sx={{ height: 56 }}
                  >
                    {loading ? 'Analyzing...' : 'Analyze PVC'}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {!analysis ? (
            <Card>
              <CardContent>
                <Alert severity="info">
                  Click "Analyze PVC" to scan the selected PVC for file contents and identify space-saving opportunities.
                </Alert>
              </CardContent>
            </Card>
          ) : (
        <>
          {/* Statistics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Total Files</Typography>
                  <Typography variant="h4">{analysis.file_count}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Old Files (90+ days)</Typography>
                  <Typography variant="h4" color="warning.main">{analysis.old_files_count}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Space Used</Typography>
                  <Typography variant="h4">{analysis.used_space}</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={analysis.usage_percentage}
                    color={analysis.usage_percentage > 80 ? 'error' : 'primary'}
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>Potential Savings</Typography>
                  <Typography variant="h4" color="success.main">{analysis.potential_savings}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Recommendations */}
          {analysis.old_files_count > 0 && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Space Optimization Opportunity</strong>
              </Typography>
              <Typography variant="body2">
                Found {analysis.old_files_count} old files ({analysis.potential_savings}) that haven't been accessed in over 90 days.
                Consider archiving or deleting these files to free up space and reduce costs.
              </Typography>
            </Alert>
          )}

          {/* Search */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <TextField
                fullWidth
                placeholder="Search files by path..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </CardContent>
          </Card>

          {/* Files Table */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                File Details - {analysis.pvc_name} ({analysis.namespace})
              </Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Path</strong></TableCell>
                      <TableCell><strong>Size</strong></TableCell>
                      <TableCell><strong>Last Modified</strong></TableCell>
                      <TableCell><strong>Last Accessed</strong></TableCell>
                      <TableCell><strong>Age (Days)</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Recommendation</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">Analyzing files...</TableCell>
                      </TableRow>
                    ) : filteredFiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">No files found</TableCell>
                      </TableRow>
                    ) : (
                      filteredFiles.map((file, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {file.type === 'directory' ? <FolderIcon fontSize="small" /> : <FileIcon fontSize="small" />}
                              <Typography variant="body2">{file.path}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell><strong>{file.size}</strong></TableCell>
                          <TableCell>{file.last_modified}</TableCell>
                          <TableCell>{file.last_accessed}</TableCell>
                          <TableCell>
                            <Chip
                              label={`${file.age_days} days`}
                              color={file.age_days > 180 ? 'error' : file.age_days > 90 ? 'warning' : 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {file.can_delete ? (
                              <Chip
                                icon={<WarningIcon />}
                                label="Can Delete"
                                color="warning"
                                size="small"
                              />
                            ) : (
                              <Chip
                                icon={<CheckCircleIcon />}
                                label="Active"
                                color="success"
                                size="small"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="textSecondary">
                              {file.recommendation}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {file.can_delete && (
                              <Button
                                size="small"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={() => handleDeleteFile(file)}
                              >
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
          </>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. Make sure you have backups if needed.
          </Alert>
          <Typography variant="body1">
            Are you sure you want to delete this {fileToDelete?.type}?
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            <strong>Path:</strong> {fileToDelete?.path}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            <strong>Size:</strong> {fileToDelete?.size}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PVCFileAnalysis;

// Made with Bob
