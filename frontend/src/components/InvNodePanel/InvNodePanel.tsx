import { useState } from 'react'
import { api } from '../../api/client'
import type { InvestigationNode, InvestigationEdge } from '../../types'
import { CRISIS_COLOR, SEV_COLOR, REL_COLOR } from '../../types'

function Prose({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <div className={className}>
      {lines.map((line, li) => {
        if (!line.trim()) return <div key={li} className="h-2" />
        const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
        return (
          <span key={li}>
            {tokens.map((tok, ti) => {
              if (tok.startsWith('**') && tok.endsWith('**'))
                return <strong key={ti} className="font-semibold text-intel">{tok.slice(2, -2)}</strong>
              if (tok.startsWith('*') && tok.endsWith('*'))
                return <em key={ti} className="italic text-text/90">{tok.slice(1, -1)}</em>
              return <span key={ti}>{tok}</span>
            })}
            {li < lines.length - 1 && <br />}
          </span>
        )
      })}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-0.5 h-3 bg-intel shrink-0" />
      <div className="font-display text-[9px] tracking-[0.22em] text-dim/85 uppercase">{label}</div>
    </div>
  )
}

interface Props {
  node: InvestigationNode
  edges: InvestigationEdge[]
  allNodes: InvestigationNode[]
  onClose: () => void
}

export default function InvNodePanel({ node, edges, allNodes, onClose }: Props) {
  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)

  const upstreamEdges   = edges.filter(e => e.target_id === node.id)
  const downstreamEdges = edges.filter(e => e.source_id === node.id)

  const upstreamNodes = upstreamEdges
    .map(e => ({ node: allNodes.find(n => n.id === e.source_id), edge: e }))
    .filter((x): x is { node: InvestigationNode; edge: InvestigationEdge } => x.node !== undefined)

  const downstreamNodes = downstreamEdges
    .map(e => ({ node: allNodes.find(n => n.id === e.target_id), edge: e }))
    .filter((x): x is { node: InvestigationNode; edge: InvestigationEdge } => x.node !== undefined)

  const handleBriefing = async () => {
    setBriefingLoading(true)
    try {
      const res = await api.nodeBriefing(
        node.title, node.description, node.country, node.type,
        upstreamNodes.map(u => u.node.title),
        downstreamNodes.map(d => d.node.title),
      )
      setBriefing(res.briefing)
    } catch {
      setBriefing('[Briefing unavailable]')
    } finally {
      setBriefingLoading(false)
    }
  }

  const color       = CRISIS_COLOR[node.type]
  const sevColor    = SEV_COLOR[node.severity]
  const isChokepoint = node.tags.includes('chokepoint')

  return (
    <div className="flex flex-col h-full overflow-hidden panel-slide">

      {/* Header */}
      <div className="p-4 border-b border-border shrink-0" style={{ borderLeftColor: color, borderLeftWidth: '2px' }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            <span
              className="font-display font-semibold text-[9px] px-2 py-0.5 tracking-[0.12em] uppercase"
              style={{ background: color + '18', color, border: `1px solid ${color}40` }}>
              {node.type.replace(/_/g, ' ')}
            </span>
            <span
              className="font-display font-semibold text-[9px] px-2 py-0.5 tracking-[0.12em] uppercase"
              style={{ background: sevColor + '18', color: sevColor, border: `1px solid ${sevColor}40` }}>
              {node.severity}
            </span>
            {isChokepoint && (
              <span className="font-display font-semibold text-[9px] px-2 py-0.5 tracking-[0.12em] uppercase bg-yellow-900/25 text-yellow-400 border border-yellow-700/30">
                ◆ CHOKEPOINT
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="text-dim/60 hover:text-text text-xl leading-none shrink-0 transition-colors">×</button>
        </div>
        <h2 className="font-display font-bold text-text text-[17px] leading-snug tracking-wide">{node.title}</h2>
        <p className="text-dim/85 text-[11px] mt-1 tracking-wide">{node.country}</p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Description */}
        <p className="text-xs text-dim leading-relaxed">{node.description}</p>

        {/* Sectors */}
        {node.sectors_affected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.sectors_affected.map(s => (
              <span key={s} className="text-[9px] text-dim/80 border border-border2 px-2 py-0.5 font-display tracking-wider uppercase">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Start date */}
        {node.start_date && (
          <div className="text-[10px] text-dim/75">
            <span className="text-dim/55 mr-1">ONSET</span>
            <span className="text-text/80">{node.start_date}</span>
          </div>
        )}

        {/* Upstream causes */}
        {upstreamNodes.length > 0 && (
          <div>
            <SectionLabel label="Caused By" />
            <div className="space-y-2.5">
              {upstreamNodes.map(({ node: n, edge: e }) => (
                <div key={n.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 font-display font-semibold text-[8px] px-1.5 py-0.5 shrink-0 tracking-[0.1em] uppercase"
                    style={{ background: REL_COLOR[e.relationship] + '18', color: REL_COLOR[e.relationship], border: `1px solid ${REL_COLOR[e.relationship]}35` }}>
                    {e.relationship}
                  </span>
                  <div>
                    <div className="text-[11px] text-text font-medium leading-snug">{n.title}</div>
                    <div className="text-[10px] text-dim/75 mt-0.5">
                      {n.country} · <span className="text-intel/70">{Math.round(e.strength * 100)}%</span>
                      {e.lag_days > 0 && ` · ${e.lag_days}d lag`}
                    </div>
                    {e.description && (
                      <div className="text-[10px] text-dim/70 mt-0.5 italic leading-snug">{e.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Downstream effects */}
        {downstreamNodes.length > 0 && (
          <div>
            <SectionLabel label="Downstream Effects" />
            <div className="space-y-2.5">
              {downstreamNodes.map(({ node: n, edge: e }) => (
                <div key={n.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 font-display font-semibold text-[8px] px-1.5 py-0.5 shrink-0 tracking-[0.1em] uppercase"
                    style={{ background: REL_COLOR[e.relationship] + '18', color: REL_COLOR[e.relationship], border: `1px solid ${REL_COLOR[e.relationship]}35` }}>
                    {e.relationship}
                  </span>
                  <div>
                    <div className="text-[11px] text-text font-medium leading-snug">{n.title}</div>
                    <div className="text-[10px] text-dim/75 mt-0.5">
                      {n.country} · <span className="text-intel/70">{Math.round(e.strength * 100)}%</span>
                      {e.lag_days > 0 && ` · ${e.lag_days}d lag`}
                    </div>
                    {e.description && (
                      <div className="text-[10px] text-dim/70 mt-0.5 italic leading-snug">{e.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Briefing */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel label="AI Briefing" />
            {!briefing && (
              <button
                onClick={handleBriefing}
                disabled={briefingLoading}
                className="text-[10px] font-display text-intel border border-intel/25 px-2.5 py-0.5 tracking-[0.14em] hover:bg-intel/10 transition-colors disabled:opacity-25 mb-2.5">
                {briefingLoading ? 'GENERATING…' : '◎ GENERATE'}
              </button>
            )}
          </div>
          {briefing ? (
            <Prose text={briefing} className="text-xs text-dim leading-relaxed" />
          ) : (
            <p className="text-[11px] text-dim/70 italic leading-relaxed">
              Click Generate for an AI strategic briefing on this crisis node.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
