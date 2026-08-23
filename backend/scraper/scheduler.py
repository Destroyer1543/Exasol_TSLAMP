"""
Hourly scrape + extraction + graph update job.
"""

import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime

from .rss_client import fetch_articles
from ..extraction.gemini_extractor import extract_from_articles
from ..graph.knowledge_graph import get_graph, CrisisNode, CrisisEdge
from ..extraction.crisis_types import CrisisType, Severity, RelationshipType
from ..storage.exasol_client import is_exasol_enabled, sync_base_graph

log = logging.getLogger("nexus.scheduler")

_scheduler = AsyncIOScheduler()
_last_scrape: dict = {"time": None, "articles_found": 0, "new_crises": 0}


async def run_scrape_cycle():
    global _last_scrape
    log.info("Starting scrape cycle...")
    graph = get_graph()

    try:
        articles = await fetch_articles(max_per_feed=10)
        log.info(f"Fetched {len(articles)} articles")

        if not articles:
            _last_scrape = {"time": datetime.utcnow().isoformat(), "articles_found": 0, "new_crises": 0}
            return

        article_dicts = [{"title": a.title, "description": a.description, "source": a.source, "url": a.url} for a in articles]
        result = await extract_from_articles(article_dicts)

        new_crises_count = 0
        for crisis_data in result.get("new_crises", []):
            try:
                node = CrisisNode(
                    id=crisis_data["id"],
                    title=crisis_data["title"],
                    type=CrisisType(crisis_data.get("type", "CONFLICT")),
                    severity=Severity(crisis_data.get("severity", "MEDIUM")),
                    lat=float(crisis_data.get("lat", 0)),
                    lon=float(crisis_data.get("lon", 0)),
                    country=crisis_data.get("country", "Unknown"),
                    description=crisis_data.get("description", ""),
                    sectors_affected=crisis_data.get("sectors_affected", []),
                    source_urls=crisis_data.get("source_urls", []),
                    tags=crisis_data.get("tags", []),
                )
                if node.id not in graph.nodes:
                    graph.add_crisis(node)
                    new_crises_count += 1
                    log.info(f"Added new crisis: {node.title}")
            except Exception as ex:
                log.warning(f"Failed to add crisis {crisis_data.get('id')}: {ex}")

        for rel_data in result.get("new_relationships", []):
            try:
                src = rel_data.get("source_id", "")
                tgt = rel_data.get("target_id", "")
                if src in graph.nodes and tgt in graph.nodes:
                    edge = CrisisEdge(
                        id=f"scraped_{src}_{tgt}",
                        source_id=src, target_id=tgt,
                        relationship=RelationshipType(rel_data.get("relationship", "CORRELATES")),
                        strength=float(rel_data.get("strength", 0.5)),
                        description=rel_data.get("description", ""),
                        lag_days=int(rel_data.get("lag_days", 30)),
                    )
                    if edge.id not in graph.edges:
                        graph.add_relationship(edge)
            except Exception as ex:
                log.warning(f"Failed to add relationship: {ex}")

        for update in result.get("updates", []):
            crisis_id = update.get("id")
            if crisis_id and crisis_id in graph.nodes:
                kwargs = {}
                if "severity" in update:
                    kwargs["severity"] = Severity(update["severity"])
                if "description" in update:
                    kwargs["description"] = update["description"]
                if kwargs:
                    graph.update_crisis(crisis_id, **kwargs)

        _last_scrape = {
            "time": datetime.utcnow().isoformat(),
            "articles_found": len(articles),
            "new_crises": new_crises_count,
        }
        if is_exasol_enabled():
            await asyncio.to_thread(sync_base_graph, graph)
        log.info(f"Scrape complete: {new_crises_count} new crises added")

    except Exception as e:
        log.error(f"Scrape cycle failed: {e}")
        _last_scrape = {"time": datetime.utcnow().isoformat(), "articles_found": 0, "new_crises": 0, "error": str(e)}


def get_last_scrape() -> dict:
    return _last_scrape


def start_scheduler():
    _scheduler.add_job(run_scrape_cycle, "interval", hours=1, id="scrape_cycle", replace_existing=True)
    _scheduler.start()
    log.info("Hourly scrape scheduler started")


def stop_scheduler():
    _scheduler.shutdown(wait=False)
