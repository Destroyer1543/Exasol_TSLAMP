
# ARIA - Adaptive Response Intelligence Architecture

ARIA is a crisis intelligence platform for tracing why a crisis is happening, how it propagates, and which second-order risks may emerge next.

The app ingests live news, uses an LLM (Groq) to extract crisis nodes and causal relationships, stores the intelligence graph in Exasol Personal, and renders an interactive graph/map for investigation and scenario simulation.

<img width="1920" height="955" alt="image" src="https://github.com/user-attachments/assets/1ef64b71-24db-457e-baf7-cd3b9a0e287f" />


## Problem

Crisis data is fragmented across news feeds, agencies, and regional reporting. Analysts often see isolated events, but not the causal chain behind them or the downstream dependencies they may trigger.

ARIA turns unstructured crisis reporting into a queryable intelligence graph:

- What are the root causes?
- Which chokepoints or sectors are affected?
- Which countries and sectors are accumulating risk?
- What happens if a scenario changes?

## Solution

Given a query such as `Red Sea shipping crisis`, ARIA:

1. Fetches recent live news from Google News RSS.
2. Sends article summaries and existing crisis context to the LLM (Groq).
3. Extracts structured crisis nodes, causal edges, confidence, severity, geography, and affected sectors.
4. Persists articles, investigations, nodes, and edges in Exasol Personal.
5. Uses Exasol SQL analytics to surface persisted counts, high-risk countries, strongest causal links, and recent investigations.
6. Uses NetworkX for in-memory graph traversal and D3/Google Maps for interactive exploration.
7. Supports what-if simulation and AI-assisted node injection.



## How Exasol Personal Is Used

Exasol Personal is the primary data platform for ARIA.

The backend initializes an `ARIA` schema in Exasol and stores:

- Seeded baseline crisis graph in `BASE_CRISIS_NODES` and `BASE_CRISIS_EDGES`
- RSS articles in `RSS_ARTICLES`
- User investigations in `INVESTIGATIONS`
- LLM-extracted investigation nodes in `CRISIS_NODES`
- LLM-extracted causal links in `CRISIS_EDGES`

ARIA then queries Exasol for analytics shown in the `EXASOL` tab:

- Persisted row counts
- Recently stored investigations
- High-risk country concentration
- Strongest causal relationships by edge strength

The app remains usable without Exasol credentials for local UI/backend development, but hackathon submission mode should run with `EXASOL_ENABLED=true`.

## Stack

| Layer | Technology |
| --- | --- |
| Data platform | Exasol Personal |
| Backend | Python 3.11+, FastAPI, PyExasol, NetworkX |
| AI | Groq (gpt-oss-120b, free tier) |
| News ingestion | Google News RSS |
| Frontend | React, TypeScript, Vite, D3.js, Tailwind CSS, Google Maps JS API |

## Project Structure

```text
backend/
  api/                 FastAPI route handlers
  extraction/          LLM extraction and scenario prompts
  graph/               NetworkX graph model, seed data, cascade scoring
  scraper/             RSS ingestion and scheduler
  storage/             Exasol Personal connector, schema, persistence, analytics
frontend/
  src/
    api/               Frontend API client
    components/        Graph, map, and node panels
    App.tsx            Main investigation UI
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- Groq API key (free tier — https://console.groq.com/keys)
- Google Maps JavaScript API key
- An Exasol database (see options below)

## Exasol Setup

ARIA speaks to Exasol over PyExasol (`host:port`, `sys` user, password), so any
Exasol deployment works. Pick one:

### Option A — Local Docker (free, Windows-friendly, used for dev/demo)

Requires Docker Desktop. From the repo root:

```bash
docker compose -f docker-compose.exasol.yml up -d
docker compose -f docker-compose.exasol.yml logs -f   # wait for init to finish
```

This runs a single-node Exasol at `127.0.0.1:8563` with credentials `sys` /
`exasol`. Tear down with `... down` (keep data) or `... down -v` (wipe).

### Option B — Exasol Personal (AWS / Azure)

Install Exasol Launcher, then deploy:

```bash
exasol install aws               # or: exasol install azure --location <region>
exasol info                      # host, port, credentials
```

New AWS/Azure accounts include free credits that cover a short demo window.
Use the host, port, and credentials from `exasol info` / `secrets.json` in
`backend/.env`.


## Backend Setup

```bash
cd backend
cp .env.example .env
```

Set (values below match Option A local Docker):

```env
GROQ_API_KEY=your_groq_key
LLM_MODEL=openai/gpt-oss-120b
EXASOL_ENABLED=true
EXASOL_DSN=127.0.0.1:8563
EXASOL_USER=sys
EXASOL_PASSWORD=exasol
EXASOL_SCHEMA=ARIA
EXASOL_ENCRYPTION=true
EXASOL_CERT_VERIFY=false
```

For Option B, set `EXASOL_DSN`/`EXASOL_PASSWORD` from `exasol info`.

Install dependencies:

```bash
pip install -r requirements.txt
```

Run from the repository root:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Useful backend checks:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/exasol/status
curl http://localhost:8000/api/exasol/analytics
```

## Frontend Setup

```bash
cd frontend
cp .env.example .env
```

Set:

```env
VITE_API_BASE=http://localhost:8000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
```

Install and run:

```bash
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Demo Flow

1. Start Exasol Personal and the backend.
2. Open the frontend.
3. Run an investigation such as `Red Sea shipping crisis`.
4. Show the generated causal graph.
5. Open the `EXASOL` tab to show the persisted investigation ID, row counts, recent investigations, and SQL-backed analytics.
6. Run a what-if scenario such as `What if the Strait of Hormuz closes?`

## Submission Materials

For final submission, this repository should include:

- Source code
- This README with setup and run guide
- Pitch deck PDF/PPT
- Demo video link, maximum 3 minutes
- Sample data, screenshots, and configuration notes as needed

Suggested final additions:

- `docs/pitch-deck.pdf`
- `docs/screenshots/`
- Demo video link in this README

## Verification

Current local checks:

```bash
python -m compileall backend
cd frontend && npm run build
```

## Pitch Deck

https://docs.google.com/presentation/d/1S_1_mn_YYqpgdWEbKRh_bbB_WNLiDPMw/edit?usp=sharing&ouid=107819819750313925051&rtpof=true&sd=true

## Demo Video

https://drive.google.com/file/d/1jli28A_dMxeY3-lCXZ51iZGtnTrTej20/view?usp=drive_link

<img width="1920" height="956" alt="image" src="https://github.com/user-attachments/assets/eeeba617-e3b0-4d20-84cc-315ff36c9861" />
<img width="1920" height="955" alt="image" src="https://github.com/user-attachments/assets/9659091e-df11-4a39-b7d0-d5a016ac4ee5" />
<img width="1920" height="959" alt="image" src="https://github.com/user-attachments/assets/8db8fe93-82e8-44ed-8d0d-561a957ec1ab" />
