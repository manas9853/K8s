import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
} from '@mui/material';
import {
  Psychology as PsychologyIcon,
  AutoAwesome as AutoAwesomeIcon,
  Security as SecurityIcon,
  BugReport as BugReportIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';

const AICopilot: React.FC = () => {
  const navigate = useNavigate();

  const tools = [
    {
      icon: <PsychologyIcon sx={{ fontSize: 36 }} />,
      title: 'Natural Language Queries',
      description: 'Ask questions about your infrastructure in plain English — cost, performance, and health.',
      route: '/autonomous-ai/ai-copilot/natural-language-queries',
      color: '#1976d2',
      badge: 'LIVE',
    },
    {
      icon: <AutoAwesomeIcon sx={{ fontSize: 36 }} />,
      title: 'Optimization Advisor',
      description: 'AI-powered rightsizing and waste-reduction recommendations driven by your real usage data.',
      route: '/autonomous-ai/ai-copilot/optimization-advisor',
      color: '#9c27b0',
      badge: 'LIVE',
    },
    {
      icon: <SecurityIcon sx={{ fontSize: 36 }} />,
      title: 'Security Advisor',
      description: 'Identify vulnerabilities, privilege escalations, and policy violations with AI guidance.',
      route: '/autonomous-ai/ai-copilot/security-advisor',
      color: '#2e7d32',
      badge: 'LIVE',
    },
    {
      icon: <BugReportIcon sx={{ fontSize: 36 }} />,
      title: 'Incident Investigator',
      description: 'Diagnose OOMKills, CrashLoopBackOffs, and deployment failures with root-cause analysis.',
      route: '/autonomous-ai/ai-copilot/incident-investigator',
      color: '#d32f2f',
      badge: 'LIVE',
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, mt: 1 }}>
          <PsychologyIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">AI Optimization Copilot</Typography>
            <Typography variant="body2" color="text.secondary">
              Select a tool below to start a session with your intelligent Kubernetes assistant.
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={3} sx={{ mt: 2 }}>
          {tools.map((tool) => (
            <Grid item xs={12} md={6} key={tool.route}>
              <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                <CardActionArea
                  sx={{ height: '100%', p: 0 }}
                  onClick={() => navigate(tool.route)}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 56, height: 56, borderRadius: 2,
                          bgcolor: `${tool.color}18`, color: tool.color, flexShrink: 0,
                        }}
                      >
                        {tool.icon}
                      </Box>
                      <Box flex={1}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="h6" fontWeight="bold">{tool.title}</Typography>
                          <Chip label={tool.badge} color="success" size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {tool.description}
                        </Typography>
                      </Box>
                      <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0, mt: 0.5 }} />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
};

export default AICopilot;

// Made with Bob
