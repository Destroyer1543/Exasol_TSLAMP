"""Exasol Personal persistence and analytics for ARIA.

The app still builds its live working graph with NetworkX, but Exasol is the
primary data platform: seeded graph data, fetched articles, and AI-generated
investigations are persisted here and queried back for analytics.
"""

from __future__ import annotations

import os
import re
import ssl
import uuid
from datetime import datetime
from typing import Any

from ..graph.knowledge_graph import CrisisKnowledgeGraph


_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TRUE_VALUES = {"1", "true", "yes", "on"}
_TABLES = {
    "base_nodes": "BASE_CRISIS_NODES",
    "base_edges": "BASE_CRISIS_EDGES",
    "articles": "RSS_ARTICLES",
    "investigations": "INVESTIGATIONS",
    "nodes": "CRISIS_NODES",
    "edges": "CRISIS_EDGES",
}


def _enabled_by_env() -> bool:
    explicit = os.environ.get("EXASOL_ENABLED")
    if explicit is not None:
        return explicit.strip().lower() in _TRUE_VALUES
    return all(os.environ.get(k) for k in ("EXASOL_DSN", "EXASOL_USER", "EXASOL_PASSWORD"))


def _schema() -> str:
    schema = os.environ.get("EXASOL_SCHEMA", "ARIA").strip() or "ARIA"
    if not _IDENTIFIER.match(schema):
        raise RuntimeError("EXASOL_SCHEMA must be a simple SQL identifier")
    return schema.upper()


def _table(name: str) -> tuple[str, str]:
    return (_schema(), _TABLES[name])


def is_exasol_enabled() -> bool:
    return _enabled_by_env()


def _connect(open_schema: bool = False):
    try:
        import pyexasol
    except ImportError as exc:
        raise RuntimeError("pyexasol is not installed. Run `pip install -r backend/requirements.txt`.") from exc

    dsn = os.environ.get("EXASOL_DSN")
    user = os.environ.get("EXASOL_USER")
    password = os.environ.get("EXASOL_PASSWORD")
    if not dsn or not user or not password:
        raise RuntimeError("Set EXASOL_DSN, EXASOL_USER, and EXASOL_PASSWORD")

    encryption = os.environ.get("EXASOL_ENCRYPTION", "true").strip().lower() in _TRUE_VALUES
    verify_cert = os.environ.get("EXASOL_CERT_VERIFY", "false").strip().lower() in _TRUE_VALUES
    kwargs: dict[str, Any] = {
        "dsn": dsn,
        "user": user,
        "password": password,
        "compression": True,
        "encryption": encryption,
    }
    if encryption and not verify_cert:
        kwargs["websocket_sslopt"] = {"cert_reqs": ssl.CERT_NONE}

    con = pyexasol.connect(**kwargs)
    if open_schema:
        con.execute("OPEN SCHEMA {schema!i}", {"schema": _schema()})
    return con


def _ignore_existing(exc: Exception) -> bool:
    message = str(exc).lower()
    return "already exists" in message or "object exists" in message


def _exec_ddl(con, sql: str, params: dict[str, Any] | None = None) -> None:
    try:
        con.execute(sql, params or {})
    except Exception as exc:
        if not _ignore_existing(exc):
            raise


def initialize_schema() -> dict[str, Any]:
    if not is_exasol_enabled():
        return {"enabled": False, "connected": False, "message": "Exasol disabled"}

    schema = _schema()
    con = _connect(open_schema=False)
    try:
        _exec_ddl(con, "CREATE SCHEMA {schema!i}", {"schema": schema})
        con.execute("OPEN SCHEMA {schema!i}", {"schema": schema})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                NODE_ID VARCHAR(200) NOT NULL,
                TITLE VARCHAR(500),
                TYPE VARCHAR(100),
                SEVERITY VARCHAR(50),
                COUNTRY VARCHAR(200),
                LAT DOUBLE,
                LON DOUBLE,
                DESCRIPTION VARCHAR(10000),
                SECTORS VARCHAR(2000),
                TAGS VARCHAR(2000),
                START_DATE VARCHAR(50),
                SOURCE_URLS VARCHAR(10000),
                IS_PREDICTED VARCHAR(10),
                CONFIDENCE DOUBLE,
                LOADED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("base_nodes")})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                EDGE_ID VARCHAR(200) NOT NULL,
                SOURCE_ID VARCHAR(200),
                TARGET_ID VARCHAR(200),
                RELATIONSHIP VARCHAR(100),
                STRENGTH DOUBLE,
                DESCRIPTION VARCHAR(10000),
                LAG_DAYS DECIMAL(18,0),
                LOADED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("base_edges")})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                ARTICLE_ID VARCHAR(200) NOT NULL,
                INVESTIGATION_ID VARCHAR(200),
                QUERY VARCHAR(500),
                TITLE VARCHAR(2000),
                DESCRIPTION VARCHAR(10000),
                URL VARCHAR(2000),
                "SOURCE" VARCHAR(200),
                FETCHED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("articles")})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                INVESTIGATION_ID VARCHAR(200) NOT NULL,
                QUERY VARCHAR(500),
                TITLE VARCHAR(500),
                SUMMARY VARCHAR(20000),
                KEY_FINDINGS VARCHAR(20000),
                RECOMMENDATIONS VARCHAR(20000),
                ARTICLES_ANALYZED DECIMAL(18,0),
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("investigations")})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                INVESTIGATION_ID VARCHAR(200) NOT NULL,
                NODE_ID VARCHAR(200) NOT NULL,
                TITLE VARCHAR(500),
                TYPE VARCHAR(100),
                SEVERITY VARCHAR(50),
                COUNTRY VARCHAR(200),
                LAT DOUBLE,
                LON DOUBLE,
                DESCRIPTION VARCHAR(10000),
                SECTORS VARCHAR(2000),
                TAGS VARCHAR(2000),
                START_DATE VARCHAR(50),
                LOADED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("nodes")})

        _exec_ddl(con, """
            CREATE TABLE {table!i} (
                INVESTIGATION_ID VARCHAR(200) NOT NULL,
                SOURCE_ID VARCHAR(200),
                TARGET_ID VARCHAR(200),
                RELATIONSHIP VARCHAR(100),
                STRENGTH DOUBLE,
                LAG_DAYS DECIMAL(18,0),
                DESCRIPTION VARCHAR(10000),
                LOADED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, {"table": _table("edges")})

        return {"enabled": True, "connected": True, "schema": schema, "message": "Exasol schema ready"}
    finally:
        con.close()


def _csv(values: list[Any] | None) -> str:
    return ",".join(str(v) for v in values or [])


def _clip(value: Any, limit: int) -> str:
    if value is None:
        return ""
    return str(value)[:limit]


def sync_base_graph(graph: CrisisKnowledgeGraph) -> dict[str, Any]:
    if not is_exasol_enabled():
        return {"stored": False, "message": "Exasol disabled"}

    initialize_schema()
    con = _connect(open_schema=True)
    try:
        con.execute("DELETE FROM {table!i}", {"table": _table("base_edges")})
        con.execute("DELETE FROM {table!i}", {"table": _table("base_nodes")})

        for node in graph.nodes.values():
            con.execute("""
                INSERT INTO {table!i} (
                    NODE_ID, TITLE, TYPE, SEVERITY, COUNTRY, LAT, LON, DESCRIPTION,
                    SECTORS, TAGS, START_DATE, SOURCE_URLS, IS_PREDICTED, CONFIDENCE
                ) VALUES (
                    {node_id}, {title}, {type}, {severity}, {country}, {lat!f}, {lon!f},
                    {description}, {sectors}, {tags}, {start_date}, {source_urls},
                    {is_predicted}, {confidence!f}
                )
            """, {
                "table": _table("base_nodes"),
                "node_id": node.id,
                "title": _clip(node.title, 500),
                "type": node.type.value,
                "severity": node.severity.value,
                "country": _clip(node.country, 200),
                "lat": node.lat,
                "lon": node.lon,
                "description": _clip(node.description, 10000),
                "sectors": _clip(_csv(node.sectors_affected), 2000),
                "tags": _clip(_csv(node.tags), 2000),
                "start_date": _clip(node.start_date, 50),
                "source_urls": _clip(_csv(node.source_urls), 10000),
                "is_predicted": "true" if node.is_predicted else "false",
                "confidence": node.confidence,
            })

        for edge in graph.edges.values():
            con.execute("""
                INSERT INTO {table!i} (
                    EDGE_ID, SOURCE_ID, TARGET_ID, RELATIONSHIP, STRENGTH, DESCRIPTION, LAG_DAYS
                ) VALUES (
                    {edge_id}, {source_id}, {target_id}, {relationship}, {strength!f}, {description}, {lag_days!d}
                )
            """, {
                "table": _table("base_edges"),
                "edge_id": edge.id,
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "relationship": edge.relationship.value,
                "strength": edge.strength,
                "description": _clip(edge.description, 10000),
                "lag_days": edge.lag_days,
            })

        return {"stored": True, "nodes": len(graph.nodes), "edges": len(graph.edges)}
    finally:
        con.close()


def save_investigation(query: str, result: dict[str, Any], articles: list[dict[str, Any]]) -> dict[str, Any]:
    if not is_exasol_enabled():
        return {"stored": False, "message": "Exasol disabled"}

    initialize_schema()
    investigation_id = f"inv_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    con = _connect(open_schema=True)
    try:
        con.execute("""
            INSERT INTO {table!i} (
                INVESTIGATION_ID, QUERY, TITLE, SUMMARY, KEY_FINDINGS, RECOMMENDATIONS, ARTICLES_ANALYZED
            ) VALUES (
                {investigation_id}, {query}, {title}, {summary}, {key_findings},
                {recommendations}, {articles_analyzed!d}
            )
        """, {
            "table": _table("investigations"),
            "investigation_id": investigation_id,
            "query": _clip(query, 500),
            "title": _clip(result.get("title", ""), 500),
            "summary": _clip(result.get("summary", ""), 20000),
            "key_findings": _clip("\n".join(result.get("key_findings", [])), 20000),
            "recommendations": _clip("\n".join(result.get("recommendations", [])), 20000),
            "articles_analyzed": int(result.get("articles_analyzed", len(articles)) or 0),
        })

        for article in articles:
            con.execute("""
                INSERT INTO {table!i} (
                    ARTICLE_ID, INVESTIGATION_ID, QUERY, TITLE, DESCRIPTION, URL, "SOURCE"
                ) VALUES (
                    {article_id}, {investigation_id}, {query}, {title}, {description}, {url}, {source}
                )
            """, {
                "table": _table("articles"),
                "article_id": f"art_{uuid.uuid4().hex}",
                "investigation_id": investigation_id,
                "query": _clip(query, 500),
                "title": _clip(article.get("title", ""), 2000),
                "description": _clip(article.get("description", ""), 10000),
                "url": _clip(article.get("url", ""), 2000),
                "source": _clip(article.get("source", ""), 200),
            })

        for node in result.get("nodes", []) or []:
            con.execute("""
                INSERT INTO {table!i} (
                    INVESTIGATION_ID, NODE_ID, TITLE, TYPE, SEVERITY, COUNTRY, LAT, LON,
                    DESCRIPTION, SECTORS, TAGS, START_DATE
                ) VALUES (
                    {investigation_id}, {node_id}, {title}, {type}, {severity}, {country},
                    {lat!f}, {lon!f}, {description}, {sectors}, {tags}, {start_date}
                )
            """, {
                "table": _table("nodes"),
                "investigation_id": investigation_id,
                "node_id": _clip(node.get("id", ""), 200),
                "title": _clip(node.get("title", ""), 500),
                "type": _clip(node.get("type", ""), 100),
                "severity": _clip(node.get("severity", ""), 50),
                "country": _clip(node.get("country", ""), 200),
                "lat": float(node.get("lat", 0) or 0),
                "lon": float(node.get("lon", 0) or 0),
                "description": _clip(node.get("description", ""), 10000),
                "sectors": _clip(_csv(node.get("sectors_affected", [])), 2000),
                "tags": _clip(_csv(node.get("tags", [])), 2000),
                "start_date": _clip(node.get("start_date", ""), 50),
            })

        for edge in result.get("edges", []) or []:
            con.execute("""
                INSERT INTO {table!i} (
                    INVESTIGATION_ID, SOURCE_ID, TARGET_ID, RELATIONSHIP, STRENGTH, LAG_DAYS, DESCRIPTION
                ) VALUES (
                    {investigation_id}, {source_id}, {target_id}, {relationship},
                    {strength!f}, {lag_days!d}, {description}
                )
            """, {
                "table": _table("edges"),
                "investigation_id": investigation_id,
                "source_id": _clip(edge.get("source_id", ""), 200),
                "target_id": _clip(edge.get("target_id", ""), 200),
                "relationship": _clip(edge.get("relationship", ""), 100),
                "strength": float(edge.get("strength", 0) or 0),
                "lag_days": int(edge.get("lag_days", 0) or 0),
                "description": _clip(edge.get("description", ""), 10000),
            })

        return {
            "stored": True,
            "investigation_id": investigation_id,
            "articles": len(articles),
            "nodes": len(result.get("nodes", []) or []),
            "edges": len(result.get("edges", []) or []),
        }
    finally:
        con.close()


def _scalar(con, sql: str, table_name: str) -> int:
    stmt = con.execute(sql, {"table": _table(table_name)})
    row = stmt.fetchone()
    return int(row[0] or 0) if row else 0


def get_status() -> dict[str, Any]:
    if not is_exasol_enabled():
        return {
            "enabled": False,
            "connected": False,
            "schema": _schema(),
            "message": "Set EXASOL_ENABLED=true and EXASOL_DSN/USER/PASSWORD",
            "counts": {},
        }

    try:
        initialize_schema()
        con = _connect(open_schema=True)
        try:
            con.execute("SELECT 1 FROM DUAL")
            counts = {
                "base_nodes": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "base_nodes"),
                "base_edges": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "base_edges"),
                "investigations": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "investigations"),
                "articles": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "articles"),
                "nodes": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "nodes"),
                "edges": _scalar(con, "SELECT COUNT(*) FROM {table!i}", "edges"),
            }
            return {
                "enabled": True,
                "connected": True,
                "schema": _schema(),
                "message": "Connected to Exasol Personal",
                "counts": counts,
            }
        finally:
            con.close()
    except Exception as exc:
        return {
            "enabled": True,
            "connected": False,
            "schema": _schema(),
            "message": str(exc),
            "counts": {},
        }


def _rows(stmt) -> list[dict[str, Any]]:
    columns = [str(name).lower() for name in stmt.columns().keys()]
    return [dict(zip(columns, row)) for row in stmt.fetchall()]


def get_analytics() -> dict[str, Any]:
    if not is_exasol_enabled():
        return {"enabled": False, "connected": False, "message": "Exasol disabled"}

    initialize_schema()
    con = _connect(open_schema=True)
    try:
        top_countries = _rows(con.execute("""
            SELECT COUNTRY, COUNT(*) AS CRISIS_COUNT
            FROM {nodes!i}
            WHERE SEVERITY IN ('HIGH', 'CRITICAL')
            GROUP BY COUNTRY
            ORDER BY CRISIS_COUNT DESC
            LIMIT 8
        """, {"nodes": _table("nodes")}))

        severity_mix = _rows(con.execute("""
            SELECT SEVERITY, COUNT(*) AS CRISIS_COUNT
            FROM {nodes!i}
            GROUP BY SEVERITY
            ORDER BY CRISIS_COUNT DESC
        """, {"nodes": _table("nodes")}))

        strongest_edges = _rows(con.execute("""
            SELECT SOURCE_ID, TARGET_ID, RELATIONSHIP, STRENGTH, LAG_DAYS
            FROM {edges!i}
            ORDER BY STRENGTH DESC
            LIMIT 10
        """, {"edges": _table("edges")}))

        recent_investigations = _rows(con.execute("""
            SELECT INVESTIGATION_ID, QUERY, TITLE, ARTICLES_ANALYZED, CREATED_AT
            FROM {investigations!i}
            ORDER BY CREATED_AT DESC
            LIMIT 8
        """, {"investigations": _table("investigations")}))

        return {
            "enabled": True,
            "connected": True,
            "schema": _schema(),
            "top_countries": top_countries,
            "severity_mix": severity_mix,
            "strongest_edges": strongest_edges,
            "recent_investigations": recent_investigations,
        }
    finally:
        con.close()
