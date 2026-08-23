import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { InvestigationNode, InvestigationEdge, Severity } from '../../types'
import { CRISIS_COLOR, SEV_RADIUS, SEV_COLOR, REL_COLOR } from '../../types'

interface WhatIfOverride {
  delta: 'escalates' | 'de-escalates' | 'unchanged'
  reason: string
}

interface Props {
  nodes: InvestigationNode[]
  edges: InvestigationEdge[]
  selectedId: string | null
  onSelect: (id: string) => void
  whatIfOverrides?: Record<string, WhatIfOverride>
  newNodeIds?: Set<string>
}

interface TooltipData { x: number; y: number; rel: string; strength: number; description: string; lagDays: number }

type SimNode = InvestigationNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }
type SimLink = InvestigationEdge & { source: string | SimNode; target: string | SimNode }

function edgeDash(s: number) {
  if (s >= 0.75) return undefined
  if (s >= 0.5)  return '8 5'
  return '3 6'
}

export default function InvestigationGraph({ nodes, edges, selectedId, onSelect, whatIfOverrides, newNodeIds }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  // Stable ref for onSelect — keeps it out of D3 effect deps so clicks/typing don't rebuild the graph
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  // Preserve node positions across simulation restarts (e.g. when whatif adds nodes)
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // ── Main D3 simulation setup ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !wrapRef.current) return

    if (nodes.length === 0) {
      // Clear saved positions for fresh investigations
      nodePositionsRef.current.clear()
      d3.select(svgRef.current).selectAll('*').remove()
      return
    }

    const W = wrapRef.current.clientWidth  || 800
    const H = wrapRef.current.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

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

    // Determine if this is a fresh investigation or adding nodes
    const savedCount = nodes.filter(n => nodePositionsRef.current.has(n.id)).length
    const isNewInvestigation = savedCount < nodes.length * 0.5

    // Restore saved positions for existing nodes
    const simNodes: SimNode[] = nodes.map(n => {
      const saved = nodePositionsRef.current.get(n.id)
      return { ...n, x: saved?.x, y: saved?.y }
    })
    const nodeById = new Map(simNodes.map(n => [n.id, n]))

    const simLinks: SimLink[] = edges
      .map(e => ({ ...e, source: nodeById.get(e.source_id) ?? e.source_id, target: nodeById.get(e.target_id) ?? e.target_id }))
      .filter(e => e.source && e.target)

    const charge = nodes.length > 15 ? -720 : -540
    const dist   = nodes.length > 15 ? 200  : 170

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link',      d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(dist).strength(0.35))
      .force('charge',    d3.forceManyBody().strength(charge))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => SEV_RADIUS[d.severity] + 52))
      .alphaDecay(isNewInvestigation ? 0.028 : 0.1)  // settle faster when just adding nodes

    // Define IBM Plex Mono font for all SVG text
    const MONO = "'IBM Plex Mono', 'Courier New', monospace"
    const DISPLAY = "Rajdhani, Impact, sans-serif"

    const g = svg.append('g')
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', e => g.attr('transform', e.transform)))

    const link = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks).join('path')
      .attr('fill', 'none')
      .attr('class', 'link')
      .attr('stroke', d => (REL_COLOR as Record<string,string>)[d.relationship] ?? '#4b5563')
      .attr('stroke-width', d => 1 + d.strength * 2)
      .attr('stroke-dasharray', d => edgeDash(d.strength) ?? null)
      .attr('marker-end', d => `url(#inv-arrow-${d.relationship})`)
      .style('opacity', 0)

    const linkHit = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks).join('path')
      .attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 14)
      .style('cursor', 'crosshair')
      .on('mousemove', (ev: MouseEvent, d: SimLink) => {
        const rect = wrapRef.current!.getBoundingClientRect()
        setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top,
          rel: d.relationship, strength: d.strength, description: d.description, lagDays: d.lag_days })
      })
      .on('mouseleave', () => setTooltip(null))

    const edgeLabelG = g.append('g')
      .selectAll<SVGGElement, SimLink>('g').data(simLinks).join('g')
      .attr('pointer-events', 'none')
      .style('opacity', 0)
    edgeLabelG.append('rect').attr('fill','#04050a').attr('opacity',0.88).attr('rx',2)
      .attr('width',56).attr('height',13).attr('x',-28).attr('y',-9)
    edgeLabelG.append('text')
      .attr('text-anchor','middle').attr('dominant-baseline','middle')
      .attr('font-size','8px').attr('font-weight','700')
      .attr('font-family', DISPLAY)
      .attr('letter-spacing', '0.05em')
      .attr('fill', d => (REL_COLOR as Record<string,string>)[d.relationship] ?? '#5e6b82')
      .text(d => d.relationship)

    const nodeG = g.append('g')
      .selectAll<SVGGElement, SimNode>('g').data(simNodes, d => d.id).join('g')
      .attr('class', d => `node${d.severity === 'CRITICAL' ? ' critical-glow' : ''}`)
      .style('cursor', 'pointer')
      .style('opacity', 0)
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y })
        .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (_ev, d) => onSelectRef.current(d.id))

    nodeG.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH')
      .append('circle')
      .attr('r', d => SEV_RADIUS[d.severity] + 7)
      .attr('fill', 'none').attr('stroke', d => (CRISIS_COLOR as Record<string,string>)[d.type] ?? '#4b5563')
      .attr('stroke-width', 1).attr('opacity', 0.2)

    nodeG.filter(d => (d.tags ?? []).includes('chokepoint'))
      .append('polygon')
      .attr('points', d => { const r = SEV_RADIUS[d.severity] + 10; return `0,${-r} ${r},0 0,${r} ${-r},0` })
      .attr('fill', 'none').attr('stroke', '#f0c040')
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '5 3').attr('opacity', 0.7)

    nodeG.append('circle')
      .attr('r', d => SEV_RADIUS[d.severity])
      .attr('fill', d => ((CRISIS_COLOR as Record<string,string>)[d.type] ?? '#4b5563') + '28')
      .attr('stroke', d => (d.tags ?? []).includes('chokepoint') ? '#f0c040' : ((CRISIS_COLOR as Record<string,string>)[d.type] ?? '#4b5563'))
      .attr('stroke-width', 2)

    const SEV_LETTER: Record<string,string> = { CRITICAL:'C', HIGH:'H', MEDIUM:'M', LOW:'L', MONITORING:'·' }
    nodeG.append('text')
      .text(d => SEV_LETTER[d.severity] ?? '?')
      .attr('text-anchor','middle').attr('dominant-baseline','middle')
      .attr('font-size', d => SEV_RADIUS[d.severity] > 20 ? '11px' : '9px')
      .attr('font-weight','700')
      .attr('font-family', DISPLAY)
      .attr('fill', d => (CRISIS_COLOR as Record<string,string>)[d.type] ?? '#5e6b82')
      .attr('opacity', 0.8).attr('pointer-events','none')

    const wrapTitle = (t: string, max: number): [string, string] => {
      if (t.length <= max) return [t, '']
      const mid = t.lastIndexOf(' ', max)
      if (mid <= 0) return [t.slice(0, max) + '…', '']
      const l2 = t.slice(mid + 1)
      return [t.slice(0, mid), l2.length > max ? l2.slice(0, max-1) + '…' : l2]
    }

    const labelG = nodeG.append('g').attr('pointer-events', 'none')
    labelG.append('rect').attr('fill','#04050a').attr('opacity',0.88).attr('rx',2)
    labelG.append('text').attr('text-anchor','middle').attr('font-size','10px').attr('font-weight','600')
      .attr('font-family', MONO).attr('fill','#d8e0ed')
      .text(d => wrapTitle(d.title, 21)[0])
    labelG.append('text').attr('text-anchor','middle').attr('font-size','10px').attr('font-weight','600')
      .attr('font-family', MONO).attr('fill','#d8e0ed')
      .text(d => wrapTitle(d.title, 21)[1])
    labelG.append('text').attr('text-anchor','middle').attr('font-size','9px')
      .attr('font-family', MONO).attr('fill','#5e6b82')
      .text(d => d.country.length > 22 ? d.country.slice(0,20) + '…' : d.country)

    nodeG.each(function(d) {
      const r = SEV_RADIUS[d.severity], base = r + 10
      const hasL2 = wrapTitle(d.title, 21)[1] !== ''
      const gSel = d3.select(this).select('g')
      gSel.select('rect').attr('y', base-1).attr('x',-54).attr('width',108).attr('height', hasL2 ? 34 : 23)
      const texts = gSel.selectAll<SVGTextElement, SimNode>('text')
      texts.filter((_,i) => i===0).attr('y', base+11)
      texts.filter((_,i) => i===1).attr('y', hasL2 ? base+23 : base+11)
      texts.filter((_,i) => i===2).attr('y', hasL2 ? base+34 : base+22)
    })

    const pathD = (d: SimLink) => {
      const s = d.source as SimNode, t = d.target as SimNode
      if (!s.x || !s.y || !t.x || !t.y) return ''
      const dx = t.x - s.x, dy = t.y - s.y
      const dr = Math.sqrt(dx*dx + dy*dy) * 1.6
      return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`
    }

    sim.on('tick', () => {
      // Save positions for reuse
      simNodes.forEach(n => {
        if (n.x != null && n.y != null) nodePositionsRef.current.set(n.id, { x: n.x, y: n.y })
      })
      link.attr('d', pathD)
      linkHit.attr('d', pathD)
      edgeLabelG.attr('transform', (d: SimLink) => {
        const s = d.source as SimNode, t = d.target as SimNode
        return `translate(${((s.x??0)+(t.x??0))/2},${((s.y??0)+(t.y??0))/2})`
      })
      nodeG.attr('transform', d => `translate(${d.x??0},${d.y??0})`)
    })

    // ── Streaming animation: reveal nodes staggered, then edges ──────────────
    const nodeIdList = simNodes.map(n => n.id)
    let revealIdx = 0

    const revealDelay = isNewInvestigation ? 700 : 100
    const stagger     = isNewInvestigation ? 70  : 40

    const revealTimer = setTimeout(() => {
      // For existing nodes (when adding whatif/new nodes), reveal immediately
      if (!isNewInvestigation) {
        nodeG.filter(d => nodePositionsRef.current.has(d.id))
          .style('opacity', 1)
      }

      const revealInterval = setInterval(() => {
        if (revealIdx >= nodeIdList.length) {
          clearInterval(revealInterval)
          link.transition().duration(400).style('opacity', 1)
          edgeLabelG.transition().duration(400).style('opacity', 1)
          return
        }
        const id = nodeIdList[revealIdx]
        nodeG.filter(d => d.id === id)
          .transition().duration(280)
          .style('opacity', 1)
        revealIdx++
      }, stagger)
    }, revealDelay)

    return () => {
      sim.stop()
      clearTimeout(revealTimer)
    }
  }, [nodes, edges])

  // ── Dim / highlight on selection ─────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    if (!selectedId) {
      svg.selectAll('.node').classed('selected',false).classed('dimmed',false).classed('highlighted',false)
      svg.selectAll('.link').classed('highlighted',false).classed('dimmed',false)
      return
    }
    const connected = new Set<string>([selectedId])
    edges.forEach(e => {
      if (e.source_id === selectedId) connected.add(e.target_id)
      if (e.target_id === selectedId) connected.add(e.source_id)
    })
    svg.selectAll<SVGGElement, InvestigationNode>('.node')
      .classed('selected',    d => d.id === selectedId)
      .classed('highlighted', d => connected.has(d.id) && d.id !== selectedId)
      .classed('dimmed',      d => !connected.has(d.id))
    svg.selectAll<SVGPathElement, InvestigationEdge>('.link')
      .classed('highlighted', d => d.source_id === selectedId || d.target_id === selectedId)
      .classed('dimmed',      d => d.source_id !== selectedId && d.target_id !== selectedId)
  }, [selectedId, edges])

  // ── What-If overlays (escalation rings + delta badges) ───────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('.whatif-overlay').remove()

    if (!whatIfOverrides) return

    svg.selectAll<SVGGElement, InvestigationNode>('.node').each(function(d) {
      const override = whatIfOverrides[d.id]
      if (!override || override.delta === 'unchanged') return

      const g = d3.select(this)
      const r = SEV_RADIUS[d.severity]
      const isUp = override.delta === 'escalates'
      const ringColor = isUp ? '#f85149' : '#3fb950'

      g.append('circle')
        .attr('class', 'whatif-overlay')
        .attr('r', r + 11)
        .attr('fill', 'none')
        .attr('stroke', ringColor)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4 3')
        .attr('opacity', 0.85)

      g.append('text')
        .attr('class', 'whatif-overlay')
        .attr('x', r + 4)
        .attr('y', -(r + 4))
        .attr('font-size', '11px')
        .attr('font-weight', '900')
        .attr('fill', ringColor)
        .attr('pointer-events', 'none')
        .text(isUp ? '↑' : '↓')
    })
  }, [whatIfOverrides])

  // ── New-node highlight rings ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('.newnode-overlay').remove()

    if (!newNodeIds?.size) return

    svg.selectAll<SVGGElement, InvestigationNode>('.node').each(function(d) {
      if (!newNodeIds.has(d.id)) return
      const r = SEV_RADIUS[d.severity]
      d3.select(this).append('circle')
        .attr('class', 'newnode-overlay')
        .attr('r', r + 9)
        .attr('fill', 'none')
        .attr('stroke', '#f0c040')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '3 3')
        .attr('opacity', 0.9)
    })
  }, [newNodeIds])

  return (
    <div ref={wrapRef} className="relative w-full h-full graph-canvas">
      <svg ref={svgRef} className="w-full h-full" />

      {tooltip && (
        <div className="absolute pointer-events-none z-50 bg-surface border border-border2 px-3 py-2.5 shadow-2xl text-xs max-w-[220px]"
          style={{ left: Math.min(tooltip.x + 14, (wrapRef.current?.clientWidth ?? 800) - 240), top: tooltip.y - 8 }}>
          <div className="font-display font-bold text-[10px] tracking-wider mb-1.5" style={{ color: (REL_COLOR as Record<string,string>)[tooltip.rel] ?? '#5e6b82' }}>{tooltip.rel}</div>
          <div className="flex items-center gap-2 text-dim text-[11px] mb-1">
            <span>confidence</span>
            <span className="text-intel">{Math.round(tooltip.strength * 100)}%</span>
            <span className="text-[9px] text-dim/50">{tooltip.strength >= 0.75 ? '●●●' : tooltip.strength >= 0.5 ? '●●○' : '●○○'}</span>
          </div>
          {tooltip.lagDays > 0 && <div className="text-dim/60 text-[10px] mb-1">lag <span className="text-text/80">{tooltip.lagDays}d</span></div>}
          <p className="text-dim/70 leading-relaxed text-[10px]">{tooltip.description}</p>
        </div>
      )}

      {/* Edge confidence legend */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 bg-surface/80 backdrop-blur px-2.5 py-2 border border-border">
        <div className="font-display text-[8px] text-dim/40 tracking-[0.2em] uppercase mb-1">Edge Confidence</div>
        {[['Solid','≥75%'],['Dashed','50-75%'],['Dotted','<50%']].map(([s,l]) => (
          <div key={s} className="flex items-center gap-1.5 text-[9px] text-dim/60">
            <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="#5e6b82" strokeWidth="1.5"
              strokeDasharray={s==='Dashed'?'8 5':s==='Dotted'?'3 6':undefined}/></svg>
            {l}
          </div>
        ))}
      </div>

      {/* Relationship color legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 bg-surface/70 backdrop-blur px-2.5 py-1.5 border border-border">
        {Object.entries(REL_COLOR).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-1 text-[9px] text-dim/60">
            <div className="w-3.5 h-px" style={{ background: color }} />
            <span className="font-display tracking-wider">{rel}</span>
          </div>
        ))}
      </div>

      <div className="absolute top-3 right-3 text-[9px] text-dim/30 font-display tracking-wider">DRAG · ZOOM · CLICK</div>
    </div>
  )
}
