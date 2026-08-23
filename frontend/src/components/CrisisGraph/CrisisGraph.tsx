import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { Crisis, Relationship } from '../../types'
import { CRISIS_COLOR, SEV_RADIUS, REL_COLOR } from '../../types'

interface Props {
  nodes: Crisis[]
  edges: Relationship[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface TooltipData {
  x: number
  y: number
  relationship: string
  strength: number
  description: string
  lagDays: number
}

type SimNode = Crisis & { x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }
type SimLink = Omit<Relationship, 'source_id' | 'target_id'> & { source: string | SimNode; target: string | SimNode }

// Uncertainty style by strength band
function edgeDash(strength: number): string {
  if (strength >= 0.75) return '7 4'   // strong — animated flowing dashes (CSS handles animation)
  if (strength >= 0.5)  return '10 6'  // medium — static dashes
  return '3 7'                          // weak  — dotted
}

export default function CrisisGraph({ nodes, edges, selectedId, onSelect }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const simRef  = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  useEffect(() => {
    if (!svgRef.current || !wrapRef.current || nodes.length === 0) return

    const W = wrapRef.current.clientWidth  || 900
    const H = wrapRef.current.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    // ── Defs ────────────────────────────────────────────────────────────────
    const defs = svg.append('defs')
    const relTypes = ['CAUSES','WORSENS','DISRUPTS','TRIGGERS','CORRELATES','MITIGATES'] as const
    relTypes.forEach(rel => {
      defs.append('marker')
        .attr('id', `arrow-${rel}`)
        .attr('viewBox', '0 -4 10 8').attr('refX', 20).attr('refY', 0)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L10,0L0,4').attr('fill', REL_COLOR[rel])
    })

    // ── Data ────────────────────────────────────────────────────────────────
    const simNodes: SimNode[] = nodes.map(n => ({ ...n }))
    const nodeById = new Map(simNodes.map(n => [n.id, n]))

    const simLinks: SimLink[] = edges
      .map(e => ({ ...e, source: nodeById.get(e.source_id) ?? e.source_id, target: nodeById.get(e.target_id) ?? e.target_id }))
      .filter(e => e.source && e.target)

    // ── Simulation ─────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link',      d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(165).strength(0.35))
      .force('charge',    d3.forceManyBody().strength(-520))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => SEV_RADIUS[d.severity] + 52))

    simRef.current = sim

    // ── Container (zoomable) ───────────────────────────────────────────────
    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', e => g.attr('transform', e.transform)))

    // ── Links (visible) ────────────────────────────────────────────────────
    const link = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .join('path')
      // Only strong edges get the animated class
      .attr('class', d => `link${d.strength >= 0.75 ? ' animated' : ''}`)
      .attr('stroke', d => REL_COLOR[d.relationship as keyof typeof REL_COLOR] ?? '#4b5563')
      .attr('stroke-width', d => 1 + d.strength * 2)
      .attr('stroke-dasharray', d => edgeDash(d.strength))
      .attr('marker-end', d => `url(#arrow-${d.relationship})`)

    // ── Links (wide invisible hit area for hover) ──────────────────────────
    const linkHit = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .style('cursor', 'crosshair')

    linkHit
      .on('mousemove', (ev: MouseEvent, d: SimLink) => {
        if (!wrapRef.current) return
        const rect = wrapRef.current.getBoundingClientRect()
        setTooltip({
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          relationship: d.relationship as string,
          strength: d.strength,
          description: d.description,
          lagDays: d.lag_days,
        })
      })
      .on('mouseleave', () => setTooltip(null))

    // ── Edge relationship labels ────────────────────────────────────────────
    const edgeLabelG = g.append('g')
      .selectAll<SVGGElement, SimLink>('g')
      .data(simLinks)
      .join('g')
      .attr('pointer-events', 'none')

    edgeLabelG.append('rect')
      .attr('fill', '#07090f').attr('opacity', 0.8).attr('rx', 3)
      .attr('width', 52).attr('height', 12).attr('x', -26).attr('y', -9)

    edgeLabelG.append('text')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', '7.5px').attr('font-weight', '700')
      .attr('fill', d => REL_COLOR[d.relationship as keyof typeof REL_COLOR] ?? '#4b5563')
      .text(d => d.relationship)

    // ── Nodes ──────────────────────────────────────────────────────────────
    const nodeG = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, d => d.id)
      .join('g')
      .attr('class', d => `node${d.severity === 'CRITICAL' ? ' critical-glow' : ''}`)
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y })
        .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (_ev, d) => onSelect(d.id))

    // Outer pulse ring for CRITICAL
    nodeG.filter(d => d.severity === 'CRITICAL')
      .append('circle')
      .attr('r', d => SEV_RADIUS[d.severity] + 7)
      .attr('fill', 'none')
      .attr('stroke', d => CRISIS_COLOR[d.type])
      .attr('stroke-width', 1)
      .attr('opacity', 0.22)

    // ── Chokepoint diamond outline ──────────────────────────────────────────
    nodeG.filter(d => (d.tags ?? []).includes('chokepoint'))
      .append('polygon')
      .attr('points', d => {
        const r = SEV_RADIUS[d.severity] + 10
        return `0,${-r} ${r},0 0,${r} ${-r},0`
      })
      .attr('fill', 'none')
      .attr('stroke', '#f0c040')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5 3')
      .attr('opacity', 0.7)

    // Main circle
    nodeG.append('circle')
      .attr('r', d => SEV_RADIUS[d.severity])
      .attr('fill', d => CRISIS_COLOR[d.type] + '28')
      .attr('stroke', d => (d.tags ?? []).includes('chokepoint') ? '#f0c040' : CRISIS_COLOR[d.type])
      .attr('stroke-width', 2)

    // Severity letter
    const SEV_LETTER: Record<string, string> = { CRITICAL:'C', HIGH:'H', MEDIUM:'M', LOW:'L', MONITORING:'·' }
    nodeG.append('text')
      .text(d => SEV_LETTER[d.severity] ?? '?')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('font-size', d => SEV_RADIUS[d.severity] > 20 ? '11px' : '9px')
      .attr('font-weight', '800')
      .attr('fill', d => (d.tags ?? []).includes('chokepoint') ? '#f0c040' : CRISIS_COLOR[d.type])
      .attr('opacity', 0.75)
      .attr('pointer-events', 'none')

    // Label group: background rect + title (2 lines) + country
    const labelG = nodeG.append('g').attr('pointer-events', 'none')

    const wrapTitle = (title: string, max: number): [string, string] => {
      if (title.length <= max) return [title, '']
      const mid = title.lastIndexOf(' ', max)
      if (mid <= 0) return [title.slice(0, max) + '…', '']
      const l2 = title.slice(mid + 1)
      return [title.slice(0, mid), l2.length > max ? l2.slice(0, max - 1) + '…' : l2]
    }

    labelG.append('rect').attr('fill', '#07090f').attr('opacity', 0.82).attr('rx', 3)
    labelG.append('text').attr('text-anchor', 'middle').attr('font-size', '10px').attr('font-weight', '600').attr('fill', '#e6edf3')
      .text(d => wrapTitle(d.title, 20)[0])
    labelG.append('text').attr('text-anchor', 'middle').attr('font-size', '10px').attr('font-weight', '600').attr('fill', '#e6edf3')
      .text(d => wrapTitle(d.title, 20)[1])
    labelG.append('text').attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#6b7280')
      .text(d => d.country.length > 22 ? d.country.slice(0, 20) + '…' : d.country)

    nodeG.each(function(d) {
      const r = SEV_RADIUS[d.severity]
      const base = r + 10
      const hasL2 = wrapTitle(d.title, 20)[1] !== ''
      const gSel = d3.select(this).select('g')
      gSel.select('rect').attr('y', base - 1).attr('x', -54).attr('width', 108).attr('height', hasL2 ? 34 : 23)
      const texts = gSel.selectAll<SVGTextElement, SimNode>('text')
      texts.filter((_, i) => i === 0).attr('y', base + 11)
      texts.filter((_, i) => i === 1).attr('y', hasL2 ? base + 23 : base + 11)
      texts.filter((_, i) => i === 2).attr('y', hasL2 ? base + 34 : base + 22)
    })

    // ── Tick ────────────────────────────────────────────────────────────────
    const updatePath = (sel: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown>) => {
      sel.attr('d', (d: SimLink) => {
        const s = d.source as SimNode
        const t = d.target as SimNode
        if (!s.x || !s.y || !t.x || !t.y) return ''
        const dx = t.x - s.x, dy = t.y - s.y
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.6
        return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`
      })
    }

    sim.on('tick', () => {
      updatePath(link)
      updatePath(linkHit)
      edgeLabelG.attr('transform', (d: SimLink) => {
        const s = d.source as SimNode
        const t = d.target as SimNode
        return `translate(${((s.x ?? 0) + (t.x ?? 0)) / 2},${((s.y ?? 0) + (t.y ?? 0)) / 2})`
      })
      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [nodes, edges, onSelect])

  // Apply selected / dim state
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    if (!selectedId) {
      svg.selectAll('.node').classed('selected', false).classed('dimmed', false).classed('highlighted', false)
      svg.selectAll('.link').classed('highlighted', false).classed('dimmed', false)
      return
    }

    const connected = new Set<string>([selectedId])
    edges.forEach(e => {
      if (e.source_id === selectedId) connected.add(e.target_id)
      if (e.target_id === selectedId) connected.add(e.source_id)
    })

    svg.selectAll<SVGGElement, Crisis>('.node')
      .classed('selected',    d => d.id === selectedId)
      .classed('highlighted', d => connected.has(d.id) && d.id !== selectedId)
      .classed('dimmed',      d => !connected.has(d.id))

    svg.selectAll<SVGPathElement, Relationship>('.link')
      .classed('highlighted', d => d.source_id === selectedId || d.target_id === selectedId)
      .classed('dimmed',      d => d.source_id !== selectedId && d.target_id !== selectedId)
  }, [selectedId, edges])

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-bg">
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-dim text-sm">Loading graph...</div>
      )}
      <svg ref={svgRef} className="w-full h-full" />

      {/* Edge tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-surface border border-border rounded-lg px-3 py-2 shadow-xl text-xs max-w-[220px]"
          style={{ left: Math.min(tooltip.x + 14, (wrapRef.current?.clientWidth ?? 900) - 240), top: tooltip.y - 8 }}
        >
          <div className="font-bold mb-1" style={{ color: (REL_COLOR as Record<string,string>)[tooltip.relationship] ?? '#4b5563' }}>
            {tooltip.relationship}
          </div>
          <div className="flex items-center gap-2 text-dim mb-1">
            <span>Confidence</span>
            <span className="font-semibold text-text">{Math.round(tooltip.strength * 100)}%</span>
            <span className="text-[9px]">{tooltip.strength >= 0.75 ? '●●●' : tooltip.strength >= 0.5 ? '●●○' : '●○○'}</span>
          </div>
          {tooltip.lagDays > 0 && (
            <div className="text-dim mb-1">Lag: <span className="text-text">{tooltip.lagDays}d</span></div>
          )}
          <p className="text-dim leading-relaxed text-[10px]">{tooltip.description}</p>
        </div>
      )}

      {/* Uncertainty legend */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 bg-surface/70 backdrop-blur px-2.5 py-2 rounded-lg border border-border">
        <div className="text-[8px] font-semibold text-dim uppercase tracking-wider mb-0.5">Edge confidence</div>
        <div className="flex items-center gap-1.5 text-[9px] text-dim">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#6b7280" strokeWidth="2" /></svg>
          Strong ≥75%
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-dim">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#6b7280" strokeWidth="2" strokeDasharray="5 3" /></svg>
          Medium 50–75%
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-dim">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#6b7280" strokeWidth="2" strokeDasharray="2 5" /></svg>
          Weak &lt;50%
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-yellow-500 mt-0.5 border-t border-border pt-1">
          <svg width="12" height="12" viewBox="-6 -6 12 12"><polygon points="0,-5 5,0 0,5 -5,0" fill="none" stroke="#f0c040" strokeWidth="1.5" strokeDasharray="3 2"/></svg>
          Chokepoint
        </div>
      </div>

      {/* Relationship color legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(REL_COLOR).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-1 text-[9px] text-dim">
            <div className="w-4 h-px" style={{ background: color }} />
            {rel}
          </div>
        ))}
      </div>

      <div className="absolute top-3 right-3 text-[9px] text-dim">
        Drag · Scroll to zoom · Click to explore · Hover edges for details
      </div>
    </div>
  )
}
