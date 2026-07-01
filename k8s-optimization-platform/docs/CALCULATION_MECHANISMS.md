# Kubernetes Optimization Platform - Calculation Mechanisms

## Overview
This document explains how we calculate CPU usage, costs, health scores, and generate optimization recommendations.

---

## 1. CPU Usage Calculation

### Current CPU Usage
**Source**: Kubernetes Metrics Server API
```python
# Get actual CPU usage from metrics API
metrics = k8s_client.get_pod_metrics(namespace, pod_name)
cpu_usage_nanocores = metrics['containers'][0]['usage']['cpu']  # e.g., "150m"
cpu_usage_cores = parse_cpu(cpu_usage_nanocores)  # Convert to cores: 0.15
```

### CPU Request vs Usage Analysis
```python
# Compare request vs actual usage
cpu_request = pod.spec.containers[0].resources.requests['cpu']  # e.g., "3000m" = 3 cores
cpu_usage = get_actual_cpu_usage(pod)  # e.g., "1000m" = 1 core

utilization_percentage = (cpu_usage / cpu_request) * 100  # 33.3%

# Recommendation logic
if utilization_percentage < 40:
    recommendation = "REDUCE CPU"
    recommended_cpu = cpu_usage * 1.5  # Add 50% buffer
    # "Currently using 1 core but requesting 3 cores. Reduce to 1.5 cores"
elif utilization_percentage > 80:
    recommendation = "INCREASE CPU"
    recommended_cpu = cpu_usage * 1.3  # Add 30% buffer
else:
    recommendation = "OPTIMAL"
```

### Example Scenario
```
Pod: analytics-worker
- CPU Request: 3000m (3 cores)
- CPU Actual Usage: 1000m (1 core)
- Utilization: 33.3%
- Recommendation: Reduce to 1500m (1.5 cores)
- Savings: 1.5 cores × $0.04/hour × 730 hours = $43.80/month
```

---

## 2. Memory Usage Calculation

### Current Memory Usage
```python
# Get actual memory usage from metrics API
metrics = k8s_client.get_pod_metrics(namespace, pod_name)
memory_usage_bytes = metrics['containers'][0]['usage']['memory']  # e.g., "512Mi"
memory_usage_mb = parse_memory(memory_usage_bytes)  # Convert to MB: 512
```

### Memory Request vs Usage Analysis
```python
memory_request = pod.spec.containers[0].resources.requests['memory']  # e.g., "2Gi" = 2048 MB
memory_usage = get_actual_memory_usage(pod)  # e.g., "512Mi" = 512 MB
peak_memory = get_peak_memory_usage(pod, days=7)  # e.g., "800Mi" = 800 MB

utilization_percentage = (memory_usage / memory_request) * 100  # 25%

# Recommendation logic
if utilization_percentage < 50 and peak_memory < memory_request * 0.7:
    recommendation = "REDUCE MEMORY"
    recommended_memory = peak_memory * 1.3  # Peak + 30% buffer
    # "Peak usage is 800MB but requesting 2048MB. Reduce to 1040MB"
elif peak_memory > memory_request * 0.9:
    recommendation = "INCREASE MEMORY"
    recommended_memory = peak_memory * 1.2  # Peak + 20% buffer
else:
    recommendation = "OPTIMAL"
```

### OOMKill Detection
```python
# Check for Out-Of-Memory kills
oom_kills = count_oom_kills(pod, days=7)
if oom_kills > 0:
    recommendation = "CRITICAL: INCREASE MEMORY"
    reason = f"Pod killed {oom_kills} times due to OOM in last 7 days"
    recommended_memory = memory_request * 1.5  # Increase by 50%
```

---

## 3. Cost Calculation

### Resource Pricing (Configurable)
```python
# Default cloud pricing (AWS/GCP/Azure average)
CPU_COST_PER_CORE_HOUR = 0.04  # $0.04 per core per hour
MEMORY_COST_PER_GB_HOUR = 0.005  # $0.005 per GB per hour
```

### Monthly Cost Calculation
```python
def calculate_monthly_cost(cpu_cores, memory_gb):
    """Calculate monthly infrastructure cost"""
    hours_per_month = 730  # Average hours in a month
    
    cpu_cost = cpu_cores * CPU_COST_PER_CORE_HOUR * hours_per_month
    memory_cost = memory_gb * MEMORY_COST_PER_GB_HOUR * hours_per_month
    
    total_cost = cpu_cost + memory_cost
    return total_cost

# Example
pod_cpu_request = 2.0  # 2 cores
pod_memory_request = 4.0  # 4 GB

monthly_cost = calculate_monthly_cost(2.0, 4.0)
# CPU: 2 × $0.04 × 730 = $58.40
# Memory: 4 × $0.005 × 730 = $14.60
# Total: $73.00/month
```

### Savings Calculation
```python
def calculate_savings(current_cpu, recommended_cpu, current_memory, recommended_memory):
    """Calculate potential monthly savings"""
    current_cost = calculate_monthly_cost(current_cpu, current_memory)
    optimized_cost = calculate_monthly_cost(recommended_cpu, recommended_memory)
    
    savings = current_cost - optimized_cost
    savings_percentage = (savings / current_cost) * 100
    
    return {
        "current_cost": current_cost,
        "optimized_cost": optimized_cost,
        "monthly_savings": savings,
        "annual_savings": savings * 12,
        "savings_percentage": savings_percentage
    }

# Example
current = calculate_monthly_cost(3.0, 8.0)  # $102.20
optimized = calculate_monthly_cost(1.5, 4.0)  # $58.40
savings = $43.80/month = $525.60/year (42.8% reduction)
```

---

## 4. Health Score Calculation

### Cluster Health Score (0-100)
```python
def calculate_cluster_health_score(cluster_data):
    """Calculate overall cluster health score"""
    
    # Component scores (each 0-100)
    cpu_efficiency = calculate_cpu_efficiency(cluster_data)
    memory_efficiency = calculate_memory_efficiency(cluster_data)
    node_utilization = calculate_node_utilization(cluster_data)
    pod_health = calculate_pod_health(cluster_data)
    resource_balance = calculate_resource_balance(cluster_data)
    
    # Weighted average
    health_score = (
        cpu_efficiency * 0.25 +
        memory_efficiency * 0.25 +
        node_utilization * 0.20 +
        pod_health * 0.20 +
        resource_balance * 0.10
    )
    
    return round(health_score, 1)
```

### CPU Efficiency Score
```python
def calculate_cpu_efficiency(cluster_data):
    """Score based on CPU utilization vs requests"""
    total_cpu_requested = sum(pod.cpu_request for pod in cluster_data.pods)
    total_cpu_used = sum(pod.cpu_usage for pod in cluster_data.pods)
    
    utilization = (total_cpu_used / total_cpu_requested) * 100
    
    # Optimal range: 60-80%
    if 60 <= utilization <= 80:
        score = 100
    elif 50 <= utilization < 60 or 80 < utilization <= 90:
        score = 85
    elif 40 <= utilization < 50 or 90 < utilization <= 95:
        score = 70
    else:
        score = 50  # Too low (<40%) or too high (>95%)
    
    return score
```

### Memory Efficiency Score
```python
def calculate_memory_efficiency(cluster_data):
    """Score based on memory utilization vs requests"""
    total_memory_requested = sum(pod.memory_request for pod in cluster_data.pods)
    total_memory_used = sum(pod.memory_usage for pod in cluster_data.pods)
    
    utilization = (total_memory_used / total_memory_requested) * 100
    
    # Optimal range: 65-85%
    if 65 <= utilization <= 85:
        score = 100
    elif 55 <= utilization < 65 or 85 < utilization <= 90:
        score = 85
    elif 45 <= utilization < 55 or 90 < utilization <= 95:
        score = 70
    else:
        score = 50
    
    return score
```

### Node Utilization Score
```python
def calculate_node_utilization(cluster_data):
    """Score based on node resource utilization"""
    node_scores = []
    
    for node in cluster_data.nodes:
        cpu_util = (node.cpu_used / node.cpu_capacity) * 100
        memory_util = (node.memory_used / node.memory_capacity) * 100
        
        # Optimal: 60-80% utilization
        avg_util = (cpu_util + memory_util) / 2
        
        if 60 <= avg_util <= 80:
            node_score = 100
        elif 50 <= avg_util < 60 or 80 < avg_util <= 85:
            node_score = 85
        else:
            node_score = max(50, 100 - abs(avg_util - 70))
        
        node_scores.append(node_score)
    
    return sum(node_scores) / len(node_scores)
```

### Pod Health Score
```python
def calculate_pod_health(cluster_data):
    """Score based on pod status and restarts"""
    total_pods = len(cluster_data.pods)
    healthy_pods = sum(1 for pod in cluster_data.pods if pod.status == "Running")
    pods_with_restarts = sum(1 for pod in cluster_data.pods if pod.restarts > 5)
    oom_killed_pods = sum(1 for pod in cluster_data.pods if pod.oom_kills > 0)
    
    health_ratio = healthy_pods / total_pods
    restart_penalty = (pods_with_restarts / total_pods) * 20
    oom_penalty = (oom_killed_pods / total_pods) * 30
    
    score = (health_ratio * 100) - restart_penalty - oom_penalty
    return max(0, min(100, score))
```

---

## 5. Recommendation Confidence Levels

### Risk Assessment
```python
def assess_recommendation_risk(pod_data, recommendation):
    """Determine risk level of applying recommendation"""
    
    # Low Risk Criteria
    if (
        recommendation.type == "REDUCE" and
        pod_data.utilization < 30% and
        pod_data.restarts == 0 and
        pod_data.oom_kills == 0 and
        pod_data.uptime_days > 7
    ):
        return "LOW_RISK"
    
    # High Risk Criteria
    if (
        recommendation.type == "REDUCE" and
        (pod_data.restarts > 3 or
         pod_data.oom_kills > 0 or
         pod_data.peak_utilization > 85%)
    ):
        return "HIGH_RISK"
    
    # Medium Risk (default)
    return "MEDIUM_RISK"
```

### Confidence Score
```python
def calculate_confidence_score(pod_data):
    """Calculate confidence in recommendation (0-100)"""
    confidence = 100
    
    # Reduce confidence if insufficient data
    if pod_data.uptime_days < 7:
        confidence -= 20
    
    # Reduce confidence if high variability
    if pod_data.usage_std_dev > pod_data.usage_mean * 0.5:
        confidence -= 15
    
    # Reduce confidence if recent restarts
    if pod_data.restarts_last_7_days > 0:
        confidence -= 10
    
    # Reduce confidence if OOM kills
    if pod_data.oom_kills > 0:
        confidence -= 25
    
    return max(0, confidence)
```

---

## 6. Real-Time Metrics Collection

### Metrics Server Integration
```python
def collect_pod_metrics(namespace, pod_name):
    """Collect real-time metrics from Kubernetes Metrics Server"""
    try:
        metrics_api = client.CustomObjectsApi()
        
        # Get pod metrics
        metrics = metrics_api.get_namespaced_custom_object(
            group="metrics.k8s.io",
            version="v1beta1",
            namespace=namespace,
            plural="pods",
            name=pod_name
        )
        
        # Parse metrics
        for container in metrics['containers']:
            cpu_usage = parse_cpu(container['usage']['cpu'])
            memory_usage = parse_memory(container['usage']['memory'])
            
        return {
            "cpu_usage_cores": cpu_usage,
            "memory_usage_mb": memory_usage,
            "timestamp": metrics['timestamp']
        }
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        return None
```

### Historical Data Storage
```python
# Store metrics in TimescaleDB for trend analysis
def store_metrics(pod_id, metrics):
    """Store metrics in time-series database"""
    query = """
        INSERT INTO pod_metrics (
            pod_id, timestamp, cpu_usage, memory_usage
        ) VALUES ($1, $2, $3, $4)
    """
    db.execute(query, pod_id, metrics['timestamp'], 
               metrics['cpu_usage_cores'], metrics['memory_usage_mb'])

# Query historical data for recommendations
def get_usage_statistics(pod_id, days=7):
    """Get usage statistics over time period"""
    query = """
        SELECT 
            AVG(cpu_usage) as avg_cpu,
            MAX(cpu_usage) as peak_cpu,
            STDDEV(cpu_usage) as cpu_stddev,
            AVG(memory_usage) as avg_memory,
            MAX(memory_usage) as peak_memory,
            STDDEV(memory_usage) as memory_stddev
        FROM pod_metrics
        WHERE pod_id = $1 
        AND timestamp > NOW() - INTERVAL '$2 days'
    """
    return db.query(query, pod_id, days)
```

---

## 7. Implementation Priority

### Phase 1: Basic Metrics (Current)
- ✅ Cluster capacity (CPU/Memory)
- ✅ Pod resource requests
- ✅ Basic cost calculation
- ⏳ Real-time usage from Metrics Server

### Phase 2: Advanced Analysis
- Historical trend analysis
- Peak usage detection
- OOMKill correlation
- Restart pattern analysis

### Phase 3: ML-Based Predictions
- Usage forecasting
- Anomaly detection
- Auto-scaling recommendations
- Cost optimization AI

---

## Testing the Calculations

```bash
# Test API endpoint
curl http://localhost:8000/api/clusters | jq '.[] | {
  name, 
  cpu_capacity, 
  memory_capacity,
  health_score
}'

# Expected output
{
  "name": "xforce-devops",
  "cpu_capacity": "16.0 cores",
  "memory_capacity": "64.0 GB",
  "health_score": 85.0
}
```

---

**Next Steps**: Integrate Kubernetes Metrics Server API to get real-time CPU/memory usage data.