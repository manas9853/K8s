"""
AI Optimization Copilot API
Provides conversational interface for cluster optimization insights
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import random

router = APIRouter()


# Pydantic Models
class ChatMessage(BaseModel):
    """Chat message"""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: str


class ChatRequest(BaseModel):
    """Request to send a message to AI Copilot"""
    message: str
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """Response from AI Copilot"""
    message: str
    suggestions: List[str]
    insights: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]
    timestamp: str


class ConversationHistory(BaseModel):
    """Conversation history"""
    conversation_id: str
    messages: List[ChatMessage]
    created_at: str
    updated_at: str


class QuickAction(BaseModel):
    """Quick action suggestion"""
    action_id: str
    title: str
    description: str
    category: str
    estimated_savings: float
    risk_level: str


# Demo conversation history
DEMO_CONVERSATIONS = []

# Quick actions
QUICK_ACTIONS = [
    {
        "action_id": "qa-001",
        "title": "Analyze High-Cost Clusters",
        "description": "Identify clusters with the highest infrastructure costs",
        "category": "Cost Analysis",
        "estimated_savings": 5000.0,
        "risk_level": "Low"
    },
    {
        "action_id": "qa-002",
        "title": "Find Over-Provisioned Workloads",
        "description": "Detect workloads using less than 30% of requested resources",
        "category": "Resource Optimization",
        "estimated_savings": 3500.0,
        "risk_level": "Low"
    },
    {
        "action_id": "qa-003",
        "title": "Identify Unused Resources",
        "description": "Find deployments, services, and PVCs that haven't been used in 30+ days",
        "category": "Cleanup",
        "estimated_savings": 2000.0,
        "risk_level": "Medium"
    },
    {
        "action_id": "qa-004",
        "title": "Optimize Storage Classes",
        "description": "Recommend cheaper storage classes for non-critical workloads",
        "category": "Storage Optimization",
        "estimated_savings": 1500.0,
        "risk_level": "Low"
    },
    {
        "action_id": "qa-005",
        "title": "Review HPA Configurations",
        "description": "Analyze HPA settings and suggest improvements",
        "category": "Scaling Optimization",
        "estimated_savings": 2500.0,
        "risk_level": "Medium"
    }
]


def generate_ai_response(user_message: str) -> ChatResponse:
    """Generate AI response based on user message"""
    message_lower = user_message.lower()
    
    # Analyze the question and provide intelligent response
    if any(word in message_lower for word in ['expensive', 'cost', 'spend', 'money']):
        return ChatResponse(
            message=(
                "Based on my analysis of your infrastructure:\n\n"
                "**Top Cost Contributors:**\n"
                "1. **Cluster prod-us-east-1** - $18,000/month (40% of total spend)\n"
                "   - Analytics namespace: $7,200/month (high waste)\n"
                "   - Production namespace: $6,500/month\n\n"
                "2. **Cluster prod-us-west-2** - $12,000/month (27% of total spend)\n"
                "   - Over-provisioned GPU workloads\n\n"
                "**Key Findings:**\n"
                "- 32 pods are over-provisioned (using <30% of requests)\n"
                "- 7 namespaces have idle resources\n"
                "- $12,000/month can be saved with low-risk optimizations\n\n"
                "**Immediate Actions:**\n"
                "1. Reduce CPU requests for analytics workloads\n"
                "2. Delete 12 unused PVCs ($800/month savings)\n"
                "3. Optimize GPU allocations ($3,200/month savings)"
            ),
            suggestions=[
                "Show me the analytics namespace details",
                "What are the over-provisioned pods?",
                "How can I optimize GPU workloads?",
                "Show me unused resources"
            ],
            insights=[
                {
                    "type": "cost_breakdown",
                    "title": "Cost by Cluster",
                    "data": {
                        "prod-us-east-1": 18000,
                        "prod-us-west-2": 12000,
                        "prod-eu-west-1": 8000,
                        "staging": 4000
                    }
                },
                {
                    "type": "waste_analysis",
                    "title": "Waste Hotspots",
                    "data": {
                        "analytics": 4000,
                        "ml-training": 3200,
                        "development": 2800
                    }
                }
            ],
            recommendations=[
                {
                    "id": "rec-001",
                    "title": "Optimize Analytics Namespace",
                    "savings": 4000,
                    "risk": "Low",
                    "actions": 12
                },
                {
                    "id": "rec-002",
                    "title": "Right-size GPU Workloads",
                    "savings": 3200,
                    "risk": "Medium",
                    "actions": 5
                }
            ],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
    
    elif any(word in message_lower for word in ['waste', 'unused', 'idle']):
        return ChatResponse(
            message=(
                "I've identified significant waste in your infrastructure:\n\n"
                "**Resource Waste Analysis:**\n\n"
                "**1. Over-Provisioned Workloads (32 pods)**\n"
                "- Average CPU utilization: 18% of requests\n"
                "- Average Memory utilization: 35% of requests\n"
                "- Potential savings: $5,400/month\n\n"
                "**2. Idle Namespaces (7 namespaces)**\n"
                "- No traffic in 30+ days\n"
                "- Total cost: $2,100/month\n"
                "- Recommendation: Archive or delete\n\n"
                "**3. Unused Resources:**\n"
                "- 12 unattached PVCs: $800/month\n"
                "- 18 stale ConfigMaps\n"
                "- 7 unused Services\n\n"
                "**4. Inefficient Storage:**\n"
                "- 15 PVCs using premium-ssd unnecessarily\n"
                "- Potential savings: $1,200/month\n\n"
                "**Total Waste: $9,500/month (21% of infrastructure spend)**"
            ),
            suggestions=[
                "Show me the over-provisioned pods",
                "Which namespaces are idle?",
                "How do I clean up unused PVCs?",
                "Optimize storage classes"
            ],
            insights=[
                {
                    "type": "waste_by_type",
                    "title": "Waste by Resource Type",
                    "data": {
                        "CPU": 3200,
                        "Memory": 2200,
                        "Storage": 2000,
                        "Idle Resources": 2100
                    }
                }
            ],
            recommendations=[
                {
                    "id": "rec-003",
                    "title": "Right-size Over-Provisioned Pods",
                    "savings": 5400,
                    "risk": "Low",
                    "actions": 32
                },
                {
                    "id": "rec-004",
                    "title": "Clean Up Idle Namespaces",
                    "savings": 2100,
                    "risk": "Medium",
                    "actions": 7
                }
            ],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
    
    elif any(word in message_lower for word in ['cpu', 'memory', 'resource']):
        return ChatResponse(
            message=(
                "**Resource Utilization Analysis:**\n\n"
                "**CPU Efficiency:**\n"
                "- Cluster Average: 42% utilization\n"
                "- Over-provisioned pods: 32 (using <30%)\n"
                "- Under-provisioned pods: 5 (using >80%)\n"
                "- Optimization potential: $3,200/month\n\n"
                "**Memory Efficiency:**\n"
                "- Cluster Average: 58% utilization\n"
                "- Over-provisioned pods: 28 (using <40%)\n"
                "- OOMKilled pods (last 7 days): 12\n"
                "- Optimization potential: $2,200/month\n\n"
                "**Top Resource Wasters:**\n"
                "1. analytics-engine: 2000m CPU requested, 300m used (15%)\n"
                "2. ml-training-job: 8Gi memory requested, 2.1Gi used (26%)\n"
                "3. data-processor: 4000m CPU requested, 800m used (20%)\n\n"
                "**Recommendations:**\n"
                "- Reduce CPU requests by 40% for analytics workloads\n"
                "- Increase memory limits for 12 pods experiencing OOMKills\n"
                "- Implement HPA for variable workloads"
            ),
            suggestions=[
                "Show me the analytics-engine details",
                "Which pods are experiencing OOMKills?",
                "How do I implement HPA?",
                "Optimize all over-provisioned pods"
            ],
            insights=[
                {
                    "type": "resource_efficiency",
                    "title": "Resource Efficiency Score",
                    "data": {
                        "CPU": 42,
                        "Memory": 58,
                        "Storage": 65,
                        "Network": 72
                    }
                }
            ],
            recommendations=[
                {
                    "id": "rec-005",
                    "title": "Optimize CPU Allocations",
                    "savings": 3200,
                    "risk": "Low",
                    "actions": 32
                },
                {
                    "id": "rec-006",
                    "title": "Fix Memory Issues",
                    "savings": 2200,
                    "risk": "Medium",
                    "actions": 40
                }
            ],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
    
    elif any(word in message_lower for word in ['optimize', 'improve', 'better']):
        return ChatResponse(
            message=(
                "**Optimization Opportunities:**\n\n"
                "I've identified several high-impact optimization opportunities:\n\n"
                "**1. Low-Risk Optimizations ($8,200/month)**\n"
                "- Right-size 32 over-provisioned pods\n"
                "- Delete 12 unused PVCs\n"
                "- Optimize storage classes for 15 volumes\n"
                "- Remove 7 idle services\n\n"
                "**2. Medium-Risk Optimizations ($4,500/month)**\n"
                "- Implement HPA for 8 workloads\n"
                "- Migrate to spot instances (non-critical)\n"
                "- Consolidate 3 under-utilized clusters\n\n"
                "**3. High-Impact Changes ($6,000/month)**\n"
                "- Archive 7 idle namespaces\n"
                "- Optimize GPU allocations\n"
                "- Implement cluster autoscaling\n\n"
                "**Total Potential Savings: $18,700/month (42% reduction)**\n\n"
                "**Recommended Approach:**\n"
                "1. Start with low-risk optimizations (Week 1-2)\n"
                "2. Implement medium-risk changes (Week 3-4)\n"
                "3. Plan high-impact changes (Month 2)"
            ),
            suggestions=[
                "Show me low-risk optimizations",
                "How do I implement HPA?",
                "What are the GPU optimization opportunities?",
                "Create an optimization plan"
            ],
            insights=[
                {
                    "type": "savings_potential",
                    "title": "Savings by Risk Level",
                    "data": {
                        "Low Risk": 8200,
                        "Medium Risk": 4500,
                        "High Risk": 6000
                    }
                }
            ],
            recommendations=[
                {
                    "id": "rec-007",
                    "title": "Execute Low-Risk Optimizations",
                    "savings": 8200,
                    "risk": "Low",
                    "actions": 66
                },
                {
                    "id": "rec-008",
                    "title": "Implement Autoscaling",
                    "savings": 4500,
                    "risk": "Medium",
                    "actions": 11
                }
            ],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
    
    elif any(word in message_lower for word in ['namespace', 'analytics']):
        return ChatResponse(
            message=(
                "**Analytics Namespace Analysis:**\n\n"
                "**Overview:**\n"
                "- Cluster: prod-us-east-1\n"
                "- Monthly Cost: $7,200\n"
                "- Waste: $4,000 (56%)\n"
                "- Pods: 45\n"
                "- Services: 12\n\n"
                "**Key Issues:**\n"
                "1. **Over-Provisioned Workloads (18 pods)**\n"
                "   - analytics-engine: 2000m CPU → 300m used (15%)\n"
                "   - data-processor: 4000m CPU → 800m used (20%)\n"
                "   - report-generator: 8Gi memory → 2Gi used (25%)\n\n"
                "2. **Idle Resources**\n"
                "   - 5 services with no traffic (30 days)\n"
                "   - 3 unused PVCs ($240/month)\n\n"
                "3. **Inefficient Storage**\n"
                "   - 8 PVCs using premium-ssd unnecessarily\n"
                "   - Potential savings: $640/month\n\n"
                "**Optimization Plan:**\n"
                "- Reduce CPU requests: $2,400/month savings\n"
                "- Reduce memory requests: $1,200/month savings\n"
                "- Optimize storage: $640/month savings\n"
                "- Clean up unused resources: $240/month savings\n\n"
                "**Total Potential Savings: $4,480/month**"
            ),
            suggestions=[
                "Optimize analytics-engine",
                "Show me unused resources in analytics",
                "How do I optimize storage classes?",
                "Apply all analytics optimizations"
            ],
            insights=[
                {
                    "type": "namespace_breakdown",
                    "title": "Analytics Cost Breakdown",
                    "data": {
                        "Compute": 4800,
                        "Storage": 1600,
                        "Network": 800
                    }
                }
            ],
            recommendations=[
                {
                    "id": "rec-009",
                    "title": "Optimize Analytics Namespace",
                    "savings": 4480,
                    "risk": "Low",
                    "actions": 34
                }
            ],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
    
    else:
        # Default response
        return ChatResponse(
            message=(
                "I'm your AI Optimization Copilot! I can help you:\n\n"
                "**Cost Analysis:**\n"
                "- Identify expensive clusters and namespaces\n"
                "- Break down costs by resource type\n"
                "- Calculate potential savings\n\n"
                "**Resource Optimization:**\n"
                "- Find over-provisioned workloads\n"
                "- Detect under-utilized resources\n"
                "- Recommend right-sizing strategies\n\n"
                "**Waste Detection:**\n"
                "- Identify unused resources\n"
                "- Find idle namespaces\n"
                "- Detect inefficient configurations\n\n"
                "**Recommendations:**\n"
                "- Provide actionable optimization steps\n"
                "- Estimate savings and risks\n"
                "- Create optimization roadmaps\n\n"
                "**Try asking me:**\n"
                "- 'Why is my cluster expensive?'\n"
                "- 'Which workloads waste the most CPU?'\n"
                "- 'Show me savings opportunities above $500/month'\n"
                "- 'What should I optimize first?'"
            ),
            suggestions=[
                "Why is my cluster expensive?",
                "Which workloads waste the most CPU?",
                "Show me savings opportunities",
                "What should I optimize first?"
            ],
            insights=[],
            recommendations=[],
            timestamp=datetime.utcnow().isoformat() + "Z"
        )


@router.post("/chat", response_model=ChatResponse)
async def chat_with_copilot(request: ChatRequest):
    """
    Send a message to AI Copilot and get intelligent response
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    # Generate AI response
    response = generate_ai_response(request.message)
    
    # Store conversation (in production, this would go to a database)
    DEMO_CONVERSATIONS.append({
        "user": request.message,
        "assistant": response.message,
        "timestamp": response.timestamp
    })
    
    return response


@router.get("/quick-actions", response_model=List[QuickAction])
async def get_quick_actions():
    """
    Get quick action suggestions
    """
    return QUICK_ACTIONS


@router.get("/conversation-history", response_model=List[Dict[str, Any]])
async def get_conversation_history():
    """
    Get conversation history
    """
    return DEMO_CONVERSATIONS


@router.delete("/conversation-history")
async def clear_conversation_history():
    """
    Clear conversation history
    """
    DEMO_CONVERSATIONS.clear()
    return {"message": "Conversation history cleared"}


@router.get("/insights")
async def get_insights():
    """
    Get AI-generated insights about the infrastructure
    """
    return {
        "insights": [
            {
                "id": "insight-001",
                "type": "cost_anomaly",
                "severity": "high",
                "title": "Unusual Cost Spike Detected",
                "description": "Analytics namespace cost increased by 45% in the last 7 days",
                "recommendation": "Investigate recent deployments and scale down if needed",
                "potential_savings": 1200
            },
            {
                "id": "insight-002",
                "type": "efficiency",
                "severity": "medium",
                "title": "Low CPU Utilization",
                "description": "32 pods are using less than 30% of requested CPU",
                "recommendation": "Right-size CPU requests to match actual usage",
                "potential_savings": 3200
            },
            {
                "id": "insight-003",
                "type": "waste",
                "severity": "medium",
                "title": "Idle Resources Detected",
                "description": "7 namespaces have no traffic in the last 30 days",
                "recommendation": "Archive or delete idle namespaces",
                "potential_savings": 2100
            },
            {
                "id": "insight-004",
                "type": "optimization",
                "severity": "low",
                "title": "Storage Optimization Opportunity",
                "description": "15 PVCs are using premium storage unnecessarily",
                "recommendation": "Migrate to standard storage class",
                "potential_savings": 1200
            },
            {
                "id": "insight-005",
                "type": "scaling",
                "severity": "low",
                "title": "HPA Not Configured",
                "description": "8 workloads with variable load don't have HPA",
                "recommendation": "Implement HPA to optimize resource usage",
                "potential_savings": 2500
            }
        ],
        "total_potential_savings": 10200,
        "generated_at": datetime.utcnow().isoformat() + "Z"
    }

# Made with Bob
