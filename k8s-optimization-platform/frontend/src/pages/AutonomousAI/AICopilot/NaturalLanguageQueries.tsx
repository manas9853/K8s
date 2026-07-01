import React, { useState } from 'react';
import { useActiveCluster } from '../../../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Send as SendIcon,
  Lightbulb as LightbulbIcon,
  History as HistoryIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import axios from 'axios';

interface QueryResponse {
  query: string;
  response: string;
  suggestions: string[];
  timestamp: string;
}

interface QueryHistory {
  query: string;
  timestamp: string;
}

const NaturalLanguageQueries: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);

  const suggestedQueries = [
    "Why is my cluster expensive?",
    "Which workloads waste the most CPU?",
    "Show savings opportunities above $500/month",
    "What should I optimize first?",
    "Find pods with high memory usage",
    "List idle namespaces",
    "Show security vulnerabilities",
    "Recommend cost optimizations"
  ];

  const handleSubmit = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.post('/api/v1/autonomous-ai/copilot/query', {
        query: query.trim()
      });

      setResponse(res.data);
      setHistory(prev => [{
        query: query.trim(),
        timestamp: new Date().toISOString()
      }, ...prev.slice(0, 9)]);
      
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process query');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuery = (suggestedQuery: string) => {
    setQuery(suggestedQuery);
  };

  const handleHistoryQuery = (historicalQuery: string) => {
    setQuery(historicalQuery);
  };

  const handleClear = () => {
    setQuery('');
    setResponse(null);
    setError(null);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Natural Language Queries
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Ask questions about your Kubernetes infrastructure in plain English
      </Typography>

      <Grid container spacing={3}>
        {/* Query Input Section */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Ask a Question
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., Why is my cluster expensive?"
                variant="outlined"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={loading || !query.trim()}
                  startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
                >
                  {loading ? 'Processing...' : 'Ask'}
                </Button>
                <IconButton onClick={handleClear} disabled={!query && !response}>
                  <ClearIcon />
                </IconButton>
              </Box>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Response Section */}
            {response && (
              <Card sx={{ mb: 3, bgcolor: 'background.default' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Response:
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                    {response.response}
                  </Typography>

                  {response.suggestions && response.suggestions.length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Follow-up Suggestions:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {response.suggestions.map((suggestion, index) => (
                          <Chip
                            key={index}
                            label={suggestion}
                            onClick={() => handleSuggestedQuery(suggestion)}
                            color="primary"
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Suggested Queries */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <LightbulbIcon sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="h6">
                  Suggested Queries
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {suggestedQueries.map((sq, index) => (
                  <Chip
                    key={index}
                    label={sq}
                    onClick={() => handleSuggestedQuery(sq)}
                    color="default"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Query History Sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <HistoryIcon sx={{ mr: 1 }} />
              <Typography variant="h6">
                Recent Queries
              </Typography>
            </Box>

            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No query history yet
              </Typography>
            ) : (
              <List>
                {history.map((item, index) => (
                  <React.Fragment key={index}>
                    <ListItem
                      button
                      onClick={() => handleHistoryQuery(item.query)}
                      sx={{ px: 0 }}
                    >
                      <ListItemText
                        primary={item.query}
                        secondary={new Date(item.timestamp).toLocaleString()}
                        primaryTypographyProps={{
                          noWrap: true,
                          variant: 'body2'
                        }}
                        secondaryTypographyProps={{
                          variant: 'caption'
                        }}
                      />
                    </ListItem>
                    {index < history.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>

          {/* Query Tips */}
          <Paper sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Query Tips
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Be specific"
                  secondary="Include cluster, namespace, or workload names"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Ask about metrics"
                  secondary="CPU, memory, cost, waste, efficiency"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Request actions"
                  secondary="Show, find, list, recommend, optimize"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Set thresholds"
                  secondary="Above $500, more than 50%, less than 30%"
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default NaturalLanguageQueries;

// Made with Bob
