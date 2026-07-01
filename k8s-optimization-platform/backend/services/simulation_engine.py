"""
Simulation Engine - Central state management for real-time resource simulation
Tracks all changes and propagates updates across the platform
"""
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
import json
from threading import Lock

logger = logging.getLogger(__name__)


@dataclass
class ResourceState:
    """Represents the current state of a resource"""
    resource_type: str  # pod, node, deployment, etc.
    resource_id: str
    cluster: str
    namespace: str
    name: str
    cpu_request: float
    cpu_limit: float
    cpu_usage: float
    memory_request: float  # GB
    memory_limit: float  # GB
    memory_usage: float  # GB
    status: str
    restarts: int = 0
    cost_per_hour: float = 0.0
    last_updated: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChangeEvent:
    """Represents a change event in the system"""
    event_id: str
    event_type: str  # fix, optimize, rollback, attack, etc.
    resource_type: str
    resource_id: str
    cluster: str
    namespace: str
    changes: Dict[str, Any]
    before_state: Dict[str, Any]
    after_state: Dict[str, Any]
    cost_impact: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    user: str = "system"
    reason: str = ""


class SimulationEngine:
    """
    Central simulation engine that manages resource state and propagates changes
    """
    
    def __init__(self):
        self._lock = Lock()
        self._resources: Dict[str, ResourceState] = {}
        self._change_history: List[ChangeEvent] = []
        self._cluster_metrics: Dict[str, Dict[str, Any]] = {}
        self._cost_baseline = 0.0
        self._current_cost = 0.0
        self._potential_savings = 0.0
        self._savings_realized = 0.0
        
        logger.info("SimulationEngine initialized with empty state — real cluster data only")
    
    def _recalculate_baseline_cost(self):
        """Recalculate baseline and current cost from all resources"""
        total_cost = 0.0
        for resource in self._resources.values():
            if resource.status != "deleted":
                total_cost += resource.cost_per_hour * 730  # Monthly
        
        self._cost_baseline = total_cost
        self._current_cost = total_cost
        logger.info(f"Calculated baseline cost: ${self._cost_baseline:.2f}/month from {len(self._resources)} resources")
    
    def _update_cluster_metrics(self, cluster: str, resource: ResourceState):
        """Update cluster-level metrics"""
        if cluster not in self._cluster_metrics:
            return
        
        metrics = self._cluster_metrics[cluster]
        metrics["total_pods"] += 1
        metrics["total_cpu_request"] += resource.cpu_request
        metrics["total_cpu_usage"] += resource.cpu_usage
        metrics["total_memory_request"] += resource.memory_request
        metrics["total_memory_usage"] += resource.memory_usage
        metrics["total_cost"] += resource.cost_per_hour * 730  # Monthly
    
    def apply_fix(self, resource_id: str, fix_type: str, 
                  new_values: Dict[str, Any], user: str = "system") -> ChangeEvent:
        """
        Apply a fix to a resource and return the change event
        """
        with self._lock:
            if resource_id not in self._resources:
                raise ValueError(f"Resource {resource_id} not found")
            
            resource = self._resources[resource_id]
            
            # Capture before state
            before_state = {
                "cpu_request": resource.cpu_request,
                "cpu_limit": resource.cpu_limit,
                "cpu_usage": resource.cpu_usage,
                "memory_request": resource.memory_request,
                "memory_limit": resource.memory_limit,
                "memory_usage": resource.memory_usage,
                "status": resource.status,
                "restarts": resource.restarts,
                "cost_per_hour": resource.cost_per_hour
            }
            
            # Apply changes
            old_cost = resource.cost_per_hour
            
            if fix_type == "reduce_cpu":
                resource.cpu_request = new_values.get("cpu_request", resource.cpu_request)
                resource.cpu_limit = new_values.get("cpu_limit", resource.cpu_limit)
                # Recalculate cost
                resource.cost_per_hour = self._calculate_cost(
                    resource.cpu_request, resource.memory_request
                )
            
            elif fix_type == "reduce_memory":
                resource.memory_request = new_values.get("memory_request", resource.memory_request)
                resource.memory_limit = new_values.get("memory_limit", resource.memory_limit)
                resource.cost_per_hour = self._calculate_cost(
                    resource.cpu_request, resource.memory_request
                )
            
            elif fix_type == "increase_memory":
                resource.memory_request = new_values.get("memory_request", resource.memory_request)
                resource.memory_limit = new_values.get("memory_limit", resource.memory_limit)
                resource.restarts = 0  # Reset restarts after fix
                resource.cost_per_hour = self._calculate_cost(
                    resource.cpu_request, resource.memory_request
                )
            
            elif fix_type == "delete":
                resource.status = "deleted"
                resource.cost_per_hour = 0.0
            
            elif fix_type == "optimize":
                resource.cpu_request = new_values.get("cpu_request", resource.cpu_request)
                resource.cpu_limit = new_values.get("cpu_limit", resource.cpu_limit)
                resource.memory_request = new_values.get("memory_request", resource.memory_request)
                resource.memory_limit = new_values.get("memory_limit", resource.memory_limit)
                resource.cost_per_hour = self._calculate_cost(
                    resource.cpu_request, resource.memory_request
                )
            
            resource.last_updated = datetime.utcnow()
            
            # Capture after state
            after_state = {
                "cpu_request": resource.cpu_request,
                "cpu_limit": resource.cpu_limit,
                "cpu_usage": resource.cpu_usage,
                "memory_request": resource.memory_request,
                "memory_limit": resource.memory_limit,
                "memory_usage": resource.memory_usage,
                "status": resource.status,
                "restarts": resource.restarts,
                "cost_per_hour": resource.cost_per_hour
            }
            
            # Calculate cost impact
            cost_impact = (old_cost - resource.cost_per_hour) * 730  # Monthly
            
            # Update global metrics
            self._current_cost -= cost_impact
            self._savings_realized += cost_impact
            
            # Update cluster metrics
            self._recalculate_cluster_metrics(resource.cluster)
            
            # Create change event
            event = ChangeEvent(
                event_id=f"event-{len(self._change_history)}",
                event_type=fix_type,
                resource_type=resource.resource_type,
                resource_id=resource_id,
                cluster=resource.cluster,
                namespace=resource.namespace,
                changes=new_values,
                before_state=before_state,
                after_state=after_state,
                cost_impact=cost_impact,
                user=user,
                reason=f"Applied {fix_type} fix"
            )
            
            self._change_history.append(event)
            
            logger.info(f"Applied fix {fix_type} to {resource_id}, cost impact: ${cost_impact:.2f}/month")
            
            return event
    
    def _calculate_cost(self, cpu: float, memory: float) -> float:
        """Calculate hourly cost based on CPU and memory"""
        # AWS pricing approximation
        cpu_cost_per_hour = 0.04  # per vCPU
        memory_cost_per_hour = 0.005  # per GB
        return (cpu * cpu_cost_per_hour) + (memory * memory_cost_per_hour)
    
    def _recalculate_cluster_metrics(self, cluster: str):
        """Recalculate metrics for a cluster"""
        if cluster not in self._cluster_metrics:
            return
        
        # Reset metrics
        metrics = self._cluster_metrics[cluster]
        metrics.update({
            "total_pods": 0,
            "total_cpu_request": 0.0,
            "total_cpu_usage": 0.0,
            "total_memory_request": 0.0,
            "total_memory_usage": 0.0,
            "total_cost": 0.0
        })
        
        # Recalculate from resources
        for resource in self._resources.values():
            if resource.cluster == cluster and resource.status != "deleted":
                metrics["total_pods"] += 1
                metrics["total_cpu_request"] += resource.cpu_request
                metrics["total_cpu_usage"] += resource.cpu_usage
                metrics["total_memory_request"] += resource.memory_request
                metrics["total_memory_usage"] += resource.memory_usage
                metrics["total_cost"] += resource.cost_per_hour * 730
        
        # Update efficiency scores
        if metrics["total_cpu_request"] > 0:
            cpu_efficiency = (metrics["total_cpu_usage"] / metrics["total_cpu_request"]) * 100
            metrics["health_score"] = min(100, 70 + (cpu_efficiency / 3))
            metrics["optimization_score"] = min(100, 60 + (cpu_efficiency / 2))
    
    def get_resource(self, resource_id: str) -> Optional[ResourceState]:
        """Get a resource by ID"""
        return self._resources.get(resource_id)
    
    def get_all_resources(self, cluster: Optional[str] = None,
                         namespace: Optional[str] = None,
                         status: Optional[str] = None) -> List[ResourceState]:
        """Get all resources with optional filters"""
        resources = list(self._resources.values())
        
        if cluster:
            resources = [r for r in resources if r.cluster == cluster]
        if namespace:
            resources = [r for r in resources if r.namespace == namespace]
        if status:
            resources = [r for r in resources if r.status == status]
        
        return resources
    
    def get_resources(self, resource_type: Optional[str] = None,
                     cluster: Optional[str] = None,
                     namespace: Optional[str] = None,
                     status: Optional[str] = None) -> List[ResourceState]:
        """Get resources filtered by type and other criteria"""
        resources = list(self._resources.values())
        
        if resource_type:
            resources = [r for r in resources if r.resource_type == resource_type]
        if cluster:
            resources = [r for r in resources if r.cluster == cluster]
        if namespace:
            resources = [r for r in resources if r.namespace == namespace]
        if status:
            resources = [r for r in resources if r.status == status]
        
        return resources
    
    def get_cluster_metrics(self, cluster: Optional[str] = None) -> Dict[str, Any]:
        """Get cluster metrics"""
        if cluster:
            return self._cluster_metrics.get(cluster, {})
        return self._cluster_metrics
    
    def get_global_metrics(self) -> Dict[str, Any]:
        """Get global platform metrics"""
        total_pods = sum(m["total_pods"] for m in self._cluster_metrics.values())
        
        return {
            "total_clusters": len(self._cluster_metrics),
            "total_pods": total_pods,
            "current_monthly_cost": self._current_cost,
            "baseline_monthly_cost": self._cost_baseline,
            "potential_savings": self._potential_savings,
            "savings_realized": self._savings_realized,
            "optimization_percentage": (self._savings_realized / self._cost_baseline) * 100 if self._cost_baseline > 0 else 0,
            "last_updated": datetime.utcnow().isoformat()
        }
    
    def remove_cluster(self, cluster_id: str) -> int:
        """
        Cascade-remove all resources belonging to a cluster.
        Called when a cluster is deleted from the platform.

        Returns the number of resource records removed.
        """
        with self._lock:
            # Collect IDs of every resource that belongs to this cluster
            to_remove = [
                rid for rid, r in self._resources.items()
                if r.cluster == cluster_id
            ]
            for rid in to_remove:
                del self._resources[rid]

            # Remove cluster-level metrics
            if cluster_id in self._cluster_metrics:
                del self._cluster_metrics[cluster_id]

            # Also remove any change-history entries for this cluster
            self._change_history = [
                e for e in self._change_history if e.cluster != cluster_id
            ]

            # Recalculate global costs so every other view reflects the removal
            self._recalculate_baseline_cost()

            removed = len(to_remove)
            logger.info(
                f"Cascade-removed cluster '{cluster_id}': "
                f"{removed} resources deleted from simulation engine."
            )
            return removed

    def list_cluster_ids(self) -> List[str]:
        """Return the set of cluster IDs currently tracked by the engine."""
        return list(self._cluster_metrics.keys())

    def get_change_history(self, limit: int = 100) -> List[ChangeEvent]:
        """Get recent change history"""
        return self._change_history[-limit:]

    def rollback_change(self, event_id: str, user: str = "system") -> ChangeEvent:
        """Rollback a previous change"""
        with self._lock:
            # Find the event
            event = None
            for e in self._change_history:
                if e.event_id == event_id:
                    event = e
                    break
            
            if not event:
                raise ValueError(f"Event {event_id} not found")
            
            # Apply rollback (restore before state)
            return self.apply_fix(
                event.resource_id,
                "rollback",
                event.before_state,
                user
            )


# Global simulation engine instance
simulation_engine = SimulationEngine()

# Made with Bob
