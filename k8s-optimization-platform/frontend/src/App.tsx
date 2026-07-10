import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import { ClusterProvider } from './contexts/ClusterContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// ── Eagerly loaded (tiny, always needed) ─────────────────────────────────────
import Login from './pages/Login';
import SignUpPage from './pages/SignUp';
import Onboarding from './pages/Onboarding';

// ── Code-split pages (loaded on demand) ──────────────────────────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Executive = lazy(() => import('./pages/Executive'));
const Clusters = lazy(() => import('./pages/Clusters'));
const ClusterHealth = lazy(() => import('./pages/ClusterHealth'));
const ClusterNodes = lazy(() => import('./pages/ClusterNodes'));
const WorkerPools = lazy(() => import('./pages/WorkerPools'));
const ResourceUtilization = lazy(() => import('./pages/ResourceUtilization'));
const ClusterBenchmarking = lazy(() => import('./pages/ClusterBenchmarking'));
const ClusterOnboarding = lazy(() => import('./pages/ClusterOnboarding'));
const Deployments = lazy(() => import('./pages/Deployments'));
const StatefulSets = lazy(() => import('./pages/StatefulSets'));
const DaemonSets = lazy(() => import('./pages/DaemonSets'));
const Jobs = lazy(() => import('./pages/Jobs'));
const CronJobs = lazy(() => import('./pages/CronJobs'));
const PVCs = lazy(() => import('./pages/PVCs'));
const PVs = lazy(() => import('./pages/PVs'));
const StorageConsumption = lazy(() => import('./pages/StorageConsumption'));
const OrphanedVolumes = lazy(() => import('./pages/OrphanedVolumes'));
const StorageForecasting = lazy(() => import('./pages/StorageForecasting'));
const PVCFileAnalysis = lazy(() => import('./pages/PVCFileAnalysis'));
const Services = lazy(() => import('./pages/Services'));
const Ingress = lazy(() => import('./pages/Ingress'));
const TrafficAnalysis = lazy(() => import('./pages/TrafficAnalysis'));
const ExternalExposure = lazy(() => import('./pages/ExternalExposure'));
const NetworkPolicies = lazy(() => import('./pages/NetworkPolicies'));
const Metrics = lazy(() => import('./pages/Metrics'));
const Logs = lazy(() => import('./pages/Logs'));
const Events = lazy(() => import('./pages/Events'));
const Traces = lazy(() => import('./pages/Traces'));
const ServiceHealth = lazy(() => import('./pages/ServiceHealth'));
const CPUAnalysis = lazy(() => import('./pages/CPUAnalysis'));
const MemoryAnalysis = lazy(() => import('./pages/MemoryAnalysis'));
const RestartAnalysis = lazy(() => import('./pages/RestartAnalysis'));
const OOMEvents = lazy(() => import('./pages/OOMEvents'));
const PodHealth = lazy(() => import('./pages/PodHealth'));
const Recommendations = lazy(() => import('./pages/Recommendations'));
const CPURightsizing = lazy(() => import('./pages/CPURightsizing'));
const MemoryRightsizing = lazy(() => import('./pages/MemoryRightsizing'));
const ResourceAllocation = lazy(() => import('./pages/ResourceAllocation'));
const Pods = lazy(() => import('./pages/Pods'));
const CostSavings = lazy(() => import('./pages/CostSavings'));
const MonthlySavings = lazy(() => import('./pages/MonthlySavings'));
const AnnualSavings = lazy(() => import('./pages/AnnualSavings'));
const CostBreakdown = lazy(() => import('./pages/CostBreakdown'));
const SavingsTrends = lazy(() => import('./pages/SavingsTrends'));
const Cleanup = lazy(() => import('./pages/Cleanup'));
const ZombieResources = lazy(() => import('./pages/ZombieResources'));
const UnusedDeployments = lazy(() => import('./pages/UnusedDeployments'));
const StaleConfigMaps = lazy(() => import('./pages/StaleConfigMaps'));
const StaleSecrets = lazy(() => import('./pages/StaleSecrets'));
const OldReplicaSets = lazy(() => import('./pages/OldReplicaSets'));
const UnattachedPVCs = lazy(() => import('./pages/UnattachedPVCs'));
const IdleNamespaces = lazy(() => import('./pages/IdleNamespaces'));
const ClusterWaste = lazy(() => import('./pages/ClusterWaste'));
const NamespaceWaste = lazy(() => import('./pages/NamespaceWaste'));
const TeamWaste = lazy(() => import('./pages/TeamWaste'));
const ApplicationWaste = lazy(() => import('./pages/ApplicationWaste'));
const ClusterScore = lazy(() => import('./pages/ClusterScore'));
const NamespaceScore = lazy(() => import('./pages/NamespaceScore'));
const TeamScore = lazy(() => import('./pages/TeamScore'));
const SecurityCommandCenter = lazy(() => import('./pages/SecurityCommandCenter'));
const SecurityScore = lazy(() => import('./pages/SecurityScore'));
const CVEDashboard = lazy(() => import('./pages/CVEDashboard'));
const ImageScanning = lazy(() => import('./pages/ImageScanning'));
const DependencyScanning = lazy(() => import('./pages/DependencyScanning'));
const PatchRecommendations = lazy(() => import('./pages/PatchRecommendations'));
const RuntimeSecurity = lazy(() => import('./pages/RuntimeSecurity'));
const PrivilegedContainers = lazy(() => import('./pages/PrivilegedContainers'));
const RootContainers = lazy(() => import('./pages/RootContainers'));
const ImageTrust = lazy(() => import('./pages/ImageTrust'));
const SecretExposure = lazy(() => import('./pages/SecretExposure'));
const SecretRotation = lazy(() => import('./pages/SecretRotation'));
const CertificateManagement = lazy(() => import('./pages/CertificateManagement'));
const CredentialAudit = lazy(() => import('./pages/CredentialAudit'));
const ExcessivePermissions = lazy(() => import('./pages/ExcessivePermissions'));
const ClusterAdminReview = lazy(() => import('./pages/ClusterAdminReview'));
const ServiceAccountsAnalysis = lazy(() => import('./pages/ServiceAccountsAnalysis'));
const LeastPrivilegeReview = lazy(() => import('./pages/LeastPrivilegeReview'));
const EastWestTraffic = lazy(() => import('./pages/EastWestTraffic'));
const ZeroTrustReview = lazy(() => import('./pages/ZeroTrustReview'));
const BaselineComparison = lazy(() => import('./pages/BaselineComparison'));
const DriftAlerts = lazy(() => import('./pages/DriftAlerts'));
const AutoRemediation = lazy(() => import('./pages/AutoRemediation'));
const AutoFix = lazy(() => import('./pages/AutoFix'));
const Rollback = lazy(() => import('./pages/Rollback'));
const AICopilot = lazy(() => import('./pages/AICopilot'));
const Autonomous = lazy(() => import('./pages/Autonomous'));

// Autonomous AI - AI Copilot
const NaturalLanguageQueries = lazy(() => import('./pages/AutonomousAI/AICopilot/NaturalLanguageQueries'));
const OptimizationAdvisor = lazy(() => import('./pages/AutonomousAI/AICopilot/OptimizationAdvisor'));
const SecurityAdvisor = lazy(() => import('./pages/AutonomousAI/AICopilot/SecurityAdvisor'));
const IncidentInvestigator = lazy(() => import('./pages/AutonomousAI/AICopilot/IncidentInvestigator'));

// Autonomous AI - Autonomous Operations
const ManualMode = lazy(() => import('./pages/AutonomousAI/AutonomousOperations/ManualMode'));
const AssistedMode = lazy(() => import('./pages/AutonomousAI/AutonomousOperations/AssistedMode'));
const AutonomousMode = lazy(() => import('./pages/AutonomousAI/AutonomousOperations/AutonomousMode'));

// Autonomous AI - Auto-Fix Center
const ResourceFixes = lazy(() => import('./pages/AutonomousAI/AutoFixCenter/ResourceFixes'));
const SecurityFixes = lazy(() => import('./pages/AutonomousAI/AutoFixCenter/SecurityFixes'));
const ComplianceFixes = lazy(() => import('./pages/AutonomousAI/AutoFixCenter/ComplianceFixes'));
const BulkFixes = lazy(() => import('./pages/AutonomousAI/AutoFixCenter/BulkFixes'));

// Autonomous AI - Rollback Center
const DeploymentRollback = lazy(() => import('./pages/AutonomousAI/RollbackCenter/DeploymentRollback'));
const ConfigurationRollback = lazy(() => import('./pages/AutonomousAI/RollbackCenter/ConfigurationRollback'));
const NamespaceRollback = lazy(() => import('./pages/AutonomousAI/RollbackCenter/NamespaceRollback'));
const ClusterRollback = lazy(() => import('./pages/AutonomousAI/RollbackCenter/ClusterRollback'));

// Autonomous AI - AI Recommendations
const CostRecommendations = lazy(() => import('./pages/AutonomousAI/AIRecommendations/CostRecommendations'));
const PerformanceRecommendations = lazy(() => import('./pages/AutonomousAI/AIRecommendations/PerformanceRecommendations'));
const ReliabilityRecommendations = lazy(() => import('./pages/AutonomousAI/AIRecommendations/ReliabilityRecommendations'));
const SecurityRecommendations = lazy(() => import('./pages/AutonomousAI/AIRecommendations/SecurityRecommendations'));
const ComplianceRecommendations = lazy(() => import('./pages/AutonomousAI/AIRecommendations/ComplianceRecommendations'));

const Scoring = lazy(() => import('./pages/Scoring'));
const TeamAccountability = lazy(() => import('./pages/TeamAccountability'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const RootCause = lazy(() => import('./pages/RootCause'));
const Simulation = lazy(() => import('./pages/Simulation'));
const Guardrails = lazy(() => import('./pages/Guardrails'));
const Incidents = lazy(() => import('./pages/Incidents'));
const Predictive = lazy(() => import('./pages/Predictive'));
const Carbon = lazy(() => import('./pages/Carbon'));
const Benchmarking = lazy(() => import('./pages/Benchmarking'));
const Reports = lazy(() => import('./pages/Reports'));
const Audit = lazy(() => import('./pages/Audit'));
const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const PredictiveFailures = lazy(() => import('./pages/PredictiveFailures'));
const CapacityForecasting = lazy(() => import('./pages/CapacityForecasting'));
const AnomalyDetection = lazy(() => import('./pages/AnomalyDetection'));
const DependencyMapping = lazy(() => import('./pages/DependencyMapping'));
const CostForecasting = lazy(() => import('./pages/CostForecasting'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const ComplianceDashboard = lazy(() => import('./pages/ComplianceDashboard'));
const ComplianceScore = lazy(() => import('./pages/ComplianceScore'));
const CISBenchmark = lazy(() => import('./pages/CISBenchmark'));
const SOC2Compliance = lazy(() => import('./pages/SOC2Compliance'));
const PCIDSSCompliance = lazy(() => import('./pages/PCIDSSCompliance'));
const ISO27001Compliance = lazy(() => import('./pages/ISO27001Compliance'));
const HIPAACompliance = lazy(() => import('./pages/HIPAACompliance'));
const GDPRCompliance = lazy(() => import('./pages/GDPRCompliance'));
const NISTCompliance = lazy(() => import('./pages/NISTCompliance'));
const PolicyEngine = lazy(() => import('./pages/PolicyEngine'));
const GovernanceRules = lazy(() => import('./pages/GovernanceRules'));
const SecurityGuardrails = lazy(() => import('./pages/SecurityGuardrails'));
const CICDGuardrails = lazy(() => import('./pages/CICDGuardrails'));
const AuditCenter = lazy(() => import('./pages/AuditCenter'));
const ChangeManagement = lazy(() => import('./pages/ChangeManagement'));
const CostManagement = lazy(() => import('./pages/CostManagement'));
const CostAllocation = lazy(() => import('./pages/CostAllocation'));
const ChargebackShowback = lazy(() => import('./pages/ChargebackShowback'));
const BudgetTracking = lazy(() => import('./pages/BudgetTracking'));
const SavingsTracker = lazy(() => import('./pages/SavingsTracker'));
const EnergyConsumption = lazy(() => import('./pages/EnergyConsumption'));
const SustainabilityScore = lazy(() => import('./pages/SustainabilityScore'));
const FinancialBenchmarking = lazy(() => import('./pages/FinancialBenchmarking'));
const CloudDiscovery = lazy(() => import('./pages/CloudDiscovery'));

// Reports & Analytics sub-pages
const FinOpsReports = lazy(() => import('./pages/FinOpsReports'));
const SecurityReports = lazy(() => import('./pages/SecurityReports'));
const ComplianceReports = lazy(() => import('./pages/ComplianceReports'));
const OptimizationReports = lazy(() => import('./pages/OptimizationReports'));
const IncidentReports = lazy(() => import('./pages/IncidentReports'));
const ScheduledReports = lazy(() => import('./pages/ScheduledReports'));

// People & Teams
const TeamCostAnalysis = lazy(() => import('./pages/TeamCostAnalysis'));
const TeamOptimizationScore = lazy(() => import('./pages/TeamOptimizationScore'));
const TeamSecurityScore = lazy(() => import('./pages/TeamSecurityScore'));
const OwnershipMapping = lazy(() => import('./pages/OwnershipMapping'));
const AccessReviews = lazy(() => import('./pages/AccessReviews'));

// Platform Engineering - GitOps
const ArgoCD = lazy(() => import('./pages/PlatformEngineering/ArgoCD'));
const FluxCD = lazy(() => import('./pages/PlatformEngineering/FluxCD'));
const GitopsDriftDetection = lazy(() => import('./pages/PlatformEngineering/GitopsDriftDetection'));

// Platform Engineering - CI/CD
const JenkinsIntegration = lazy(() => import('./pages/PlatformEngineering/JenkinsIntegration'));
const GitHubActions = lazy(() => import('./pages/PlatformEngineering/GitHubActions'));
const GitLabCI = lazy(() => import('./pages/PlatformEngineering/GitLabCI'));
const TektonPipelines = lazy(() => import('./pages/PlatformEngineering/TektonPipelines'));

// Platform Engineering - Other
const PolicyAsCode = lazy(() => import('./pages/PlatformEngineering/PolicyAsCode'));
const InfraAsCode = lazy(() => import('./pages/PlatformEngineering/InfraAsCode'));
const DeploymentIntelligence = lazy(() => import('./pages/PlatformEngineering/DeploymentIntelligence'));
const PlatformStandards = lazy(() => import('./pages/PlatformEngineering/PlatformStandards'));

// Administration
const UserManagement = lazy(() => import('./pages/Administration/UserManagement'));
const RBACAdmin = lazy(() => import('./pages/Administration/RBACAdmin'));
const SSOSaml = lazy(() => import('./pages/Administration/SSOSaml'));
const AdminIntegrations = lazy(() => import('./pages/Administration/Integrations'));
const AdminNotifications = lazy(() => import('./pages/Administration/Notifications'));
const APIKeys = lazy(() => import('./pages/Administration/APIKeys'));
const BackupRecovery = lazy(() => import('./pages/Administration/BackupRecovery'));
const PlatformSettings = lazy(() => import('./pages/Administration/PlatformSettings'));

// Attack Investigation
const SecurityIncidentCenter = lazy(() => import('./pages/AttackInvestigation/SecurityIncidentCenter'));
const ActiveThreats = lazy(() => import('./pages/AttackInvestigation/ActiveThreats'));
const IncidentTimeline = lazy(() => import('./pages/AttackInvestigation/IncidentTimeline'));
const AttackPathAnalysis = lazy(() => import('./pages/AttackInvestigation/AttackPathAnalysis'));
const BlastRadiusAnalysis = lazy(() => import('./pages/AttackInvestigation/BlastRadiusAnalysis'));
const SuspiciousPods = lazy(() => import('./pages/AttackInvestigation/SuspiciousPods'));
const SuspiciousProcesses = lazy(() => import('./pages/AttackInvestigation/SuspiciousProcesses'));
const SuspiciousUsers = lazy(() => import('./pages/AttackInvestigation/SuspiciousUsers'));
const ThreatQueries = lazy(() => import('./pages/AttackInvestigation/ThreatQueries'));
const PodEvidence = lazy(() => import('./pages/AttackInvestigation/PodEvidence'));
const AuditLogs = lazy(() => import('./pages/AttackInvestigation/AuditLogs'));
const ProcessHistory = lazy(() => import('./pages/AttackInvestigation/ProcessHistory'));
const NetworkEvidence = lazy(() => import('./pages/AttackInvestigation/NetworkEvidence'));
const DataExfiltration = lazy(() => import('./pages/AttackInvestigation/DataExfiltration'));
const CryptoMinerDetection = lazy(() => import('./pages/AttackInvestigation/CryptoMinerDetection'));
const InsiderThreat = lazy(() => import('./pages/AttackInvestigation/InsiderThreat'));
const MitreAttackMapping = lazy(() => import('./pages/AttackInvestigation/MitreAttackMapping'));
const IncidentPlaybooks = lazy(() => import('./pages/AttackInvestigation/IncidentPlaybooks'));
const PlaybookExecution = lazy(() => import('./pages/AttackInvestigation/PlaybookExecution'));
const QuarantineResource = lazy(() => import('./pages/AttackInvestigation/QuarantineResource'));
const KillPod = lazy(() => import('./pages/AttackInvestigation/KillPod'));
const BlockTraffic = lazy(() => import('./pages/AttackInvestigation/BlockTraffic'));
const RotateSecrets = lazy(() => import('./pages/AttackInvestigation/RotateSecrets'));
const EmergencyRollback = lazy(() => import('./pages/AttackInvestigation/EmergencyRollback'));

// ── Shared page-level loading fallback ───────────────────────────────────────
const PageLoader: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
    }}
  >
    <CircularProgress size={40} />
  </Box>
);

function App() {
  return (
    <AuthProvider>
      <ClusterProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Protected routes - All other pages */}
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Box sx={{ flexGrow: 1 }}>
                  <ErrorBoundary section="Application">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/command-center" element={<CommandCenter />} />
                      <Route path="/executive" element={<Executive />} />
                      <Route path="/clusters" element={<Clusters />} />
                      <Route path="/cluster-health" element={<ClusterHealth />} />
                      <Route path="/cluster-nodes" element={<ClusterNodes />} />
                      <Route path="/worker-pools" element={<WorkerPools />} />
                      <Route path="/resource-utilization" element={<ResourceUtilization />} />
                      <Route path="/cluster-benchmarking" element={<ClusterBenchmarking />} />
                      <Route path="/cluster-onboarding" element={<ClusterOnboarding />} />
                      <Route path="/deployments" element={<Deployments />} />
                      <Route path="/statefulsets" element={<StatefulSets />} />
                      <Route path="/daemonsets" element={<DaemonSets />} />
                      <Route path="/jobs" element={<Jobs />} />
                      <Route path="/cronjobs" element={<CronJobs />} />
                      <Route path="/cpu-analysis" element={<CPUAnalysis />} />
                      <Route path="/memory-analysis" element={<MemoryAnalysis />} />
                      <Route path="/restart-analysis" element={<RestartAnalysis />} />
                      <Route path="/oom-events" element={<OOMEvents />} />
                      <Route path="/pod-health" element={<PodHealth />} />
                      <Route path="/pvcs" element={<PVCs />} />
                      <Route path="/pvs" element={<PVs />} />
                      <Route path="/storage-consumption" element={<StorageConsumption />} />
                      <Route path="/orphaned-volumes" element={<OrphanedVolumes />} />
                      <Route path="/storage-forecasting" element={<StorageForecasting />} />
                      <Route path="/pvc-file-analysis" element={<PVCFileAnalysis />} />
                      <Route path="/services" element={<Services />} />
                      <Route path="/ingress" element={<Ingress />} />
                      <Route path="/traffic-analysis" element={<TrafficAnalysis />} />
                      <Route path="/external-exposure" element={<ExternalExposure />} />
                      <Route path="/network-policies" element={<NetworkPolicies />} />
                      <Route path="/metrics" element={<Metrics />} />
                      <Route path="/logs" element={<Logs />} />
                      <Route path="/events" element={<Events />} />
                      <Route path="/traces" element={<Traces />} />
                      <Route path="/service-health" element={<ServiceHealth />} />
                      <Route path="/recommendations" element={<Recommendations />} />
                      <Route path="/cpu-rightsizing" element={<CPURightsizing />} />
                      <Route path="/memory-rightsizing" element={<MemoryRightsizing />} />
                      <Route path="/resource-allocation" element={<ResourceAllocation />} />
                      <Route path="/pods" element={<Pods />} />
                      <Route path="/cost-savings" element={<CostSavings />} />
                      <Route path="/monthly-savings" element={<MonthlySavings />} />
                      <Route path="/annual-savings" element={<AnnualSavings />} />
                      <Route path="/cost-breakdown" element={<CostBreakdown />} />
                      <Route path="/savings-trends" element={<SavingsTrends />} />
                      <Route path="/cleanup" element={<Cleanup />} />
                      <Route path="/zombie-resources" element={<ZombieResources />} />
                      <Route path="/unused-deployments" element={<UnusedDeployments />} />
                      <Route path="/stale-configmaps" element={<StaleConfigMaps />} />
                      <Route path="/stale-secrets" element={<StaleSecrets />} />
                      <Route path="/old-replicasets" element={<OldReplicaSets />} />
                      <Route path="/unattached-pvcs" element={<UnattachedPVCs />} />
                      <Route path="/idle-namespaces" element={<IdleNamespaces />} />
                      <Route path="/cluster-waste" element={<ClusterWaste />} />
                      <Route path="/namespace-waste" element={<NamespaceWaste />} />
                      <Route path="/team-waste" element={<TeamWaste />} />
                      <Route path="/application-waste" element={<ApplicationWaste />} />
                      <Route path="/cluster-score" element={<ClusterScore />} />
                      <Route path="/namespace-score" element={<NamespaceScore />} />
                      <Route path="/team-score" element={<TeamScore />} />
                      <Route path="/security-command-center" element={<SecurityCommandCenter />} />
                      <Route path="/security-score" element={<SecurityScore />} />
                      <Route path="/cve-dashboard" element={<CVEDashboard />} />
                      <Route path="/image-scanning" element={<ImageScanning />} />
                      <Route path="/dependency-scanning" element={<DependencyScanning />} />
                      <Route path="/patch-recommendations" element={<PatchRecommendations />} />
                      <Route path="/runtime-security" element={<RuntimeSecurity />} />
                      <Route path="/privileged-containers" element={<PrivilegedContainers />} />
                      <Route path="/root-containers" element={<RootContainers />} />
                      <Route path="/image-trust" element={<ImageTrust />} />
                      <Route path="/secret-exposure" element={<SecretExposure />} />
                      <Route path="/secret-rotation" element={<SecretRotation />} />
                      <Route path="/certificate-management" element={<CertificateManagement />} />
                      <Route path="/credential-audit" element={<CredentialAudit />} />
                      <Route path="/excessive-permissions" element={<ExcessivePermissions />} />
                      <Route path="/cluster-admin-review" element={<ClusterAdminReview />} />
                      <Route path="/service-accounts-analysis" element={<ServiceAccountsAnalysis />} />
                      <Route path="/least-privilege-review" element={<LeastPrivilegeReview />} />
                      <Route path="/network-policies-security" element={<NetworkPolicies />} />
                      <Route path="/external-exposure-security" element={<ExternalExposure />} />
                      <Route path="/east-west-traffic" element={<EastWestTraffic />} />
                      <Route path="/zero-trust-review" element={<ZeroTrustReview />} />
                      <Route path="/baseline-comparison" element={<BaselineComparison />} />
                      <Route path="/drift-alerts" element={<DriftAlerts />} />
                      <Route path="/auto-remediation-security" element={<AutoRemediation />} />
                      <Route path="/compliance/dashboard" element={<ComplianceDashboard />} />
                      <Route path="/compliance/score" element={<ComplianceScore />} />
                      <Route path="/compliance/cis-benchmark" element={<CISBenchmark />} />
                      <Route path="/compliance/soc2" element={<SOC2Compliance />} />
                      <Route path="/compliance/pci-dss" element={<PCIDSSCompliance />} />
                      <Route path="/compliance/iso27001" element={<ISO27001Compliance />} />
                      <Route path="/compliance/hipaa" element={<HIPAACompliance />} />
                      <Route path="/compliance/gdpr" element={<GDPRCompliance />} />
                      <Route path="/compliance/nist" element={<NISTCompliance />} />
                      <Route path="/compliance/policy-engine" element={<PolicyEngine />} />
                      <Route path="/compliance/governance-rules" element={<GovernanceRules />} />
                      <Route path="/compliance/security-guardrails" element={<SecurityGuardrails />} />
                      <Route path="/compliance/cicd-guardrails" element={<CICDGuardrails />} />
                      <Route path="/compliance/audit-center" element={<AuditCenter />} />
                      <Route path="/compliance/change-management" element={<ChangeManagement />} />
                      <Route path="/autofix" element={<AutoFix />} />
                      <Route path="/rollback" element={<Rollback />} />
                      <Route path="/ai-copilot" element={<AICopilot />} />
                      <Route path="/autonomous" element={<Autonomous />} />

                      {/* Autonomous AI - AI Copilot Routes */}
                      <Route path="/autonomous-ai/ai-copilot/natural-language-queries" element={<NaturalLanguageQueries />} />
                      <Route path="/autonomous-ai/ai-copilot/optimization-advisor" element={<OptimizationAdvisor />} />
                      <Route path="/autonomous-ai/ai-copilot/security-advisor" element={<SecurityAdvisor />} />
                      <Route path="/autonomous-ai/ai-copilot/incident-investigator" element={<IncidentInvestigator />} />

                      {/* Autonomous AI - Autonomous Operations Routes */}
                      <Route path="/autonomous-ai/autonomous-operations/manual-mode" element={<ManualMode />} />
                      <Route path="/autonomous-ai/autonomous-operations/assisted-mode" element={<AssistedMode />} />
                      <Route path="/autonomous-ai/autonomous-operations/autonomous-mode" element={<AutonomousMode />} />

                      {/* Autonomous AI - Auto-Fix Center Routes */}
                      <Route path="/autonomous-ai/autofix-center/resource-fixes" element={<ResourceFixes />} />
                      <Route path="/autonomous-ai/autofix-center/security-fixes" element={<SecurityFixes />} />
                      <Route path="/autonomous-ai/autofix-center/compliance-fixes" element={<ComplianceFixes />} />
                      <Route path="/autonomous-ai/autofix-center/bulk-fixes" element={<BulkFixes />} />

                      {/* Autonomous AI - Rollback Center Routes */}
                      <Route path="/autonomous-ai/rollback-center/deployment-rollback" element={<DeploymentRollback />} />
                      <Route path="/autonomous-ai/rollback-center/configuration-rollback" element={<ConfigurationRollback />} />
                      <Route path="/autonomous-ai/rollback-center/namespace-rollback" element={<NamespaceRollback />} />
                      <Route path="/autonomous-ai/rollback-center/cluster-rollback" element={<ClusterRollback />} />

                      {/* Autonomous AI - AI Recommendations Routes */}
                      <Route path="/autonomous-ai/ai-recommendations/cost" element={<CostRecommendations />} />
                      <Route path="/autonomous-ai/ai-recommendations/performance" element={<PerformanceRecommendations />} />
                      <Route path="/autonomous-ai/ai-recommendations/reliability" element={<ReliabilityRecommendations />} />
                      <Route path="/autonomous-ai/ai-recommendations/security" element={<SecurityRecommendations />} />
                      <Route path="/autonomous-ai/ai-recommendations/compliance" element={<ComplianceRecommendations />} />

                      <Route path="/scoring" element={<Scoring />} />
                      <Route path="/team-accountability" element={<TeamAccountability />} />
                      <Route path="/guardrails" element={<Guardrails />} />
                      <Route path="/simulation" element={<Simulation />} />
                      <Route path="/heatmap" element={<Heatmap />} />
                      <Route path="/root-cause" element={<RootCause />} />
                      <Route path="/incidents" element={<Incidents />} />
                      <Route path="/predictive" element={<Predictive />} />
                      <Route path="/predictive-failures" element={<PredictiveFailures />} />
                      <Route path="/capacity-forecasting" element={<CapacityForecasting />} />
                      <Route path="/anomaly-detection" element={<AnomalyDetection />} />
                      <Route path="/dependency-mapping" element={<DependencyMapping />} />
                      <Route path="/cost-forecasting" element={<CostForecasting />} />
                      <Route path="/ai-insights" element={<AIInsights />} />
                      <Route path="/cost-management" element={<CostManagement />} />
                      <Route path="/cost-allocation" element={<CostAllocation />} />
                      <Route path="/chargeback-showback" element={<ChargebackShowback />} />
                      <Route path="/budget-tracking" element={<BudgetTracking />} />
                      <Route path="/savings-tracker" element={<SavingsTracker />} />
                      <Route path="/carbon" element={<Carbon />} />
                      <Route path="/energy-consumption" element={<EnergyConsumption />} />
                      <Route path="/sustainability-score" element={<SustainabilityScore />} />
                      <Route path="/financial-benchmarking" element={<FinancialBenchmarking />} />
                      <Route path="/settings/cloud-discovery" element={<CloudDiscovery />} />
                      <Route path="/benchmarking" element={<Benchmarking />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/reports/finops" element={<FinOpsReports />} />
                      <Route path="/reports/security" element={<SecurityReports />} />
                      <Route path="/reports/compliance" element={<ComplianceReports />} />
                      <Route path="/reports/optimization" element={<OptimizationReports />} />
                      <Route path="/reports/incidents" element={<IncidentReports />} />
                      <Route path="/reports/scheduled" element={<ScheduledReports />} />
                      <Route path="/audit" element={<Audit />} />

                      {/* People & Teams */}
                      <Route path="/people/team-cost-analysis" element={<TeamCostAnalysis />} />
                      <Route path="/people/team-optimization-score" element={<TeamOptimizationScore />} />
                      <Route path="/people/team-security-score" element={<TeamSecurityScore />} />
                      <Route path="/people/ownership-mapping" element={<OwnershipMapping />} />
                      <Route path="/people/access-reviews" element={<AccessReviews />} />

                      {/* Platform Engineering - GitOps */}
                      <Route path="/platform/gitops/argocd" element={<ArgoCD />} />
                      <Route path="/platform/gitops/fluxcd" element={<FluxCD />} />
                      <Route path="/platform/gitops/drift-detection" element={<GitopsDriftDetection />} />

                      {/* Platform Engineering - CI/CD */}
                      <Route path="/platform/cicd/jenkins" element={<JenkinsIntegration />} />
                      <Route path="/platform/cicd/github-actions" element={<GitHubActions />} />
                      <Route path="/platform/cicd/gitlab-ci" element={<GitLabCI />} />
                      <Route path="/platform/cicd/tekton" element={<TektonPipelines />} />

                      {/* Platform Engineering - Other */}
                      <Route path="/platform/policy-as-code" element={<PolicyAsCode />} />
                      <Route path="/platform/infra-as-code" element={<InfraAsCode />} />
                      <Route path="/platform/deployment-intelligence" element={<DeploymentIntelligence />} />
                      <Route path="/platform/platform-standards" element={<PlatformStandards />} />

                      {/* Administration */}
                      <Route path="/admin/user-management" element={<UserManagement />} />
                      <Route path="/admin/rbac" element={<RBACAdmin />} />
                      <Route path="/admin/sso-saml" element={<SSOSaml />} />
                      <Route path="/admin/integrations" element={<AdminIntegrations />} />
                      <Route path="/admin/notifications" element={<AdminNotifications />} />
                      <Route path="/admin/api-keys" element={<APIKeys />} />
                      <Route path="/admin/backup-recovery" element={<BackupRecovery />} />
                      <Route path="/admin/platform-settings" element={<PlatformSettings />} />

                      {/* Attack Investigation Routes */}
                      <Route path="/attack-investigation/incident-center" element={<SecurityIncidentCenter />} />
                      <Route path="/attack-investigation/active-threats" element={<ActiveThreats />} />
                      <Route path="/attack-investigation/incident-timeline" element={<IncidentTimeline />} />
                      <Route path="/attack-investigation/attack-path" element={<AttackPathAnalysis />} />
                      <Route path="/attack-investigation/blast-radius" element={<BlastRadiusAnalysis />} />
                      <Route path="/attack-investigation/suspicious-pods" element={<SuspiciousPods />} />
                      <Route path="/attack-investigation/suspicious-processes" element={<SuspiciousProcesses />} />
                      <Route path="/attack-investigation/suspicious-users" element={<SuspiciousUsers />} />
                      <Route path="/attack-investigation/threat-queries" element={<ThreatQueries />} />
                      <Route path="/attack-investigation/pod-evidence" element={<PodEvidence />} />
                      <Route path="/attack-investigation/audit-logs" element={<AuditLogs />} />
                      <Route path="/attack-investigation/process-history" element={<ProcessHistory />} />
                      <Route path="/attack-investigation/network-evidence" element={<NetworkEvidence />} />
                      <Route path="/attack-investigation/data-exfiltration" element={<DataExfiltration />} />
                      <Route path="/attack-investigation/crypto-miner" element={<CryptoMinerDetection />} />
                      <Route path="/attack-investigation/insider-threat" element={<InsiderThreat />} />
                      <Route path="/attack-investigation/mitre-attack" element={<MitreAttackMapping />} />
                      <Route path="/attack-investigation/playbooks" element={<IncidentPlaybooks />} />
                      <Route path="/attack-investigation/playbook-execution" element={<PlaybookExecution />} />
                      <Route path="/attack-investigation/quarantine" element={<QuarantineResource />} />
                      <Route path="/attack-investigation/kill-pod" element={<KillPod />} />
                      <Route path="/attack-investigation/block-traffic" element={<BlockTraffic />} />
                      <Route path="/attack-investigation/rotate-secrets" element={<RotateSecrets />} />
                      <Route path="/attack-investigation/emergency-rollback" element={<EmergencyRollback />} />
                    </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </Box>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </ClusterProvider>
    </AuthProvider>
  );
}

export default App;

// Made with Bob
