export type CrisisType =
  | 'WAR' | 'CONFLICT' | 'ECONOMIC' | 'SUPPLY_CHAIN'
  | 'NATURAL_DISASTER' | 'HEALTH' | 'POLITICAL' | 'FOOD'
  | 'ENERGY' | 'CLIMATE' | 'HUMANITARIAN'

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MONITORING'

export type RelationshipType = 'CAUSES' | 'WORSENS' | 'DISRUPTS' | 'TRIGGERS' | 'CORRELATES' | 'MITIGATES'

export interface Crisis {
  id: string
  title: string
  type: CrisisType
  severity: Severity
  lat: number
  lon: number
  country: string
  description: string
  sectors_affected: string[]
  start_date: string
  last_updated: string
  source_urls: string[]
  tags: string[]
  is_predicted: boolean
  confidence: number
}

export interface Relationship {
  id: string
  source_id: string
  target_id: string
  relationship: RelationshipType
  strength: number
  description: string
  lag_days: number
}

export interface GraphData {
  nodes: Crisis[]
  edges: Relationship[]
  stats: {
    total_crises: number
    total_relationships: number
    critical_count: number
    predicted_count: number
  }
}

export interface ChainEntry {
  crisis: Crisis
  relationship: RelationshipType
  strength: number
}

export interface CrisisDetail {
  crisis: Crisis
  upstream: ChainEntry[]
  downstream: ChainEntry[]
}

export interface Prediction {
  crisis_id: string
  title: string
  country: string
  crisis_type: CrisisType
  current_severity: Severity
  risk_score: number
  reason: string
  via_path: string[]
  lag_days_estimate: number
}

export interface StoryStep {
  id: string
  title: string
  country: string
  severity: Severity
  type: CrisisType
  next_relationship?: RelationshipType
  next_strength?: number
  next_lag_days?: number
}

export interface StoryPath {
  path_strength: number
  total_lag_days: number
  steps: StoryStep[]
}

export interface CrisisStory {
  upstream_stories: StoryPath[]
  downstream_stories: StoryPath[]
}

export interface InvestigationNode {
  id: string
  title: string
  type: CrisisType
  severity: Severity
  country: string
  lat: number
  lon: number
  description: string
  sectors_affected: string[]
  tags: string[]
  start_date: string
}

export interface InvestigationEdge {
  source_id: string
  target_id: string
  relationship: RelationshipType
  strength: number
  description: string
  lag_days: number
}

export interface InvestigationResult {
  title: string
  summary: string
  key_findings: string[]
  nodes: InvestigationNode[]
  edges: InvestigationEdge[]
  recommendations: string[]
  articles_analyzed: number
  exasol?: {
    stored: boolean
    investigation_id?: string
    articles?: number
    nodes?: number
    edges?: number
    message?: string
    error?: string
  }
  error?: string
}

// ── Color maps ────────────────────────────────────────────────────────────────

export const CRISIS_COLOR: Record<CrisisType, string> = {
  WAR:             '#f85149',
  CONFLICT:        '#ff9f7e',
  ECONOMIC:        '#d29922',
  SUPPLY_CHAIN:    '#a371f7',
  NATURAL_DISASTER:'#39c5cf',
  HEALTH:          '#3fb950',
  POLITICAL:       '#f0883e',
  FOOD:            '#7ee787',
  ENERGY:          '#ffa657',
  CLIMATE:         '#79c0ff',
  HUMANITARIAN:    '#ff7b72',
}

export const SEV_COLOR: Record<Severity, string> = {
  CRITICAL:   '#f85149',
  HIGH:       '#f0883e',
  MEDIUM:     '#d29922',
  LOW:        '#3fb950',
  MONITORING: '#7d8590',
}

export const SEV_RADIUS: Record<Severity, number> = {
  CRITICAL:   28,
  HIGH:       22,
  MEDIUM:     17,
  LOW:        13,
  MONITORING: 10,
}

export interface WhatIfNodeChange {
  id: string
  new_severity: Severity
  delta: 'escalates' | 'de-escalates' | 'unchanged'
  reason: string
}

export interface WhatIfResult {
  scenario_title: string
  outcome_summary: string
  modified_nodes: WhatIfNodeChange[]
  new_nodes: InvestigationNode[]
  new_edges: InvestigationEdge[]
  key_changes: string[]
  error?: string
}

export interface ExasolStatus {
  enabled: boolean
  connected: boolean
  schema: string
  message: string
  counts: Record<string, number>
}

export interface ExasolAnalytics {
  enabled: boolean
  connected: boolean
  schema?: string
  message?: string
  top_countries?: { country: string; crisis_count: number }[]
  severity_mix?: { severity: Severity; crisis_count: number }[]
  strongest_edges?: {
    source_id: string
    target_id: string
    relationship: RelationshipType
    strength: number
    lag_days: number
  }[]
  recent_investigations?: {
    investigation_id: string
    query: string
    title: string
    articles_analyzed: number
    created_at: string
  }[]
}

export const REL_COLOR: Record<RelationshipType, string> = {
  CAUSES:    '#f85149',
  WORSENS:   '#f0883e',
  DISRUPTS:  '#a371f7',
  TRIGGERS:  '#d29922',
  CORRELATES:'#4b5563',
  MITIGATES: '#3fb950',
}
