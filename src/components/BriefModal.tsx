import type { OpportunityBrief } from "../lib/types";

interface BriefModalProps {
  brief: OpportunityBrief | null;
  onClose: () => void;
}

const scoreBadgeClass = (score: number) => {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-300 border-emerald-400/60";
  if (score >= 6) return "bg-teal-500/20 text-teal-300 border-teal-400/60";
  if (score >= 4) return "bg-amber-500/20 text-amber-300 border-amber-400/60";
  return "bg-red-500/20 text-red-300 border-red-400/60";
};

/** Render a signalEvidence entry — handles both string (legacy) and object (v2) */
function SignalItem({ item, idx }: { item: any; idx: number }) {
  if (!item) return null;
  if (typeof item === 'string') {
    return <li key={idx} className="text-sm text-slate-200">• {item}</li>;
  }
  const source   = String(item.source   ?? '');
  const metric   = String(item.metric   ?? '');
  const insight  = String(item.insight  ?? '');
  const strength = item.strength ?? '';
  const strengthColor =
    strength === 'Strong'   ? 'text-emerald-400' :
    strength === 'Moderate' ? 'text-amber-400'   : 'text-slate-400';
  return (
    <li className="flex items-start gap-2 text-sm text-slate-200">
      <span className={`font-semibold shrink-0 ${strengthColor}`}>[{source}]</span>
      <span>
        {metric && <span className="text-slate-400 mr-1">{metric}:</span>}
        {insight}
      </span>
    </li>
  );
}

export function BriefModal({ brief, onClose }: BriefModalProps) {
  if (!brief) return null;

  const { scores, velocityReasoning, marketReasoning, competitionReasoning, timingReasoning } = brief;

  const scoreItems = [
    { label: "Velocity",    value: scores.velocity,    rat: velocityReasoning    },
    { label: "Market",      value: scores.market,      rat: marketReasoning      },
    { label: "Competition", value: scores.competition, rat: competitionReasoning },
    { label: "Timing",      value: scores.timing,      rat: timingReasoning      },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-[#0d1117] text-white shadow-2xl border border-[#1e2d3d]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#1e2d3d] px-6 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="truncate text-xs font-mono text-slate-400">{brief.keyword}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono ${scoreBadgeClass(scores.overall)}`}>
                <span>{scores.overall.toFixed(1)}</span>
                <span className="ml-1 text-[9px] opacity-80">/10</span>
              </span>
              {brief.isConfirmedTrend && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                  Confirmed
                </span>
              )}
            </div>
            {brief.brandFit && brief.brandFit.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {brief.brandFit.map((brand) => (
                  <span key={brand} className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/70 px-2 py-0.5 text-[10px] text-slate-100">
                    {brand}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[calc(90vh-4rem)] overflow-y-auto px-6 py-4 space-y-5">

          <section>
            <h2 className="text-xl font-semibold text-teal-300">{brief.headline}</h2>
          </section>

          {/* Score bars with rationale */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Scores</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {scoreItems.map((s) => (
                <div key={s.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{s.label}</span>
                    <span className="font-mono text-slate-200">{s.value.toFixed(1)}/10</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-teal-400"
                      style={{ width: `${Math.min(100, Math.max(0, (s.value / 10) * 100))}%` }} />
                  </div>
                  {s.rat && (
                    <p className="text-[11px] text-slate-500 line-clamp-3">{s.rat}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Why now */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Why now</h3>
            <p className="text-sm text-slate-100 whitespace-pre-line">{brief.whyNow}</p>
          </section>

          {/* Signal evidence — fixed: render objects properly */}
          {brief.signalEvidence && brief.signalEvidence.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Signal evidence</h3>
              <ul className="space-y-1.5">
                {brief.signalEvidence.map((item, idx) => (
                  <SignalItem key={idx} item={item} idx={idx} />
                ))}
              </ul>
            </section>
          )}

          {/* Consumer language */}
          {brief.consumerQuotes && brief.consumerQuotes.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Consumer language</h3>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 space-y-1">
                {brief.consumerQuotes.slice(0, 6).map((q, idx) => (
                  <p key={idx} className="italic text-sm text-slate-200">&ldquo;{q}&rdquo;</p>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">CAGR estimate</h3>
              <p className="text-sm text-slate-100">{brief.cagrEstimate}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">First move recommendation</h3>
              <div className="rounded-xl border border-teal-500/60 bg-teal-500/5 px-3 py-2 text-sm text-slate-100">
                {brief.firstMove}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Risk flag</h3>
            <div className="rounded-xl border border-amber-500/70 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {brief.riskFlag}
            </div>
          </section>

          {brief.consistencyFlag && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5">
              <p className="text-xs text-amber-200">⚠️ {brief.consistencyFlag}</p>
            </section>
          )}

          {brief.isConfirmedTrend && (
            <section className="rounded-xl border border-emerald-500/70 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 text-center">
              CONFIRMED TREND — Signal in 3+ sources
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default BriefModal;