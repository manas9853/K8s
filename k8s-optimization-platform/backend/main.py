"""
Kubernetes Optimization Platform - Main Application Entry Point
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from contextlib import asynccontextmanager
import logging
from datetime import datetime

from api import (
    auth,
    user_management,
    clusters,
    workloads,
    dashboard,
    executive,
    recommendations,
    pods,
    cost_savings,
    cleanup,
    autofix,
    rollback,
    ai_copilot,
    autonomous,
    autonomous_ai,
    scoring,
    team_accountability,
    heatmap,
    root_cause,
    simulation,
    guardrails,
    incidents,
    predictive,
    carbon,
    benchmarking,
    reports,
    audit,
    command_center,
    agent_receiver,
    tokens,
    storage,
    network,
    observability,
    pvc_file_analysis,
    security,
    compliance,
    intelligence,
    finops,
    attack_investigation,
    discovery,
    platform_engineering,
)
from config.settings import settings
from utils.logger import setup_logging

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Kubernetes Optimization Platform...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"API Version: {settings.API_VERSION}")
    
    # Initialize services
    # TODO: Initialize database connections
    # TODO: Initialize Redis cache
    # TODO: Initialize Kubernetes clients
    # TODO: Start background tasks
    
    yield
    
    # Cleanup
    logger.info("Shutting down Kubernetes Optimization Platform...")
    # TODO: Close database connections
    # TODO: Close Redis connections
    # TODO: Stop background tasks


# Create FastAPI application
app = FastAPI(
    title="Kubernetes Optimization Platform",
    description="AI-powered Kubernetes cluster optimization and cost management",
    version=settings.API_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware to handle trailing slashes - DISABLED to prevent redirects
# FastAPI will handle both /api/clusters and /api/clusters/ automatically
@app.middleware("http")
async def no_redirect_middleware(request: Request, call_next):
    """Pass through without redirects"""
    response = await call_next(request)
    return response


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred",
            "timestamp": datetime.utcnow().isoformat()
        }
    )


# Health check endpoints
@app.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.API_VERSION
    }


@app.get("/health/db")
async def health_db():
    """Database health check"""
    try:
        from database.db import db_manager
        count = db_manager.get_cluster_count()
        return {"status": "healthy", "clusters": count, "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(e)})


@app.get("/health/k8s")
async def health_k8s():
    """K8s agent connectivity health check"""
    try:
        from database.db import db_manager
        clusters = db_manager.get_all_clusters()
        active = [c for c in clusters if c.get("status") == "active"]
        return {
            "status": "healthy" if active else "no_agents",
            "registered_clusters": len(clusters),
            "active_clusters": len(active),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(e)})


@app.get("/health/ai")
async def health_ai():
    """AI (OpenAI) health check"""
    if not settings.OPENAI_API_KEY:
        return JSONResponse(status_code=503, content={"status": "not_configured", "message": "OPENAI_API_KEY not set"})
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as http:
            r = await http.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
            )
        if r.status_code == 200:
            return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}
        return JSONResponse(status_code=503, content={"status": "unhealthy", "http_status": r.status_code})
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(e)})


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Kubernetes Optimization Platform",
        "version": settings.API_VERSION,
        "docs": "/api/docs",
        "health": "/health"
    }


# Include API routers with /api/v1 prefix
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(user_management.router, prefix="/api/v1/users", tags=["User Management"])
app.include_router(clusters.router, prefix="/api/v1/clusters", tags=["Clusters"])
app.include_router(executive.router, prefix="/api/v1/executive", tags=["Executive"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(recommendations.router, prefix="/api/v1/recommendations", tags=["Recommendations"])
app.include_router(workloads.router, prefix="/api/v1/workloads", tags=["Workloads"])
app.include_router(pods.router, prefix="/api/v1/pods", tags=["Pods"])
app.include_router(cost_savings.router, prefix="/api/v1/cost-savings", tags=["Cost Savings"])
app.include_router(cleanup.router, prefix="/api/v1/cleanup", tags=["Cleanup"])
app.include_router(autofix.router, prefix="/api/v1/autofix", tags=["Auto Fix"])
app.include_router(rollback.router, prefix="/api/v1/rollback", tags=["Rollback"])
app.include_router(ai_copilot.router, prefix="/api/v1/ai-copilot", tags=["AI Copilot"])
app.include_router(autonomous.router, prefix="/api/v1/autonomous", tags=["Autonomous"])
app.include_router(autonomous_ai.router, prefix="/api/v1/autonomous-ai", tags=["Autonomous AI"])
app.include_router(scoring.router, prefix="/api/v1/scoring", tags=["Scoring"])
app.include_router(team_accountability.router, prefix="/api/v1/team-accountability", tags=["Team Accountability"])
app.include_router(heatmap.router, prefix="/api/v1/heatmap", tags=["Heatmap"])
app.include_router(security.router, tags=["Security"])
app.include_router(compliance.router, tags=["Compliance"])
app.include_router(intelligence.router, tags=["Intelligence"])
app.include_router(finops.router, prefix="/api/v1/finops", tags=["FinOps"])
app.include_router(discovery.router, prefix="/api/v1/discovery", tags=["Cloud Discovery"])
app.include_router(attack_investigation.router, prefix="/api/v1/attack-investigation", tags=["Attack Investigation"])
app.include_router(root_cause.router, prefix="/api/v1/root-cause", tags=["Root Cause Analysis"])
app.include_router(simulation.router, prefix="/api/v1/simulation", tags=["Simulation"])
app.include_router(guardrails.router, prefix="/api/v1/guardrails", tags=["CI/CD Guardrails"])
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["Incident Correlation"])
app.include_router(predictive.router, prefix="/api/v1/predictive", tags=["Predictive Scaling"])
app.include_router(carbon.router, prefix="/api/v1/carbon", tags=["Carbon Footprint"])
app.include_router(benchmarking.router, prefix="/api/v1/benchmarking", tags=["Benchmarking"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(command_center.router, prefix="/api/v1/command-center", tags=["Command Center"])
app.include_router(agent_receiver.router, tags=["Agent Receiver"])
app.include_router(tokens.router, tags=["Token Management"])
app.include_router(storage.router, prefix="/api/v1/storage", tags=["Storage"])
app.include_router(pvc_file_analysis.router, prefix="/api/v1", tags=["PVC File Analysis"])
app.include_router(network.router, prefix="/api/v1/network", tags=["Network"])
app.include_router(observability.router, prefix="/api/v1/observability", tags=["Observability"])
app.include_router(platform_engineering.router, prefix="/api/v1/platform", tags=["Platform Engineering"])

# Also include routers without /v1 for backward compatibility
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication (Legacy)"])
app.include_router(user_management.router, prefix="/api/users", tags=["User Management (Legacy)"])
app.include_router(clusters.router, prefix="/api/clusters", tags=["Clusters (Legacy)"])
app.include_router(workloads.router, prefix="/api/workloads", tags=["Workloads"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard (Legacy)"])
app.include_router(executive.router, prefix="/api/executive", tags=["Executive (Legacy)"])
app.include_router(recommendations.router, prefix="/api/recommendations", tags=["Recommendations (Legacy)"])
app.include_router(pods.router, prefix="/api/pods", tags=["Pods (Legacy)"])
app.include_router(cost_savings.router, prefix="/api/cost-savings", tags=["Cost Savings (Legacy)"])
app.include_router(cleanup.router, prefix="/api/cleanup", tags=["Cleanup (Legacy)"])
app.include_router(autofix.router, prefix="/api/autofix", tags=["Auto Fix (Legacy)"])
app.include_router(rollback.router, prefix="/api/rollback", tags=["Rollback (Legacy)"])
app.include_router(ai_copilot.router, prefix="/api/ai-copilot", tags=["AI Copilot (Legacy)"])
app.include_router(autonomous.router, prefix="/api/autonomous", tags=["Autonomous (Legacy)"])
app.include_router(autonomous_ai.router, prefix="/api/autonomous-ai", tags=["Autonomous AI (Legacy)"])
app.include_router(scoring.router, prefix="/api/scoring", tags=["Scoring (Legacy)"])
app.include_router(team_accountability.router, prefix="/api/team-accountability", tags=["Team Accountability (Legacy)"])
app.include_router(heatmap.router, prefix="/api/heatmap", tags=["Heatmap (Legacy)"])
app.include_router(security.router, prefix="/api/security", tags=["Security (Legacy)"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["Compliance (Legacy)"])
app.include_router(attack_investigation.router, prefix="/api/attack-investigation", tags=["Attack Investigation (Legacy)"])
app.include_router(root_cause.router, prefix="/api/root-cause", tags=["Root Cause Analysis (Legacy)"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["Simulation (Legacy)"])
app.include_router(guardrails.router, prefix="/api/guardrails", tags=["CI/CD Guardrails (Legacy)"])
app.include_router(incidents.router, prefix="/api/incidents", tags=["Incident Correlation (Legacy)"])
app.include_router(predictive.router, prefix="/api/predictive", tags=["Predictive Scaling (Legacy)"])
app.include_router(carbon.router, prefix="/api/carbon", tags=["Carbon Footprint (Legacy)"])
app.include_router(benchmarking.router, prefix="/api/benchmarking", tags=["Benchmarking (Legacy)"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports (Legacy)"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit (Legacy)"])
app.include_router(command_center.router, prefix="/api/command-center", tags=["Command Center (Legacy)"])
app.include_router(storage.router, prefix="/api/storage", tags=["Storage (Legacy)"])
app.include_router(network.router, prefix="/api/network", tags=["Network (Legacy)"])
app.include_router(observability.router, prefix="/api/observability", tags=["Observability (Legacy)"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )

# Made with Bob
