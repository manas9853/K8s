#!/usr/bin/env python3
"""
K8s Optimization Platform - Cluster Agent
Collects metrics from Kubernetes cluster and sends to central platform
"""
import os
import sys
import time
import json
import logging
import requests
from datetime import datetime
from kubernetes import client, config
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ClusterAgent:
    """Agent that collects cluster metrics and sends to platform"""
    
    def __init__(self):
        """Initialize the agent"""
        # Load configuration from environment
        self.platform_url = os.getenv('PLATFORM_URL', 'http://localhost:8000')
        self.api_token = os.getenv('API_TOKEN', '')
        self.cluster_id = os.getenv('CLUSTER_ID', '')
        self.cluster_name = os.getenv('CLUSTER_NAME', '')
        self.environment = os.getenv('ENVIRONMENT', 'production')
        self.collection_interval = int(os.getenv('COLLECTION_INTERVAL', '30'))
        
        # Validate configuration
        if not self.api_token:
            logger.error("API_TOKEN environment variable is required")
            sys.exit(1)
        
        if not self.cluster_name:
            logger.error("CLUSTER_NAME environment variable is required")
            sys.exit(1)
        
        # Initialize Kubernetes client
        try:
            # Try in-cluster config first (for Kubernetes deployment)
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes configuration")
        except Exception:
            # Fall back to local kubeconfig (for local development)
            try:
                config.load_kube_config()
                logger.info("Loaded local Kubernetes configuration")
            except Exception as e:
                logger.error(f"Failed to load Kubernetes config: {e}")
                sys.exit(1)
        
        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()
        self.version_api = client.VersionApi()
        
        # Register with platform
        self.register_cluster()
    
    def register_cluster(self):
        """Register this cluster with the platform"""
        try:
            # Get cluster version
            version_info = self.version_api.get_code()
            
            # Detect cloud provider
            nodes = self.core_v1.list_node(limit=1)
            provider = "unknown"
            region = "unknown"
            
            if nodes.items:
                node = nodes.items[0]
                labels = node.metadata.labels or {}
                
                if 'ibm-cloud.kubernetes.io/region' in labels:
                    provider = "IBM Cloud"
                    region = labels.get('ibm-cloud.kubernetes.io/region', 'unknown')
                elif 'eks.amazonaws.com/nodegroup' in labels:
                    provider = "AWS"
                    region = labels.get('topology.kubernetes.io/region', 'unknown')
                elif 'cloud.google.com/gke-nodepool' in labels:
                    provider = "GCP"
                    region = labels.get('topology.kubernetes.io/region', 'unknown')
                elif 'kubernetes.azure.com/cluster' in labels:
                    provider = "Azure"
                    region = labels.get('topology.kubernetes.io/region', 'unknown')
            
            registration_data = {
                "cluster_id": self.cluster_id or self.cluster_name,
                "cluster_name": self.cluster_name,
                "environment": self.environment,
                "provider": provider,
                "region": region,
                "version": f"{version_info.major}.{version_info.minor}",
                "agent_version": "1.0.0"
            }
            
            response = requests.post(
                f"{self.platform_url}/api/agents/register",
                json=registration_data,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "ngrok-skip-browser-warning": "true"
                },
                timeout=10,
                verify=False  # Disable SSL verification for ngrok
            )
            
            if response.status_code == 200:
                result = response.json()
                self.cluster_id = result.get('cluster_id', self.cluster_id)
                logger.info(f"Successfully registered cluster: {self.cluster_name}")
            else:
                logger.warning(f"Registration failed: {response.status_code} - {response.text}")
        
        except Exception as e:
            logger.error(f"Failed to register cluster: {e}")
    
    def collect_metrics(self) -> Dict[str, Any]:
        """Collect metrics from the cluster"""
        try:
            # Get nodes
            nodes = self.core_v1.list_node()
            node_count = len(nodes.items)
            
            # Calculate total capacity and collect per-node details
            total_cpu_capacity = 0.0
            total_memory_capacity = 0.0
            node_details = []
            
            for node in nodes.items:
                capacity = node.status.capacity or {}
                allocatable = node.status.allocatable or {}
                cpu_str = capacity.get('cpu', '0')
                memory_str = capacity.get('memory', '0')
                cpu_alloc_str = allocatable.get('cpu', cpu_str)
                mem_alloc_str = allocatable.get('memory', memory_str)
                
                cpu_cap = self._parse_cpu(cpu_str)
                mem_cap = self._parse_memory(memory_str)
                total_cpu_capacity += cpu_cap
                total_memory_capacity += mem_cap
                
                is_ready = any(
                    c.type == 'Ready' and c.status == 'True'
                    for c in (node.status.conditions or [])
                )
                labels = node.metadata.labels or {}
                roles = [
                    k.replace('node-role.kubernetes.io/', '')
                    for k in labels
                    if k.startswith('node-role.kubernetes.io/')
                ]
                if not roles:
                    roles = ['worker']
                
                node_details.append({
                    "name": node.metadata.name,
                    "status": "Ready" if is_ready else "NotReady",
                    "roles": roles,
                    "version": node.status.node_info.kubelet_version,
                    "os_image": node.status.node_info.os_image,
                    "kernel_version": node.status.node_info.kernel_version,
                    "container_runtime": node.status.node_info.container_runtime_version,
                    "cpu_capacity": round(cpu_cap, 2),
                    "memory_capacity": round(mem_cap / (1024**3), 2),
                    "cpu_allocatable": round(self._parse_cpu(cpu_alloc_str), 2),
                    "memory_allocatable": round(self._parse_memory(mem_alloc_str) / (1024**3), 2),
                    "cpu_usage_percent": 0.0,
                    "memory_usage_percent": 0.0,
                    "pod_count": 0,
                    "pod_capacity": int(allocatable.get('pods', 110)),
                    "labels": labels,
                    "conditions": [
                        {"type": c.type, "status": c.status}
                        for c in (node.status.conditions or [])
                    ],
                })
            
            # Get namespaces
            namespaces = self.core_v1.list_namespace()
            namespace_count = len(namespaces.items)
            
            # Get all pods
            all_pods = self.core_v1.list_pod_for_all_namespaces()
            pod_count = len(all_pods.items)
            
            # Calculate total requested resources
            total_cpu_requested = 0.0
            total_memory_requested = 0.0
            
            pod_status_counts = {
                "running": 0,
                "pending": 0,
                "failed": 0,
                "succeeded": 0
            }
            
            for pod in all_pods.items:
                # Count pod status
                status = pod.status.phase.lower()
                if status in pod_status_counts:
                    pod_status_counts[status] += 1
                
                # Sum resource requests
                if pod.spec.containers:
                    for container in pod.spec.containers:
                        if container.resources and container.resources.requests:
                            cpu_req = container.resources.requests.get('cpu', '0')
                            mem_req = container.resources.requests.get('memory', '0')
                            total_cpu_requested += self._parse_cpu(cpu_req)
                            total_memory_requested += self._parse_memory(mem_req)
            
            # Build metrics payload
            metrics = {
                "cluster_id": self.cluster_id,
                "cluster_name": self.cluster_name,
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "nodes": {
                    "count": node_count,
                    "cpu_capacity_cores": total_cpu_capacity,
                    "memory_capacity_gb": total_memory_capacity / (1024**3),
                    "nodes": node_details
                },
                "namespaces": {
                    "count": namespace_count
                },
                "pods": {
                    "total": pod_count,
                    "running": pod_status_counts["running"],
                    "pending": pod_status_counts["pending"],
                    "failed": pod_status_counts["failed"],
                    "succeeded": pod_status_counts["succeeded"]
                },
                "resources": {
                    "cpu_requested_cores": total_cpu_requested,
                    "memory_requested_gb": total_memory_requested / (1024**3),
                    "cpu_utilization_percent": (total_cpu_requested / total_cpu_capacity * 100) if total_cpu_capacity > 0 else 0,
                    "memory_utilization_percent": (total_memory_requested / total_memory_capacity * 100) if total_memory_capacity > 0 else 0
                }
            }
            
            return metrics
        
        except Exception as e:
            logger.error(f"Failed to collect metrics: {e}")
            return {}
    
    def send_metrics(self, metrics: Dict[str, Any]) -> bool:
        """Send metrics to the platform"""
        try:
            response = requests.post(
                f"{self.platform_url}/api/agents/metrics",
                json=metrics,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "ngrok-skip-browser-warning": "true"
                },
                timeout=10,
                verify=False  # Disable SSL verification for ngrok
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully sent metrics for cluster: {self.cluster_name}")
                return True
            else:
                logger.warning(f"Failed to send metrics: {response.status_code} - {response.text}")
                return False
        
        except Exception as e:
            logger.error(f"Failed to send metrics: {e}")
            return False
    
    def send_heartbeat(self):
        """Send heartbeat to platform"""
        try:
            heartbeat_data = {
                "cluster_id": self.cluster_id,
                "cluster_name": self.cluster_name,
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "status": "healthy"
            }
            
            response = requests.post(
                f"{self.platform_url}/api/agents/heartbeat",
                json=heartbeat_data,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "ngrok-skip-browser-warning": "true"
                },
                timeout=5,
                verify=False  # Disable SSL verification for ngrok
            )
            
            if response.status_code != 200:
                logger.warning(f"Heartbeat failed: {response.status_code}")
        
        except Exception as e:
            logger.error(f"Failed to send heartbeat: {e}")
    
    def _parse_cpu(self, cpu_str: str) -> float:
        """Parse CPU string to cores"""
        if not cpu_str or cpu_str == '0':
            return 0.0
        
        cpu_str = str(cpu_str).strip()
        
        if cpu_str.endswith('m'):
            return float(cpu_str[:-1]) / 1000.0
        else:
            return float(cpu_str)
    
    def _parse_memory(self, memory_str: str) -> float:
        """Parse memory string to bytes"""
        if not memory_str or memory_str == '0':
            return 0.0
        
        memory_str = str(memory_str).strip()
        
        units = {
            'Ki': 1024,
            'Mi': 1024**2,
            'Gi': 1024**3,
            'Ti': 1024**4,
            'K': 1000,
            'M': 1000**2,
            'G': 1000**3,
            'T': 1000**4
        }
        
        for unit, multiplier in units.items():
            if memory_str.endswith(unit):
                return float(memory_str[:-len(unit)]) * multiplier
        
        return float(memory_str)
    
    def run(self):
        """Main agent loop"""
        logger.info(f"Starting agent for cluster: {self.cluster_name}")
        logger.info(f"Platform URL: {self.platform_url}")
        logger.info(f"Collection interval: {self.collection_interval} seconds")
        
        heartbeat_counter = 0
        
        while True:
            try:
                # Collect and send metrics
                metrics = self.collect_metrics()
                if metrics:
                    self.send_metrics(metrics)
                
                # Send heartbeat every 5 collection cycles
                heartbeat_counter += 1
                if heartbeat_counter >= 5:
                    self.send_heartbeat()
                    heartbeat_counter = 0
                
                # Wait for next collection
                time.sleep(self.collection_interval)
            
            except KeyboardInterrupt:
                logger.info("Agent stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(self.collection_interval)


def main():
    """Main entry point"""
    agent = ClusterAgent()
    agent.run()


if __name__ == "__main__":
    main()

# Made with Bob