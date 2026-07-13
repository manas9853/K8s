from fastapi import APIRouter
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


async def _real_cluster_scores() -> List[Dict[str, Any]]:
    """Fetch real cluster scores from scoring module."""
    try:
        from api.scoring import get_cluster_score
        from utils.cluster_registry import get_active_clusters
        clusters = get_active_clusters()
        scores = []
        for c in clusters:
            try:
                score = await get_cluster_score(c["id"])
                scores.append({
                    "cluster_name": c.get("name", c["id"]),
                    "overall_score": score.get("overall_score", 0),
                    "monthly_cost": score.get("monthly_cost", 0),
                    "rank": 0,
                    "metrics": score.get("factors", {}),
                })
            except Exception:
                pass
        # Assign ranks by score descending
        scores.sort(key=lambda x: x["overall_score"], reverse=True)
        for i, s in enumerate(scores):
            s["rank"] = i + 1
        return scores
    except Exception as e:
        logger.warning(f"Could not fetch real cluster scores for benchmarking: {e}")
        return []


@router.get("/clusters")
async def get_clusters():
    """Get cluster benchmarking data — uses real cluster scores."""
    return await _real_cluster_scores()


@router.get("/comparison")
async def get_comparison():
    """Get cluster comparison summary — derived from real cluster scores."""
    scores = await _real_cluster_scores()
    if not scores:
        return {
            "best_performer": None,
            "worst_performer": None,
            "average_score": 0,
            "total_cost": 0,
            "optimization_potential": 0,
        }

    total_cost = sum(s.get("monthly_cost", 0) for s in scores)
    avg_score = round(sum(s["overall_score"] for s in scores) / len(scores), 1)
    best = max(scores, key=lambda x: x["overall_score"])
    worst = min(scores, key=lambda x: x["overall_score"])
    # Potential = savings if worst cluster reached average
    potential = max(0, round((avg_score - worst["overall_score"]) / 100 * 100, 1))

    return {
        "best_performer": best["cluster_name"],
        "worst_performer": worst["cluster_name"],
        "average_score": avg_score,
        "total_cost": total_cost,
        "optimization_potential": potential,
    }

# Made with Bob
