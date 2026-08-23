import { useState, useMemo, useCallback } from 'react'
import { api } from './api/client'
import type { InvestigationResult, WhatIfResult } from './types'
import { SEV_COLOR } from './types'
import InvestigationGraph from './components/InvestigationGraph/InvestigationGraph'
import GlobalMap          from './components/GlobalMap/GlobalMap'
import InvNodePanel       from './components/InvNodePanel/InvNodePanel'

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

type View     = 'investigate' | 'map'
type RightTab = 'summary' | 'whatif' | 'addnode'

const PROGRESS_STEPS = [
  'Fetching live news…',
  'Analyzing articles…',
  'Building causal graph…',
  'Generating insights…',
  'Cross-referencing sources…',
  'Tracing causal chains…',
  'Mapping chokepoints…',
  'Validating connections…',
  'Almost there…',
]

const EXAMPLE_QUERIES = [
  'Red Sea shipping crisis',
  'Sudan civil war famine',
  'Pakistan energy shortage',
  'Myanmar conflict refugees',
  'Taiwan semiconductor risk',
]

const SCARCE_SECTORS = new Set(['FOOD', 'HEALTH', 'HUMANITARIAN', 'ENERGY', 'WATER'])

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-0.5 h-3 bg-intel shrink-0" />
      <div className="font-display text-[9px] tracking-[0.22em] text-dim/85 uppercase">{label}</div>
    </div>
  )
}

export default function App() {
  const [view,         setView]         = useState<View>('investigate')
  const [query,        setQuery]        = useState('')
  const [deep,         setDeep]         = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [result,       setResult]       = useState<InvestigationResult | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  const [rightTab,    setRightTab]    = useState<RightTab>('summary')

  const [fullBriefing,    setFullBriefing]    = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)

  const [whatIfInput,   setWhatIfInput]   = useState('')
  const [whatIfLoading, setWhatIfLoading] = useState(false)
  const [whatIfResult,  setWhatIfResult]  = useState<WhatIfResult | null>(null)
  const [whatIfError,   setWhatIfError]   = useState<string | null>(null)

  const [addNodeInput,   setAddNodeInput]   = useState('')
  const [addNodeLoading, setAddNodeLoading] = useState(false)
  const [addNodeError,   setAddNodeError]   = useState<string | null>(null)
  const [newNodeIds,     setNewNodeIds]     = useState<Set<string>>(new Set())

  const selectedNode = result?.nodes.find(n => n.id === selectedId) ?? null

  const displayNodes = useMemo(() => {
    if (!result) return []
    if (!whatIfResult) return result.nodes
    return [...result.nodes, ...whatIfResult.new_nodes]
  }, [result, whatIfResult])

  const displayEdges = useMemo(() => {
    if (!result) return []
    if (!whatIfResult) return result.edges
    return [...result.edges, ...whatIfResult.new_edges]
  }, [result, whatIfResult])

  const whatIfOverrides = useMemo(() => {
    if (!whatIfResult) return undefined
    const map: Record<string, { delta: 'escalates' | 'de-escalates' | 'unchanged'; reason: string }> = {}
    whatIfResult.modified_nodes.forEach(m => { map[m.id] = { delta: m.delta, reason: m.reason } })
    return Object.keys(map).length > 0 ? map : undefined
  }, [whatIfResult])

  const conflicts = useMemo(() => {
    if (!result) return []
    const sectorNodes = new Map<string, string[]>()
    result.nodes.forEach(n => {
      if (n.severity !== 'CRITICAL' && n.severity !== 'HIGH') return
      n.sectors_affected.forEach(s => {
        if (!SCARCE_SECTORS.has(s)) return
        if (!sectorNodes.has(s)) sectorNodes.set(s, [])
        sectorNodes.get(s)!.push(n.title)
      })
    })
    return Array.from(sectorNodes.entries())
      .filter(([, names]) => names.length >= 2)
      .map(([sector, names]) => ({ sector, count: names.length }))
  }, [result])

  const handleInvestigate = async () => {
    if (!query.trim() || loading) return
    setLoading(true); setError(null); setResult(null)
    setSelectedId(null); setProgressStep(0)
    setWhatIfResult(null); setFullBriefing(null)
    setRightTab('summary')

    const interval = setInterval(() =>
      setProgressStep(s => {
        if (s < PROGRESS_STEPS.length - 1) return s + 1
        return 4
      })
    , deep ? 3000 : 2200)

    try {
      const res = await api.investigate(query.trim(), deep)
      if (res.error && !res.nodes?.length) setError(res.error)
      else setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Investigation failed')
    } finally {
      clearInterval(interval); setLoading(false)
    }
  }

  const handleFullBriefing = async () => {
    if (!result || briefingLoading) return
    setBriefingLoading(true)
    try {
      const res = await api.investigationBriefing(
        result.title, result.summary, result.key_findings,
        result.nodes.map(n => ({ title: n.title, type: n.type, severity: n.severity, country: n.country })),
        result.edges.length, result.recommendations,
      )
      setFullBriefing(res.briefing)
    } catch { setFullBriefing('[Briefing unavailable]') }
    finally { setBriefingLoading(false) }
  }

  const handleWhatIf = async () => {
    if (!whatIfInput.trim() || !result || whatIfLoading) return
    setWhatIfLoading(true); setWhatIfError(null)
    try {
      const res = await api.whatif(
        whatIfInput.trim(), result.title, result.summary,
        result.nodes.map(n => ({ id: n.id, title: n.title, type: n.type, severity: n.severity, country: n.country })),
        result.edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, relationship: e.relationship, strength: e.strength })),
      )
      if (res.error && !res.modified_nodes?.length && !res.new_nodes?.length)
        setWhatIfError(res.error ?? 'Simulation failed')
      else
        setWhatIfResult(res)
    } catch (e: unknown) {
      setWhatIfError(e instanceof Error ? e.message : 'Simulation failed')
    } finally { setWhatIfLoading(false) }
  }

  const exitWhatIf = () => { setWhatIfResult(null); setWhatIfInput('') }

  const handleAddNode = async () => {
    if (!addNodeInput.trim() || !result || addNodeLoading) return
    setAddNodeLoading(true); setAddNodeError(null)
    try {
      const res = await api.addNode(
        addNodeInput.trim(),
        result.nodes.map(n => ({ id: n.id, title: n.title, type: n.type, country: n.country, severity: n.severity })),
        result.edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, relationship: e.relationship })),
      )
      if (!res.node) { setAddNodeError(res.error ?? 'Could not create node'); return }
      setResult(prev => prev ? {
        ...prev,
        nodes: [...prev.nodes, res.node!],
        edges: [...prev.edges, ...res.edges],
      } : prev)
      setNewNodeIds(prev => new Set([...prev, res.node!.id]))
      setTimeout(() => setNewNodeIds(prev => {
        const next = new Set(prev); next.delete(res.node!.id); return next
      }), 6000)
      setAddNodeInput('')
    } catch (e: unknown) {
      setAddNodeError(e instanceof Error ? e.message : 'Failed to add node')
    } finally { setAddNodeLoading(false) }
  }

  const toggleSelect = useCallback((id: string) => setSelectedId(prev => prev === id ? null : id), [])

  return (
    <div className="flex flex-col h-screen w-screen bg-bg overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-5 h-[72px] bg-surface border-b border-border shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-16 h-16 shrink-0">
            <img src="/logo.png" className="w-full h-full object-contain" alt="ARIA" />
          </div>
          <div>
            <div className="font-display font-bold text-text tracking-[0.14em] text-[20px] leading-none">ARIA</div>
            <div className="text-[9px] text-dim/80 tracking-[0.18em] uppercase mt-0.5">Crisis Intelligence</div>
          </div>
        </div>

        <div className="h-6 w-px bg-border2 shrink-0" />

        {/* Nav */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(['investigate', 'map'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`inline-flex items-center gap-2 font-display font-semibold text-[12px] px-4 py-[7px] tracking-[0.12em] transition-all ${
                view === v
                  ? 'text-intel border border-intel/30 bg-intel/10'
                  : 'text-dim hover:text-text border border-transparent hover:border-border2'
              }`}>
              {v === 'investigate'
                ? <><SearchIcon className="w-3.5 h-3.5" /> INVESTIGATE</>
                : <><GlobeIcon  className="w-3.5 h-3.5" /> MAP</>
              }
            </button>
          ))}
        </div>

        {/* Live stats */}
        {result && (
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {[
              [`${displayNodes.length}`, 'nodes'],
              [`${displayEdges.length}`, 'links'],
              [`${result.articles_analyzed}`, 'articles'],
            ].map(([val, label]) => (
              <div key={label} className="text-[10px] text-dim/50">
                [<span className="text-intel">{val}</span> {label}]
              </div>
            ))}
            {deep && <span className="font-display text-[10px] text-intel tracking-[0.15em]">DEEP</span>}
            {whatIfResult && (
              <span className="font-display text-[10px] text-orange-400 tracking-[0.15em] alert-blink">● WHAT-IF</span>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 text-[9px] text-dim/50 tracking-[0.12em]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            GEMINI 2.5
          </div>
          <div className="h-3.5 w-px bg-border2" />
          <div className="font-display text-[8px] text-dim/30 tracking-[0.22em]">RESTRICTED</div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Investigate view ── */}
          {view === 'investigate' && (
            <>
              {/* Conflict alert */}
              {conflicts.length > 0 && (
                <div className="flex items-center gap-2.5 px-5 py-1.5 bg-crisis-war/10 border-b border-crisis-war/20 shrink-0">
                  <span className="alert-blink text-crisis-war text-xs leading-none shrink-0">▲</span>
                  <span className="font-display font-semibold text-crisis-war text-[10px] tracking-[0.18em] shrink-0">
                    RESOURCE CONFLICT DETECTED
                  </span>
                  <span className="text-crisis-war/40 text-[10px] shrink-0">│</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {conflicts.map(c => (
                      <span key={c.sector} className="font-display text-[9px] tracking-[0.1em] px-1.5 py-0.5 bg-crisis-war/15 text-crisis-war/80 border border-crisis-war/30">
                        {c.sector} ×{c.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Graph canvas */}
              <div className="flex-1 overflow-hidden relative">

                {/* Loading */}
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-bg z-10 overflow-hidden">
                    <div className="scanline" />
                    <div className="text-center fade-in-up" style={{ animationDelay: '0ms' }}>
                      <div className="font-display font-bold text-intel text-[52px] tracking-[0.4em] leading-none mb-2">
                        ANALYZING
                      </div>
                      <div className="text-[10px] text-dim/50 tracking-[0.25em] uppercase">
                        {deep
                          ? 'DEEP SCAN · 4 FEEDS · 35 ARTICLES · 20-30 NODES'
                          : 'STANDARD SCAN · LIVE NEWS · 15 ARTICLES · 10-15 NODES'}
                      </div>
                    </div>
                    <div className="w-72 fade-in-up" style={{ animationDelay: '150ms' }}>
                      <div className="text-[11px] text-intel/70 font-mono text-center mb-3 h-4">
                        {PROGRESS_STEPS[progressStep]}
                      </div>
                      <div className="h-px bg-border2 relative overflow-hidden mb-2">
                        <div
                          className="absolute inset-y-0 left-0 bg-intel transition-all duration-700"
                          style={{ width: `${Math.min((Math.min(progressStep, 3) + 1) / 4 * 100, 95)}%` }}
                        />
                      </div>
                      <div className="flex gap-1">
                        {[0,1,2,3].map(i => (
                          <div key={i}
                            className={`flex-1 h-px transition-colors duration-500 ${
                              i <= Math.min(progressStep, 3) ? 'bg-intel/60' : 'bg-border2'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-[9px] text-dim/25 tracking-[0.35em] font-display fade-in-up" style={{ animationDelay: '300ms' }}>
                      ARIA · THREAT ASSESSMENT ENGINE
                    </div>
                  </div>
                )}

                {/* Error */}
                {!loading && error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="font-display font-bold text-crisis-war text-3xl tracking-[0.25em]">FAILED</div>
                    <p className="text-dim text-xs max-w-sm text-center leading-relaxed">{error}</p>
                    <button onClick={handleInvestigate}
                      className="text-[11px] font-display font-semibold text-intel border border-intel/30 px-5 py-2 tracking-[0.18em] hover:bg-intel/10 transition-colors mt-1">
                      ↻ RETRY
                    </button>
                  </div>
                )}

                {/* Empty state */}
                {!loading && !error && !result && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 p-8">
                    <img
                      src="/logo1.png"
                      className="w-48 h-48 object-contain select-none pointer-events-none"
                      style={{ opacity: 0.9 }}
                      alt=""
                    />
                    <div className="text-center space-y-2.5 max-w-xl">
                      <p className="font-display font-bold text-text/70 text-4xl tracking-[0.2em]">ARIA READY</p>
                      <p className="text-dim text-sm leading-relaxed">
                        Fetches live news · traces root causes 4–5 hops back · maps chokepoints · builds a causal intelligence graph
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2.5 max-w-xl justify-center stagger">
                      {EXAMPLE_QUERIES.map((s, i) => (
                        <button key={s} onClick={() => setQuery(s)}
                          className="text-xs text-dim/40 border border-border2 px-4 py-2 font-mono hover:border-intel/40 hover:text-intel transition-colors fade-in-up"
                          style={{ animationDelay: `${i * 60}ms` }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Graph */}
                {!loading && result && (
                  <InvestigationGraph
                    nodes={displayNodes}
                    edges={displayEdges}
                    selectedId={selectedId}
                    onSelect={toggleSelect}
                    whatIfOverrides={whatIfOverrides}
                    newNodeIds={newNodeIds}
                  />
                )}
              </div>

              {/* Search bar — bottom */}
              <div className="flex items-center gap-4 px-5 py-4 border-t border-border bg-surface/80 shrink-0">
                <span className="text-intel/50 font-mono text-base shrink-0 select-none">▸</span>
                <div className="flex-1 flex items-center gap-3">
                  <div className="relative flex-1 max-w-2xl">
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleInvestigate()}
                      placeholder="describe a crisis to investigate — e.g. 'Sudan food shortage' or 'Red Sea disruption'"
                      className="w-full bg-transparent border-b border-border2 text-text text-sm font-mono py-2 pr-7 focus:outline-none focus:border-intel/60 transition-colors"
                      disabled={loading}
                    />
                    {query && !loading && (
                      <button onClick={() => setQuery('')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-dim hover:text-text text-lg leading-none px-1">×</button>
                    )}
                  </div>
                  <button
                    onClick={handleInvestigate}
                    disabled={loading || !query.trim()}
                    className="inline-flex items-center gap-2 px-6 py-2 bg-intel/15 border border-intel/40 text-intel font-display font-semibold text-[13px] tracking-[0.15em] hover:bg-intel/25 transition-colors disabled:opacity-25 disabled:cursor-not-allowed whitespace-nowrap">
                    {loading
                      ? <><span className="w-3.5 h-3.5 border border-intel/60 border-t-intel rounded-full animate-spin" /> ANALYZING</>
                      : <><SearchIcon className="w-4 h-4" /> INVESTIGATE</>
                    }
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none shrink-0">
                  <button
                    onClick={() => !loading && setDeep(d => !d)}
                    className={`w-9 h-4 transition-colors relative focus:outline-none border ${
                      deep ? 'bg-intel/15 border-intel/40' : 'bg-border border-border2'
                    }`}>
                    <div className={`absolute top-[1px] w-3.5 h-3 transition-transform ${
                      deep ? 'translate-x-[19px] bg-intel' : 'translate-x-[1px] bg-dim/60'
                    }`} />
                  </button>
                  <span className={`font-display tracking-[0.15em] ${deep ? 'text-intel font-semibold' : 'text-dim'}`}>
                    DEEP
                  </span>
                  {deep && <span className="text-[10px] text-intel/50">20-30</span>}
                </label>
              </div>
            </>
          )}

          {/* ── Map view ── */}
          {view === 'map' && (
            result ? (
              <GlobalMap crises={displayNodes} edges={displayEdges} selectedId={selectedId} onSelect={toggleSelect} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
                <svg className="w-16 h-16 text-dim/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <div className="text-center space-y-2">
                  <p className="font-display font-bold text-dim text-xl tracking-[0.18em]">MAP EMPTY</p>
                  <p className="text-dim/50 text-xs max-w-xs leading-relaxed">
                    Run an investigation first — nodes will be plotted with causal connection lines.
                  </p>
                </div>
                <button onClick={() => setView('investigate')}
                  className="inline-flex items-center gap-1.5 text-[11px] font-display font-semibold text-intel border border-intel/30 px-5 py-2 tracking-[0.18em] hover:bg-intel/10 transition-colors">
                  <SearchIcon className="w-3.5 h-3.5" /> GO TO INVESTIGATE
                </button>
              </div>
            )
          )}
        </div>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        <div className="w-[340px] shrink-0 border-l border-border bg-surface overflow-hidden flex flex-col">
          {result ? (
            <>
              {/* Tab bar */}
              <div className="flex border-b border-border shrink-0">
                {([['summary','SUMMARY'],['whatif','WHAT-IF'],['addnode','+ NODE']] as [RightTab, string][]).map(([tab, label]) => (
                  <button key={tab} onClick={() => setRightTab(tab)}
                    className={`flex-1 font-display font-semibold text-[10px] py-2.5 tracking-[0.14em] transition-colors border-b-2 ${
                      rightTab === tab
                        ? 'text-intel border-intel bg-intel/5'
                        : 'text-dim/70 hover:text-text border-transparent'
                    }`}>
                    {label}
                    {tab === 'whatif' && whatIfResult && (
                      <span className="ml-1 alert-blink text-orange-400">●</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── SUMMARY TAB ── */}
              {rightTab === 'summary' && (
                selectedNode ? (
                  <InvNodePanel
                    node={selectedNode}
                    edges={displayEdges}
                    allNodes={displayNodes}
                    onClose={() => setSelectedId(null)}
                  />
                ) : (
                  <div className="overflow-y-auto flex-1">
                    <div className="p-4 border-b border-border">
                      <div className="text-[8px] text-dim/40 tracking-[0.25em] uppercase font-display mb-1.5">Investigation</div>
                      <h2 className="font-display font-bold text-text text-[19px] leading-tight tracking-wide">{result.title}</h2>
                    </div>
                    <div className="p-4 space-y-5">
                      <Prose text={result.summary} className="text-xs text-dim leading-relaxed" />

                      {result.key_findings.length > 0 && (
                        <div>
                          <SectionHeader label="Key Findings" />
                          <ul className="space-y-2.5">
                            {result.key_findings.map((f, i) => (
                              <li key={i} className="flex gap-2 text-xs text-dim">
                                <span className="text-intel shrink-0 mt-px leading-none">▸</span>
                                <Prose text={f} className="leading-relaxed" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.recommendations.length > 0 && (
                        <div>
                          <SectionHeader label="Recommendations" />
                          <ul className="space-y-2.5">
                            {result.recommendations.map((r, i) => (
                              <li key={i} className="flex gap-2 text-xs text-dim">
                                <span className="text-intel shrink-0 mt-px leading-none">◈</span>
                                <Prose text={r} className="leading-relaxed" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Intel brief */}
                      <div className="border-t border-border pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <SectionHeader label="Intel Brief" />
                          {!fullBriefing && (
                            <button onClick={handleFullBriefing} disabled={briefingLoading}
                              className="text-[10px] font-display text-intel border border-intel/25 px-2.5 py-0.5 tracking-[0.14em] hover:bg-intel/10 transition-colors disabled:opacity-25 mb-2.5">
                              {briefingLoading ? 'GENERATING…' : '◎ GENERATE'}
                            </button>
                          )}
                        </div>
                        {fullBriefing
                          ? <Prose text={fullBriefing} className="text-xs text-dim leading-relaxed" />
                          : <p className="text-[11px] text-dim/70 italic leading-relaxed">Commander-ready narrative of the full causal chain.</p>
                        }
                      </div>

                      <p className="text-[10px] text-dim/65 pt-1 leading-relaxed">
                        Click any node to see connections and generate a per-node brief.
                      </p>
                    </div>
                  </div>
                )
              )}

              {/* ── WHAT-IF TAB ── */}
              {rightTab === 'whatif' && (
                <div className="flex-1 overflow-y-auto flex flex-col">
                  {!whatIfResult ? (
                    <div className="p-4 space-y-4">
                      <p className="text-xs text-dim leading-relaxed">
                        Describe a hypothetical scenario and project how the crisis network would shift.
                      </p>
                      <textarea
                        value={whatIfInput}
                        onChange={e => setWhatIfInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleWhatIf())}
                        placeholder="What if a ceasefire is declared? What if oil prices drop 40%? What if the Strait closes?"
                        rows={4}
                        disabled={whatIfLoading}
                        className="w-full bg-surface2 border border-border2 text-text text-xs font-mono px-3 py-2.5 focus:outline-none focus:border-intel/50 resize-none transition-colors leading-relaxed"
                      />
                      <button onClick={handleWhatIf} disabled={whatIfLoading || !whatIfInput.trim()}
                        className="w-full py-2.5 bg-intel/12 border border-intel/30 text-intel font-display font-semibold text-[11px] tracking-[0.18em] hover:bg-intel/20 transition-colors disabled:opacity-25">
                        {whatIfLoading ? '◉ SIMULATING…' : '◇ RUN SIMULATION'}
                      </button>
                      {whatIfError && <p className="text-xs text-crisis-war">{whatIfError}</p>}
                      <div>
                        <div className="font-display text-[9px] text-dim/65 tracking-[0.22em] uppercase mb-2">Quick Scenarios</div>
                        {[
                          'What if a ceasefire is declared?',
                          'What if oil prices drop 40%?',
                          'What if international aid is cut?',
                          'What if sanctions are lifted?',
                        ].map(s => (
                          <button key={s} onClick={() => setWhatIfInput(s)}
                            className="block w-full text-left text-[11px] text-dim/85 py-2 border-b border-border/50 hover:text-intel transition-colors last:border-0">
                            ▸ {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                      <div>
                        <div className="font-display text-[9px] text-dim/40 tracking-[0.22em] uppercase mb-1">Scenario</div>
                        <p className="font-display font-bold text-text text-sm leading-snug tracking-wide">{whatIfResult.scenario_title}</p>
                      </div>
                      <div>
                        <SectionHeader label="Projected Outcome" />
                        <Prose text={whatIfResult.outcome_summary} className="text-xs text-dim leading-relaxed" />
                      </div>
                      {whatIfResult.key_changes.length > 0 && (
                        <div>
                          <SectionHeader label="Key Changes" />
                          <ul className="space-y-2">
                            {whatIfResult.key_changes.map((c, i) => (
                              <li key={i} className="flex gap-2 text-xs text-dim">
                                <span className="text-orange-500 shrink-0 mt-px">◈</span><span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {whatIfResult.modified_nodes.filter(m => m.delta !== 'unchanged').length > 0 && (
                        <div>
                          <SectionHeader label={`Modified Nodes (${whatIfResult.modified_nodes.length})`} />
                          <div className="space-y-2.5">
                            {whatIfResult.modified_nodes.filter(m => m.delta !== 'unchanged').map(m => {
                              const node = result.nodes.find(n => n.id === m.id)
                              const isUp = m.delta === 'escalates'
                              return (
                                <div key={m.id} className="flex gap-2 text-xs">
                                  <span className={`shrink-0 font-bold text-sm leading-tight ${isUp ? 'text-crisis-war' : 'text-green-500'}`}>
                                    {isUp ? '↑' : '↓'}
                                  </span>
                                  <div>
                                    <span className="text-text">{node?.title ?? m.id}</span>
                                    <span className="text-dim mx-1">→</span>
                                    <span style={{ color: SEV_COLOR[m.new_severity] }}>{m.new_severity}</span>
                                    <div className="text-[10px] text-dim/75 mt-0.5 italic leading-snug">{m.reason}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {whatIfResult.new_nodes.length > 0 && (
                        <div>
                          <SectionHeader label={`New Factors (${whatIfResult.new_nodes.length})`} />
                          <div className="space-y-2">
                            {whatIfResult.new_nodes.map(n => (
                              <div key={n.id} className="text-xs text-dim flex gap-2">
                                <span className="text-orange-400 shrink-0">·</span>
                                <span><span className="text-text">{n.title}</span> — {n.country}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={exitWhatIf}
                        className="w-full py-2 border border-border2 text-dim/70 font-display text-[10px] tracking-[0.18em] hover:border-crisis-war/40 hover:text-crisis-war transition-colors mt-1">
                        ✕ EXIT SIMULATION
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── ADD NODE TAB ── */}
              {rightTab === 'addnode' && (
                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                  <p className="text-xs text-dim leading-relaxed">
                    Describe a new crisis, event, or factor. AI creates the node and connects it to the existing graph.
                  </p>
                  <input
                    value={addNodeInput}
                    onChange={e => setAddNodeInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNode()}
                    placeholder="e.g. Drought in Kenya affecting food supply…"
                    disabled={addNodeLoading}
                    className="w-full bg-surface2 border border-border2 text-text text-xs font-mono px-3 py-2 focus:outline-none focus:border-intel/50 transition-colors"
                  />
                  <button onClick={handleAddNode} disabled={addNodeLoading || !addNodeInput.trim()}
                    className="w-full py-2.5 bg-intel/12 border border-intel/30 text-intel font-display font-semibold text-[11px] tracking-[0.18em] hover:bg-intel/20 transition-colors disabled:opacity-25">
                    {addNodeLoading ? '◉ CREATING…' : '+ INJECT NODE'}
                  </button>
                  {addNodeError && <p className="text-xs text-crisis-war">{addNodeError}</p>}
                  <div className="border-t border-border pt-3">
                    <div className="font-display text-[9px] text-dim/65 tracking-[0.22em] uppercase mb-2.5">How It Works</div>
                    {[
                      'Gemini creates a structured node from your description',
                      'Scans the existing graph for causal connections',
                      'If a link is found, edges are added automatically',
                      'Unconnected nodes float freely in the graph',
                    ].map((item, i) => (
                      <div key={i} className="flex gap-2 text-[10px] text-dim/75 mb-2">
                        <span className="text-intel/55 shrink-0 font-mono">{i + 1}.</span>
                        <span className="leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
              <svg className="w-10 h-10 text-dim/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 22h14"/>
                <path d="M5 2h14"/>
                <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
                <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
              </svg>
              <p className="font-display text-[10px] text-dim/80 tracking-[0.22em] text-center">AWAITING INVESTIGATION</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-7 bg-surface border-t border-border shrink-0 text-[9px] text-dim/50">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="tracking-[0.12em]">LIVE · GOOGLE NEWS RSS</span>
        </span>
        <span className="text-border2">│</span>
        <span className="tracking-[0.1em]">GEMINI 2.5 FLASH</span>
        <span className="text-border2">│</span>
        <span className="ml-auto font-display tracking-[0.18em] text-dim/25">ARIA v1.0 · GOOGLE HACKATHON 2026</span>
      </div>
    </div>
  )
}
