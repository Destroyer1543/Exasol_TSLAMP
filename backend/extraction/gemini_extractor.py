"""
Gemini-powered crisis extractor.
Takes raw news articles and extracts structured crisis events + relationships.
"""

import asyncio
import json
import os
import re
from typing import Optional

from ..ai.llm import get_model as _get_llm_model


def _extract_json(text: str) -> str:
    """Robustly strip markdown fences and extract the outermost JSON object."""
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ``` fences
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    # If there's still surrounding text, pull the first {...} block
    if not text.startswith('{'):
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            text = m.group(0)
    return text


def _loads(raw: str) -> dict:
    """Parse model JSON, salvaging output truncated by the token cap.

    Free-tier token limits can cut the JSON mid-array. When a clean parse
    fails, drop the incomplete trailing element (back to the last complete
    ``}``) and balance-close open arrays/objects so the completed nodes and
    edges still load.
    """
    text = _extract_json(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        cut = text.rfind('}')
        if cut == -1:
            raise
        frag = text[:cut + 1]
        frag += ']' * max(0, frag.count('[') - frag.count(']'))
        frag += '}' * max(0, frag.count('{') - frag.count('}'))
        return json.loads(frag)

def _get_model():
    """Return the active LLM (Groq). Name kept for existing call sites."""
    return _get_llm_model()


async def extract_from_articles(articles: list[dict]) -> dict:
    """
    Takes list of {title, description, source} dicts.
    Returns {new_crises: [...], new_relationships: [...], updates: [...]}
    """
    if not articles:
        return {"new_crises": [], "new_relationships": [], "updates": []}

    # Format articles for prompt
    article_text = "\n\n".join(
        f"[{i+1}] SOURCE: {a.get('source','')}\nTITLE: {a.get('title','')}\nSUMMARY: {a.get('description','')}"
        for i, a in enumerate(articles[:10])  # limit per batch (Groq free-tier 8k TPM)
    )

    prompt = f"""You are a global crisis intelligence analyst. Analyze these news articles and extract crisis intelligence.

ARTICLES:
{article_text}

Extract and return ONLY valid JSON with this exact structure:
{{
  "new_crises": [
    {{
      "id": "snake_case_unique_id",
      "title": "Crisis Title",
      "type": "WAR|CONFLICT|ECONOMIC|SUPPLY_CHAIN|NATURAL_DISASTER|HEALTH|POLITICAL|FOOD|ENERGY|CLIMATE|HUMANITARIAN",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|MONITORING",
      "country": "Country/Region name",
      "lat": 0.0,
      "lon": 0.0,
      "description": "1-2 sentence factual description",
      "sectors_affected": ["ENERGY","FOOD","TRADE","FINANCE","HEALTH","TRANSPORT","POLITICS","HUMANITARIAN","TECHNOLOGY"],
      "tags": ["tag1","tag2"],
      "source_urls": ["url1"]
    }}
  ],
  "new_relationships": [
    {{
      "source_id": "existing_or_new_crisis_id",
      "target_id": "existing_or_new_crisis_id",
      "relationship": "CAUSES|WORSENS|DISRUPTS|TRIGGERS|CORRELATES",
      "strength": 0.0,
      "description": "Why this relationship exists",
      "lag_days": 0
    }}
  ],
  "updates": [
    {{
      "id": "existing_crisis_id_to_update",
      "severity": "new_severity_if_changed",
      "description": "updated description if significant change"
    }}
  ]
}}

Rules:
- Only extract genuinely new crises not already obvious from context
- strength is 0.0-1.0 (how strong/direct the causal link is)
- Only include relationships you're confident about
- If no new crises/relationships found, return empty arrays
- Respond with ONLY the JSON, no markdown
"""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        return _loads(response.text)
    except Exception as e:
        return {"new_crises": [], "new_relationships": [], "updates": [], "error": str(e)}


async def investigate_query(query: str, articles: list[dict], existing_graph_summary: str, deep: bool = False) -> dict:
    """
    Takes a freeform user query (e.g. 'petroleum shortage due to war') and
    news articles, and returns a focused crisis sub-graph + analysis.
    """
    max_articles = 12 if deep else 8  # keep request under Groq free-tier 8k TPM
    article_text = ""
    if articles:
        article_text = "\n\n".join(
            f"[{i+1}] {a.get('source','')}: {a.get('title','')}\n{(a.get('description','') or '')[:220]}"
            for i, a in enumerate(articles[:max_articles])
        )
    else:
        article_text = "(No live articles fetched — reasoning from knowledge base)"

    node_range   = "10-14" if deep else "7-9"
    depth_clause = (
        "Go DEEP: trace root causes back 4-5 hops, include intermediate factors, "
        "geographic chokepoints (straits, canals, corridors), and second-order spillovers. "
        "Include nodes for: root trigger → intermediate escalations → chokepoints → direct effects → spillover effects."
    ) if deep else (
        "Build a clear causal chain: root cause → intermediate factors → direct effects."
    )

    prompt = f"""You are a global crisis intelligence analyst. A user is investigating:

QUERY: "{query}"

RELEVANT RECENT ARTICLES ({len(articles)} fetched):
{article_text}

EXISTING KNOWN CRISES CONTEXT:
{existing_graph_summary}

Build a focused crisis intelligence report. {depth_clause}

Return ONLY valid JSON:
{{
  "title": "Short title for this investigation (max 8 words)",
  "summary": "3-4 sentence executive summary of the full causal chain",
  "key_findings": [
    "Finding 1 — specific, data-grounded with numbers where possible",
    "Finding 2",
    "Finding 3",
    "Finding 4"
  ],
  "nodes": [
    {{
      "id": "snake_case_unique_id",
      "title": "Crisis or factor name",
      "type": "WAR|CONFLICT|ECONOMIC|SUPPLY_CHAIN|NATURAL_DISASTER|HEALTH|POLITICAL|FOOD|ENERGY|CLIMATE|HUMANITARIAN",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "country": "Country or region",
      "lat": 0.0,
      "lon": 0.0,
      "description": "One concise factual sentence with a specific detail",
      "sectors_affected": ["ENERGY","FOOD","TRADE"],
      "tags": ["tag1","tag2"],
      "start_date": "YYYY-MM-DD"
    }}
  ],
  "edges": [
    {{
      "source_id": "id1",
      "target_id": "id2",
      "relationship": "CAUSES|WORSENS|DISRUPTS|TRIGGERS|CORRELATES",
      "strength": 0.85,
      "description": "Specific reason this causal link exists with evidence",
      "lag_days": 30
    }}
  ],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Recommendation 2",
    "Recommendation 3"
  ]
}}

Rules:
- Include {node_range} nodes forming a complete causal network
- Every node must connect to at least one other via edges
- Nodes must have accurate lat/lon coordinates
- Strength 0.0-1.0 (how direct/evidenced the causal link is)
- Be specific: use real country names, actual figures, named actors
- Return ONLY the JSON, no markdown fences"""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        result = _loads(response.text)
        # Inject source count
        result["articles_analyzed"] = len(articles)
        return result
    except Exception as e:
        return {
            "title": f"Investigation: {query[:40]}",
            "summary": f"Could not complete investigation: {e}",
            "key_findings": [],
            "nodes": [],
            "edges": [],
            "recommendations": [],
            "articles_analyzed": len(articles),
            "error": str(e),
        }


async def generate_briefing(graph_summary: str, focus_id: Optional[str] = None,
                            focus_title: Optional[str] = None,
                            upstream: list = None, downstream: list = None,
                            predictions: list = None) -> str:
    """Generate a Gemini strategic briefing on a selected crisis or global state."""
    upstream = upstream or []
    downstream = downstream or []
    predictions = predictions or []

    if focus_id:
        up_text = "\n".join(f"  ← {u['crisis']['title']} ({u['relationship']})" for u in upstream) or "  None (root cause)"
        dn_text = "\n".join(f"  → {d['crisis']['title']} ({d['relationship']}, {d['strength']:.0%} strength)" for d in downstream) or "  None detected yet"
        pred_text = "\n".join(f"  ⚠ {p['title']} ({p['country']}) — risk {p['risk_score']:.0%} — via: {p['reason']}" for p in predictions[:4]) or "  None"

        prompt = f"""You are a senior global crisis analyst. Provide a strategic intelligence briefing on this crisis.

CRISIS: {focus_title}

UPSTREAM CAUSES:
{up_text}

DOWNSTREAM CONFIRMED EFFECTS:
{dn_text}

PREDICTED CASCADE RISKS:
{pred_text}

Write a 3-paragraph briefing:
1. Root cause analysis and current trajectory
2. Cross-border spillover effects already materializing
3. Key cascade risks to monitor in next 30–90 days

Be direct, specific, data-aware. Avoid vague language. Max 250 words."""
    else:
        prompt = f"""You are a senior global crisis analyst. Provide a global situation overview.

CURRENT GLOBAL CRISIS STATE:
{graph_summary}

Write a 3-paragraph executive briefing:
1. Most critical active crises and their interconnections
2. Key dependency chains driving second-order effects
3. Top 3 risks to watch in the next 90 days

Max 200 words. Be specific and direct."""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        return response.text
    except Exception as e:
        return f"[Briefing unavailable: {e}]"


async def generate_investigation_briefing(
    title: str, summary: str, key_findings: list[str],
    nodes_summary: list[dict], edge_count: int, recommendations: list[str],
) -> str:
    """Commander-ready narrative briefing for a full investigation result."""
    nodes_text = "\n".join(
        f"  • {n.get('title','')} ({n.get('type','')}, {n.get('country','')}) — {n.get('severity','')}"
        for n in nodes_summary[:20]
    )
    findings_text = "\n".join(f"  {i+1}. {f}" for i, f in enumerate(key_findings))
    rec_text      = "\n".join(f"  → {r}" for r in recommendations)

    prompt = f"""You are a senior crisis intelligence analyst preparing a commander-ready briefing.

INVESTIGATION: {title}
EXECUTIVE SUMMARY: {summary}

CRISIS NODES ({len(nodes_summary)} nodes, {edge_count} causal links):
{nodes_text}

KEY FINDINGS:
{findings_text}

RECOMMENDED ACTIONS:
{rec_text}

Write a 3-paragraph intelligence briefing:
Paragraph 1: The root causal chain — what triggered this and how it propagated. Specific actors, geographies, and timeframes.
Paragraph 2: Current cascading effects and resource pressures materializing right now.
Paragraph 3: The 2-3 most critical risks in the next 30-90 days and the single most important decision point.

Max 280 words. Direct, specific. No hedging. Write for a senior decision-maker with limited time."""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        return response.text
    except Exception as e:
        return f"[Briefing unavailable: {e}]"


async def run_whatif(
    scenario: str, investigation_title: str, investigation_summary: str,
    nodes: list[dict], edges: list[dict],
) -> dict:
    """Run a what-if scenario simulation on an existing investigation graph."""
    nodes_text = "\n".join(
        f"  [{n['id']}] {n['title']} ({n['type']}, {n['country']}, severity={n['severity']})"
        for n in nodes[:25]
    )
    edges_text = "\n".join(
        f"  {e['source_id']} --[{e['relationship']} {int(float(e.get('strength',0.5))*100)}%]--> {e['target_id']}"
        for e in edges[:30]
    )

    prompt = f"""You are a crisis scenario analyst running a what-if simulation.

CURRENT INVESTIGATION: {investigation_title}
CURRENT SUMMARY: {investigation_summary}

CURRENT CRISIS NODES:
{nodes_text}

CURRENT CAUSAL EDGES:
{edges_text}

WHAT-IF SCENARIO: "{scenario}"

Analyze how this scenario changes the crisis network. Return ONLY valid JSON:
{{
  "scenario_title": "Brief title for this what-if (max 8 words)",
  "outcome_summary": "2-3 sentence projection of the outcome under this scenario",
  "modified_nodes": [
    {{
      "id": "existing_node_id",
      "new_severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "delta": "escalates|de-escalates|unchanged",
      "reason": "Why this node changes under the scenario"
    }}
  ],
  "new_nodes": [
    {{
      "id": "snake_case_unique_id",
      "title": "New crisis or factor",
      "type": "WAR|CONFLICT|ECONOMIC|SUPPLY_CHAIN|NATURAL_DISASTER|HEALTH|POLITICAL|FOOD|ENERGY|CLIMATE|HUMANITARIAN",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "country": "Country/region",
      "lat": 0.0,
      "lon": 0.0,
      "description": "How this emerges under the scenario",
      "sectors_affected": ["ENERGY","FOOD"],
      "tags": ["projected"],
      "start_date": "2025-01-01"
    }}
  ],
  "new_edges": [
    {{
      "source_id": "id1",
      "target_id": "id2",
      "relationship": "CAUSES|WORSENS|DISRUPTS|TRIGGERS|CORRELATES",
      "strength": 0.7,
      "description": "Why this connection emerges",
      "lag_days": 30
    }}
  ],
  "key_changes": [
    "Most significant change 1 with specifics",
    "Key change 2",
    "Key change 3"
  ]
}}

Rules:
- Only modify nodes that genuinely change; leave others out of modified_nodes
- Max 4 new projected nodes; only what specifically emerges from this scenario
- Be realistic and evidence-based
- Return ONLY the JSON, no markdown"""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        return _loads(response.text)
    except Exception as e:
        return {
            "scenario_title": scenario[:60],
            "outcome_summary": f"Simulation failed: {e}",
            "modified_nodes": [], "new_nodes": [], "new_edges": [],
            "key_changes": [], "error": str(e),
        }


async def add_node_to_graph(
    description: str, existing_nodes: list[dict], existing_edges: list[dict],
) -> dict:
    """Create a new investigation node from a user description and connect it to the graph."""
    nodes_text = "\n".join(
        f"  [{n['id']}] {n['title']} ({n['type']}, {n['country']}, {n['severity']})"
        for n in existing_nodes[:30]
    )

    prompt = f"""You are a crisis intelligence analyst adding a new node to a crisis graph.

USER DESCRIPTION: "{description}"

EXISTING GRAPH NODES:
{nodes_text}

Create a new crisis node from the description and identify connections to existing nodes.
Return ONLY valid JSON:
{{
  "node": {{
    "id": "snake_case_unique_id",
    "title": "Crisis or factor title (concise)",
    "type": "WAR|CONFLICT|ECONOMIC|SUPPLY_CHAIN|NATURAL_DISASTER|HEALTH|POLITICAL|FOOD|ENERGY|CLIMATE|HUMANITARIAN",
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "country": "Country or region",
    "lat": 0.0,
    "lon": 0.0,
    "description": "2-3 sentence factual description",
    "sectors_affected": ["ENERGY","FOOD"],
    "tags": [],
    "start_date": "2025-01-01"
  }},
  "edges": [
    {{
      "source_id": "existing_or_new_node_id",
      "target_id": "existing_or_new_node_id",
      "relationship": "CAUSES|WORSENS|DISRUPTS|TRIGGERS|CORRELATES",
      "strength": 0.7,
      "description": "Why this connection exists",
      "lag_days": 30
    }}
  ]
}}

Rules:
- The new node id must not match any existing id (add _added suffix if needed)
- Only create edges where a genuine causal relationship exists
- If no connections fit, return empty edges array
- Edges can go from new→existing or existing→new
- Return ONLY the JSON, no markdown"""

    try:
        model = _get_model()
        response = await asyncio.wait_for(asyncio.to_thread(model.generate_content, prompt), timeout=180)
        result = _loads(response.text)
        # Guard against id collision
        if result.get("node"):
            existing_ids = {n["id"] for n in existing_nodes}
            nid = result["node"].get("id", "new_node")
            while nid in existing_ids:
                nid = nid + "_added"
            result["node"]["id"] = nid
        return result
    except Exception as e:
        return {"node": None, "edges": [], "error": str(e)}
