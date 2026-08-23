"""
NEXUS Backend — Global Crisis Intelligence API
"""

import os
import logging
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .graph.knowledge_graph import get_graph
from .graph.seeder import seed
from .scraper.scheduler import start_scheduler, stop_scheduler
from .api.routes import router

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("nexus")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: seed graph + start hourly scraper
    log.info("Seeding knowledge graph with current global crises...")
    seed(get_graph())
    g = get_graph()
    log.info(f"Graph ready: {len(g.nodes)} crises, {len(g.edges)} relationships")
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="NEXUS — Global Crisis Intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
async def health():
    g = get_graph()
    return {"status": "ok", "crises": len(g.nodes), "relationships": len(g.edges)}
