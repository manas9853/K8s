#!/usr/bin/env python3
"""
K8s Optimization Platform - Comprehensive Cluster Agent
Collects complete cluster data for all platform features
"""
import os
import sys
import time
import json
import logging
import requests
from datetime import datetime, timedelta
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ComprehensiveClusterAgent:
    """
    Comprehensive agent that collects ALL Kubernetes data needed for:
    - Dashboard (Command Center, Executive, Multi-Cluster)
    - Operations (Clusters, Workloads, Pods, Storage, Network)
    - Autonomous AI (Copilot, Auto-Fix, Rollback)
    - Optimization (Recommendations, Cost, Cleanup, Waste)
    - Security (Vulnerabilities, RBAC, Secrets, Network)
    - Attack Investigation (Threats, Forensics, Detection)
    - Compliance (CIS, SOC2, PCI, ISO, HIPAA, GDPR)
    - Intelligence (Root Cause, Predictive, Anomaly)
    - FinOps (Cost, Carbon, Sustainability)
    - Platform Engineering (GitOps, CI/CD, Policy)
    - People & Teams (Accountability, Ownership)
    - Reports & Analytics
    """
    
    def __init__(self):
        """Initialize the comprehensive agent"""
        # Load configuration
        self.platform_url = os.getenv('PLATFORM_URL', 'http://localhost:8000')
        self.api_token = os.getenv('API_TOKEN', '')
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
        
        # Initialize Kubernetes clients
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes configuration")
        except Exception as e:
            logger.error(f"Failed to load Kubernetes config: {e}")
            sys.exit(1)
        
        # Initialize all API clients
        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()
        self.batch_v1 = client.BatchV1Api()
        self.networking_v1 = client.NetworkingV1Api()
        self.rbac_v1 = client.RbacAuthorizationV1Api()
        self.storage_v1 = client.StorageV1Api()
        self.version_api = client.VersionApi()
        self.custom_objects_api = client.CustomObjectsApi()
        
        # Register with platform
        self.register_cluster()
    
    def register_cluster(self):
        """Register cluster with platform"""
        try:
            version_info = self.version_api.get_code()
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
                "cluster_name": self.cluster_name,
                "environment": self.environment,
                "cloud_provider": provider,
                "region": region,
                "version": f"{version_info.major}.{version_info.minor}"
            }
            
            response = requests.post(
                f"{self.platform_url}/api/agent/register",
                json=registration_data,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Cluster {self.cluster_name} registered successfully")
            else:
                logger.error(f"Registration failed: {response.text}")
                
        except Exception as e:
            logger.error(f"Failed to register cluster: {e}")
    
    def collect_comprehensive_metrics(self) -> Dict[str, Any]:
        """Collect ALL metrics for complete platform functionality"""
        logger.info("Starting comprehensive metrics collection...")
        
        metrics = {
            "cluster_name": self.cluster_name,
            "timestamp": datetime.utcnow().isoformat(),
            "collection_type": "comprehensive",
            
            # Dashboard data
            "dashboard": self.collect_dashboard_data(),
            
            # Operations data
            "operations": {
                "clusters": self.collect_cluster_data(),
                "workloads": self.collect_workload_data(),
                "pods": self.collect_pod_data(),
                "storage": self.collect_storage_data(),
                "network": self.collect_network_data(),
                "observability": self.collect_observability_data()
            },
            
            # Security data
            "security": self.collect_security_data(),
            
            # Compliance data
            "compliance": self.collect_compliance_data(),
            
            # Cost & FinOps data
            "finops": self.collect_finops_data(),
            
            # Platform Engineering data
            "platform": self.collect_platform_data(),
            
            # Teams & Ownership data
            "teams": self.collect_team_data()
        }
        
        logger.info("Comprehensive metrics collection completed")
        return metrics
    
    def collect_dashboard_data(self) -> Dict[str, Any]:
        """Collect data for Dashboard features"""
        try:
            nodes = self.core_v1.list_node()
            namespaces = self.core_v1.list_namespace()
            pods = self.core_v1.list_pod_for_all_namespaces()
            
            return {
                "total_nodes": len(nodes.items),
                "total_namespaces": len(namespaces.items),
                "total_pods": len(pods.items),
                "running_pods": sum(1 for p in pods.items if p.status.phase == "Running"),
                "pending_pods": sum(1 for p in pods.items if p.status.phase == "Pending"),
                "failed_pods": sum(1 for p in pods.items if p.status.phase == "Failed")
            }
        except Exception as e:
            logger.error(f"Error collecting dashboard data: {e}")
            return {}
    
    def collect_cluster_data(self) -> Dict[str, Any]:
        """Collect cluster-level data"""
        try:
            nodes = self.core_v1.list_node()
            
            total_cpu = 0
            total_memory = 0
            allocatable_cpu = 0
            allocatable_memory = 0
            
            node_details = []
            for node in nodes.items:
                capacity = node.status.capacity or {}
                allocatable = node.status.allocatable or {}
                
                cpu_cap = self._parse_cpu(capacity.get('cpu', '0'))
                mem_cap = self._parse_memory(capacity.get('memory', '0'))
                cpu_alloc = self._parse_cpu(allocatable.get('cpu', '0'))
                mem_alloc = self._parse_memory(allocatable.get('memory', '0'))
                
                total_cpu += cpu_cap
                total_memory += mem_cap
                allocatable_cpu += cpu_alloc
                allocatable_memory += mem_alloc
                
                # Extract node IP addresses
                internal_ip = ""
                external_ip = ""
                if node.status.addresses:
                    for addr in node.status.addresses:
                        if addr.type == "InternalIP":
                            internal_ip = addr.address
                        elif addr.type == "ExternalIP":
                            external_ip = addr.address

                node_details.append({
                    "name": node.metadata.name,
                    "status": "Ready" if any(c.type == "Ready" and c.status == "True"
                                            for c in node.status.conditions) else "NotReady",
                    "internal_ip": internal_ip,
                    "external_ip": external_ip,
                    "cpu_capacity": cpu_cap,
                    "memory_capacity": mem_cap,
                    "cpu_allocatable": cpu_alloc,
                    "memory_allocatable": mem_alloc,
                    "labels": node.metadata.labels or {},
                    "taints": [{"key": t.key, "effect": t.effect}
                              for t in (node.spec.taints or [])],
                    "kubelet_version": node.status.node_info.kubelet_version,
                    "os_image": node.status.node_info.os_image,
                    "kernel_version": node.status.node_info.kernel_version,
                    "container_runtime": node.status.node_info.container_runtime_version
                })
            
            return {
                "total_nodes": len(nodes.items),
                "total_cpu_cores": total_cpu,
                "total_memory_gb": total_memory,
                "allocatable_cpu_cores": allocatable_cpu,
                "allocatable_memory_gb": allocatable_memory,
                "nodes": node_details
            }
        except Exception as e:
            logger.error(f"Error collecting cluster data: {e}")
            return {}
    
    def collect_workload_data(self) -> Dict[str, Any]:
        """Collect workload data (Deployments, StatefulSets, DaemonSets, Jobs, CronJobs)"""
        try:
            deployments = self.apps_v1.list_deployment_for_all_namespaces()
            statefulsets = self.apps_v1.list_stateful_set_for_all_namespaces()
            daemonsets = self.apps_v1.list_daemon_set_for_all_namespaces()
            replicasets = self.apps_v1.list_replica_set_for_all_namespaces()
            jobs = self.batch_v1.list_job_for_all_namespaces()
            cronjobs = self.batch_v1.list_cron_job_for_all_namespaces()
            
            deployment_list = []
            for d in deployments.items:
                deployment_list.append({
                    "name": d.metadata.name,
                    "namespace": d.metadata.namespace,
                    "replicas": d.spec.replicas,
                    "ready_replicas": d.status.ready_replicas or 0,
                    "available_replicas": d.status.available_replicas or 0,
                    "labels": d.metadata.labels or {},
                    "annotations": d.metadata.annotations or {},
                    "strategy": d.spec.strategy.type if d.spec.strategy else "RollingUpdate",
                    "created": d.metadata.creation_timestamp.isoformat() if d.metadata.creation_timestamp else None
                })
            
            statefulset_list = []
            for s in statefulsets.items:
                # Build container specs
                sts_containers = []
                for c in (s.spec.template.spec.containers or []):
                    req = {}
                    lim = {}
                    if c.resources:
                        if c.resources.requests:
                            req = {k: v for k, v in c.resources.requests.items()}
                        if c.resources.limits:
                            lim = {k: v for k, v in c.resources.limits.items()}
                    ports = []
                    if c.ports:
                        for p in c.ports:
                            ports.append({"containerPort": p.container_port, "protocol": p.protocol or "TCP"})
                    sts_containers.append({
                        "name": c.name,
                        "image": c.image or "",
                        "ports": ports,
                        "resources": {"requests": req, "limits": lim},
                    })

                # Build volume claim templates
                vct_list = []
                for vct in (s.spec.volume_claim_templates or []):
                    storage = ""
                    storage_class = ""
                    if vct.spec:
                        if vct.spec.resources and vct.spec.resources.requests:
                            storage = vct.spec.resources.requests.get("storage", "")
                        storage_class = vct.spec.storage_class_name or ""
                    vct_list.append({
                        "name": vct.metadata.name if vct.metadata else "",
                        "storage": storage,
                        "storage_class": storage_class,
                    })

                created_ts = s.metadata.creation_timestamp
                created_iso = created_ts.isoformat() if created_ts else None

                statefulset_list.append({
                    "name": s.metadata.name,
                    "namespace": s.metadata.namespace,
                    "replicas_desired": s.spec.replicas or 0,
                    "replicas_current": s.status.current_replicas or s.status.ready_replicas or 0,
                    "replicas_ready": s.status.ready_replicas or 0,
                    "service_name": s.spec.service_name or "",
                    "labels": s.metadata.labels or {},
                    "selector": (s.spec.selector.match_labels or {}) if s.spec.selector else {},
                    "containers": sts_containers,
                    "volume_claim_templates": vct_list,
                    "created_at": created_iso,
                })
            
            def _containers_from_spec(spec):
                result = []
                for c in (spec.containers or []):
                    ports = []
                    if c.ports:
                        for p in c.ports:
                            ports.append({"containerPort": p.container_port, "protocol": p.protocol or "TCP"})
                    req = {}
                    lim = {}
                    if c.resources:
                        if c.resources.requests:
                            req = dict(c.resources.requests)
                        if c.resources.limits:
                            lim = dict(c.resources.limits)
                    result.append({
                        "name": c.name,
                        "image": c.image or "",
                        "ports": ports,
                        "resources": {"requests": req, "limits": lim},
                    })
                return result

            daemonset_list = []
            for ds in daemonsets.items:
                created_at = ds.metadata.creation_timestamp.isoformat() if ds.metadata.creation_timestamp else None
                ds_containers = _containers_from_spec(ds.spec.template.spec) if ds.spec and ds.spec.template and ds.spec.template.spec else []
                selector = (ds.spec.selector.match_labels or {}) if ds.spec and ds.spec.selector else {}
                daemonset_list.append({
                    "name":                      ds.metadata.name,
                    "namespace":                 ds.metadata.namespace,
                    "desired_number_scheduled":  ds.status.desired_number_scheduled or 0,
                    "current_number_scheduled":  ds.status.current_number_scheduled or 0,
                    "number_ready":              ds.status.number_ready or 0,
                    "number_available":          ds.status.number_available or 0,
                    "number_misscheduled":       ds.status.number_misscheduled or 0,
                    "labels":                    ds.metadata.labels or {},
                    "selector":                  selector,
                    "containers":                ds_containers,
                    "created_at":                created_at,
                })
            
            job_list = []
            for j in jobs.items:
                created_at = j.metadata.creation_timestamp.isoformat() if j.metadata.creation_timestamp else None
                start_time = j.status.start_time.isoformat() if j.status.start_time else None
                completion_time = j.status.completion_time.isoformat() if j.status.completion_time else None
                duration = None
                if start_time and completion_time:
                    try:
                        from datetime import datetime as _dt
                        t0 = _dt.fromisoformat(start_time.replace("Z", "+00:00"))
                        t1 = _dt.fromisoformat(completion_time.replace("Z", "+00:00"))
                        duration = str(int((t1 - t0).total_seconds()))
                    except Exception:
                        pass
                elif start_time:
                    try:
                        from datetime import datetime as _dt, timezone as _tz
                        t0 = _dt.fromisoformat(start_time.replace("Z", "+00:00"))
                        duration = str(int((_dt.now(_tz.utc) - t0).total_seconds()))
                    except Exception:
                        pass
                job_containers = _containers_from_spec(j.spec.template.spec) if j.spec and j.spec.template and j.spec.template.spec else []
                selector = (j.spec.selector.match_labels or {}) if j.spec and j.spec.selector else {}
                conditions = []
                for cond in (j.status.conditions or []):
                    conditions.append({
                        "type": cond.type,
                        "status": cond.status,
                        "reason": cond.reason or "",
                        "message": cond.message or "",
                        "last_update_time": cond.last_transition_time.isoformat() if cond.last_transition_time else None,
                    })
                job_list.append({
                    "name":            j.metadata.name,
                    "namespace":       j.metadata.namespace,
                    "completions":     j.spec.completions,
                    "parallelism":     j.spec.parallelism,
                    "active":          j.status.active or 0,
                    "succeeded":       j.status.succeeded or 0,
                    "failed":          j.status.failed or 0,
                    "start_time":      start_time,
                    "completion_time": completion_time,
                    "duration":        duration,
                    "labels":          j.metadata.labels or {},
                    "selector":        selector,
                    "containers":      job_containers,
                    "conditions":      conditions,
                    "created_at":      created_at,
                })
            
            cronjob_list = []
            for cj in cronjobs.items:
                created_at = cj.metadata.creation_timestamp.isoformat() if cj.metadata.creation_timestamp else None
                jt_spec = cj.spec.job_template.spec if cj.spec and cj.spec.job_template and cj.spec.job_template.spec else None
                jt_containers = _containers_from_spec(jt_spec.template.spec) if jt_spec and jt_spec.template and jt_spec.template.spec else []
                job_template = {
                    "completions": jt_spec.completions if jt_spec else None,
                    "parallelism": jt_spec.parallelism if jt_spec else None,
                    "backoff_limit": jt_spec.backoff_limit if jt_spec and jt_spec.backoff_limit is not None else 6,
                    "containers": jt_containers,
                }
                cronjob_list.append({
                    "name":                cj.metadata.name,
                    "namespace":           cj.metadata.namespace,
                    "schedule":            cj.spec.schedule,
                    "suspend":             cj.spec.suspend or False,
                    "active":              len(cj.status.active or []),
                    "last_schedule_time":  cj.status.last_schedule_time.isoformat() if cj.status.last_schedule_time else None,
                    "last_successful_time": cj.status.last_successful_time.isoformat() if cj.status.last_successful_time else None,
                    "labels":              cj.metadata.labels or {},
                    "job_template":        job_template,
                    "created_at":          created_at,
                })
            
            return {
                "deployments": {
                    "total": len(deployments.items),
                    "items": deployment_list
                },
                "statefulsets": {
                    "total": len(statefulsets.items),
                    "items": statefulset_list
                },
                "daemonsets": {
                    "total": len(daemonsets.items),
                    "items": daemonset_list
                },
                "replicasets": {
                    "total": len(replicasets.items)
                },
                "jobs": {
                    "total": len(jobs.items),
                    "items": job_list
                },
                "cronjobs": {
                    "total": len(cronjobs.items),
                    "items": cronjob_list
                }
            }
        except Exception as e:
            logger.error(f"Error collecting workload data: {e}")
            return {}
    
    def collect_pod_data(self) -> Dict[str, Any]:
        """Collect detailed pod data for CPU/Memory/Restart/OOM analysis"""
        try:
            pods = self.core_v1.list_pod_for_all_namespaces()
            events = self.core_v1.list_event_for_all_namespaces()
            
            pod_list = []
            oom_events = []
            restart_analysis = []
            
            for pod in pods.items:
                containers = []
                total_restarts = 0
                
                for container_status in (pod.status.container_statuses or []):
                    restart_count = container_status.restart_count
                    total_restarts += restart_count
                    
                    # Check for OOMKilled
                    if container_status.last_state and container_status.last_state.terminated:
                        if container_status.last_state.terminated.reason == "OOMKilled":
                            oom_events.append({
                                "pod": pod.metadata.name,
                                "namespace": pod.metadata.namespace,
                                "container": container_status.name,
                                "timestamp": container_status.last_state.terminated.finished_at.isoformat() if container_status.last_state.terminated.finished_at else None
                            })
                    
                    containers.append({
                        "name": container_status.name,
                        "ready": container_status.ready,
                        "restart_count": restart_count,
                        "state": self._get_container_state(container_status)
                    })
                
                # Get resource requests/limits
                cpu_request = 0
                memory_request = 0
                cpu_limit = 0
                memory_limit = 0
                
                for container in (pod.spec.containers or []):
                    if container.resources:
                        if container.resources.requests:
                            cpu_request += self._parse_cpu(container.resources.requests.get('cpu', '0'))
                            memory_request += self._parse_memory(container.resources.requests.get('memory', '0'))
                        if container.resources.limits:
                            cpu_limit += self._parse_cpu(container.resources.limits.get('cpu', '0'))
                            memory_limit += self._parse_memory(container.resources.limits.get('memory', '0'))
                
                pod_data = {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": pod.status.phase,
                    "node": pod.spec.node_name,
                    "cpu_request": cpu_request,
                    "memory_request": memory_request,
                    "cpu_limit": cpu_limit,
                    "memory_limit": memory_limit,
                    "total_restarts": total_restarts,
                    "containers": containers,
                    "labels": pod.metadata.labels or {},
                    "annotations": pod.metadata.annotations or {},
                    "created": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None,
                    "owner_kind": self._get_owner_kind(pod),
                    "owner_name": self._get_owner_name(pod)
                }
                
                pod_list.append(pod_data)
                
                if total_restarts > 0:
                    restart_analysis.append({
                        "pod": pod.metadata.name,
                        "namespace": pod.metadata.namespace,
                        "restart_count": total_restarts
                    })
            
            return {
                "total_pods": len(pods.items),
                "running": sum(1 for p in pods.items if p.status.phase == "Running"),
                "pending": sum(1 for p in pods.items if p.status.phase == "Pending"),
                "failed": sum(1 for p in pods.items if p.status.phase == "Failed"),
                "succeeded": sum(1 for p in pods.items if p.status.phase == "Succeeded"),
                "pods": pod_list,
                "oom_events": oom_events,
                "restart_analysis": restart_analysis
            }
        except Exception as e:
            logger.error(f"Error collecting pod data: {e}")
            return {}
    
    def collect_storage_data(self) -> Dict[str, Any]:
        """Collect storage data (PVCs, PVs, Storage Classes)"""
        try:
            pvcs = self.core_v1.list_persistent_volume_claim_for_all_namespaces()
            pvs = self.core_v1.list_persistent_volume()
            storage_classes = self.storage_v1.list_storage_class()
            
            pvc_list = []
            orphaned_pvcs = []
            
            for pvc in pvcs.items:
                size = pvc.spec.resources.requests.get('storage', '0') if pvc.spec.resources and pvc.spec.resources.requests else '0'
                
                pvc_data = {
                    "name": pvc.metadata.name,
                    "namespace": pvc.metadata.namespace,
                    "status": pvc.status.phase,
                    "volume_name": pvc.spec.volume_name,
                    "storage_class": pvc.spec.storage_class_name,
                    "size": size,
                    "access_modes": pvc.spec.access_modes or [],
                    "labels": pvc.metadata.labels or {},
                    "created": pvc.metadata.creation_timestamp.isoformat() if pvc.metadata.creation_timestamp else None
                }
                
                pvc_list.append(pvc_data)
                
                # Check if PVC is orphaned (not bound or no pods using it)
                if pvc.status.phase != "Bound":
                    orphaned_pvcs.append(pvc_data)
            
            pv_list = []
            for pv in pvs.items:
                pv_list.append({
                    "name": pv.metadata.name,
                    "status": pv.status.phase,
                    "claim": f"{pv.spec.claim_ref.namespace}/{pv.spec.claim_ref.name}" if pv.spec.claim_ref else None,
                    "storage_class": pv.spec.storage_class_name,
                    "capacity": pv.spec.capacity.get('storage', '0') if pv.spec.capacity else '0',
                    "access_modes": pv.spec.access_modes or [],
                    "reclaim_policy": pv.spec.persistent_volume_reclaim_policy
                })
            
            storage_class_list = []
            for sc in storage_classes.items:
                storage_class_list.append({
                    "name": sc.metadata.name,
                    "provisioner": sc.provisioner,
                    "reclaim_policy": sc.reclaim_policy,
                    "volume_binding_mode": sc.volume_binding_mode,
                    "allow_volume_expansion": sc.allow_volume_expansion or False
                })
            
            return {
                "pvcs": {
                    "total": len(pvcs.items),
                    "items": pvc_list,
                    "orphaned": orphaned_pvcs
                },
                "pvs": {
                    "total": len(pvs.items),
                    "items": pv_list
                },
                "storage_classes": {
                    "total": len(storage_classes.items),
                    "items": storage_class_list
                }
            }
        except Exception as e:
            logger.error(f"Error collecting storage data: {e}")
            return {}
    
    def collect_network_data(self) -> Dict[str, Any]:
        """Collect network data (Services, Ingress, Network Policies)"""
        try:
            services = self.core_v1.list_service_for_all_namespaces()
            ingresses = self.networking_v1.list_ingress_for_all_namespaces()
            network_policies = self.networking_v1.list_network_policy_for_all_namespaces()
            
            service_list = []
            external_services = []
            
            for svc in services.items:
                svc_data = {
                    "name": svc.metadata.name,
                    "namespace": svc.metadata.namespace,
                    "type": svc.spec.type,
                    "cluster_ip": svc.spec.cluster_ip,
                    "external_ips": svc.spec.external_i_ps or [],
                    "ports": [{"port": p.port, "protocol": p.protocol, "target_port": str(p.target_port)} 
                             for p in (svc.spec.ports or [])],
                    "selector": svc.spec.selector or {},
                    "labels": svc.metadata.labels or {},
                    "created": svc.metadata.creation_timestamp.isoformat() if svc.metadata.creation_timestamp else None
                }
                
                service_list.append(svc_data)
                
                # Track external exposure
                if svc.spec.type in ["LoadBalancer", "NodePort"]:
                    external_services.append(svc_data)
            
            ingress_list = []
            for ing in ingresses.items:
                rules = []
                if ing.spec.rules:
                    for rule in ing.spec.rules:
                        if rule.http and rule.http.paths:
                            for path in rule.http.paths:
                                rules.append({
                                    "host": rule.host,
                                    "path": path.path,
                                    "service": path.backend.service.name if path.backend and path.backend.service else None
                                })
                
                ingress_list.append({
                    "name": ing.metadata.name,
                    "namespace": ing.metadata.namespace,
                    "rules": rules,
                    "tls": [{"hosts": t.hosts} for t in (ing.spec.tls or [])],
                    "labels": ing.metadata.labels or {},
                    "created": ing.metadata.creation_timestamp.isoformat() if ing.metadata.creation_timestamp else None
                })
            
            network_policy_list = []
            for np in network_policies.items:
                network_policy_list.append({
                    "name": np.metadata.name,
                    "namespace": np.metadata.namespace,
                    "pod_selector": np.spec.pod_selector.match_labels if np.spec.pod_selector else {},
                    "policy_types": np.spec.policy_types or [],
                    "created": np.metadata.creation_timestamp.isoformat() if np.metadata.creation_timestamp else None
                })
            
            return {
                "services": {
                    "total": len(services.items),
                    "items": service_list,
                    "external_exposure": external_services
                },
                "ingresses": {
                    "total": len(ingresses.items),
                    "items": ingress_list
                },
                "network_policies": {
                    "total": len(network_policies.items),
                    "items": network_policy_list
                }
            }
        except Exception as e:
            logger.error(f"Error collecting network data: {e}")
            return {}
    
    def collect_observability_data(self) -> Dict[str, Any]:
        """Collect observability data (Events, Logs metadata)"""
        try:
            events = self.core_v1.list_event_for_all_namespaces()
            
            # Categorize events
            warning_events = []
            error_events = []
            recent_events = []
            
            now = datetime.utcnow()
            
            for event in events.items:
                event_data = {
                    "name": event.metadata.name,
                    "namespace": event.metadata.namespace,
                    "type": event.type,
                    "reason": event.reason,
                    "message": event.message,
                    "involved_object": {
                        "kind": event.involved_object.kind,
                        "name": event.involved_object.name
                    },
                    "count": event.count,
                    "first_timestamp": event.first_timestamp.isoformat() if event.first_timestamp else None,
                    "last_timestamp": event.last_timestamp.isoformat() if event.last_timestamp else None
                }
                
                if event.type == "Warning":
                    warning_events.append(event_data)
                
                if event.last_timestamp:
                    age = (now - event.last_timestamp.replace(tzinfo=None)).total_seconds()
                    if age < 3600:  # Last hour
                        recent_events.append(event_data)
            
            return {
                "events": {
                    "total": len(events.items),
                    "warnings": len(warning_events),
                    "recent": recent_events[:100],  # Last 100 events
                    "warning_events": warning_events[:50]  # Top 50 warnings
                }
            }
        except Exception as e:
            logger.error(f"Error collecting observability data: {e}")
            return {}
    
    def collect_security_data(self) -> Dict[str, Any]:
        """Collect security data (RBAC, Secrets, Security Policies)"""
        try:
            secrets = self.core_v1.list_secret_for_all_namespaces()
            service_accounts = self.core_v1.list_service_account_for_all_namespaces()
            roles = self.rbac_v1.list_role_for_all_namespaces()
            cluster_roles = self.rbac_v1.list_cluster_role()
            role_bindings = self.rbac_v1.list_role_binding_for_all_namespaces()
            cluster_role_bindings = self.rbac_v1.list_cluster_role_binding()
            
            # Analyze secrets
            secret_list = []
            exposed_secrets = []
            
            for secret in secrets.items:
                secret_data = {
                    "name": secret.metadata.name,
                    "namespace": secret.metadata.namespace,
                    "type": secret.type,
                    "data_keys": list(secret.data.keys()) if secret.data else [],
                    "labels": secret.metadata.labels or {},
                    "created": secret.metadata.creation_timestamp.isoformat() if secret.metadata.creation_timestamp else None
                }
                
                secret_list.append(secret_data)
                
                # Check for potentially exposed secrets (in default namespace, etc.)
                if secret.metadata.namespace == "default":
                    exposed_secrets.append(secret_data)
            
            # Analyze RBAC
            privileged_roles = []
            cluster_admin_bindings = []
            
            for cr in cluster_roles.items:
                # Check for cluster-admin or highly privileged roles
                if cr.metadata.name == "cluster-admin":
                    privileged_roles.append({
                        "name": cr.metadata.name,
                        "type": "ClusterRole"
                    })
            
            for crb in cluster_role_bindings.items:
                if crb.role_ref.name == "cluster-admin":
                    cluster_admin_bindings.append({
                        "name": crb.metadata.name,
                        "subjects": [{"kind": s.kind, "name": s.name, "namespace": s.namespace} 
                                   for s in (crb.subjects or [])]
                    })
            
            # Analyze pods for security issues
            pods = self.core_v1.list_pod_for_all_namespaces()
            privileged_pods = []
            root_pods = []
            
            for pod in pods.items:
                for container in (pod.spec.containers or []):
                    if container.security_context:
                        if container.security_context.privileged:
                            privileged_pods.append({
                                "pod": pod.metadata.name,
                                "namespace": pod.metadata.namespace,
                                "container": container.name
                            })
                        
                        if container.security_context.run_as_user == 0:
                            root_pods.append({
                                "pod": pod.metadata.name,
                                "namespace": pod.metadata.namespace,
                                "container": container.name
                            })
            
            return {
                "secrets": {
                    "total": len(secrets.items),
                    "items": secret_list[:100],  # Limit to 100
                    "exposed": exposed_secrets
                },
                "rbac": {
                    "service_accounts": len(service_accounts.items),
                    "roles": len(roles.items),
                    "cluster_roles": len(cluster_roles.items),
                    "role_bindings": len(role_bindings.items),
                    "cluster_role_bindings": len(cluster_role_bindings.items),
                    "privileged_roles": privileged_roles,
                    "cluster_admin_bindings": cluster_admin_bindings
                },
                "container_security": {
                    "privileged_pods": privileged_pods,
                    "root_pods": root_pods
                }
            }
        except Exception as e:
            logger.error(f"Error collecting security data: {e}")
            return {}
    
    def collect_compliance_data(self) -> Dict[str, Any]:
        """Collect compliance-related data"""
        try:
            # Basic compliance checks
            namespaces = self.core_v1.list_namespace()
            pods = self.core_v1.list_pod_for_all_namespaces()
            network_policies = self.networking_v1.list_network_policy_for_all_namespaces()
            
            # Check for namespaces without network policies
            namespaces_without_netpol = []
            netpol_namespaces = set(np.metadata.namespace for np in network_policies.items)
            
            for ns in namespaces.items:
                if ns.metadata.name not in netpol_namespaces and ns.metadata.name not in ['kube-system', 'kube-public', 'kube-node-lease']:
                    namespaces_without_netpol.append(ns.metadata.name)
            
            # Check for pods without resource limits
            pods_without_limits = []
            for pod in pods.items:
                has_limits = False
                for container in (pod.spec.containers or []):
                    if container.resources and container.resources.limits:
                        has_limits = True
                        break
                
                if not has_limits:
                    pods_without_limits.append({
                        "pod": pod.metadata.name,
                        "namespace": pod.metadata.namespace
                    })
            
            return {
                "network_policy_coverage": {
                    "total_namespaces": len(namespaces.items),
                    "namespaces_with_policies": len(netpol_namespaces),
                    "namespaces_without_policies": namespaces_without_netpol
                },
                "resource_limits": {
                    "total_pods": len(pods.items),
                    "pods_without_limits": len(pods_without_limits),
                    "pods_without_limits_list": pods_without_limits[:50]
                }
            }
        except Exception as e:
            logger.error(f"Error collecting compliance data: {e}")
            return {}
    
    def collect_finops_data(self) -> Dict[str, Any]:
        """Collect FinOps and cost-related data"""
        try:
            pods = self.core_v1.list_pod_for_all_namespaces()
            nodes = self.core_v1.list_node()
            
            # Calculate resource requests by namespace
            namespace_resources = {}
            
            for pod in pods.items:
                ns = pod.metadata.namespace
                if ns not in namespace_resources:
                    namespace_resources[ns] = {
                        "cpu_request": 0,
                        "memory_request": 0,
                        "pod_count": 0
                    }
                
                namespace_resources[ns]["pod_count"] += 1
                
                for container in (pod.spec.containers or []):
                    if container.resources and container.resources.requests:
                        cpu = self._parse_cpu(container.resources.requests.get('cpu', '0'))
                        memory = self._parse_memory(container.resources.requests.get('memory', '0'))
                        namespace_resources[ns]["cpu_request"] += cpu
                        namespace_resources[ns]["memory_request"] += memory
            
            # Calculate by team (using labels)
            team_resources = {}
            for pod in pods.items:
                team = pod.metadata.labels.get('team', 'unknown') if pod.metadata.labels else 'unknown'
                
                if team not in team_resources:
                    team_resources[team] = {
                        "cpu_request": 0,
                        "memory_request": 0,
                        "pod_count": 0
                    }
                
                team_resources[team]["pod_count"] += 1
                
                for container in (pod.spec.containers or []):
                    if container.resources and container.resources.requests:
                        cpu = self._parse_cpu(container.resources.requests.get('cpu', '0'))
                        memory = self._parse_memory(container.resources.requests.get('memory', '0'))
                        team_resources[team]["cpu_request"] += cpu
                        team_resources[team]["memory_request"] += memory
            
            return {
                "namespace_resources": namespace_resources,
                "team_resources": team_resources,
                "total_nodes": len(nodes.items)
            }
        except Exception as e:
            logger.error(f"Error collecting FinOps data: {e}")
            return {}
    
    def collect_platform_data(self) -> Dict[str, Any]:
        """Collect platform engineering data (GitOps, CI/CD indicators)"""
        try:
            # Check for GitOps tools
            namespaces = self.core_v1.list_namespace()
            
            gitops_tools = {
                "argocd": False,
                "flux": False
            }
            
            for ns in namespaces.items:
                if 'argocd' in ns.metadata.name:
                    gitops_tools["argocd"] = True
                if 'flux' in ns.metadata.name:
                    gitops_tools["flux"] = True
            
            return {
                "gitops": gitops_tools
            }
        except Exception as e:
            logger.error(f"Error collecting platform data: {e}")
            return {}
    
    def collect_team_data(self) -> Dict[str, Any]:
        """Collect team and ownership data"""
        try:
            pods = self.core_v1.list_pod_for_all_namespaces()
            namespaces = self.core_v1.list_namespace()
            
            # Extract teams from labels
            teams = set()
            team_namespaces = {}
            
            for pod in pods.items:
                if pod.metadata.labels:
                    team = pod.metadata.labels.get('team')
                    if team:
                        teams.add(team)
                        if team not in team_namespaces:
                            team_namespaces[team] = set()
                        team_namespaces[team].add(pod.metadata.namespace)
            
            for ns in namespaces.items:
                if ns.metadata.labels:
                    team = ns.metadata.labels.get('team')
                    if team:
                        teams.add(team)
                        if team not in team_namespaces:
                            team_namespaces[team] = set()
                        team_namespaces[team].add(ns.metadata.name)
            
            return {
                "total_teams": len(teams),
                "teams": list(teams),
                "team_namespaces": {team: list(namespaces) for team, namespaces in team_namespaces.items()}
            }
        except Exception as e:
            logger.error(f"Error collecting team data: {e}")
            return {}
    
    def send_metrics(self, metrics: Dict[str, Any]):
        """Send collected metrics to platform"""
        try:
            response = requests.post(
                f"{self.platform_url}/api/agent/metrics",
                json=metrics,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=60
            )
            
            if response.status_code == 200:
                logger.info("Metrics sent successfully")
            else:
                logger.error(f"Failed to send metrics: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"Error sending metrics: {e}")
    
    def send_heartbeat(self):
        """Send heartbeat to platform"""
        try:
            heartbeat_data = {
                "cluster_name": self.cluster_name,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "healthy"
            }
            
            response = requests.post(
                f"{self.platform_url}/api/agent/heartbeat",
                json=heartbeat_data,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.debug("Heartbeat sent successfully")
            else:
                logger.warning(f"Heartbeat failed: {response.status_code}")
                
        except Exception as e:
            logger.warning(f"Error sending heartbeat: {e}")
    
    def run(self):
        """Main agent loop"""
        logger.info(f"Starting comprehensive agent for cluster: {self.cluster_name}")
        logger.info(f"Collection interval: {self.collection_interval} seconds")
        logger.info(f"Platform URL: {self.platform_url}")
        
        heartbeat_counter = 0
        
        while True:
            try:
                # Collect and send comprehensive metrics
                metrics = self.collect_comprehensive_metrics()
                self.send_metrics(metrics)
                
                # Send heartbeat every 2 collection cycles
                heartbeat_counter += 1
                if heartbeat_counter >= 2:
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
    
    # Helper methods
    def _parse_cpu(self, cpu_str: str) -> float:
        """Parse CPU string to cores"""
        if not cpu_str:
            return 0.0
        cpu_str = str(cpu_str)
        if cpu_str.endswith('m'):
            return float(cpu_str[:-1]) / 1000
        return float(cpu_str)
    
    def _parse_memory(self, mem_str: str) -> float:
        """Parse memory string to GB"""
        if not mem_str:
            return 0.0
        mem_str = str(mem_str)
        units = {'Ki': 1024, 'Mi': 1024**2, 'Gi': 1024**3, 'Ti': 1024**4}
        for unit, multiplier in units.items():
            if mem_str.endswith(unit):
                return float(mem_str[:-2]) * multiplier / (1024**3)
        return float(mem_str) / (1024**3)
    
    def _get_container_state(self, container_status) -> str:
        """Get container state"""
        if container_status.state.running:
            return "running"
        elif container_status.state.waiting:
            return f"waiting: {container_status.state.waiting.reason}"
        elif container_status.state.terminated:
            return f"terminated: {container_status.state.terminated.reason}"
        return "unknown"
    
    def _get_owner_kind(self, pod) -> Optional[str]:
        """Get pod owner kind"""
        if pod.metadata.owner_references:
            return pod.metadata.owner_references[0].kind
        return None
    
    def _get_owner_name(self, pod) -> Optional[str]:
        """Get pod owner name"""
        if pod.metadata.owner_references:
            return pod.metadata.owner_references[0].name
        return None


if __name__ == "__main__":
    agent = ComprehensiveClusterAgent()
    agent.run()

# Made with Bob
