import type { OpportunityBrief } from "../lib/types";

interface TrendCardProps {
  brief: OpportunityBrief;
  onClick: () => void;
}

const scoreBadgeClass = (score: number) => {
  if (score >= 8) return "bg-emerald-500/20 text-emerald-300 border-emerald-400/60";
  if (score >= 6) return "bg-teal-500/20 text-teal-300 border-teal-400/60";
  if (score >= 4) return "bg-amber-500/20 text-amber-300 border-amber-400/60";
  return "bg-red-500/20 text-red-300 border-red-400/60";
};

const brandChipClass = (brand: string) => {
  switch (brand) {
    case "Man Matters":
      return "bg-blue-600/20 text-blue-200 border-blue-500/60";
    case "Be Bodywise":
      return "bg-pink-600/20 text-pink-200 border-pink-500/60";
    case "Little Joys":
      return "bg-purple-600/20 text-purple-200 border-purple-500/60";
    case "Root Labs":
      return "bg-emerald-600/20 text-emerald-200 border-emerald-500/60";
    case "New Category":
      return "bg-amber-600/20 text-amber-200 border-amber-500/60";
    default:
      return "bg-slate-700/40 text-slate-200 border-slate-500/60";
  }
};

const clampWhyNow = (text: string) => {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= 100) return trimmed;
  return `${trimmed.slice(0, 100)}...`;
};

export function TrendCard({ brief, onClick }: TrendCardProps) {
  const overall = brief.scores.overall;

  const miniScores = [
    { label: "V", value: brief.scores.velocity },
    { label: "M", value: brief.scores.market },
    { label: "C", value: brief.scores.competition },
    { label: "T", value: brief.scores.timing },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-[#1e2d3d] bg-[#0d1117] px-4 py-3 shadow-sm hover:shadow-md hover:border-[#0D9488] transition transform hover:-translate-y-0.5 cursor-pointer"
    >
      {/* Top row: keyword + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-mono text-slate-400 truncate">
            {brief.keyword}
          </div>
        </div>
        <div
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-mono ${scoreBadgeClass(
            overall,
          )}`}
        >
          <span>{overall.toFixed(1)}</span>
          <span className="ml-1 text-[9px] opacity-80">/10</span>
        </div>
      </div>

      {/* Brand chips */}
      {brief.brandFit && brief.brandFit.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {brief.brandFit.map((brand) => (
            <span
              key={brand}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${brandChipClass(
                brand,
              )}`}
            >
              {brand}
            </span>
          ))}
        </div>
      )}

      {/* Headline */}
      <div className="mt-2 text-sm font-semibold text-slate-50 line-clamp-2">
        {brief.headline}
      </div>

      {/* whyNow preview */}
      <div className="mt-1 text-xs text-slate-400">
        {clampWhyNow(brief.whyNow)}
      </div>

      {/* Bottom row: mini scores + confirmed badge */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>V</span>
            <span>M</span>
            <span>C</span>
            <span>T</span>
          </div>
          <div className="flex gap-1">
            {miniScores.map((s) => (
              <div key={s.label} className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-400"
                  style={{ width: `${Math.min(100, Math.max(0, (s.value / 10) * 100))}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        {brief.isConfirmedTrend && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 whitespace-nowrap">
            CONFIRMED TREND
          </span>
        )}
      </div>
    </button>
  );
}

export default TrendCard;
