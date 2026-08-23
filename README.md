# ARIA — Adaptive Response Intelligence Architecture

> **Find the real truth behind crisis.**

A crisis intelligence platform that ingests live news, builds a causal chain graph of interconnected crises, and projects forward in time — turning fragmented information into an actionable reasoning network.

---

<img width="1920" height="955" alt="3" src="https://github.com/user-attachments/assets/b4743eff-caad-45e5-ba4b-3cec7538e26a" />


## What It Does

Most tools show you *what* is happening. ARIA shows you *why* it is happening and *where* it is heading.

Given a query like "Red Sea shipping crisis", ARIA:

1. Fetches live news from multiple feeds
2. Uses Gemini AI to extract crisis nodes, causal relationships, and confidence scores
3. Renders an interactive force-directed graph tracing root causes 4–5 hops back
4. Detects resource conflicts when multiple crises compete for the same sector
5. Projects cascade risks 30–90 days forward
6. Lets you run "what if" scenario simulations on the live graph

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript, D3.js, Tailwind CSS, Google Maps JS API |
| Backend | Python 3.11, FastAPI |
| AI | Gemini 2.5 Flash |
| Graph Engine | NetworkX |
| News | Google News RSS |

---



## Project Structure

```
├── backend/                  # FastAPI backend
│   ├── api/                  # Route handlers
│   ├── extraction/           # Gemini extraction pipeline
│   ├── graph/                # Knowledge graph engine
│   ├── scraper/              # RSS ingestion + scheduler
│   ├── main.py
│   └── requirements.txt
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/       # InvestigationGraph, GlobalMap, InvNodePanel
│   │   ├── api/              # API client
│   │   ├── App.tsx
│   │   └── types.ts
│   └── package.json
```

---

## Screenshots

<img width="1920" height="959" alt="6" src="https://github.com/user-attachments/assets/c1eb669e-4543-48f7-89e7-1effc00393ee" />

<img width="1920" height="955" alt="5" src="https://github.com/user-attachments/assets/9bef152c-2ae4-4cee-bc95-374b4bf11adf" />

<img width="1920" height="956" alt="4" src="https://github.com/user-attachments/assets/7ad11598-1c48-417f-9137-4e9a8233d69a" />


## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- A [Gemini API key](https://aistudio.google.com)
- A [Google Maps JavaScript API key](https://console.cloud.google.com)

### Backend

```bash
cd backend
cp .env.example .env
# Add your GEMINI_API_KEY to .env

pip install -r requirements.txt

# Run from project root
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_API_BASE and VITE_GOOGLE_MAPS_API_KEY

npm install
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:8000`.

---

## Deployment (Google Cloud Run)

Both services are containerized and deploy to Cloud Run with scale-to-zero (no cost when idle).

### Backend

```bash
# Build image
gcloud builds submit --config=cloudbuild-backend.yaml .

# Deploy
gcloud run deploy aria-backend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT/aria-repo/aria-backend:latest \
  --platform=managed --region=us-central1 --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=your_key" \
  --memory=1Gi --timeout=300
```

### Frontend

```bash
# Build image (bakes in API URL at build time)
gcloud builds submit --config=cloudbuild-frontend.yaml .

# Deploy
gcloud run deploy aria-frontend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT/aria-repo/aria-frontend:latest \
  --platform=managed --region=us-central1 --allow-unauthenticated \
  --memory=256Mi --port=8080
```

---

## Key Features

**Causal Chain Graph** — nodes are crises, edges are causal relationships with type, confidence score, and estimated lag in days. Chokepoints (straits, corridors, supply lines) are visually tagged.

**Resource Conflict Detection** — automatically surfaces when multiple HIGH/CRITICAL crises compete for the same scarce sector (food, energy, health, water).

**What-If Simulator** — type a hypothetical scenario, get a projected network showing which nodes escalate, de-escalate, or emerge as new factors.

**Intel Brief** — Gemini generates a commander-ready 3-paragraph narrative: root cause chain, active cascades, top risks in the next 30–90 days.

**Node Injection** — describe a new crisis factor in plain text; AI creates the node, finds causal connections, and injects it live into the graph.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE` | Backend API URL (e.g. `http://localhost:8000`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API key |
| `VITE_WS_URL` | WebSocket URL (optional) |

---

## Watch Demo

[Click here to watch the demo](https://drive.google.com/file/d/1j0pDzKA2jNL78P4p_bd8PwLiUDKNQT87/view?usp=sharing)
