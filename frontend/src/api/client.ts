import type { GraphData, CrisisDetail, Prediction, InvestigationResult, CrisisStory, WhatIfResult, InvestigationNode, InvestigationEdge } from '../types'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export const api = {
  graph:       ()          => get<GraphData>('/api/graph'),
  crisis:      (id: string) => get<CrisisDetail>(`/api/crisis/${id}`),
  predictions: (id: string) => get<{ predictions: Prediction[] }>(`/api/crisis/${id}/predictions`),
  briefing:    (id?: string) => post<{ briefing: string }>('/api/briefing', { focus_id: id ?? null }),
  stats:       ()           => get<Record<string, unknown>>('/api/stats'),
  scrape:      ()           => post('/api/scrape/trigger', {}),
  investigate: (query: string, deep = false) => post<InvestigationResult>('/api/investigate', { query, deep }),
  nodeBriefing: (title: string, description: string, country: string, crisis_type: string, upstream_titles: string[], downstream_titles: string[]) =>
    post<{ briefing: string }>('/api/briefing/node', { title, description, country, crisis_type, upstream_titles, downstream_titles }),
  story:       (id: string)    => get<CrisisStory>(`/api/crisis/${id}/story`),

  investigationBriefing: (
    title: string, summary: string, key_findings: string[],
    nodes: { title: string; type: string; severity: string; country: string }[],
    edge_count: number, recommendations: string[],
  ) => post<{ briefing: string }>('/api/briefing/investigation', {
    title, summary, key_findings, nodes, edge_count, recommendations,
  }),

  whatif: (
    scenario: string, investigation_title: string, investigation_summary: string,
    nodes: object[], edges: object[],
  ) => post<WhatIfResult>('/api/whatif', {
    scenario, investigation_title, investigation_summary, nodes, edges,
  }),

  addNode: (
    description: string, current_nodes: object[], current_edges: object[],
  ) => post<{ node: InvestigationNode | null; edges: InvestigationEdge[]; error?: string }>(
    '/api/graph/add-node', { description, current_nodes, current_edges },
  ),
}
