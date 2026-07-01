import React from 'react';
import { useActiveCluster } from '../hooks/useActiveCluster';
import {
  Box,
  Paper,
  Typography,
  Container,
  Card,
  CardContent,
  Grid,
  Chip,
} from '@mui/material';
import {
  Psychology as PsychologyIcon,
  Construction as ConstructionIcon,
  AutoAwesome as AutoAwesomeIcon,
  TrendingUp as TrendingUpIcon,
  Lightbulb as LightbulbIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

const AICopilot: React.FC = () => {
  const { clusterParam } = useActiveCluster();
  const upcomingFeatures = [
    {
      icon: <PsychologyIcon sx={{ fontSize: 40 }} />,
      title: 'Natural Language Queries',
      description: 'Ask questions about your infrastructure in plain English',
      color: '#1976d2',
    },
    {
      icon: <AutoAwesomeIcon sx={{ fontSize: 40 }} />,
      title: 'Intelligent Recommendations',
      description: 'AI-powered optimization suggestions based on your usage patterns',
      color: '#9c27b0',
    },
    {
      icon: <TrendingUpIcon sx={{ fontSize: 40 }} />,
      title: 'Predictive Analytics',
      description: 'Forecast resource needs and prevent issues before they occur',
      color: '#2e7d32',
    },
    {
      icon: <LightbulbIcon sx={{ fontSize: 40 }} />,
      title: 'Root Cause Analysis',
      description: 'Automatically identify the source of waste and inefficiencies',
      color: '#ed6c02',
    },
    {
      icon: <SpeedIcon sx={{ fontSize: 40 }} />,
      title: 'Real-time Insights',
      description: 'Get instant answers about cost, performance, and optimization',
      color: '#d32f2f',
    },
    {
      icon: <ConstructionIcon sx={{ fontSize: 40 }} />,
      title: 'Automated Actions',
      description: 'Let AI execute approved optimizations automatically',
      color: '#0288d1',
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box
          sx={{
            textAlign: 'center',
            mb: 6,
            mt: 4,
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              borderRadius: '50%',
              bgcolor: 'primary.light',
              mb: 3,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': {
                  transform: 'scale(1)',
                  opacity: 1,
                },
                '50%': {
                  transform: 'scale(1.05)',
                  opacity: 0.8,
                },
              },
            }}
          >
            <PsychologyIcon sx={{ fontSize: 80, color: 'primary.main' }} />
          </Box>
          
          <Typography
            variant="h3"
            fontWeight="bold"
            gutterBottom
            sx={{
              background: 'linear-gradient(45deg, #1976d2 30%, #9c27b0 90%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            AI Optimization Copilot
          </Typography>
          
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Your Intelligent Kubernetes Assistant
          </Typography>
          
          <Chip
            label="COMING SOON"
            color="primary"
            sx={{
              mt: 2,
              fontSize: '1rem',
              fontWeight: 'bold',
              px: 2,
              py: 3,
            }}
          />
        </Box>

        {/* Description */}
        <Paper
          sx={{
            p: 4,
            mb: 4,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
          }}
        >
          <Typography variant="h5" gutterBottom fontWeight="medium">
            The Future of Kubernetes Optimization
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: 800, mx: 'auto', mt: 2 }}>
            AI Copilot will revolutionize how you interact with your Kubernetes infrastructure.
            Ask questions in natural language, get intelligent recommendations, and let AI handle
            complex optimization tasks automatically.
          </Typography>
        </Paper>

        {/* Upcoming Features */}
        <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ mb: 3 }}>
          Upcoming Features
        </Typography>
        
        <Grid container spacing={3}>
          {upcomingFeatures.map((feature, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card
                sx={{
                  height: '100%',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: 6,
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      mb: 2,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 60,
                        height: 60,
                        borderRadius: 2,
                        bgcolor: `${feature.color}15`,
                        color: feature.color,
                      }}
                    >
                      {feature.icon}
                    </Box>
                    <Typography variant="h6" fontWeight="bold">
                      {feature.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Example Queries */}
        <Paper sx={{ p: 4, mt: 4, bgcolor: 'grey.50' }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Example Queries You'll Be Able to Ask
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {[
              'Why is my cluster expensive?',
              'Which workloads waste the most CPU?',
              'Show me savings opportunities above $500/month',
              'What should I optimize first?',
              'Analyze namespace analytics for waste',
              'Predict my infrastructure costs for next month',
              'Find all over-provisioned pods',
              'What caused the OOMKill in production?',
            ].map((query, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: 'white',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    "{query}"
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 6, mb: 4 }}>
          <Typography variant="body2" color="text.secondary">
            This feature is currently under development and will be available soon.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            In the meantime, explore other features like Recommendations, AutoFix, and Cleanup.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default AICopilot;

// Made with Bob
