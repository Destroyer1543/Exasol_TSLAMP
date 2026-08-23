import { useCrisisDetail } from '../../hooks/useCrisisData'
import type { Crisis, StoryStep } from '../../types'
import { CRISIS_COLOR, SEV_COLOR, REL_COLOR } from '../../types'

interface Props {
  crisis: Crisis
  onClose: () => void
}

const SEV_BG: Record<string, string> = {
  CRITICAL:  'bg-red-950/40 border-red-900/50',
  HIGH:      'bg-orange-950/40 border-orange-900/50',
  MEDIUM:    'bg-yellow-950/30 border-yellow-900/40',
  LOW:       'bg-green-950/30 border-green-900/40',
  MONITORING:'bg-gray-900/40 border-gray-800',
}

function StoryChain({ steps, label }: { steps: StoryStep[], label: string }) {
  if (steps.length < 2) return null
  return (
    <div>
      <div className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-start overflow-x-auto pb-1 gap-0" style={{ scrollbarWidth: 'none' }}>
        {steps.map((step, i) => {
          const color = (CRISIS_COLOR as Record<string, string>)[step.type] ?? '#4b5563'
          const relColor = step.next_relationship
            ? (REL_COLOR as Record<string, string>)[step.next_relationship] ?? '#4b5563'
            : '#4b5563'
          return (
            <div key={step.id} className="flex items-center shrink-0">
              {/* Node pill */}
              <div className="flex flex-col items-center max-w-[88px]">
                <div className="text-[8px] font-bold px-1.5 py-0.5 rounded mb-0.5 text-center"
                  style={{ color, background: color + '18' }}>
                  {step.type.replace('_', ' ')}
                </div>
                <div className="text-[10px] font-semibold text-text text-center leading-tight px-1">
                  {step.title.length > 20 ? step.title.slice(0, 18) + '…' : step.title}
                </div>
                <div className="text-[8px] text-dim mt-0.5 text-center">{step.country}</div>
              </div>

              {/* Arrow connector */}
              {step.next_relationship && (
                <div className="flex flex-col items-center mx-2 shrink-0">
                  <div className="text-[7.5px] font-bold mb-0.5" style={{ color: relColor }}>
                    {step.next_relationship}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <div className="h-px w-6" style={{ background: relColor }} />
                    <span className="text-[10px] leading-none" style={{ color: relColor }}>›</span>
                  </div>
                  <div className="text-[7px] text-dim mt-0.5">
                    {Math.round((step.next_strength ?? 0) * 100)}% · {step.next_lag_days}d
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CrisisPanel({ crisis, onClose }: Props) {
  const { detail, predictions, story, briefing, loadingDetail, loadingBriefing, generateBriefing } = useCrisisDetail(crisis.id)
  const color    = CRISIS_COLOR[crisis.type]
  const sevColor = SEV_COLOR[crisis.severity]

  const upstreamStory   = story?.upstream_stories[0]
  const downstreamStory = story?.downstream_stories[0]

  return (
    <div className="panel-slide flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ color, borderColor: color + '55', background: color + '15' }}>
              {crisis.type.replace('_', ' ')}
            </span>
            <span className="text-[10px] font-bold" style={{ color: sevColor }}>● {crisis.severity}</span>
            {crisis.tags?.includes('chokepoint') && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-yellow-700/50 text-yellow-500 bg-yellow-950/30">
                ◆ CHOKEPOINT
              </span>
            )}
          </div>
          <h2 className="text-sm font-semibold text-text leading-snug">{crisis.title}</h2>
          <p className="text-xs text-dim mt-0.5">📍 {crisis.country} · since {crisis.start_date}</p>
        </div>
        <button onClick={onClose} className="text-dim hover:text-text transition-colors shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Description */}
        <p className="text-xs text-gray-300 leading-relaxed">{crisis.description}</p>

        {/* Sectors */}
        <div className="flex flex-wrap gap-1">
          {crisis.sectors_affected.map(s => (
            <span key={s} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-surface border border-border text-dim">
              {s}
            </span>
          ))}
        </div>

        {loadingDetail && <div className="text-xs text-dim animate-pulse">Loading chain...</div>}

        {/* ── Origin chain story ──────────────────────────────────────────── */}
        {upstreamStory && upstreamStory.steps.length >= 3 && (
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2.5">
            <StoryChain
              steps={upstreamStory.steps}
              label={`Origin chain · ${upstreamStory.total_lag_days}d cumulative lag`}
            />
          </div>
        )}

        {/* Upstream direct causes */}
        {detail && (
          <div>
            <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">
              Direct Causes
            </div>
            {detail.upstream.length === 0
              ? <p className="text-xs text-dim italic">Root cause — no upstream crises</p>
              : detail.upstream.map(u => (
                <div key={u.crisis.id} className="flex items-start gap-2 mb-1.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 mt-0.5"
                    style={{ color: REL_COLOR[u.relationship], background: REL_COLOR[u.relationship] + '20' }}>
                    {u.relationship}
                  </span>
                  <div>
                    <div className="text-xs text-text font-medium leading-tight">{u.crisis.title}</div>
                    <div className="text-[9px] text-dim">{u.crisis.country}</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* Downstream direct effects */}
        {detail && detail.downstream.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">
              Direct Effects
            </div>
            {detail.downstream.map(d => (
              <div key={d.crisis.id} className="flex items-start gap-2 mb-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 mt-0.5"
                  style={{ color: REL_COLOR[d.relationship], background: REL_COLOR[d.relationship] + '20' }}>
                  {d.relationship}
                </span>
                <div>
                  <div className="text-xs text-text font-medium leading-tight">{d.crisis.title}</div>
                  <div className="text-[9px] text-dim">{d.crisis.country} · {Math.round(d.strength * 100)}% strength</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cascade risk predictions */}
        {predictions.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">
              Cascade Risk Predictions
            </div>
            {predictions.slice(0, 4).map(p => (
              <div key={p.crisis_id} className={`rounded-lg border p-2.5 mb-2 ${SEV_BG[p.current_severity] ?? 'bg-surface border-border'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text">{p.title}</span>
                  <span className="text-[10px] font-bold ml-2 shrink-0" style={{ color: SEV_COLOR[p.current_severity] }}>
                    {Math.round(p.risk_score * 100)}%
                  </span>
                </div>
                <p className="text-[9px] text-dim leading-relaxed">{p.reason}</p>
                <p className="text-[9px] text-dim mt-1">Est. lag: {p.lag_days_estimate}d</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Cascade path story ─────────────────────────────────────────── */}
        {downstreamStory && downstreamStory.steps.length >= 3 && (
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2.5">
            <StoryChain
              steps={downstreamStory.steps}
              label={`Top cascade path · ${downstreamStory.total_lag_days}d to impact`}
            />
          </div>
        )}

        {/* AI Briefing */}
        <div>
          <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">
            AI Strategic Briefing
          </div>
          {briefing
            ? <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{briefing}</p>
            : <button
                onClick={generateBriefing}
                disabled={loadingBriefing}
                className="w-full text-xs border border-border text-dim hover:text-text hover:border-gray-500 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                {loadingBriefing ? 'Generating…' : '⚡ Generate Gemini Briefing'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}
