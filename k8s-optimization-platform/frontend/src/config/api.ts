/**
 * API Configuration
 * Dev: relative URLs proxied by react-scripts to localhost:8000
 * Prod: REACT_APP_API_URL points to EC2 backend (http://98.82.224.39)
 */
const _backendBase = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/$/, '')
  : '';

export const API_BASE_URL = `${_backendBase}/api`;

// API endpoints
export const API_ENDPOINTS = {
  // Dashboard
  dashboard: {
    executive: `${API_BASE_URL}/dashboard/executive`,
    kpis: `${API_BASE_URL}/dashboard/kpis`,
    insights: `${API_BASE_URL}/dashboard/insights`,
    wasteContributors: `${API_BASE_URL}/dashboard/waste-contributors`,
    costTrend: `${API_BASE_URL}/dashboard/cost-trend`,
  },
  
  // Clusters
  clusters: {
    list: `${API_BASE_URL}/clusters`,
    health: `${API_BASE_URL}/clusters/health`,
    nodes: `${API_BASE_URL}/clusters/nodes`,
    workerPools: `${API_BASE_URL}/clusters/worker-pools`,
    utilization: `${API_BASE_URL}/clusters/utilization`,
    benchmarking: `${API_BASE_URL}/clusters/benchmarking`,
  },
  
  // Executive
  executive: `${API_BASE_URL}/executive`,
  
  // Recommendations
  recommendations: `${API_BASE_URL}/recommendations`,
  
  // Pods
  pods: `${API_BASE_URL}/pods`,
  
  // Cost Savings
  costSavings: `${API_BASE_URL}/cost-savings`,
  
  // Cleanup
  cleanup: `${API_BASE_URL}/cleanup`,
  
  // Auto Fix
  autofix: `${API_BASE_URL}/autofix`,
  
  // Rollback
  rollback: `${API_BASE_URL}/rollback`,
  
  // AI Copilot
  aiCopilot: `${API_BASE_URL}/ai-copilot`,
  
  // Autonomous
  autonomous: `${API_BASE_URL}/autonomous`,
  
  // Scoring
  scoring: `${API_BASE_URL}/scoring`,
  
  // Team Accountability
  teamAccountability: `${API_BASE_URL}/team-accountability`,
  
  // Heatmap
  heatmap: `${API_BASE_URL}/heatmap`,
  
  // Root Cause
  rootCause: `${API_BASE_URL}/root-cause`,
  
  // Simulation
  simulation: `${API_BASE_URL}/simulation`,
  
  // Guardrails
  guardrails: `${API_BASE_URL}/guardrails`,
  
  // Incidents
  incidents: {
    list: `${API_BASE_URL}/v1/incidents/incidents`,
    correlations: `${API_BASE_URL}/v1/incidents/correlations`,
    patterns: `${API_BASE_URL}/v1/incidents/patterns`,
    summary: `${API_BASE_URL}/v1/incidents/summary`,
  },
  
  // Predictive
  predictive: `${API_BASE_URL}/predictive`,
  
  // Carbon
  carbon: `${API_BASE_URL}/carbon`,
  
  // Benchmarking
  benchmarking: {
    clusters: `${API_BASE_URL}/v1/benchmarking/clusters`,
    comparison: `${API_BASE_URL}/v1/benchmarking/comparison`,
  },
  
  // Reports
  reports: `${API_BASE_URL}/reports`,
  
  // Audit
  audit: `${API_BASE_URL}/audit`,
  
  // Command Center
  commandCenter: {
    status: `${API_BASE_URL}/v1/command-center/status`,
    metrics: `${API_BASE_URL}/v1/command-center/metrics`,
    alerts: `${API_BASE_URL}/v1/command-center/alerts`,
  },
  
  // Tokens
  tokens: {
    generate: `${API_BASE_URL}/tokens/generate`,
    list: `${API_BASE_URL}/tokens/list`,
    verify: `${API_BASE_URL}/tokens/verify`,
    revoke: (hash: string) => `${API_BASE_URL}/tokens/${hash}`,
  },
};

// Helper function to build full URL
export const getApiUrl = (endpoint: string): string => {
  // If endpoint already starts with /api, return as is
  if (endpoint.startsWith('/api')) {
    return endpoint;
  }
  // Otherwise prepend API_BASE_URL
  return `${API_BASE_URL}/${endpoint}`;
};

// Made with Bob
