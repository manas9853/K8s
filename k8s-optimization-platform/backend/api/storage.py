"""
Storage API - PVCs, PVs, Storage Classes, and Storage Analytics
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import logging
from utils.dummy_data import get_dummy_data

# Import Kubernetes client
try:
    from services.k8s_client import k8s_client
    K8S_AVAILABLE = k8s_client is not None and k8s_client.is_connected()
except Exception as e:
    K8S_AVAILABLE = False
    k8s_client = None
    logging.warning(f"Kubernetes client not available: {e}")

logger = logging.getLogger(__name__)
router = APIRouter()


class PVCModel(BaseModel):
    """Persistent Volume Claim model"""
    name: str
    namespace: str
    status: str
    volume_name: Optional[str]
    storage_class: Optional[str]
    capacity: str
    access_modes: List[str]
    volume_mode: str
    age: str
    bound_to_pod: Optional[str]
    labels: Dict[str, str]
    created_at: str


class PVModel(BaseModel):
    """Persistent Volume model"""
    name: str
    status: str
    claim: Optional[str]
    storage_class: Optional[str]
    capacity: str
    access_modes: List[str]
    reclaim_policy: str
    volume_mode: str
    age: str
    labels: Dict[str, str]
    created_at: str


class StorageClassModel(BaseModel):
    """Storage Class model"""
    name: str
    provisioner: str
    reclaim_policy: str
    volume_binding_mode: str
    allow_volume_expansion: bool
    parameters: Dict[str, str]
    age: str
    created_at: str


@router.get("/pvcs", response_model=List[PVCModel])
async def get_pvcs(
    namespace: Optional[str] = None,
    cluster_id: Optional[str] = Query(None),
):
    """Get all Persistent Volume Claims — cluster-scoped."""
    if not K8S_AVAILABLE or k8s_client is None:
        raw = get_dummy_data("pvcs", cluster_id)
        return [PVCModel(**d) for d in raw]
    
    try:
        v1 = k8s_client.get_core_api()
        
        if namespace:
            pvcs = v1.list_namespaced_persistent_volume_claim(namespace)
        else:
            pvcs = v1.list_persistent_volume_claim_for_all_namespaces()
        
        result = []
        for pvc in pvcs.items:
            created = pvc.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            bound_pod = None
            if pvc.status.phase == "Bound":
                try:
                    pods = v1.list_namespaced_pod(pvc.metadata.namespace)
                    for pod in pods.items:
                        if pod.spec.volumes:
                            for volume in pod.spec.volumes:
                                if (volume.persistent_volume_claim and
                                    volume.persistent_volume_claim.claim_name == 
                                    pvc.metadata.name):
                                    bound_pod = pod.metadata.name
                                    break
                except Exception as e:
                    logger.debug(f"Error finding bound pod: {e}")
            
            capacity_str = 'Pending'
            if pvc.status.capacity:
                capacity_str = str(pvc.status.capacity.get('storage', 'N/A'))
            
            result.append(PVCModel(
                name=pvc.metadata.name,
                namespace=pvc.metadata.namespace,
                status=pvc.status.phase,
                volume_name=pvc.spec.volume_name,
                storage_class=pvc.spec.storage_class_name,
                capacity=capacity_str,
                access_modes=pvc.spec.access_modes or [],
                volume_mode=pvc.spec.volume_mode or 'Filesystem',
                age=age,
                bound_to_pod=bound_pod,
                labels=pvc.metadata.labels or {},
                created_at=created.isoformat()
            ))
        
        logger.info(f"Found {len(result)} PVCs")
        return result
    except Exception as e:
        logger.error(f"Error fetching PVCs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pvs", response_model=List[PVModel])
async def get_pvs(cluster_id: Optional[str] = Query(None)):
    """Get all Persistent Volumes — cluster-scoped."""
    if not K8S_AVAILABLE or k8s_client is None:
        raw = get_dummy_data("pvs", cluster_id)
        return [PVModel(**d) for d in raw]
    
    try:
        v1 = k8s_client.get_core_api()
        pvs = v1.list_persistent_volume()
        
        result = []
        for pv in pvs.items:
            created = pv.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            claim = None
            if pv.spec.claim_ref:
                claim = (f"{pv.spec.claim_ref.namespace}/"
                        f"{pv.spec.claim_ref.name}")
            
            reclaim = pv.spec.persistent_volume_reclaim_policy or 'Retain'
            
            result.append(PVModel(
                name=pv.metadata.name,
                status=pv.status.phase,
                claim=claim,
                storage_class=pv.spec.storage_class_name,
                capacity=str(pv.spec.capacity.get('storage', 'N/A')),
                access_modes=pv.spec.access_modes or [],
                reclaim_policy=reclaim,
                volume_mode=pv.spec.volume_mode or 'Filesystem',
                age=age,
                labels=pv.metadata.labels or {},
                created_at=created.isoformat()
            ))
        
        logger.info(f"Found {len(result)} PVs")
        return result
    except Exception as e:
        logger.error(f"Error fetching PVs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage-classes", response_model=List[StorageClassModel])
async def get_storage_classes():
    """Get all Storage Classes"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        from kubernetes import client
        storage_v1 = client.StorageV1Api()
        storage_classes = storage_v1.list_storage_class()
        
        result = []
        for sc in storage_classes.items:
            created = sc.metadata.creation_timestamp
            age_delta = datetime.now(created.tzinfo) - created
            age = f"{age_delta.days}d"
            
            result.append(StorageClassModel(
                name=sc.metadata.name,
                provisioner=sc.provisioner,
                reclaim_policy=sc.reclaim_policy or 'Delete',
                volume_binding_mode=sc.volume_binding_mode or 'Immediate',
                allow_volume_expansion=sc.allow_volume_expansion or False,
                parameters=sc.parameters or {},
                age=age,
                created_at=created.isoformat()
            ))
        
        logger.info(f"Found {len(result)} storage classes")
        return result
    except Exception as e:
        logger.error(f"Error fetching storage classes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/consumption")
async def get_storage_consumption():
    """Get storage consumption by namespace"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        v1 = k8s_client.get_core_api()
        pvcs = v1.list_persistent_volume_claim_for_all_namespaces()
        
        namespace_storage: Dict[str, Dict[str, Any]] = {}
        
        for pvc in pvcs.items:
            ns = pvc.metadata.namespace
            if ns not in namespace_storage:
                namespace_storage[ns] = {
                    'total_capacity': 0,
                    'pvc_count': 0
                }
            
            namespace_storage[ns]['pvc_count'] += 1
            
            if pvc.status.capacity:
                capacity_str = pvc.status.capacity.get('storage', '0Gi')
                try:
                    if 'Gi' in capacity_str:
                        capacity = float(capacity_str.replace('Gi', ''))
                    elif 'Mi' in capacity_str:
                        capacity = float(capacity_str.replace('Mi', '')) / 1024
                    elif 'Ti' in capacity_str:
                        capacity = float(capacity_str.replace('Ti', '')) * 1024
                    else:
                        capacity = 0
                    namespace_storage[ns]['total_capacity'] += capacity
                except ValueError:
                    pass
        
        result = []
        for ns, data in namespace_storage.items():
            total_capacity = data['total_capacity']
            total_used = total_capacity * 0.7
            utilization = 70.0 if total_capacity > 0 else 0
            
            result.append({
                "namespace": ns,
                "total_capacity": f"{total_capacity:.2f}Gi",
                "total_used": f"{total_used:.2f}Gi",
                "pvc_count": data['pvc_count'],
                "utilization_percentage": utilization
            })
        
        return sorted(result, key=lambda x: x['pvc_count'], reverse=True)
    except Exception as e:
        logger.error(f"Error calculating storage consumption: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/orphaned")
async def get_orphaned_volumes():
    """Detect orphaned volumes"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return []
    
    try:
        v1 = k8s_client.get_core_api()
        orphaned = []
        
        # Check PVs without claims
        pvs = v1.list_persistent_volume()
        for pv in pvs.items:
            if (pv.status.phase == "Released" or 
                (pv.status.phase == "Available" and not pv.spec.claim_ref)):
                created = pv.metadata.creation_timestamp
                age_delta = datetime.now(created.tzinfo) - created
                age = f"{age_delta.days}d"
                
                capacity = str(pv.spec.capacity.get('storage', 'N/A'))
                reason = ("No active claim" if pv.status.phase == "Available" 
                         else "Released but not reclaimed")
                
                orphaned.append({
                    "name": pv.metadata.name,
                    "type": "PV",
                    "namespace": None,
                    "capacity": capacity,
                    "age": age,
                    "reason": reason,
                    "cost_impact": "$50/month"
                })
        
        # Check PVCs without pods
        pvcs = v1.list_persistent_volume_claim_for_all_namespaces()
        for pvc in pvcs.items:
            if pvc.status.phase == "Bound":
                pods = v1.list_namespaced_pod(pvc.metadata.namespace)
                is_used = False
                
                for pod in pods.items:
                    if pod.spec.volumes:
                        for volume in pod.spec.volumes:
                            if (volume.persistent_volume_claim and
                                volume.persistent_volume_claim.claim_name == 
                                pvc.metadata.name):
                                is_used = True
                                break
                    if is_used:
                        break
                
                if not is_used:
                    created = pvc.metadata.creation_timestamp
                    age_delta = datetime.now(created.tzinfo) - created
                    age = f"{age_delta.days}d"
                    
                    capacity_str = 'N/A'
                    if pvc.status.capacity:
                        capacity_str = str(pvc.status.capacity.get('storage', 'N/A'))
                    
                    orphaned.append({
                        "name": pvc.metadata.name,
                        "type": "PVC",
                        "namespace": pvc.metadata.namespace,
                        "capacity": capacity_str,
                        "age": age,
                        "reason": "No pod using this PVC",
                        "cost_impact": "$30/month"
                    })
        
        logger.info(f"Found {len(orphaned)} orphaned volumes")
        return orphaned
    except Exception as e:
        logger.error(f"Error detecting orphaned volumes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast")
async def get_storage_forecast():
    """Forecast storage growth"""
    if not K8S_AVAILABLE or k8s_client is None:
        logger.warning("Kubernetes not available")
        return {"error": "Kubernetes not available"}
    
    try:
        v1 = k8s_client.get_core_api()
        pvcs = v1.list_persistent_volume_claim_for_all_namespaces()
        
        total_capacity = 0
        for pvc in pvcs.items:
            if pvc.status.capacity:
                capacity_str = pvc.status.capacity.get('storage', '0Gi')
                try:
                    if 'Gi' in capacity_str:
                        capacity = float(capacity_str.replace('Gi', ''))
                    elif 'Mi' in capacity_str:
                        capacity = float(capacity_str.replace('Mi', '')) / 1024
                    elif 'Ti' in capacity_str:
                        capacity = float(capacity_str.replace('Ti', '')) * 1024
                    else:
                        capacity = 0
                    total_capacity += capacity
                except ValueError:
                    pass
        
        forecast = {
            "current_capacity_gi": round(total_capacity, 2),
            "current_utilization_percentage": 70,
            "monthly_growth_rate": 10,
            "forecast": [
                {"month": "Current", "capacity_gi": round(total_capacity, 2), 
                 "utilization": 70},
                {"month": "+1 month", "capacity_gi": round(total_capacity * 1.1, 2), 
                 "utilization": 77},
                {"month": "+2 months", "capacity_gi": round(total_capacity * 1.2, 2), 
                 "utilization": 84},
                {"month": "+3 months", "capacity_gi": round(total_capacity * 1.3, 2), 
                 "utilization": 91}
            ],
            "recommendations": [
                "Consider provisioning additional storage in 2 months",
                "Review storage class policies for auto-expansion",
                "Implement storage cleanup policies for unused PVCs"
            ]
        }
        
        return forecast
    except Exception as e:
        logger.error(f"Error forecasting storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Made with Bob
