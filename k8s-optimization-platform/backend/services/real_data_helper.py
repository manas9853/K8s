"""
Helper functions to provide real cluster context to all APIs
This ensures all features show data from the actual connected cluster
"""
from services.k8s_client import k8s_client
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

def get_real_cluster_context() -> Dict:
    """
    Get real cluster context that all APIs should use
    Returns cluster info, namespaces, and basic stats
    """
    if k8s_client is None or not k8s_client.is_connected():
        return {
            'connected': False,
            'cluster_id': 'demo-cluster',
            'cluster_name': 'Demo Cluster',
            'namespaces': ['default', 'kube-system', 'production'],
            'total_pods': 0,
            'total_nodes': 0
        }
    
    try:
        cluster_info = k8s_client.get_cluster_info()
        pods = k8s_client.list_pods()
        namespaces = k8s_client.list_namespaces()
        
        return {
            'connected': True,
            'cluster_id': cluster_info.get('id', 'unknown'),
            'cluster_name': cluster_info.get('name', 'unknown'),
            'namespaces': [ns['name'] for ns in namespaces],
            'total_pods': len(pods),
            'total_nodes': cluster_info.get('node_count', 0),
            'pods': pods,
            'namespace_objects': namespaces
        }
    except Exception as e:
        logger.error(f"Error getting cluster context: {e}")
        return {
            'connected': False,
            'cluster_id': 'error',
            'cluster_name': 'Error',
            'namespaces': [],
            'total_pods': 0,
            'total_nodes': 0
        }


def get_real_namespaces() -> List[str]:
    """Get list of real namespaces from connected cluster"""
    context = get_real_cluster_context()
    return context.get('namespaces', ['default'])


def get_real_cluster_id() -> str:
    """Get real cluster ID"""
    context = get_real_cluster_context()
    return context.get('cluster_id', 'demo-cluster')


def get_real_cluster_name() -> str:
    """Get real cluster name"""
    context = get_real_cluster_context()
    return context.get('cluster_name', 'Demo Cluster')


def is_connected_to_real_cluster() -> bool:
    """Check if connected to real cluster"""
    context = get_real_cluster_context()
    return context.get('connected', False)

# Made with Bob
