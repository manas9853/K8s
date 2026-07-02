"""
Kubernetes Client Service
Handles connections to Kubernetes clusters and provides API access
"""
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from typing import Optional, List, Dict, Any
import os
import logging
import asyncio
import concurrent.futures

# Global timeout (seconds) for all K8s API calls
K8S_TIMEOUT = int(os.environ.get("K8S_TIMEOUT", "10"))

_k8s_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="k8s")


async def async_k8s(fn, *args, timeout: int = K8S_TIMEOUT, **kwargs):
    """
    Run a synchronous K8s SDK call in a thread pool with an asyncio timeout.
    Raises asyncio.TimeoutError if it exceeds `timeout` seconds.
    Usage:
        nodes = await async_k8s(k8s_client.list_nodes)
    """
    loop = asyncio.get_event_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(_k8s_thread_pool, lambda: fn(*args, **kwargs)),
        timeout=timeout
    )

logger = logging.getLogger(__name__)


class KubernetesClient:
    """Kubernetes client wrapper for cluster operations"""
    
    def __init__(self):
        self.k8s_in_cluster = os.getenv('K8S_IN_CLUSTER', 'false').lower() == 'true'
        # Use KUBECONFIG env var if set, otherwise default to ~/.kube/config
        self.k8s_config_path = os.getenv('KUBECONFIG', os.getenv('K8S_CONFIG_PATH', '~/.kube/config'))
        self.k8s_context = os.getenv('K8S_CONTEXT', None)
        self.verify_ssl = os.getenv('K8S_VERIFY_SSL', 'true').lower() == 'true'
        
        # Cache for cluster info to avoid repeated slow API calls
        self._cluster_info_cache = None
        self._cache_timestamp = 0
        self._cache_ttl = 60  # Cache for 60 seconds
        
        # Cluster name cache
        self._cluster_name = None
        
        self._load_config()
        
    def _load_config(self):
        """Load Kubernetes configuration"""
        try:
            # Check if token file exists (for IBM Cloud and other token-based auth)
            token_file = os.path.join(os.path.dirname(__file__), '..', '.kube-token')
            if os.path.exists(token_file) and os.path.getsize(token_file) > 0:
                logger.info("Loading Kubernetes configuration with token-based authentication")
                self._load_token_config(token_file)
            elif self.k8s_in_cluster:
                logger.info("Loading in-cluster Kubernetes configuration")
                config.load_incluster_config()
            else:
                logger.info(f"Loading Kubernetes configuration from {self.k8s_config_path}")
                config.load_kube_config(
                    config_file=os.path.expanduser(self.k8s_config_path),
                    context=self.k8s_context if self.k8s_context else None
                )
            logger.info("✅ Kubernetes configuration loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load Kubernetes configuration: {e}")
            logger.warning("Platform will use dummy data until Kubernetes is configured")
    
    def _load_token_config(self, token_file: str):
        """Load Kubernetes configuration using bearer token"""
        # Read token from file
        with open(token_file, 'r') as f:
            token = f.read().strip()
        
        if not token:
            raise ValueError("Token file is empty")
        
        # Load kubeconfig to get cluster info
        config.load_kube_config(
            config_file=os.path.expanduser(self.k8s_config_path),
            context=self.k8s_context if self.k8s_context else None
        )
        
        # Get the current configuration
        configuration = client.Configuration.get_default_copy()
        
        # Override with token authentication
        configuration.api_key = {"authorization": f"Bearer {token}"}
        configuration.api_key_prefix = {}
        
        # Set as default
        client.Configuration.set_default(configuration)
        
        logger.info(f"✅ Token-based authentication configured (token length: {len(token)} chars)")
    
    def get_core_api(self) -> client.CoreV1Api:
        """Get Core V1 API client"""
        return client.CoreV1Api()
    
    def get_apps_api(self) -> client.AppsV1Api:
        """Get Apps V1 API client"""
        return client.AppsV1Api()
    
    def get_batch_api(self) -> client.BatchV1Api:
        """Get Batch V1 API client"""
        return client.BatchV1Api()
    
    def get_metrics_api(self) -> client.CustomObjectsApi:
        """Get Metrics API client"""
        return client.CustomObjectsApi()
    
    def get_networking_api(self) -> client.NetworkingV1Api:
        """Get Networking V1 API client"""
        return client.NetworkingV1Api()
    
    def is_connected(self) -> bool:
        """Check if connected to Kubernetes cluster.

        Runs the probe in a thread so callers are never blocked longer than
        ``timeout`` seconds, even if the underlying socket stalls.
        """
        import concurrent.futures
        from kubernetes.client.configuration import Configuration

        def _probe() -> bool:
            cfg = Configuration.get_default_copy()
            cfg.connection_pool_maxsize = 2
            with client.ApiClient(configuration=cfg) as api:
                v1 = client.CoreV1Api(api_client=api)
                v1.list_namespace(limit=1, _request_timeout=3)
            return True

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(_probe)
                return future.result(timeout=4)
        except Exception as e:
            logger.debug(f"Kubernetes connection check failed (expected if no cluster): {e}")
            return False
    
    def get_cluster_info(self, timeout: int = 15) -> Dict[str, Any]:
        """Get basic cluster information with caching"""
        import time
        
        # Check cache first
        current_time = time.time()
        if self._cluster_info_cache and (current_time - self._cache_timestamp) < self._cache_ttl:
            logger.info("Returning cached cluster info")
            return self._cluster_info_cache
        
        try:
            import signal
            
            def timeout_handler(signum, frame):
                raise TimeoutError("Kubernetes API call timed out")
            
            # Set timeout for API calls (increased to 15 seconds)
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(timeout)
            
            try:
                v1 = self.get_core_api()
                
                # Get version info
                version = client.VersionApi().get_code(_request_timeout=K8S_TIMEOUT)

                # Get nodes with capacity info
                nodes = v1.list_node(_request_timeout=K8S_TIMEOUT)
                
                # Calculate total cluster capacity and detect provider
                total_cpu_capacity = 0.0
                total_memory_capacity = 0.0
                provider = "unknown"
                region = "unknown"
                
                for node in nodes.items:
                    # Get CPU capacity (in cores)
                    cpu_str = node.status.capacity.get('cpu', '0')
                    total_cpu_capacity += self._parse_cpu(cpu_str)
                    
                    # Get memory capacity (in bytes)
                    memory_str = node.status.capacity.get('memory', '0')
                    total_memory_capacity += self._parse_memory(memory_str)
                    
                    # Detect provider from node labels
                    if provider == "unknown" and node.metadata.labels:
                        labels = node.metadata.labels
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
                
                # Get namespaces (fast)
                namespaces = v1.list_namespace(_request_timeout=K8S_TIMEOUT)

                # Get all pods to calculate usage
                try:
                    all_pods = v1.list_pod_for_all_namespaces(_request_timeout=K8S_TIMEOUT)
                    pod_count = len(all_pods.items)
                    
                    # Calculate total requested resources
                    total_cpu_requested = 0.0
                    total_memory_requested = 0.0
                    
                    for pod in all_pods.items:
                        if pod.spec.containers:
                            for container in pod.spec.containers:
                                if container.resources and container.resources.requests:
                                    cpu_req = container.resources.requests.get('cpu', '0')
                                    mem_req = container.resources.requests.get('memory', '0')
                                    total_cpu_requested += self._parse_cpu(cpu_req)
                                    total_memory_requested += self._parse_memory(mem_req)
                except:
                    pod_count = 0
                    total_cpu_requested = 0.0
                    total_memory_requested = 0.0
                
                signal.alarm(0)  # Cancel alarm
                
                result = {
                    "connected": True,
                    "version": f"{version.major}.{version.minor}",
                    "nodes": len(nodes.items),
                    "namespaces": len(namespaces.items),
                    "pods": pod_count,
                    "platform": version.platform,
                    "provider": provider,
                    "region": region,
                    "cpu_capacity_cores": total_cpu_capacity,
                    "memory_capacity_gb": total_memory_capacity / (1024**3),
                    "cpu_requested_cores": total_cpu_requested,
                    "memory_requested_gb": total_memory_requested / (1024**3)
                }
                
                # Cache the result
                self._cluster_info_cache = result
                self._cache_timestamp = current_time
                
                return result
            finally:
                signal.alarm(0)  # Ensure alarm is cancelled
                
        except (TimeoutError, Exception) as e:
            logger.error(f"Failed to get cluster info: {e}")
            # Return cached data if available, even if stale
            if self._cluster_info_cache:
                logger.warning("Returning stale cached cluster info due to error")
                return self._cluster_info_cache
            return {
                "connected": False,
                "error": str(e)
            }
    
    def _parse_cpu(self, cpu_str: str) -> float:
        """Parse CPU string to cores (e.g., '2', '500m' -> 0.5)"""
        if not cpu_str or cpu_str == '0':
            return 0.0
        
        cpu_str = str(cpu_str).strip()
        
        if cpu_str.endswith('m'):
            # Millicores
            return float(cpu_str[:-1]) / 1000.0
        else:
            # Cores
            return float(cpu_str)
    
    def _parse_memory(self, memory_str: str) -> float:
        """Parse memory string to bytes"""
        if not memory_str or memory_str == '0':
            return 0.0
        
        memory_str = str(memory_str).strip()
        
        # Handle different units
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
        
        # No unit, assume bytes
        return float(memory_str)
    
    def get_cluster_name(self) -> str:
        """Get the cluster name from kubeconfig context"""
        if self._cluster_name:
            return self._cluster_name
        
        try:
            # Try to get from context
            if self.k8s_context:
                # Extract cluster name from context (e.g., "xforce-devops/c2dvjirw01r66qf58vu0" -> "xforce-devops")
                cluster_name = self.k8s_context.split('/')[0]
                self._cluster_name = cluster_name
                return cluster_name
            
            # Try to load kubeconfig and get current context
            import subprocess
            result = subprocess.run(
                ['kubectl', 'config', 'current-context'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                context = result.stdout.strip()
                cluster_name = context.split('/')[0] if '/' in context else context
                self._cluster_name = cluster_name
                return cluster_name
        except Exception as e:
            logger.warning(f"Failed to get cluster name: {e}")
        
        # Fallback to "current-cluster"
        self._cluster_name = "current-cluster"
        return self._cluster_name
    
    def list_namespaces(self) -> List[str]:
        """List all namespaces"""
        try:
            v1 = self.get_core_api()
            namespaces = v1.list_namespace(_request_timeout=K8S_TIMEOUT)
            return [ns.metadata.name for ns in namespaces.items]
        except Exception as e:
            logger.error(f"Failed to list namespaces: {e}")
            return []

    def list_pods(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """List pods in namespace or all namespaces with full resource specs"""
        try:
            v1 = self.get_core_api()

            if namespace:
                pods = v1.list_namespaced_pod(namespace, _request_timeout=K8S_TIMEOUT)
            else:
                pods = v1.list_pod_for_all_namespaces(_request_timeout=K8S_TIMEOUT)
            
            result = []
            for pod in pods.items:
                # Get owner reference
                owner_kind = "Pod"
                if pod.metadata.owner_references:
                    owner_kind = pod.metadata.owner_references[0].kind
                
                # Aggregate container resources
                total_cpu_request = 0.0
                total_cpu_limit = 0.0
                total_memory_request = 0.0
                total_memory_limit = 0.0
                
                containers_info = []
                for container in pod.spec.containers:
                    resources = container.resources
                    
                    # Parse CPU
                    cpu_request = resources.requests.get('cpu', '0') if resources.requests else '0'
                    cpu_limit = resources.limits.get('cpu', '0') if resources.limits else '0'
                    
                    # Parse Memory
                    memory_request = resources.requests.get('memory', '0') if resources.requests else '0'
                    memory_limit = resources.limits.get('memory', '0') if resources.limits else '0'

                    # Security context — read actual fields from the cluster
                    sc = container.security_context
                    pod_sc = pod.spec.security_context
                    sec_ctx = {}
                    if sc:
                        sec_ctx = {
                            "privileged": sc.privileged or False,
                            "allowPrivilegeEscalation": sc.allow_privilege_escalation,
                            "runAsNonRoot": sc.run_as_non_root,
                            "runAsUser": sc.run_as_user,
                            "runAsRoot": (sc.run_as_user == 0) if sc.run_as_user is not None else None,
                            "readOnlyRootFilesystem": sc.read_only_root_filesystem,
                            "capabilities": {
                                "add": list(sc.capabilities.add) if sc.capabilities and sc.capabilities.add else [],
                                "drop": list(sc.capabilities.drop) if sc.capabilities and sc.capabilities.drop else [],
                            } if sc.capabilities else {}
                        }
                    pod_sec = {}
                    if pod_sc:
                        pod_sec = {
                            "hostNetwork": pod.spec.host_network or False,
                            "hostPID": pod.spec.host_pid or False,
                            "hostIPC": pod.spec.host_ipc or False,
                            "runAsNonRoot": pod_sc.run_as_non_root,
                            "runAsUser": pod_sc.run_as_user,
                        }
                    
                    containers_info.append({
                        "name": container.name,
                        "image": container.image or "",
                        "cpu_request": cpu_request,
                        "cpu_limit": cpu_limit,
                        "memory_request": memory_request,
                        "memory_limit": memory_limit,
                        "securityContext": sec_ctx,
                        "podSecurityContext": pod_sec,
                        "hostNetwork": pod.spec.host_network or False,
                        "hostPID": pod.spec.host_pid or False,
                        "hostIPC": pod.spec.host_ipc or False,
                    })
                    
                    # Aggregate (convert to standard units)
                    total_cpu_request += self._parse_cpu(cpu_request)
                    total_cpu_limit += self._parse_cpu(cpu_limit)
                    total_memory_request += self._parse_memory(memory_request)
                    total_memory_limit += self._parse_memory(memory_limit)
                
                result.append({
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": pod.status.phase,
                    "node_name": pod.spec.node_name,
                    "creation_timestamp": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None,
                    "owner_kind": owner_kind,
                    "containers": containers_info,
                    "container_count": len(pod.spec.containers),
                    "restarts": sum(cs.restart_count for cs in pod.status.container_statuses) if pod.status.container_statuses else 0,
                    "total_cpu_request": total_cpu_request,
                    "total_cpu_limit": total_cpu_limit,
                    "total_memory_request_mb": total_memory_request,
                    "total_memory_limit_mb": total_memory_limit
                })
            
            return result
        except Exception as e:
            logger.error(f"Failed to list pods: {e}")
            return []
    
    def get_pod_metrics(self, namespace: str, pod_name: str) -> Optional[Dict[str, Any]]:
        """Get metrics for a specific pod"""
        try:
            metrics_api = self.get_metrics_api()
            metrics = metrics_api.get_namespaced_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                namespace=namespace,
                plural="pods",
                name=pod_name
            )
            return metrics
        except Exception as e:
            logger.error(f"Failed to get pod metrics: {e}")
            return None
    
    def list_nodes(self) -> List[Dict[str, Any]]:
        """List all nodes"""
        try:
            v1 = self.get_core_api()
            nodes = v1.list_node(_request_timeout=K8S_TIMEOUT)
            
            return [
                {
                    "name": node.metadata.name,
                    "status": node.status.conditions[-1].type if node.status.conditions else "Unknown",
                    "cpu_capacity": node.status.capacity.get('cpu', '0'),
                    "memory_capacity": node.status.capacity.get('memory', '0'),
                    "cpu_allocatable": node.status.allocatable.get('cpu', '0'),
                    "memory_allocatable": node.status.allocatable.get('memory', '0'),
                    "pods_capacity": node.status.capacity.get('pods', '0'),
                    "kubelet_version": node.status.node_info.kubelet_version,
                    "os_image": node.status.node_info.os_image,
                    "created": node.metadata.creation_timestamp.isoformat() if node.metadata.creation_timestamp else None
                }
                for node in nodes.items
            ]
        except Exception as e:
            logger.error(f"Failed to list nodes: {e}")
            return []
    
    def get_nodes_detailed(self) -> List[Dict[str, Any]]:
        """Get detailed node information with usage metrics"""
        try:
            v1 = self.get_core_api()
            nodes = v1.list_node(_request_timeout=K8S_TIMEOUT)

            # Get all pods to calculate per-node metrics
            all_pods = v1.list_pod_for_all_namespaces(_request_timeout=K8S_TIMEOUT)
            node_pod_counts = {}
            node_cpu_requests = {}
            node_memory_requests = {}
            
            for pod in all_pods.items:
                node_name = pod.spec.node_name
                if not node_name or pod.status.phase not in ['Running', 'Pending']:
                    continue
                
                node_pod_counts[node_name] = node_pod_counts.get(node_name, 0) + 1
                
                # Calculate resource requests
                for container in pod.spec.containers:
                    if container.resources and container.resources.requests:
                        cpu_req = container.resources.requests.get('cpu', '0')
                        mem_req = container.resources.requests.get('memory', '0')
                        
                        node_cpu_requests[node_name] = node_cpu_requests.get(node_name, 0) + self._parse_cpu(cpu_req)
                        node_memory_requests[node_name] = node_memory_requests.get(node_name, 0) + self._parse_memory(mem_req)
            
            result = []
            for node in nodes.items:
                node_name = node.metadata.name

                # Get node IP addresses
                internal_ip = ""
                external_ip = ""
                if node.status.addresses:
                    for addr in node.status.addresses:
                        if addr.type == "InternalIP":
                            internal_ip = addr.address
                        elif addr.type == "ExternalIP":
                            external_ip = addr.address

                # Get node roles
                roles = []
                if node.metadata.labels:
                    if 'node-role.kubernetes.io/master' in node.metadata.labels:
                        roles.append('master')
                    if 'node-role.kubernetes.io/control-plane' in node.metadata.labels:
                        roles.append('control-plane')
                    if not roles:
                        roles.append('worker')
                
                # Get node status
                status = "Unknown"
                conditions = []
                if node.status.conditions:
                    for condition in node.status.conditions:
                        conditions.append({
                            "type": condition.type,
                            "status": condition.status
                        })
                        if condition.type == "Ready":
                            status = "Ready" if condition.status == "True" else "NotReady"
                
                # Calculate age
                age = "unknown"
                if node.metadata.creation_timestamp:
                    from datetime import datetime, timezone
                    created = node.metadata.creation_timestamp
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    age_delta = datetime.now(timezone.utc) - created
                    days = age_delta.days
                    if days > 0:
                        age = f"{days}d"
                    else:
                        hours = age_delta.seconds // 3600
                        age = f"{hours}h"
                
                # Get resource info
                cpu_capacity_cores = self._parse_cpu(node.status.capacity.get('cpu', '0'))
                memory_capacity_bytes = self._parse_memory(node.status.capacity.get('memory', '0'))
                cpu_allocatable_cores = self._parse_cpu(node.status.allocatable.get('cpu', '0'))
                memory_allocatable_bytes = self._parse_memory(node.status.allocatable.get('memory', '0'))
                
                # Get pod count and requests
                pod_count = node_pod_counts.get(node_name, 0)
                pod_capacity = int(node.status.capacity.get('pods', '110'))
                cpu_requested = node_cpu_requests.get(node_name, 0)
                memory_requested = node_memory_requests.get(node_name, 0)
                
                # Calculate usage percentages
                cpu_usage_percent = (cpu_requested / cpu_allocatable_cores * 100) if cpu_allocatable_cores > 0 else 0
                memory_usage_percent = (memory_requested / memory_allocatable_bytes * 100) if memory_allocatable_bytes > 0 else 0
                
                result.append({
                    "name": node_name,
                    "status": status,
                    "roles": roles,
                    "age": age,
                    "version": node.status.node_info.kubelet_version,
                    "internal_ip": internal_ip,
                    "external_ip": external_ip,
                    "os_image": node.status.node_info.os_image,
                    "kernel_version": node.status.node_info.kernel_version,
                    "container_runtime": node.status.node_info.container_runtime_version,
                    "cpu_capacity": f"{cpu_capacity_cores:.1f} cores",
                    "memory_capacity": f"{memory_capacity_bytes / (1024**3):.1f} GB",
                    "cpu_allocatable": f"{cpu_allocatable_cores:.1f} cores",
                    "memory_allocatable": f"{memory_allocatable_bytes / (1024**3):.1f} GB",
                    "cpu_usage_percent": round(cpu_usage_percent, 1),
                    "memory_usage_percent": round(memory_usage_percent, 1),
                    "pod_count": pod_count,
                    "pod_capacity": pod_capacity,
                    "conditions": conditions,
                    "labels": dict(node.metadata.labels) if node.metadata.labels else {}
                })
            
            return result
        except Exception as e:
            logger.error(f"Failed to get detailed nodes: {e}")
            return []


# Global instance
try:
    k8s_client = KubernetesClient()
except Exception as e:
    logger.warning(f"Failed to initialize Kubernetes client: {e}")
    logger.warning("Platform will use dummy data until Kubernetes is configured")
    k8s_client = None

# Made with Bob
