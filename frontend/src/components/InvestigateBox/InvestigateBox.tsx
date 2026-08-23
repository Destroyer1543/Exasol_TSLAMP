import { useState, useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { api } from '../../api/client'
import type { InvestigationResult, InvestigationNode, InvestigationEdge } from '../../types'
import { CRISIS_COLOR, SEV_COLOR, REL_COLOR, SEV_RADIUS } from '../../types'

type SimNode = InvestigationNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }
type SimLink = InvestigationEdge & { source: string | SimNode; target: string | SimNode }

const EXAMPLES = [
  'petroleum shortage due to war',
  'food crisis from shipping disruption',
  'energy prices causing inflation',
  'Taiwan semiconductor supply risk',
]

export default function InvestigateBox() {
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<InvestigationResult | null>(null)
  const [error, setError]     = useState('')
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const submit = async (q?: string) => {
    const text = (q ?? query).trim()
    if (!text) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.investigate(text)
      if (res.error && res.nodes.length === 0) setError(res.error)
      else setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Draw D3 graph
  useEffect(() => {
    if (!result || !svgRef.current || !wrapRef.current || result.nodes.length === 0) return

    const W = wrapRef.current.clientWidth  || 600
    const H = wrapRef.current.clientHeight || 500

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    // Defs: arrows + glow
    const defs = svg.append('defs')
    const relTypes = ['CAUSES','WORSENS','DISRUPTS','TRIGGERS','CORRELATES','MITIGATES'] as const
    relTypes.forEach(rel => {
      defs.append('marker')
        .attr('id', `inv-arrow-${rel}`)
        .attr('viewBox', '0 -4 10 8').attr('refX', 20).attr('refY', 0)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', REL_COLOR[rel] ?? '#4b5563')
    })

    const simNodes: SimNode[] = result.nodes.map(n => ({ ...n }))
    const nodeById = new Map(simNodes.map(n => [n.id, n]))

    const simLinks: SimLink[] = result.edges
      .map(e => ({ ...e, source: nodeById.get(e.source_id) ?? e.source_id, target: nodeById.get(e.target_id) ?? e.target_id }))
      .filter(e => e.source && e.target)

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link',      d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(180).strength(0.4))
      .force('charge',    d3.forceManyBody().strength(-600))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => (SEV_RADIUS[d.severity] ?? 18) + 55))

    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', e => g.attr('transform', e.transform)))

    // Links
    const link = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', d => REL_COLOR[d.relationship as keyof typeof REL_COLOR] ?? '#4b5563')
      .attr('stroke-width', d => 1.5 + d.strength * 2.5)
      .attr('stroke-opacity', 0.65)
      .attr('stroke-dasharray', '7 4')
      .attr('marker-end', d => `url(#inv-arrow-${d.relationship})`)

    // Edge relationship labels
    const edgeLabel = g.append('g')
      .selectAll<SVGGElement, SimLink>('g')
      .data(simLinks)
      .join('g')

    edgeLabel.append('rect')
      .attr('fill', '#0d1117').attr('opacity', 0.85).attr('rx', 3)
      .attr('width', 56).attr('height', 13).attr('x', -28).attr('y', -10)

    edgeLabel.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', '8px').attr('font-weight', '700')
      .attr('fill', d => REL_COLOR[d.relationship as keyof typeof REL_COLOR] ?? '#4b5563')
      .attr('pointer-events', 'none')
      .text(d => d.relationship)

    // Nodes
    const nodeG = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y })
        .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    // Outer ring for CRITICAL/HIGH
    nodeG.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH')
      .append('circle')
      .attr('r', d => (SEV_RADIUS[d.severity] ?? 18) + 7)
      .attr('fill', 'none')
      .attr('stroke', d => CRISIS_COLOR[d.type] ?? '#4b5563')
      .attr('stroke-width', 1)
      .attr('opacity', 0.2)

    // Main circle
    nodeG.append('circle')
      .attr('r', d => SEV_RADIUS[d.severity] ?? 18)
      .attr('fill', d => (CRISIS_COLOR[d.type] ?? '#4b5563') + '28')
      .attr('stroke', d => CRISIS_COLOR[d.type] ?? '#4b5563')
      .attr('stroke-width', 2)

    // Severity letter inside
    const SEV_LETTER: Record<string, string> = { CRITICAL:'C', HIGH:'H', MEDIUM:'M', LOW:'L', MONITORING:'·' }
    nodeG.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', '11px').attr('font-weight', '800')
      .attr('fill', d => CRISIS_COLOR[d.type] ?? '#4b5563')
      .attr('opacity', 0.7)
      .attr('pointer-events', 'none')
      .text(d => SEV_LETTER[d.severity] ?? '?')

    // Label group below node
    const labelG = nodeG.append('g').attr('pointer-events', 'none')

    const wrapTitle = (t: string, max: number): [string, string] => {
      if (t.length <= max) return [t, '']
      const mid = t.lastIndexOf(' ', max)
      if (mid <= 0) return [t.slice(0, max) + '…', '']
      const l2 = t.slice(mid + 1)
      return [t.slice(0, mid), l2.length > max ? l2.slice(0, max - 1) + '…' : l2]
    }

    labelG.append('rect').attr('fill', '#07090f').attr('opacity', 0.85).attr('rx', 3)

    labelG.append('text')
      .attr('text-anchor', 'middle').attr('font-size', '11px').attr('font-weight', '600').attr('fill', '#e6edf3')
      .text(d => wrapTitle(d.title, 22)[0])

    labelG.append('text')
      .attr('text-anchor', 'middle').attr('font-size', '11px').attr('font-weight', '600').attr('fill', '#e6edf3')
      .text(d => wrapTitle(d.title, 22)[1])

    labelG.append('text')
      .attr('text-anchor', 'middle').attr('font-size', '9.5px').attr('fill', '#6b7280')
      .text(d => d.country.length > 20 ? d.country.slice(0, 18) + '…' : d.country)

    nodeG.each(function(d) {
      const r = SEV_RADIUS[d.severity] ?? 18
      const base = r + 10
      const hasL2 = wrapTitle(d.title, 22)[1] !== ''
      const gSel = d3.select(this).select('g')
      const bgH = hasL2 ? 38 : 26
      gSel.select('rect').attr('y', base - 1).attr('x', -62).attr('width', 124).attr('height', bgH)
      const texts = gSel.selectAll<SVGTextElement, SimNode>('text')
      texts.filter((_, i) => i === 0).attr('y', base + 12)
      texts.filter((_, i) => i === 1).attr('y', hasL2 ? base + 25 : base + 12)
      texts.filter((_, i) => i === 2).attr('y', hasL2 ? base + 37 : base + 24)
    })

    sim.on('tick', () => {
      link.attr('d', (d: SimLink) => {
        const s = d.source as SimNode
        const t = d.target as SimNode
        if (!s.x || !s.y || !t.x || !t.y) return ''
        const dx = t.x - s.x, dy = t.y - s.y
        const dr = Math.sqrt(dx*dx + dy*dy) * 1.5
        return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`
      })
      edgeLabel.attr('transform', (d: SimLink) => {
        const s = d.source as SimNode
        const t = d.target as SimNode
        return `translate(${((s.x??0)+(t.x??0))/2},${((s.y??0)+(t.y??0))/2})`
      })
      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [result])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg">
      {/* Input bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
        <span className="text-dim text-[10px] font-semibold uppercase tracking-wider shrink-0">Investigate</span>
        <div className="flex-1 flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Type any crisis, shortage, or situation — e.g. petroleum shortage due to war..."
            className="flex-1 bg-surface border border-border text-text text-xs rounded-lg px-3 py-1.5 placeholder:text-dim focus:outline-none focus:border-gray-500 transition-colors"
          />
          <button
            onClick={() => submit()}
            disabled={loading || !query.trim()}
            className="text-[11px] font-semibold px-4 py-1.5 rounded-lg bg-surface border border-border hover:border-gray-500 text-text disabled:opacity-40 transition-colors shrink-0"
          >
            {loading ? '…' : 'Analyze →'}
          </button>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => { setQuery(ex); submit(ex) }}
              className="text-[9px] px-2 py-0.5 rounded-full border border-border text-dim hover:text-text hover:border-gray-500 transition-colors whitespace-nowrap"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="text-3xl opacity-40" style={{ animation: 'spin 2s linear infinite' }}>◈</div>
          <p className="text-sm text-dim animate-pulse">Fetching live news · Building causal graph with Groq…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-crisis-war max-w-sm text-center">{error}</p>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="text-5xl opacity-10">◎</div>
          <p className="text-sm text-dim text-center max-w-md leading-relaxed">
            Enter any crisis, situation or scenario. NEXUS will scrape live news, extract the causal chain, and build a custom knowledge graph.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => { setQuery(ex); submit(ex) }}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-dim hover:text-text hover:border-gray-500 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: D3 graph */}
          <div ref={wrapRef} className="flex-1 overflow-hidden relative border-r border-border bg-bg">
            <svg ref={svgRef} className="w-full h-full" />
            <div className="absolute top-3 left-3 text-[9px] text-dim">Drag · Scroll to zoom</div>
            {/* Edge legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 bg-surface/80 backdrop-blur px-3 py-2 rounded-lg border border-border">
              {Object.entries(REL_COLOR).map(([rel, color]) => (
                <div key={rel} className="flex items-center gap-1 text-[9px] text-dim">
                  <div className="w-4 h-px" style={{ background: color }} />
                  {rel}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Details */}
          <div className="w-80 shrink-0 overflow-y-auto px-4 py-4 space-y-5">
            {/* Title */}
            <div>
              <h3 className="text-sm font-bold text-text leading-snug">{result.title}</h3>
              <p className="text-[9px] text-dim mt-0.5">{result.articles_analyzed} articles · Groq</p>
            </div>

            {/* Summary */}
            <div>
              <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-1.5">Summary</div>
              <p className="text-xs text-gray-300 leading-relaxed">{result.summary}</p>
            </div>

            {/* Key findings */}
            {result.key_findings.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">Key Findings</div>
                <ul className="space-y-2">
                  {result.key_findings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                      <span style={{ color: '#f85149' }} className="shrink-0 mt-0.5">▸</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Causal chain node list */}
            {result.nodes.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">
                  Causal Chain — {result.nodes.length} nodes
                </div>
                <div className="space-y-2">
                  {result.nodes.map(n => (
                    <div key={n.id} className="rounded-lg border border-border bg-surface p-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ color: CRISIS_COLOR[n.type] ?? '#4b5563', background: (CRISIS_COLOR[n.type] ?? '#4b5563') + '18' }}>
                          {n.type.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] font-bold" style={{ color: SEV_COLOR[n.severity] }}>
                          {n.severity}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-text leading-snug">{n.title}</div>
                      <div className="text-[9px] text-dim mt-0.5">{n.country}</div>
                      {n.description && (
                        <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">{n.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">Recommendations</div>
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                      <span className="text-blue-400 shrink-0 mt-0.5">◈</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
