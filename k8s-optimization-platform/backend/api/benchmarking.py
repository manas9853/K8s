from fastapi import APIRouter

router = APIRouter()


@router.get("/clusters")
async def get_clusters():
    """Get cluster benchmarking data"""
    return [
        {
            "cluster_name": "prod-us-east-1",
            "overall_score": 92,
            "monthly_cost": 12000,
            "rank": 1,
            "metrics": {
                "cpu_efficiency": 88,
                "memory_efficiency": 92,
                "cost_efficiency": 95,
                "reliability_score": 94,
                "performance_score": 90,
                "waste_percentage": 5
            }
        },
        {
            "cluster_name": "prod-us-west-2",
            "overall_score": 85,
            "monthly_cost": 15000,
            "rank": 2,
            "metrics": {
                "cpu_efficiency": 82,
                "memory_efficiency": 85,
                "cost_efficiency": 88,
                "reliability_score": 87,
                "performance_score": 85,
                "waste_percentage": 12
            }
        },
        {
            "cluster_name": "prod-eu-west-1",
            "overall_score": 78,
            "monthly_cost": 18000,
            "rank": 3,
            "metrics": {
                "cpu_efficiency": 75,
                "memory_efficiency": 78,
                "cost_efficiency": 80,
                "reliability_score": 82,
                "performance_score": 76,
                "waste_percentage": 20
            }
        }
    ]


@router.get("/comparison")
async def get_comparison():
    """Get cluster comparison data"""
    return {
        "best_performer": "prod-us-east-1",
        "worst_performer": "prod-eu-west-1",
        "average_score": 85,
        "total_cost": 45000,
        "optimization_potential": 15
    }

# Made with Bob
