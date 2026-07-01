-- Kubernetes Optimization Platform Database Schema
-- PostgreSQL + TimescaleDB

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- CLUSTERS
-- ============================================================================

CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    environment VARCHAR(50) NOT NULL, -- production, staging, qa, development
    region VARCHAR(100),
    provider VARCHAR(50), -- aws, gcp, azure, on-prem
    version VARCHAR(50),
    kubeconfig_path TEXT,
    context_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_scanned_at TIMESTAMP
);

CREATE INDEX idx_clusters_environment ON clusters(environment);
CREATE INDEX idx_clusters_provider ON clusters(provider);
CREATE INDEX idx_clusters_is_active ON clusters(is_active);

-- ============================================================================
-- NAMESPACES
-- ============================================================================

CREATE TABLE namespaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    team VARCHAR(255),
    labels JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, name)
);

CREATE INDEX idx_namespaces_cluster ON namespaces(cluster_id);
CREATE INDEX idx_namespaces_team ON namespaces(team);

-- ============================================================================
-- WORKLOADS
-- ============================================================================

CREATE TABLE workloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id UUID REFERENCES namespaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    workload_type VARCHAR(50), -- deployment, statefulset, daemonset, job
    replicas INTEGER,
    labels JSONB,
    annotations JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, namespace_id, name, workload_type)
);

CREATE INDEX idx_workloads_cluster ON workloads(cluster_id);
CREATE INDEX idx_workloads_namespace ON workloads(namespace_id);
CREATE INDEX idx_workloads_type ON workloads(workload_type);

-- ============================================================================
-- PODS
-- ============================================================================

CREATE TABLE pods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id UUID REFERENCES namespaces(id) ON DELETE CASCADE,
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    node_name VARCHAR(255),
    status VARCHAR(50),
    cpu_request DECIMAL(10, 3),
    cpu_limit DECIMAL(10, 3),
    memory_request BIGINT, -- in bytes
    memory_limit BIGINT, -- in bytes
    labels JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, namespace_id, name)
);

CREATE INDEX idx_pods_cluster ON pods(cluster_id);
CREATE INDEX idx_pods_namespace ON pods(namespace_id);
CREATE INDEX idx_pods_workload ON pods(workload_id);
CREATE INDEX idx_pods_node ON pods(node_name);

-- ============================================================================
-- METRICS (TimescaleDB Hypertable)
-- ============================================================================

CREATE TABLE metrics (
    time TIMESTAMPTZ NOT NULL,
    pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
    cpu_usage DECIMAL(10, 3),
    memory_usage BIGINT,
    network_rx_bytes BIGINT,
    network_tx_bytes BIGINT,
    restarts INTEGER DEFAULT 0,
    oom_kills INTEGER DEFAULT 0
);

SELECT create_hypertable('metrics', 'time');

CREATE INDEX idx_metrics_pod ON metrics(pod_id, time DESC);

-- ============================================================================
-- RECOMMENDATIONS
-- ============================================================================

CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50), -- cpu, memory, replicas
    current_value DECIMAL(10, 3),
    recommended_value DECIMAL(10, 3),
    confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
    risk_level VARCHAR(20), -- low, medium, high
    estimated_savings DECIMAL(10, 2),
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- pending, applied, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMP,
    applied_by VARCHAR(255)
);

CREATE INDEX idx_recommendations_workload ON recommendations(workload_id);
CREATE INDEX idx_recommendations_status ON recommendations(status);
CREATE INDEX idx_recommendations_created ON recommendations(created_at DESC);

-- ============================================================================
-- COST TRACKING
-- ============================================================================

CREATE TABLE cost_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id UUID REFERENCES namespaces(id) ON DELETE CASCADE,
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    cpu_cost DECIMAL(10, 2),
    memory_cost DECIMAL(10, 2),
    storage_cost DECIMAL(10, 2),
    total_cost DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, namespace_id, workload_id, date)
);

CREATE INDEX idx_cost_cluster ON cost_records(cluster_id, date DESC);
CREATE INDEX idx_cost_namespace ON cost_records(namespace_id, date DESC);
CREATE INDEX idx_cost_date ON cost_records(date DESC);

-- ============================================================================
-- CLEANUP CANDIDATES
-- ============================================================================

CREATE TABLE cleanup_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id UUID REFERENCES namespaces(id) ON DELETE CASCADE,
    resource_type VARCHAR(50), -- deployment, service, pvc, configmap, secret
    resource_name VARCHAR(255),
    reason TEXT,
    last_used_at TIMESTAMP,
    estimated_savings DECIMAL(10, 2),
    risk_level VARCHAR(20), -- safe, low, medium, high
    status VARCHAR(50) DEFAULT 'pending', -- pending, deleted, kept
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255)
);

CREATE INDEX idx_cleanup_cluster ON cleanup_candidates(cluster_id);
CREATE INDEX idx_cleanup_status ON cleanup_candidates(status);
CREATE INDEX idx_cleanup_risk ON cleanup_candidates(risk_level);

-- ============================================================================
-- ROLLBACK HISTORY
-- ============================================================================

CREATE TABLE rollback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    change_type VARCHAR(50), -- resource_update, resource_delete
    previous_config JSONB,
    new_config JSONB,
    applied_by VARCHAR(255),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP,
    rolled_back_by VARCHAR(255)
);

CREATE INDEX idx_rollback_workload ON rollback_history(workload_id);
CREATE INDEX idx_rollback_applied ON rollback_history(applied_at DESC);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    action VARCHAR(100),
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================================================
-- OPTIMIZATION MODES
-- ============================================================================

CREATE TABLE optimization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    mode VARCHAR(50) DEFAULT 'manual', -- manual, assisted, autonomous
    auto_apply_threshold DECIMAL(3, 2) DEFAULT 0.90,
    max_changes_per_day INTEGER DEFAULT 10,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id)
);

-- ============================================================================
-- CLUSTER HEALTH SCORES
-- ============================================================================

CREATE TABLE cluster_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    overall_score DECIMAL(5, 2),
    cpu_efficiency DECIMAL(5, 2),
    memory_efficiency DECIMAL(5, 2),
    node_utilization DECIMAL(5, 2),
    storage_utilization DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, date)
);

CREATE INDEX idx_health_cluster ON cluster_health_scores(cluster_id, date DESC);

-- ============================================================================
-- INCIDENTS
-- ============================================================================

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
    incident_type VARCHAR(50), -- oom_kill, cpu_throttle, restart, crash
    severity VARCHAR(20), -- low, medium, high, critical
    description TEXT,
    occurred_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    root_cause TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_incidents_pod ON incidents(pod_id);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
CREATE INDEX idx_incidents_occurred ON incidents(occurred_at DESC);

-- ============================================================================
-- AI INSIGHTS
-- ============================================================================

CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    insight_type VARCHAR(50), -- waste, savings, risk, opportunity
    title VARCHAR(255),
    description TEXT,
    impact VARCHAR(20), -- low, medium, high
    estimated_savings DECIMAL(10, 2),
    action_required BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'active', -- active, resolved, dismissed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX idx_insights_cluster ON ai_insights(cluster_id);
CREATE INDEX idx_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_insights_status ON ai_insights(status);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Cluster summary view
CREATE VIEW v_cluster_summary AS
SELECT 
    c.id,
    c.name,
    c.environment,
    COUNT(DISTINCT n.id) as namespace_count,
    COUNT(DISTINCT w.id) as workload_count,
    COUNT(DISTINCT p.id) as pod_count,
    COALESCE(SUM(cr.total_cost), 0) as monthly_cost,
    COALESCE(SUM(r.estimated_savings), 0) as potential_savings
FROM clusters c
LEFT JOIN namespaces n ON c.id = n.cluster_id
LEFT JOIN workloads w ON c.id = w.cluster_id
LEFT JOIN pods p ON c.id = p.cluster_id
LEFT JOIN cost_records cr ON c.id = cr.cluster_id 
    AND cr.date >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN recommendations r ON w.id = r.workload_id 
    AND r.status = 'pending'
WHERE c.is_active = true
GROUP BY c.id, c.name, c.environment;

-- Team cost accountability view
CREATE VIEW v_team_costs AS
SELECT 
    n.team,
    c.environment,
    SUM(cr.total_cost) as total_cost,
    SUM(r.estimated_savings) as potential_savings
FROM namespaces n
JOIN clusters c ON n.cluster_id = c.id
LEFT JOIN cost_records cr ON n.id = cr.namespace_id 
    AND cr.date >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN workloads w ON n.id = w.namespace_id
LEFT JOIN recommendations r ON w.id = r.workload_id 
    AND r.status = 'pending'
WHERE n.team IS NOT NULL
GROUP BY n.team, c.environment;

-- Made with Bob
