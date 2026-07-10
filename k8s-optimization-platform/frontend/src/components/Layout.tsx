import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../hooks/useUserStore';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Collapse,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Chip,
  Badge,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import ClusterSelector from './ClusterSelector';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import StorageIcon from '@mui/icons-material/Storage';
import RecommendIcon from '@mui/icons-material/Recommend';
import MemoryIcon from '@mui/icons-material/Memory';
import SavingsIcon from '@mui/icons-material/Savings';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import HistoryIcon from '@mui/icons-material/History';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ScoreIcon from '@mui/icons-material/Score';
import GroupsIcon from '@mui/icons-material/Groups';
import MapIcon from '@mui/icons-material/Map';
import SearchIcon from '@mui/icons-material/Search';
import ScienceIcon from '@mui/icons-material/Science';
import SecurityIcon from '@mui/icons-material/Security';
import ErrorIcon from '@mui/icons-material/Error';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ParkIcon from '@mui/icons-material/Park';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import GavelIcon from '@mui/icons-material/Gavel';
import CommandIcon from '@mui/icons-material/Terminal';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import AssessmentIcon from '@mui/icons-material/Assessment';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import PaymentIcon from '@mui/icons-material/Payment';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PrivacyTipIcon from '@mui/icons-material/PrivacyTip';
import PolicyIcon from '@mui/icons-material/Policy';
import RuleIcon from '@mui/icons-material/Rule';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import BoltIcon from '@mui/icons-material/Bolt';
import NatureIcon from '@mui/icons-material/Nature';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import RadarIcon from '@mui/icons-material/Radar';
import BugReportIcon from '@mui/icons-material/BugReport';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ShieldIcon from '@mui/icons-material/Shield';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BlockIcon from '@mui/icons-material/Block';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import CloudSyncIcon from '@mui/icons-material/CloudSync';

const drawerWidth = 280;

interface LayoutProps {
  children: React.ReactNode;
}

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItem[];
  /** Teams allowed to see this item. Undefined = visible to all. */
  teams?: string[];
}

// Teams that gate each top-level section.
// A user with NO teams assigned sees everything (same as admin).
// 'admin' role always sees everything regardless.
const TEAM_MENU_ACCESS: Record<string, string[]> = {
  'Dashboard':              ['Platform', 'SRE', 'DevOps', 'Security', 'Finance', 'Compliance', 'Analytics', 'Payments', 'Frontend', 'Infrastructure', 'ML/AI', 'Data Engineering'],
  'Operations':             ['Platform', 'SRE', 'DevOps', 'Infrastructure', 'Frontend', 'ML/AI', 'Data Engineering'],
  'Autonomous AI':          ['Platform', 'SRE', 'DevOps', 'Security', 'Compliance', 'Infrastructure'],
  'Optimization':           ['Platform', 'SRE', 'DevOps', 'Finance', 'Analytics', 'Infrastructure', 'Frontend', 'ML/AI', 'Data Engineering'],
  'Security':               ['Security', 'Platform', 'SRE', 'Compliance', 'Infrastructure'],
  'Attack Investigation':   ['Security', 'Platform', 'SRE'],
  'Compliance & Governance':['Compliance', 'Security', 'Platform', 'Finance', 'Payments'],
  'Intelligence':           ['Platform', 'SRE', 'DevOps', 'Analytics', 'ML/AI', 'Data Engineering', 'Infrastructure'],
  'FinOps & Sustainability': ['Finance', 'Platform', 'Analytics', 'Payments', 'Infrastructure'],
  'Reports & Analytics':    ['Analytics', 'Finance', 'Platform', 'SRE', 'Security', 'Compliance', 'Payments', 'ML/AI', 'Data Engineering'],
  'People & Teams':         ['Platform', 'SRE', 'Finance', 'Analytics'],
  'Platform Engineering':   ['Platform', 'DevOps', 'SRE', 'Infrastructure', 'Frontend'],
  'Administration':         [], // admin-only — handled separately
};

const menuItems: MenuItem[] = [
  {
    text: 'Dashboard',
    icon: <DashboardIcon />,
    children: [
      { text: 'Overview', icon: <DashboardIcon />, path: '/' },
      { text: 'Command Center', icon: <CommandIcon />, path: '/command-center' },
      { text: 'Executive Overview', icon: <BusinessIcon />, path: '/executive' },
      { text: 'Platform Health Score', icon: <ScoreIcon />, path: '/scoring' },
    ],
  },
  {
    text: 'Operations',
    icon: <SettingsIcon />,
    children: [
      {
        text: 'Clusters',
        icon: <StorageIcon />,
        children: [
          { text: 'Overview', icon: <StorageIcon />, path: '/clusters' },
          { text: 'Onboard Cluster', icon: <BuildIcon />, path: '/cluster-onboarding' },
          { text: 'Cluster Health', icon: <StorageIcon />, path: '/cluster-health' },
          { text: 'Nodes', icon: <StorageIcon />, path: '/cluster-nodes' },
          { text: 'Worker Pools', icon: <StorageIcon />, path: '/worker-pools' },
          { text: 'Resource Utilization', icon: <MemoryIcon />, path: '/resource-utilization' },
          { text: 'Cluster Benchmarking', icon: <CompareIcon />, path: '/cluster-benchmarking' },
        ],
      },
      {
        text: 'Workloads',
        icon: <MemoryIcon />,
        children: [
          { text: 'Deployments', icon: <MemoryIcon />, path: '/deployments' },
          { text: 'StatefulSets', icon: <StorageIcon />, path: '/statefulsets' },
          { text: 'DaemonSets', icon: <MemoryIcon />, path: '/daemonsets' },
          { text: 'Jobs', icon: <BuildIcon />, path: '/jobs' },
          { text: 'CronJobs', icon: <HistoryIcon />, path: '/cronjobs' },
        ],
      },
      {
        text: 'Pods',
        icon: <MemoryIcon />,
        children: [
          { text: 'CPU Analysis', icon: <SpeedIcon />, path: '/cpu-analysis' },
          { text: 'Memory Analysis', icon: <MemoryIcon />, path: '/memory-analysis' },
          { text: 'Restart Analysis', icon: <RestartAltIcon />, path: '/restart-analysis' },
          { text: 'OOM Events', icon: <ErrorIcon />, path: '/oom-events' },
          { text: 'Pod Health', icon: <FavoriteIcon />, path: '/pod-health' },
        ],
      },
      {
        text: 'Storage',
        icon: <StorageIcon />,
        children: [
          { text: 'PVCs', icon: <StorageIcon />, path: '/pvcs' },
          { text: 'PVs', icon: <StorageIcon />, path: '/pvs' },
          { text: 'Storage Consumption', icon: <MemoryIcon />, path: '/storage-consumption' },
          { text: 'Orphaned Volumes', icon: <DeleteIcon />, path: '/orphaned-volumes' },
          { text: 'Storage Forecasting', icon: <TrendingUpIcon />, path: '/storage-forecasting' },
          { text: 'PVC File Analysis', icon: <SearchIcon />, path: '/pvc-file-analysis' },
        ],
      },
      {
        text: 'Network',
        icon: <StorageIcon />,
        children: [
          { text: 'Services', icon: <StorageIcon />, path: '/services' },
          { text: 'Ingress', icon: <StorageIcon />, path: '/ingress' },
          { text: 'Traffic Analysis', icon: <TrendingUpIcon />, path: '/traffic-analysis' },
          { text: 'External Exposure', icon: <SecurityIcon />, path: '/external-exposure' },
          { text: 'Network Policies', icon: <SecurityIcon />, path: '/network-policies' },
        ],
      },
      {
        text: 'Observability',
        icon: <StorageIcon />,
        children: [
          { text: 'Metrics', icon: <SpeedIcon />, path: '/metrics' },
          { text: 'Logs', icon: <DescriptionIcon />, path: '/logs' },
          { text: 'Events', icon: <ErrorIcon />, path: '/events' },
          { text: 'Traces', icon: <MapIcon />, path: '/traces' },
          { text: 'Service Health', icon: <FavoriteIcon />, path: '/service-health' },
        ],
      },
    ],
  },
  {
    text: 'Autonomous AI',
    icon: <SmartToyIcon />,
    children: [
      {
        text: 'AI Copilot',
        icon: <SmartToyIcon />,
        children: [
          { text: 'Natural Language Queries', icon: <SmartToyIcon />, path: '/autonomous-ai/ai-copilot/natural-language-queries' },
          { text: 'Optimization Advisor', icon: <RecommendIcon />, path: '/autonomous-ai/ai-copilot/optimization-advisor' },
          { text: 'Security Advisor', icon: <SecurityIcon />, path: '/autonomous-ai/ai-copilot/security-advisor' },
          { text: 'Incident Investigator', icon: <SearchIcon />, path: '/autonomous-ai/ai-copilot/incident-investigator' },
        ],
      },
      {
        text: 'Autonomous Operations',
        icon: <AutoModeIcon />,
        children: [
          { text: 'Manual Mode', icon: <SettingsIcon />, path: '/autonomous-ai/autonomous-operations/manual-mode' },
          { text: 'Assisted Mode', icon: <SmartToyIcon />, path: '/autonomous-ai/autonomous-operations/assisted-mode' },
          { text: 'Autonomous Mode', icon: <AutoModeIcon />, path: '/autonomous-ai/autonomous-operations/autonomous-mode' },
        ],
      },
      {
        text: 'Auto-Fix Center',
        icon: <BuildIcon />,
        children: [
          { text: 'Resource Fixes', icon: <MemoryIcon />, path: '/autonomous-ai/autofix-center/resource-fixes' },
          { text: 'Security Fixes', icon: <SecurityIcon />, path: '/autonomous-ai/autofix-center/security-fixes' },
          { text: 'Compliance Fixes', icon: <GavelIcon />, path: '/autonomous-ai/autofix-center/compliance-fixes' },
          { text: 'Bulk Fixes', icon: <BuildIcon />, path: '/autonomous-ai/autofix-center/bulk-fixes' },
        ],
      },
      {
        text: 'Rollback Center',
        icon: <HistoryIcon />,
        children: [
          { text: 'Deployment Rollback', icon: <HistoryIcon />, path: '/autonomous-ai/rollback-center/deployment-rollback' },
          { text: 'Configuration Rollback', icon: <SettingsIcon />, path: '/autonomous-ai/rollback-center/configuration-rollback' },
          { text: 'Namespace Rollback', icon: <StorageIcon />, path: '/autonomous-ai/rollback-center/namespace-rollback' },
          { text: 'Cluster Rollback', icon: <HistoryIcon />, path: '/autonomous-ai/rollback-center/cluster-rollback' },
        ],
      },
      {
        text: 'AI Recommendations',
        icon: <RecommendIcon />,
        children: [
          { text: 'Cost Recommendations', icon: <SavingsIcon />, path: '/autonomous-ai/ai-recommendations/cost' },
          { text: 'Performance Recommendations', icon: <SpeedIcon />, path: '/autonomous-ai/ai-recommendations/performance' },
          { text: 'Reliability Recommendations', icon: <FavoriteIcon />, path: '/autonomous-ai/ai-recommendations/reliability' },
          { text: 'Security Recommendations', icon: <SecurityIcon />, path: '/autonomous-ai/ai-recommendations/security' },
          { text: 'Compliance Recommendations', icon: <GavelIcon />, path: '/autonomous-ai/ai-recommendations/compliance' },
        ],
      },
    ],
  },
  {
    text: 'Optimization',
    icon: <RecommendIcon />,
    children: [
      {
        text: 'Recommendations',
        icon: <RecommendIcon />,
        children: [
          { text: 'All Recommendations', icon: <RecommendIcon />, path: '/recommendations' },
          { text: 'CPU Rightsizing', icon: <SpeedIcon />, path: '/cpu-rightsizing' },
          { text: 'Memory Rightsizing', icon: <MemoryIcon />, path: '/memory-rightsizing' },
          { text: 'Resource Allocation', icon: <MemoryIcon />, path: '/resource-allocation' },
        ],
      },
      {
        text: 'Cost Savings',
        icon: <SavingsIcon />,
        children: [
          { text: 'Savings Dashboard', icon: <SavingsIcon />, path: '/cost-savings' },
          { text: 'Monthly Savings', icon: <SavingsIcon />, path: '/monthly-savings' },
          { text: 'Annual Savings', icon: <TrendingUpIcon />, path: '/annual-savings' },
          { text: 'Cost Breakdown', icon: <CompareIcon />, path: '/cost-breakdown' },
          { text: 'Savings Trends', icon: <TrendingUpIcon />, path: '/savings-trends' },
        ],
      },
      {
        text: 'Cleanup Center',
        icon: <DeleteIcon />,
        children: [
          { text: 'Zombie Resources', icon: <DeleteIcon />, path: '/zombie-resources' },
          { text: 'Unused Deployments', icon: <MemoryIcon />, path: '/unused-deployments' },
          { text: 'Stale ConfigMaps', icon: <SettingsIcon />, path: '/stale-configmaps' },
          { text: 'Stale Secrets', icon: <SecurityIcon />, path: '/stale-secrets' },
          { text: 'Old ReplicaSets', icon: <MemoryIcon />, path: '/old-replicasets' },
          { text: 'Unattached PVCs', icon: <StorageIcon />, path: '/unattached-pvcs' },
          { text: 'Idle Namespaces', icon: <StorageIcon />, path: '/idle-namespaces' },
        ],
      },
      {
        text: 'Waste Heatmap',
        icon: <MapIcon />,
        children: [
          { text: 'Cluster Waste', icon: <StorageIcon />, path: '/cluster-waste' },
          { text: 'Namespace Waste', icon: <MemoryIcon />, path: '/namespace-waste' },
          { text: 'Team Waste', icon: <GroupsIcon />, path: '/team-waste' },
          { text: 'Application Waste', icon: <MemoryIcon />, path: '/application-waste' },
        ],
      },
      {
        text: 'Optimization Score',
        icon: <ScoreIcon />,
        children: [
          { text: 'Cluster Score', icon: <StorageIcon />, path: '/cluster-score' },
          { text: 'Namespace Score', icon: <MemoryIcon />, path: '/namespace-score' },
          { text: 'Team Score', icon: <GroupsIcon />, path: '/team-score' },
        ],
      },
    ],
  },
  {
    text: 'Security',
    icon: <SecurityIcon />,
    children: [
      { text: 'Security Command Center', icon: <SecurityIcon />, path: '/security-command-center' },
      { text: 'Security Score', icon: <ScoreIcon />, path: '/security-score' },
      {
        text: 'Vulnerability Management',
        icon: <ErrorIcon />,
        children: [
          { text: 'CVE Dashboard', icon: <ErrorIcon />, path: '/cve-dashboard' },
          { text: 'Image Scanning', icon: <StorageIcon />, path: '/image-scanning' },
          { text: 'Dependency Scanning', icon: <SearchIcon />, path: '/dependency-scanning' },
          { text: 'Patch Recommendations', icon: <BuildIcon />, path: '/patch-recommendations' },
        ],
      },
      {
        text: 'Container Security',
        icon: <StorageIcon />,
        children: [
          { text: 'Runtime Security', icon: <SecurityIcon />, path: '/runtime-security' },
          { text: 'Privileged Containers', icon: <ErrorIcon />, path: '/privileged-containers' },
          { text: 'Root Containers', icon: <ErrorIcon />, path: '/root-containers' },
          { text: 'Image Trust', icon: <SecurityIcon />, path: '/image-trust' },
        ],
      },
      {
        text: 'Secrets Security',
        icon: <SecurityIcon />,
        children: [
          { text: 'Secret Exposure', icon: <ErrorIcon />, path: '/secret-exposure' },
          { text: 'Secret Rotation', icon: <HistoryIcon />, path: '/secret-rotation' },
          { text: 'Certificate Management', icon: <SecurityIcon />, path: '/certificate-management' },
          { text: 'Credential Audit', icon: <SearchIcon />, path: '/credential-audit' },
        ],
      },
      {
        text: 'RBAC Analysis',
        icon: <GavelIcon />,
        children: [
          { text: 'Excessive Permissions', icon: <ErrorIcon />, path: '/excessive-permissions' },
          { text: 'Cluster Admin Review', icon: <SecurityIcon />, path: '/cluster-admin-review' },
          { text: 'Service Accounts', icon: <SettingsIcon />, path: '/service-accounts-analysis' },
          { text: 'Least Privilege Review', icon: <SecurityIcon />, path: '/least-privilege-review' },
        ],
      },
      {
        text: 'Network Security',
        icon: <StorageIcon />,
        children: [
          { text: 'Network Policies', icon: <SecurityIcon />, path: '/network-policies-security' },
          { text: 'External Exposure', icon: <ErrorIcon />, path: '/external-exposure-security' },
          { text: 'East-West Traffic', icon: <StorageIcon />, path: '/east-west-traffic' },
          { text: 'Zero Trust Review', icon: <SecurityIcon />, path: '/zero-trust-review' },
        ],
      },
      {
        text: 'Security Drift Detection',
        icon: <TrendingUpIcon />,
        children: [
          { text: 'Baseline Comparison', icon: <CompareIcon />, path: '/baseline-comparison' },
          { text: 'Drift Alerts', icon: <ErrorIcon />, path: '/drift-alerts' },
          { text: 'Auto Remediation', icon: <BuildIcon />, path: '/auto-remediation-security' },
        ],
      },
    ],
  },
  {
    text: 'Attack Investigation',
    icon: <GpsFixedIcon />,
    children: [
      { text: 'Security Incident Center', icon: <SecurityIcon />, path: '/attack-investigation/incident-center' },
      { text: 'Active Threats', icon: <ErrorIcon />, path: '/attack-investigation/active-threats' },
      { text: 'Incident Timeline', icon: <TimelineIcon />, path: '/attack-investigation/incident-timeline' },
      { text: 'Attack Path Analysis', icon: <AccountTreeIcon />, path: '/attack-investigation/attack-path' },
      { text: 'Blast Radius Analysis', icon: <RadarIcon />, path: '/attack-investigation/blast-radius' },
      {
        text: 'Threat Hunting',
        icon: <SearchIcon />,
        children: [
          { text: 'Suspicious Pods', icon: <BugReportIcon />, path: '/attack-investigation/suspicious-pods' },
          { text: 'Suspicious Processes', icon: <BugReportIcon />, path: '/attack-investigation/suspicious-processes' },
          { text: 'Suspicious Users', icon: <PersonSearchIcon />, path: '/attack-investigation/suspicious-users' },
          { text: 'Threat Queries', icon: <QueryStatsIcon />, path: '/attack-investigation/threat-queries' },
        ],
      },
      {
        text: 'Kubernetes Forensics',
        icon: <FingerprintIcon />,
        children: [
          { text: 'Pod Evidence', icon: <StorageIcon />, path: '/attack-investigation/pod-evidence' },
          { text: 'Audit Logs', icon: <DescriptionIcon />, path: '/attack-investigation/audit-logs' },
          { text: 'Process History', icon: <HistoryIcon />, path: '/attack-investigation/process-history' },
          { text: 'Network Evidence', icon: <NetworkCheckIcon />, path: '/attack-investigation/network-evidence' },
        ],
      },
      { text: 'Data Exfiltration Detection', icon: <CloudDownloadIcon />, path: '/attack-investigation/data-exfiltration' },
      { text: 'Crypto Miner Detection', icon: <CurrencyBitcoinIcon />, path: '/attack-investigation/crypto-miner' },
      { text: 'Insider Threat Detection', icon: <PersonOffIcon />, path: '/attack-investigation/insider-threat' },
      { text: 'MITRE ATT&CK Mapping', icon: <ShieldIcon />, path: '/attack-investigation/mitre-attack' },
      { text: 'Incident Playbooks', icon: <PlaylistPlayIcon />, path: '/attack-investigation/playbooks' },
      { text: 'Playbook Execution', icon: <PlayArrowIcon />, path: '/attack-investigation/playbook-execution' },
      {
        text: 'Incident Response',
        icon: <BuildIcon />,
        children: [
          { text: 'Quarantine Resource', icon: <BlockIcon />, path: '/attack-investigation/quarantine' },
          { text: 'Kill Pod', icon: <PowerSettingsNewIcon />, path: '/attack-investigation/kill-pod' },
          { text: 'Block Traffic', icon: <BlockIcon />, path: '/attack-investigation/block-traffic' },
          { text: 'Rotate Secrets', icon: <VpnKeyIcon />, path: '/attack-investigation/rotate-secrets' },
          { text: 'Emergency Rollback', icon: <RestartAltIcon />, path: '/attack-investigation/emergency-rollback' },
        ],
      },
    ],
  },
  {
    text: 'Compliance & Governance',
    icon: <GavelIcon />,
    children: [
      {
        text: 'Overview',
        icon: <DashboardIcon />,
        children: [
          { text: 'Compliance Dashboard', icon: <DashboardIcon />, path: '/compliance/dashboard' },
          { text: 'Compliance Score', icon: <AssessmentIcon />, path: '/compliance/score' },
        ],
      },
      {
        text: 'Compliance Frameworks',
        icon: <GavelIcon />,
        children: [
          { text: 'CIS Benchmark', icon: <SecurityIcon />, path: '/compliance/cis-benchmark' },
          { text: 'SOC 2', icon: <VerifiedUserIcon />, path: '/compliance/soc2' },
          { text: 'PCI DSS', icon: <PaymentIcon />, path: '/compliance/pci-dss' },
          { text: 'ISO 27001', icon: <VerifiedUserIcon />, path: '/compliance/iso27001' },
          { text: 'HIPAA', icon: <LocalHospitalIcon />, path: '/compliance/hipaa' },
          { text: 'GDPR', icon: <PrivacyTipIcon />, path: '/compliance/gdpr' },
          { text: 'NIST', icon: <SecurityIcon />, path: '/compliance/nist' },
        ],
      },
      {
        text: 'Policy & Governance',
        icon: <PolicyIcon />,
        children: [
          { text: 'Policy Engine', icon: <PolicyIcon />, path: '/compliance/policy-engine' },
          { text: 'Governance Rules', icon: <RuleIcon />, path: '/compliance/governance-rules' },
          { text: 'Security Guardrails', icon: <SecurityIcon />, path: '/compliance/security-guardrails' },
          { text: 'CI/CD Guardrails', icon: <BuildIcon />, path: '/compliance/cicd-guardrails' },
        ],
      },
      {
        text: 'Audit & Change',
        icon: <HistoryIcon />,
        children: [
          { text: 'Audit Center', icon: <GavelIcon />, path: '/compliance/audit-center' },
          { text: 'Change Management', icon: <HistoryIcon />, path: '/compliance/change-management' },
        ],
      },
    ],
  },
  {
    text: 'Intelligence',
    icon: <SearchIcon />,
    children: [
      { text: 'Root Cause Analysis', icon: <SearchIcon />, path: '/root-cause' },
      { text: 'Incident Correlation', icon: <ErrorIcon />, path: '/incidents' },
      { text: 'Predictive Scaling', icon: <TrendingUpIcon />, path: '/predictive' },
      { text: 'Predictive Failures', icon: <ErrorIcon />, path: '/predictive-failures' },
      { text: 'Capacity Forecasting', icon: <TrendingUpIcon />, path: '/capacity-forecasting' },
      { text: 'What-If Simulation', icon: <ScienceIcon />, path: '/simulation' },
      { text: 'Anomaly Detection', icon: <SearchIcon />, path: '/anomaly-detection' },
      { text: 'Dependency Mapping', icon: <MapIcon />, path: '/dependency-mapping' },
      { text: 'Cost Forecasting', icon: <TrendingUpIcon />, path: '/cost-forecasting' },
      { text: 'AI Insights', icon: <SmartToyIcon />, path: '/ai-insights' },
    ],
  },
  {
    text: 'FinOps & Sustainability',
    icon: <ParkIcon />,
    children: [
      { text: 'Cost Management', icon: <AttachMoneyIcon />, path: '/cost-management' },
      { text: 'Cost Allocation', icon: <AccountBalanceIcon />, path: '/cost-allocation' },
      { text: 'Chargeback / Showback', icon: <ReceiptIcon />, path: '/chargeback-showback' },
      { text: 'Team Accountability', icon: <GroupsIcon />, path: '/team-accountability' },
      { text: 'Budget Tracking', icon: <AccountBalanceWalletIcon />, path: '/budget-tracking' },
      { text: 'Savings Tracker', icon: <TrendingDownIcon />, path: '/savings-tracker' },
      { text: 'Carbon Footprint', icon: <ParkIcon />, path: '/carbon' },
      { text: 'Energy Consumption', icon: <BoltIcon />, path: '/energy-consumption' },
      { text: 'Sustainability Score', icon: <NatureIcon />, path: '/sustainability-score' },
      { text: 'Financial Benchmarking', icon: <CompareArrowsIcon />, path: '/financial-benchmarking' },
      { text: 'Cloud Billing Setup', icon: <CloudSyncIcon />, path: '/settings/cloud-discovery' },
    ],
  },
  {
    text: 'Reports & Analytics',
    icon: <DescriptionIcon />,
    children: [
      { text: 'Executive Reports', icon: <DescriptionIcon />, path: '/reports' },
      { text: 'FinOps Reports', icon: <AttachMoneyIcon />, path: '/reports/finops' },
      { text: 'Security Reports', icon: <SecurityIcon />, path: '/reports/security' },
      { text: 'Compliance Reports', icon: <GavelIcon />, path: '/reports/compliance' },
      { text: 'Optimization Reports', icon: <RecommendIcon />, path: '/reports/optimization' },
      { text: 'Incident Reports', icon: <ErrorIcon />, path: '/reports/incidents' },
      { text: 'Scheduled Reports', icon: <HistoryIcon />, path: '/reports/scheduled' },
      { text: 'Benchmarking', icon: <CompareIcon />, path: '/benchmarking' },
    ],
  },
  {
    text: 'People & Teams',
    icon: <GroupsIcon />,
    children: [
      { text: 'Team Accountability', icon: <GroupsIcon />, path: '/team-accountability' },
      { text: 'Team Cost Analysis', icon: <AttachMoneyIcon />, path: '/people/team-cost-analysis' },
      { text: 'Team Optimization Score', icon: <ScoreIcon />, path: '/people/team-optimization-score' },
      { text: 'Team Security Score', icon: <SecurityIcon />, path: '/people/team-security-score' },
      { text: 'Ownership Mapping', icon: <MapIcon />, path: '/people/ownership-mapping' },
      { text: 'Access Reviews', icon: <SearchIcon />, path: '/people/access-reviews' },
    ],
  },
  {
    text: 'Platform Engineering',
    icon: <BuildIcon />,
    children: [
      {
        text: 'GitOps',
        icon: <StorageIcon />,
        children: [
          { text: 'ArgoCD', icon: <StorageIcon />, path: '/platform/gitops/argocd' },
          { text: 'FluxCD', icon: <StorageIcon />, path: '/platform/gitops/fluxcd' },
          { text: 'Drift Detection', icon: <CompareIcon />, path: '/platform/gitops/drift-detection' },
        ],
      },
      {
        text: 'CI/CD Integrations',
        icon: <BuildIcon />,
        children: [
          { text: 'Jenkins', icon: <BuildIcon />, path: '/platform/cicd/jenkins' },
          { text: 'GitHub Actions', icon: <BuildIcon />, path: '/platform/cicd/github-actions' },
          { text: 'GitLab CI', icon: <BuildIcon />, path: '/platform/cicd/gitlab-ci' },
          { text: 'Tekton', icon: <BuildIcon />, path: '/platform/cicd/tekton' },
        ],
      },
      { text: 'Policy as Code', icon: <PolicyIcon />, path: '/platform/policy-as-code' },
      { text: 'Infrastructure as Code', icon: <SettingsIcon />, path: '/platform/infra-as-code' },
      { text: 'Deployment Intelligence', icon: <SmartToyIcon />, path: '/platform/deployment-intelligence' },
      { text: 'Platform Standards', icon: <RuleIcon />, path: '/platform/platform-standards' },
    ],
  },
  {
    text: 'Administration',
    icon: <SettingsIcon />,
    children: [
      { text: 'User Management', icon: <GroupsIcon />, path: '/admin/user-management' },
      { text: 'RBAC', icon: <GavelIcon />, path: '/admin/rbac' },
      { text: 'SSO / SAML', icon: <SecurityIcon />, path: '/admin/sso-saml' },
      { text: 'Integrations', icon: <BuildIcon />, path: '/admin/integrations' },
      { text: 'Notifications', icon: <ErrorIcon />, path: '/admin/notifications' },
      { text: 'API Keys', icon: <VpnKeyIcon />, path: '/admin/api-keys' },
      { text: 'Cluster Onboarding', icon: <StorageIcon />, path: '/cluster-onboarding' },
      { text: 'Backup & Recovery', icon: <HistoryIcon />, path: '/admin/backup-recovery' },
      { text: 'Platform Settings', icon: <SettingsIcon />, path: '/admin/platform-settings' },
    ],
  },
];

const USERS_API_BASE = 'http://localhost:8000';

/* ── K8s 7-spoke wheel SVG ── */
const K8sWheelIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = '#00d4ff' }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" fill="none" style={{ flexShrink: 0 }}>
    {Array.from({ length: 7 }, (_, k) => {
      const a = (2 * Math.PI * k) / 7 - Math.PI / 2;
      return (
        <line key={k}
          x1={15 + 5 * Math.cos(a)} y1={15 + 5 * Math.sin(a)}
          x2={15 + 11 * Math.cos(a)} y2={15 + 11 * Math.sin(a)}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />
      );
    })}
    <circle cx="15" cy="15" r="3.5" fill={color} />
  </svg>
);

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { platformUser } = useUserStore();
  const isAdmin = user?.role === 'admin';
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({
    Dashboard: true,
    Operations: false,
    'Autonomous AI': false,
    Optimization: false,
    Security: false,
    'Attack Investigation': false,
    'Compliance & Governance': false,
    Intelligence: false,
    'FinOps & Sustainability': false,
    'Reports & Analytics': false,
  });
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPending = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get(`${USERS_API_BASE}/api/v1/users/pending`);
      setPendingCount(Array.isArray(res.data) ? res.data.length : 0);
    } catch { /* backend unavailable */ }
  }, [isAdmin]);

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, 30_000);
    return () => clearInterval(id);
  }, [fetchPending]);

  const handleDrawerToggle = () => setDrawerOpen(!drawerOpen);

  const handleMenuClick = (text: string, path?: string) => {
    if (path) {
      navigate(path);
    } else {
      setOpenMenus((prev) => ({ ...prev, [text]: !prev[text] }));
    }
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    if (item.text === 'Administration' && !isAdmin) return null;
    if (level === 0 && item.text !== 'Administration') {
      const allowedTeams = TEAM_MENU_ACCESS[item.text];
      if (allowedTeams !== undefined && !isAdmin) {
        const userTeams: string[] = (platformUser?.teams ?? []);
        if (userTeams.length > 0 && !userTeams.some((t) => allowedTeams.includes(t))) return null;
      }
    }

    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openMenus[item.text];
    const isSelected = item.path === location.pathname;
    const showPendingBadge = item.text === 'User Management' && isAdmin && pendingCount > 0;

    /* ── Section header (level 0) ── */
    if (level === 0) {
      return (
        <React.Fragment key={item.text}>
          <ListItem disablePadding sx={{ mt: 0.5 }}>
            <ListItemButton
              onClick={() => handleMenuClick(item.text, item.path)}
              sx={{
                borderRadius: '6px',
                mx: 1,
                py: 0.75,
                background: isOpen ? 'rgba(0,212,255,0.06)' : 'transparent',
                '&:hover': { background: 'rgba(0,212,255,0.08)' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: isOpen ? '#00d4ff' : '#2a5080' }}>
                {showPendingBadge
                  ? <Badge badgeContent={pendingCount} color="warning">{item.icon}</Badge>
                  : item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontFamily: "'JetBrains Mono','Courier New',monospace",
                  color: isOpen ? '#00d4ff' : '#3d6080',
                }}
              />
              {hasChildren && (
                isOpen
                  ? <ExpandLess sx={{ fontSize: 14, color: '#3d6080' }} />
                  : <ExpandMore sx={{ fontSize: 14, color: '#3d6080' }} />
              )}
            </ListItemButton>
          </ListItem>
          {hasChildren && (
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {item.children!.map((child) => renderMenuItem(child, level + 1))}
              </List>
            </Collapse>
          )}
        </React.Fragment>
      );
    }

    /* ── Sub-section header (level 1 with children) ── */
    if (hasChildren) {
      return (
        <React.Fragment key={item.text}>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => handleMenuClick(item.text, item.path)}
              sx={{
                pl: level * 1.5 + 2,
                py: 0.5,
                mx: 1,
                borderRadius: '4px',
                '&:hover': { background: 'rgba(0,212,255,0.05)' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 28, color: '#2a5080' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#7ca5cc',
                  letterSpacing: '0.02em',
                }}
              />
              {isOpen
                ? <ExpandLess sx={{ fontSize: 13, color: '#2a5080' }} />
                : <ExpandMore sx={{ fontSize: 13, color: '#2a5080' }} />}
            </ListItemButton>
          </ListItem>
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children!.map((child) => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        </React.Fragment>
      );
    }

    /* ── Leaf item ── */
    return (
      <React.Fragment key={item.text}>
        <ListItem disablePadding>
          <ListItemButton
            selected={isSelected}
            onClick={() => handleMenuClick(item.text, item.path)}
            sx={{
              pl: level * 1.5 + 2,
              py: 0.4,
              mx: 1,
              borderRadius: '4px',
              position: 'relative',
              '&.Mui-selected': {
                background: 'rgba(0,212,255,0.1)',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: '15%',
                  bottom: '15%',
                  width: '2px',
                  background: '#00d4ff',
                  borderRadius: '0 2px 2px 0',
                  boxShadow: '0 0 6px #00d4ff',
                },
              },
              '&:hover': { background: 'rgba(0,212,255,0.06)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 24, '& svg': { fontSize: 14 }, color: isSelected ? '#00d4ff' : '#2a5080' }}>
              {showPendingBadge
                ? <Badge badgeContent={pendingCount} color="warning">{item.icon}</Badge>
                : item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.text}
              primaryTypographyProps={{
                fontSize: '0.78rem',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? '#00d4ff' : '#7ca5cc',
                letterSpacing: '0.01em',
              }}
            />
          </ListItemButton>
        </ListItem>
      </React.Fragment>
    );
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#050d1a' }}>

      {/* ── Injected global styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes k8s-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes k8s-scan {
          0%{transform:translateY(-100%);opacity:0}
          5%{opacity:.25} 95%{opacity:.25}
          100%{transform:translateY(100vh);opacity:0}
        }
      `}</style>

      {/* ── Top scan line ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999,
        background: 'linear-gradient(90deg,transparent,#00d4ff,transparent)',
        opacity: 0, animation: 'k8s-scan 12s linear infinite', pointerEvents: 'none',
      }} />

      {/* ══════════════════ APP BAR ══════════════════ */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          width: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%',
          ml: drawerOpen ? `${drawerWidth}px` : 0,
          background: 'linear-gradient(90deg, #071022 0%, #0a1830 100%)',
          borderBottom: '1px solid #1e3a5f',
          boxShadow: '0 1px 0 #1e3a5f, 0 4px 20px rgba(0,0,0,0.6)',
          transition: (theme) => theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: '52px !important', px: 2 }}>
          {/* Hamburger */}
          <IconButton
            onClick={handleDrawerToggle}
            size="small"
            sx={{
              border: '1px solid #1e3a5f',
              borderRadius: '6px',
              width: 32, height: 32,
              color: '#3d6080',
              '&:hover': { borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.08)' },
            }}
          >
            {drawerOpen ? <ChevronLeftIcon sx={{ fontSize: 16 }} /> : <MenuIcon sx={{ fontSize: 16 }} />}
          </IconButton>

          {/* Brand name */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
            <Typography
              sx={{
                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em',
                fontFamily: "'JetBrains Mono','Courier New',monospace",
                color: '#7ca5cc', textTransform: 'uppercase',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              K8s<span style={{ color: '#00d4ff' }}>Opt</span>
            </Typography>
          </Box>

          {/* Page path breadcrumb */}
          <Typography
            sx={{
              fontSize: '0.7rem', color: '#3d6080', flexGrow: 1,
              fontFamily: "'JetBrains Mono','Courier New',monospace",
              letterSpacing: '0.04em',
              display: { xs: 'none', md: 'block' },
            }}
          >
            <span style={{ color: '#2a5080' }}>~/</span>
            {location.pathname.replace(/\//g, ' / ').trim() || 'dashboard'}
          </Typography>

          <Box sx={{ flexGrow: { xs: 1, md: 0 } }} />

          {/* Cluster Selector */}
          <ClusterSelector />

          {/* Live dot */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
            background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)',
            borderRadius: '4px', px: 1, py: 0.25,
          }}>
            <Box sx={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#39ff14', boxShadow: '0 0 6px #39ff14',
              animation: 'k8s-pulse 2s ease-in-out infinite',
            }} />
            <Typography sx={{
              fontSize: '0.65rem', color: '#39ff14', fontWeight: 700,
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em',
            }}>
              LIVE
            </Typography>
          </Box>

          {/* User chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isAdmin && pendingCount > 0 && (
              <Chip
                label={`${pendingCount} pending`}
                size="small" color="warning" variant="outlined"
                onClick={() => navigate('/admin/user-management')}
                sx={{ cursor: 'pointer', fontSize: '0.65rem' }}
              />
            )}
            {(platformUser?.teams ?? []).slice(0, 2).map((t) => (
              <Chip key={t} label={t} size="small" variant="outlined"
                sx={{ fontSize: '0.65rem', borderColor: '#1e3a5f', color: '#3d6080' }} />
            ))}
            {(platformUser?.teams ?? []).length > 2 && (
              <Chip label={`+${(platformUser?.teams ?? []).length - 2}`} size="small" variant="outlined"
                sx={{ fontSize: '0.65rem', borderColor: '#1e3a5f', color: '#3d6080' }} />
            )}
            <Chip
              label={user?.role || 'User'}
              size="small"
              color={user?.role === 'admin' ? 'error' : 'info'}
              sx={{ textTransform: 'uppercase', fontSize: '0.62rem', fontWeight: 700 }}
            />
            <UserButton appearance={{ elements: { avatarBox: { width: 30, height: 30 } } }} />
          </Box>
        </Toolbar>
      </AppBar>

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <Drawer
        variant="persistent"
        open={drawerOpen}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            background: '#071022',
            borderRight: '1px solid #1a2e4a',
            backgroundImage: 'none',
            transition: (theme) => theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        }}
      >
        {/* Sidebar header */}
        <Box sx={{
          height: 52, display: 'flex', alignItems: 'center',
          px: 2, gap: 1.5,
          borderBottom: '1px solid #1a2e4a',
          background: 'linear-gradient(90deg, #071022, #0b1628)',
          flexShrink: 0,
        }}>
          <Box sx={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #0f1e35, #0d2040)',
            border: '1.5px solid #00d4ff',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 14px rgba(0,212,255,0.25)',
            flexShrink: 0,
          }}>
            <K8sWheelIcon size={18} color="#00d4ff" />
          </Box>
          <Box>
            <Typography sx={{
              fontSize: '0.78rem', fontWeight: 700, letterSpacing: '-0.01em',
              color: '#e2f0ff', lineHeight: 1.2,
            }}>
              K8s Optimization
            </Typography>
            <Typography sx={{
              fontSize: '0.6rem', color: '#3d6080',
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: '0.06em',
            }}>
              PLATFORM v2.4
            </Typography>
          </Box>
        </Box>

        {/* Hex pattern watermark */}
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden', top: 52 }}>
          <svg width="100%" height="100%" style={{ opacity: 0.025 }} viewBox="0 0 280 800" preserveAspectRatio="xMidYMin slice">
            <defs>
              <pattern id="sidebar-hex" patternUnits="userSpaceOnUse" width="40" height="46">
                <polygon points="20,1 39,12 39,34 20,45 1,34 1,12"
                  fill="none" stroke="#00d4ff" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sidebar-hex)" />
          </svg>
        </Box>

        {/* Nav list */}
        <Box sx={{ overflow: 'auto', flexGrow: 1, position: 'relative', zIndex: 1, pt: 0.5 }}>
          <List dense disablePadding>
            {menuItems.map((item) => renderMenuItem(item))}
          </List>

          {/* Terminal footer inside sidebar */}
          <Box sx={{
            mx: 1, my: 2, p: 1.5,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid #1a2e4a',
            borderRadius: '6px',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5f56' }} />
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#febc2e' }} />
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#27c93f' }} />
            </Box>
            {[
              '$ kubectl cluster-info',
              '  control-plane: RUNNING',
              '  health: OPTIMAL ✓',
            ].map((line, i) => (
              <Typography key={i} sx={{
                fontSize: '0.6rem', color: i === 0 ? '#7ca5cc' : '#3d6080',
                fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6,
              }}>
                {line}
              </Typography>
            ))}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
              <Typography sx={{ fontSize: '0.6rem', color: '#39ff14', fontFamily: "'JetBrains Mono',monospace" }}>$</Typography>
              <Box sx={{ width: 6, height: 10, background: '#39ff14', animation: 'k8s-pulse 1s step-end infinite' }} />
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          background: '#050d1a',
          width: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%',
          ml: drawerOpen ? 0 : `-${drawerWidth}px`,
          transition: (theme) => theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          position: 'relative',
          /* Faint global hex bg on main area */
          '&::before': {
            content: '""',
            position: 'fixed',
            inset: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,1 55,16 55,46 28,61 1,46 1,16' fill='none' stroke='%2300d4ff' stroke-width='0.5' stroke-opacity='0.04'/%3E%3C/svg%3E")`,
            backgroundSize: '56px 48px',
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        <Toolbar sx={{ minHeight: '52px !important' }} />
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;

// Made with Bob