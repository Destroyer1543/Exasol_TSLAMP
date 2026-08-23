from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio

from ..graph.knowledge_graph import get_graph
from ..graph.dependency_engine import predict_cascades
from ..extraction.gemini_extractor import (
    generate_briefing, investigate_query,
    generate_investigation_briefing, run_whatif, add_node_to_graph,
)
from ..scraper.scheduler import run_scrape_cycle, get_last_scrape
from ..scraper.rss_client import fetch_articles
from ..storage.exasol_client import get_analytics as get_exasol_analytics
from ..storage.exasol_client import get_status as get_exasol_status
from ..storage.exasol_client import save_investigation

router = APIRouter()


# ── Graph ──────────────────────────────────────────────────────────────────────

@router.get("/graph")
async def get_full_graph():
    return get_graph().to_graph_json()


@router.get("/crises")
async def list_crises():
    g = get_graph()
    return {"crises": [n.to_dict() for n in g.nodes.values()]}


@router.get("/crisis/{crisis_id}")
async def get_crisis(crisis_id: str):
    g = get_graph()
    if crisis_id not in g.nodes:
        raise HTTPException(404, f"Crisis '{crisis_id}' not found")
    node = g.nodes[crisis_id]
    return {
        "crisis":     node.to_dict(),
        "upstream":   g.get_upstream(crisis_id),
        "downstream": g.get_downstream(crisis_id),
    }


@router.get("/crisis/{crisis_id}/story")
async def get_story(crisis_id: str):
    g = get_graph()
    if crisis_id not in g.nodes:
        raise HTTPException(404, f"Crisis '{crisis_id}' not found")

    upstream_stories = g.get_upstream_story(crisis_id)

    # Downstream: build from top cascade prediction
    predictions = predict_cascades(g, crisis_id, max_hops=3)
    downstream_stories = []
    if predictions:
        top = predictions[0]
        full_path = top["via_path"] + [top["crisis_id"]]
        steps = []
        for i, node_id in enumerate(full_path):
            node = g.nodes.get(node_id)
            if not node:
                continue
            step: dict = {
                "id": node_id, "title": node.title,
                "country": node.country,
                "severity": node.severity.value,
                "type": node.type.value,
            }
            if i < len(full_path) - 1:
                nxt = full_path[i + 1]
                if g.graph.has_edge(node_id, nxt):
                    edata = g.graph.edges[node_id, nxt]
                    eo = next((e for e in g.edges.values()
                               if e.source_id == node_id and e.target_id == nxt), None)
                    step["next_relationship"] = edata.get("relationship", "CAUSES")
                    step["next_strength"]     = round(edata.get("strength", 0.5), 2)
                    step["next_lag_days"]     = eo.lag_days if eo else 30
            steps.append(step)
        if len(steps) >= 2:
            downstream_stories = [{
                "path_strength": top["risk_score"],
                "total_lag_days": top["lag_days_estimate"],
                "steps": steps,
            }]

    return {"upstream_stories": upstream_stories, "downstream_stories": downstream_stories}


@router.get("/crisis/{crisis_id}/chain")
async def get_chain(crisis_id: str, depth: int = 3):
    g = get_graph()
    if crisis_id not in g.nodes:
        raise HTTPException(404, f"Crisis '{crisis_id}' not found")
    return g.get_full_chain(crisis_id, max_depth=depth)


@router.get("/crisis/{crisis_id}/predictions")
async def get_predictions(crisis_id: str):
    g = get_graph()
    if crisis_id not in g.nodes:
        raise HTTPException(404, f"Crisis '{crisis_id}' not found")
    predictions = predict_cascades(g, crisis_id)
    return {"predictions": predictions}


# ── AI Briefing ────────────────────────────────────────────────────────────────

class BriefingRequest(BaseModel):
    focus_id: Optional[str] = None


@router.post("/briefing")
async def get_briefing(req: BriefingRequest):
    g = get_graph()
    summary = g.get_summary_for_llm(req.focus_id)
    upstream, downstream, predictions = [], [], []

    if req.focus_id and req.focus_id in g.nodes:
        focus_title = g.nodes[req.focus_id].title
        upstream    = g.get_upstream(req.focus_id)
        downstream  = g.get_downstream(req.focus_id)
        predictions = predict_cascades(g, req.focus_id)
    else:
        focus_title = None

    briefing = await generate_briefing(
        graph_summary=summary,
        focus_id=req.focus_id,
        focus_title=focus_title,
        upstream=upstream,
        downstream=downstream,
        predictions=predictions,
    )
    return {"briefing": briefing}


# ── Investigate ───────────────────────────────────────────────────────────────

class InvestigateRequest(BaseModel):
    query: str
    deep: bool = False


@router.post("/investigate")
async def investigate(req: InvestigateRequest):
    if not req.query or len(req.query.strip()) < 3:
        raise HTTPException(400, "Query too short")
    query = req.query.strip()[:200]

    import feedparser, httpx, urllib.parse

    articles: list[dict] = []
    seen_titles: set[str] = set()

    def _parse_feed(text: str, source: str, limit: int):
        feed = feedparser.parse(text)
        count = 0
        for entry in feed.entries:
            if count >= limit:
                break
            title = entry.get("title", "")
            if title in seen_titles:
                continue
            seen_titles.add(title)
            articles.append({
                "title": title,
                "description": entry.get("summary", entry.get("description", ""))[:500],
                "url": entry.get("link", ""),
                "source": source,
            })
            count += 1

    # Build query variants for deep mode
    q_enc = urllib.parse.quote_plus(query)
    queries = [
        (f"https://news.google.com/rss/search?q={q_enc}&hl=en&gl=US&ceid=US:en",       "Google News"),
    ]
    if req.deep:
        q2 = urllib.parse.quote_plus(query + " economic impact")
        q3 = urllib.parse.quote_plus(query + " crisis causes")
        q4 = urllib.parse.quote_plus(query + " humanitarian consequences")
        queries += [
            (f"https://news.google.com/rss/search?q={q2}&hl=en&gl=US&ceid=US:en", "Google News (economic)"),
            (f"https://news.google.com/rss/search?q={q3}&hl=en&gl=US&ceid=US:en", "Google News (causes)"),
            (f"https://news.google.com/rss/search?q={q4}&hl=en&gl=US&ceid=US:en", "Google News (humanitarian)"),
        ]

    per_feed = 15 if not req.deep else 12
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            for url, source in queries:
                try:
                    resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 NEXUS/1.0"})
                    _parse_feed(resp.text, source, per_feed)
                except Exception:
                    continue
    except Exception:
        pass

    g = get_graph()
    result = await investigate_query(
        query=query,
        articles=articles,
        existing_graph_summary=g.get_summary_for_llm(None),
        deep=req.deep,
    )
    try:
        result["exasol"] = await asyncio.to_thread(save_investigation, query, result, articles)
    except Exception as exc:
        result["exasol"] = {"stored": False, "error": str(exc)}
    return result


# ── Node briefing (for investigation nodes not in main graph) ─────────────────

class NodeBriefingRequest(BaseModel):
    title: str
    description: str
    country: str
    crisis_type: str
    upstream_titles: list[str] = []
    downstream_titles: list[str] = []


@router.post("/briefing/node")
async def node_briefing(req: NodeBriefingRequest):
    up   = ", ".join(req.upstream_titles)  or "Root cause (no known upstream)"
    down = ", ".join(req.downstream_titles) or "No downstream identified yet"
    prompt = f"""You are a crisis intelligence analyst. Write a 2-paragraph briefing.

CRISIS: {req.title} ({req.crisis_type}, {req.country})
DESCRIPTION: {req.description}
CAUSED BY: {up}
CAUSING: {down}

Paragraph 1: root causes and current trajectory with specific data points.
Paragraph 2: key cascade risks to monitor in next 30-90 days and recommended actions.
Max 180 words. Be direct and specific. No vague language."""

    import asyncio
    from ..extraction.gemini_extractor import _get_model
    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=90)
        return {"briefing": response.text}
    except Exception as e:
        return {"briefing": f"[Briefing unavailable: {e}]"}


# ── Scraper ────────────────────────────────────────────────────────────────────

# ── Investigation Briefing ────────────────────────────────────────────────────

class InvestigationBriefingRequest(BaseModel):
    title: str
    summary: str
    key_findings: list[str] = []
    nodes: list[dict] = []
    edge_count: int = 0
    recommendations: list[str] = []


@router.post("/briefing/investigation")
async def investigation_briefing(req: InvestigationBriefingRequest):
    briefing = await generate_investigation_briefing(
        title=req.title,
        summary=req.summary,
        key_findings=req.key_findings,
        nodes_summary=req.nodes,
        edge_count=req.edge_count,
        recommendations=req.recommendations,
    )
    return {"briefing": briefing}


# ── What-If Simulator ─────────────────────────────────────────────────────────

class WhatIfRequest(BaseModel):
    scenario: str
    investigation_title: str = ""
    investigation_summary: str = ""
    nodes: list[dict] = []
    edges: list[dict] = []


@router.post("/whatif")
async def whatif_simulation(req: WhatIfRequest):
    if not req.scenario or len(req.scenario.strip()) < 5:
        raise HTTPException(400, "Scenario too short")
    result = await run_whatif(
        scenario=req.scenario.strip()[:300],
        investigation_title=req.investigation_title,
        investigation_summary=req.investigation_summary,
        nodes=req.nodes,
        edges=req.edges,
    )
    return result


# ── Add Node ──────────────────────────────────────────────────────────────────

class AddNodeRequest(BaseModel):
    description: str
    current_nodes: list[dict] = []
    current_edges: list[dict] = []


@router.post("/graph/add-node")
async def graph_add_node(req: AddNodeRequest):
    if not req.description or len(req.description.strip()) < 3:
        raise HTTPException(400, "Description too short")
    result = await add_node_to_graph(
        description=req.description.strip()[:200],
        existing_nodes=req.current_nodes,
        existing_edges=req.current_edges,
    )
    return result


# ── Scraper ────────────────────────────────────────────────────────────────────

@router.post("/scrape/trigger")
async def trigger_scrape():
    await run_scrape_cycle()
    return {"status": "done", **get_last_scrape()}


@router.get("/stats")
async def get_stats():
    g = get_graph()
    graph_json = g.to_graph_json()
    return {
        **graph_json["stats"],
        "last_scrape": get_last_scrape(),
    }


# â”€â”€ Exasol Personal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/exasol/status")
async def exasol_status():
    return await asyncio.to_thread(get_exasol_status)


@router.get("/exasol/analytics")
async def exasol_analytics():
    try:
        return await asyncio.to_thread(get_exasol_analytics)
    except Exception as exc:
        return {"enabled": True, "connected": False, "message": str(exc)}
