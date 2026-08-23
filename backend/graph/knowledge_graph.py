"""
Global Crisis Knowledge Graph
Nodes = crises, Edges = causal/dependency relationships
"""

import networkx as nx
from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime

from ..extraction.crisis_types import CrisisType, Severity, Sector, RelationshipType


@dataclass
class CrisisNode:
    id: str
    title: str
    type: CrisisType
    severity: Severity
    lat: float
    lon: float
    country: str
    description: str
    sectors_affected: list[str]
    start_date: str
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    source_urls: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    is_predicted: bool = False
    confidence: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CrisisEdge:
    id: str
    source_id: str
    target_id: str
    relationship: RelationshipType
    strength: float          # 0.0–1.0
    description: str
    lag_days: int = 0        # typical delay between cause and effect

    def to_dict(self) -> dict:
        return asdict(self)


class CrisisKnowledgeGraph:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.nodes: dict[str, CrisisNode] = {}
        self.edges: dict[str, CrisisEdge] = {}

    # ── Nodes ──────────────────────────────────────────────────────────────────

    def add_crisis(self, node: CrisisNode):
        self.nodes[node.id] = node
        self.graph.add_node(node.id, **{
            "type":     node.type.value,
            "severity": node.severity.value,
        })

    def update_crisis(self, node_id: str, **kwargs):
        if node_id in self.nodes:
            for k, v in kwargs.items():
                setattr(self.nodes[node_id], k, v)
            self.nodes[node_id].last_updated = datetime.utcnow().isoformat()

    # ── Edges ──────────────────────────────────────────────────────────────────

    def add_relationship(self, edge: CrisisEdge):
        self.edges[edge.id] = edge
        self.graph.add_edge(
            edge.source_id, edge.target_id,
            relationship=edge.relationship.value,
            strength=edge.strength,
            edge_id=edge.id,
        )

    # ── Queries ────────────────────────────────────────────────────────────────

    def get_upstream(self, crisis_id: str) -> list[dict]:
        """Direct causes of this crisis."""
        result = []
        for src in self.graph.predecessors(crisis_id):
            edge_data = self.graph.edges[src, crisis_id]
            node = self.nodes.get(src)
            if node:
                result.append({
                    "crisis": node.to_dict(),
                    "relationship": edge_data.get("relationship"),
                    "strength": edge_data.get("strength", 0),
                })
        return result

    def get_downstream(self, crisis_id: str) -> list[dict]:
        """Direct effects of this crisis."""
        result = []
        for tgt in self.graph.successors(crisis_id):
            edge_data = self.graph.edges[crisis_id, tgt]
            node = self.nodes.get(tgt)
            if node:
                result.append({
                    "crisis": node.to_dict(),
                    "relationship": edge_data.get("relationship"),
                    "strength": edge_data.get("strength", 0),
                })
        return result

    def get_full_chain(self, crisis_id: str, max_depth: int = 3) -> dict:
        """Full upstream + downstream chain up to max_depth hops."""
        upstream_ids   = set()
        downstream_ids = set()

        # BFS upstream
        queue = [(crisis_id, 0)]
        while queue:
            nid, depth = queue.pop(0)
            if depth >= max_depth:
                continue
            for src in self.graph.predecessors(nid):
                if src not in upstream_ids:
                    upstream_ids.add(src)
                    queue.append((src, depth + 1))

        # BFS downstream
        queue = [(crisis_id, 0)]
        while queue:
            nid, depth = queue.pop(0)
            if depth >= max_depth:
                continue
            for tgt in self.graph.successors(nid):
                if tgt not in downstream_ids:
                    downstream_ids.add(tgt)
                    queue.append((tgt, depth + 1))

        chain_node_ids = upstream_ids | downstream_ids | {crisis_id}
        chain_edge_ids = [
            eid for eid, e in self.edges.items()
            if e.source_id in chain_node_ids and e.target_id in chain_node_ids
        ]

        return {
            "focus_id":   crisis_id,
            "upstream":   [self.nodes[i].to_dict() for i in upstream_ids if i in self.nodes],
            "downstream": [self.nodes[i].to_dict() for i in downstream_ids if i in self.nodes],
            "edges":      [self.edges[i].to_dict() for i in chain_edge_ids],
        }

    # ── Serialization ──────────────────────────────────────────────────────────

    def to_graph_json(self) -> dict:
        return {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "edges": [e.to_dict() for e in self.edges.values()],
            "stats": {
                "total_crises":       len(self.nodes),
                "total_relationships": len(self.edges),
                "critical_count":     sum(1 for n in self.nodes.values() if n.severity == Severity.CRITICAL),
                "predicted_count":    sum(1 for n in self.nodes.values() if n.is_predicted),
            }
        }

    def get_upstream_story(self, crisis_id: str, max_stories: int = 2) -> list[dict]:
        """Find the most significant upstream causal chains leading to this crisis."""
        roots = [n for n in self.graph.nodes if self.graph.in_degree(n) == 0]
        all_paths: list[tuple[float, int, list[str]]] = []

        for root in roots:
            try:
                for path in nx.all_simple_paths(self.graph, root, crisis_id, cutoff=7):
                    if len(path) < 2:
                        continue
                    strength, total_lag = 1.0, 0
                    for i in range(len(path) - 1):
                        edata = self.graph.edges[path[i], path[i + 1]]
                        strength *= edata.get("strength", 0.5)
                        eo = next((e for e in self.edges.values()
                                   if e.source_id == path[i] and e.target_id == path[i + 1]), None)
                        total_lag += eo.lag_days if eo else 30
                    all_paths.append((strength, total_lag, path))
            except (nx.NetworkXNoPath, nx.NodeNotFound, nx.NetworkXError):
                continue

        all_paths.sort(key=lambda x: x[0], reverse=True)
        stories = []
        for strength, total_lag, path in all_paths[:max_stories]:
            steps = []
            for i, node_id in enumerate(path):
                node = self.nodes.get(node_id)
                if not node:
                    continue
                step: dict = {
                    "id": node_id, "title": node.title,
                    "country": node.country,
                    "severity": node.severity.value,
                    "type": node.type.value,
                }
                if i < len(path) - 1:
                    nxt   = path[i + 1]
                    edata = self.graph.edges[node_id, nxt]
                    eo    = next((e for e in self.edges.values()
                                  if e.source_id == node_id and e.target_id == nxt), None)
                    step["next_relationship"] = edata.get("relationship", "CAUSES")
                    step["next_strength"]     = round(edata.get("strength", 0.5), 2)
                    step["next_lag_days"]     = eo.lag_days if eo else 30
                steps.append(step)
            stories.append({"path_strength": round(strength, 3),
                             "total_lag_days": total_lag, "steps": steps})
        return stories

    def get_summary_for_llm(self, focus_id: Optional[str] = None) -> str:
        lines = []
        if focus_id and focus_id in self.nodes:
            node = self.nodes[focus_id]
            lines.append(f"FOCUS CRISIS: {node.title} [{node.severity.value}] — {node.description}")
            lines.append("\nUPSTREAM CAUSES:")
            for up in self.get_upstream(focus_id):
                lines.append(f"  ← {up['crisis']['title']} ({up['relationship']})")
            lines.append("\nDOWNSTREAM EFFECTS:")
            for dn in self.get_downstream(focus_id):
                lines.append(f"  → {dn['crisis']['title']} ({dn['relationship']}, strength {dn['strength']:.0%})")
        else:
            lines.append(f"ACTIVE CRISES: {len(self.nodes)} tracked globally")
            for node in sorted(self.nodes.values(), key=lambda n: ["CRITICAL","HIGH","MEDIUM","LOW","MONITORING"].index(n.severity.value)):
                lines.append(f"  [{node.severity.value}] {node.title} ({node.country})")
        return "\n".join(lines)


# Module-level singleton
_graph_instance: Optional[CrisisKnowledgeGraph] = None

def get_graph() -> CrisisKnowledgeGraph:
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = CrisisKnowledgeGraph()
    return _graph_instance
