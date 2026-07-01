"""
PVC File Analysis API
Analyzes files inside PVCs to identify space-saving opportunities
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import logging
from datetime import datetime, timedelta
from services.k8s_client import k8s_client

router = APIRouter()
logger = logging.getLogger(__name__)


def execute_in_pod(namespace: str, pod_name: str, container: str, command: List[str]) -> str:
    """
    Execute a command inside a pod and return the output
    
    Args:
        namespace: Kubernetes namespace
        pod_name: Name of the pod
        container: Container name
        command: Command to execute as list
        
    Returns:
        Command output as string
    """
    try:
        from kubernetes.stream import stream
        
        v1 = k8s_client.get_core_api()
        
        # Execute command in pod
        resp = stream(
            v1.connect_get_namespaced_pod_exec,
            pod_name,
            namespace,
            container=container,
            command=command,
            stderr=True,
            stdin=False,
            stdout=True,
            tty=False
        )
        
        return resp
    except Exception as e:
        logger.error(f"Error executing command in pod: {e}")
        raise


def find_pod_using_pvc(namespace: str, pvc_name: str) -> Dict[str, str]:
    """
    Find a pod that is using the specified PVC
    
    Returns:
        Dict with pod_name, container_name, and mount_path
    """
    try:
        v1 = k8s_client.get_core_api()
        
        # Get all pods in namespace
        pods = v1.list_namespaced_pod(namespace)
        
        for pod in pods.items:
            if pod.spec.volumes:
                for volume in pod.spec.volumes:
                    if volume.persistent_volume_claim and volume.persistent_volume_claim.claim_name == pvc_name:
                        # Found a pod using this PVC
                        container_name = pod.spec.containers[0].name
                        
                        # Find mount path
                        mount_path = "/data"  # default
                        for container in pod.spec.containers:
                            if container.volume_mounts:
                                for mount in container.volume_mounts:
                                    if mount.name == volume.name:
                                        mount_path = mount.mount_path
                                        break
                        
                        return {
                            "pod_name": pod.metadata.name,
                            "container_name": container_name,
                            "mount_path": mount_path,
                            "pod_status": pod.status.phase
                        }
        
        return None
    except Exception as e:
        logger.error(f"Error finding pod for PVC: {e}")
        return None


def analyze_file(file_info: str, mount_path: str) -> Dict[str, Any]:
    """
    Parse file information and create analysis
    
    File info format from 'find' command:
    permissions size mtime path
    """
    try:
        parts = file_info.strip().split(maxsplit=3)
        if len(parts) < 4:
            return None
        
        permissions, size_bytes, mtime_timestamp, path = parts
        
        # Parse file metadata
        size_bytes = int(size_bytes)
        mtime = datetime.fromtimestamp(int(mtime_timestamp))
        age_days = (datetime.now() - mtime).days
        
        # Determine file type
        file_type = "directory" if permissions.startswith('d') else "file"
        
        # Calculate if file can be deleted (old and not recently accessed)
        can_delete = age_days > 90 and file_type == "file"
        
        # Generate recommendation
        if age_days > 365:
            recommendation = "Very old file, consider archiving or deleting"
        elif age_days > 180:
            recommendation = "Old file, safe to delete if not needed"
        elif age_days > 90:
            recommendation = "Moderately old, review before deleting"
        else:
            recommendation = "Recent file, keep"
        
        # Format size
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            size_str = f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
        
        return {
            "path": path.replace(mount_path, ""),  # Remove mount path prefix
            "size": size_str,
            "size_bytes": size_bytes,
            "last_modified": mtime.strftime("%Y-%m-%d"),
            "last_accessed": mtime.strftime("%Y-%m-%d"),  # Using mtime as approximation
            "age_days": age_days,
            "type": file_type,
            "can_delete": can_delete,
            "recommendation": recommendation
        }
    except Exception as e:
        logger.error(f"Error analyzing file: {e}")
        return None


@router.get("/storage/pvcs/{namespace}/{pvc_name}/files")
async def analyze_pvc_files(namespace: str, pvc_name: str):
    """
    Analyze files inside a PVC
    
    This endpoint:
    1. Finds a pod using the PVC
    2. Executes file listing commands inside the pod
    3. Analyzes file metadata (size, age, access patterns)
    4. Identifies old/unused files
    5. Calculates potential space savings
    """
    try:
        # Find a pod using this PVC
        pod_info = find_pod_using_pvc(namespace, pvc_name)
        
        if not pod_info:
            raise HTTPException(
                status_code=404,
                detail=f"No running pod found using PVC '{pvc_name}' in namespace '{namespace}'"
            )
        
        if pod_info["pod_status"] != "Running":
            raise HTTPException(
                status_code=400,
                detail=f"Pod is not running (status: {pod_info['pod_status']})"
            )
        
        mount_path = pod_info["mount_path"]
        
        # Execute find command to list all files with metadata
        # Format: permissions size mtime path
        command = [
            "find",
            mount_path,
            "-type", "f",
            "-o", "-type", "d",
            "-printf", "%M %s %T@ %p\\n"
        ]
        
        try:
            output = execute_in_pod(
                namespace,
                pod_info["pod_name"],
                pod_info["container_name"],
                command
            )
        except Exception as e:
            # Fallback to simpler command if find with printf not available
            logger.warning(f"Advanced find failed, using fallback: {e}")
            command = ["ls", "-lR", mount_path]
            output = execute_in_pod(
                namespace,
                pod_info["pod_name"],
                pod_info["container_name"],
                command
            )
        
        # Parse output and analyze files
        files = []
        total_size = 0
        old_files_count = 0
        potential_savings = 0
        
        for line in output.split('\n'):
            if line.strip():
                file_info = analyze_file(line, mount_path)
                if file_info:
                    files.append(file_info)
                    total_size += file_info["size_bytes"]
                    
                    if file_info["can_delete"]:
                        old_files_count += 1
                        potential_savings += file_info["size_bytes"]
        
        # Get PVC capacity
        v1 = k8s_client.get_core_api()
        pvc = v1.read_namespaced_persistent_volume_claim(pvc_name, namespace)
        
        capacity = pvc.spec.resources.requests.get("storage", "0Gi")
        
        # Calculate usage percentage
        capacity_bytes = parse_storage_size(capacity)
        usage_percentage = (total_size / capacity_bytes * 100) if capacity_bytes > 0 else 0
        
        # Format sizes
        def format_bytes(bytes_val):
            if bytes_val < 1024 * 1024 * 1024:
                return f"{bytes_val / (1024 * 1024):.1f} MB"
            return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"
        
        return {
            "pvc_name": pvc_name,
            "namespace": namespace,
            "total_capacity": capacity,
            "used_space": format_bytes(total_size),
            "free_space": format_bytes(capacity_bytes - total_size),
            "usage_percentage": round(usage_percentage, 1),
            "file_count": len(files),
            "old_files_count": old_files_count,
            "potential_savings": format_bytes(potential_savings),
            "files": sorted(files, key=lambda x: x["age_days"], reverse=True)[:100],  # Top 100 oldest
            "pod_info": pod_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing PVC files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/storage/pvcs/{namespace}/{pvc_name}/files")
async def delete_file_from_pvc(namespace: str, pvc_name: str, file_path: str):
    """
    Delete a file from a PVC
    
    WARNING: This operation cannot be undone!
    """
    try:
        # Find pod using PVC
        pod_info = find_pod_using_pvc(namespace, pvc_name)
        
        if not pod_info:
            raise HTTPException(status_code=404, detail="No pod found using this PVC")
        
        mount_path = pod_info["mount_path"]
        full_path = f"{mount_path}/{file_path.lstrip('/')}"
        
        # Execute delete command
        command = ["rm", "-rf", full_path]
        
        output = execute_in_pod(
            namespace,
            pod_info["pod_name"],
            pod_info["container_name"],
            command
        )
        
        return {
            "success": True,
            "message": f"File deleted: {file_path}",
            "path": full_path
        }
        
    except Exception as e:
        logger.error(f"Error deleting file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def parse_storage_size(size_str: str) -> int:
    """Convert Kubernetes storage size to bytes"""
    size_str = size_str.strip()
    
    units = {
        'Ki': 1024,
        'Mi': 1024 ** 2,
        'Gi': 1024 ** 3,
        'Ti': 1024 ** 4,
        'K': 1000,
        'M': 1000 ** 2,
        'G': 1000 ** 3,
        'T': 1000 ** 4,
    }
    
    for unit, multiplier in units.items():
        if size_str.endswith(unit):
            return int(float(size_str[:-len(unit)]) * multiplier)
    
    # No unit, assume bytes
    return int(size_str)

# Made with Bob
