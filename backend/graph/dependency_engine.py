"""
Dependency / Cascade Prediction Engine

Given a crisis, scores and ranks potential second-order effects.
"""

from dataclasses import dataclass
from .knowledge_graph import CrisisKnowledgeGraph, CrisisNode
from ..extraction.crisis_types import Severity, SEVERITY_WEIGHT


@dataclass
class CascadePrediction:
    crisis_id: str
    title: str
    country: str
    crisis_type: str
    current_severity: str
    risk_score: float           # 0–1, higher = more at risk
    reason: str
    via_path: list[str]         # chain of crisis IDs leading here
    lag_days_estimate: int


def predict_cascades(graph: CrisisKnowledgeGraph, focus_id: str, max_hops: int = 3) -> list[dict]:
    """
    From focus crisis, traverse downstream graph and score indirect risks.
    Returns top predictions sorted by risk_score descending.
    """
    predictions: dict[str, CascadePrediction] = {}

    def traverse(current_id: str, path: list[str], accumulated_strength: float, depth: int, accumulated_lag: int):
        if depth > max_hops or current_id in path:
            return

        for target_id in graph.graph.successors(current_id):
            if target_id == focus_id:
                continue

            edge_data = graph.graph.edges[current_id, target_id]
            edge_strength = edge_data.get("strength", 0.5)
            edge = next((e for e in graph.edges.values() if e.source_id == current_id and e.target_id == target_id), None)
            lag = edge.lag_days if edge else 30

            # Decay strength with each hop
            path_strength = accumulated_strength * edge_strength * (0.7 ** depth)
            total_lag = accumulated_lag + lag

            target_node = graph.nodes.get(target_id)
            if not target_node:
                continue

            # Skip already-critical crises (they don't need prediction)
            if target_node.severity == Severity.CRITICAL and depth == 1:
                traverse(target_id, path + [current_id], path_strength, depth + 1, total_lag)
                continue

            # Score = path_strength boosted if target is already high severity
            severity_boost = SEVERITY_WEIGHT.get(target_node.severity, 1) / 5.0
            risk_score = min(path_strength * (1 + severity_boost * 0.3), 1.0)

            if target_id not in predictions or predictions[target_id].risk_score < risk_score:
                # Build readable reason
                chain_titles = [graph.nodes[n].title for n in path if n in graph.nodes]
                chain_titles.append(target_node.title)
                reason = " → ".join(chain_titles)

                predictions[target_id] = CascadePrediction(
                    crisis_id=target_id,
                    title=target_node.title,
                    country=target_node.country,
                    crisis_type=target_node.type.value,
                    current_severity=target_node.severity.value,
                    risk_score=risk_score,
                    reason=reason,
                    via_path=path + [current_id],
                    lag_days_estimate=total_lag,
                )

            traverse(target_id, path + [current_id], path_strength, depth + 1, total_lag)

    traverse(focus_id, [], 1.0, 0, 0)

    # Sort and exclude focus crisis itself
    results = sorted(predictions.values(), key=lambda p: p.risk_score, reverse=True)
    return [
        {
            "crisis_id":         p.crisis_id,
            "title":             p.title,
            "country":           p.country,
            "crisis_type":       p.crisis_type,
            "current_severity":  p.current_severity,
            "risk_score":        round(p.risk_score, 3),
            "reason":            p.reason,
            "via_path":          p.via_path,
            "lag_days_estimate": p.lag_days_estimate,
        }
        for p in results[:6]
    ]
