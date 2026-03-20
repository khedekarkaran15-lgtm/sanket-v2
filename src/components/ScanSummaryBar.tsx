import { useState } from "react";
import type { TrendData } from "@/lib/types";
import { Info } from "lucide-react";

interface ScanSummaryBarProps {
  trends: TrendData[];
}

// ── Score methodology tooltip ─────────────────────────────────────────────
const SCORE_DIMS = [
  {
    icon: "⚡", name: "Buzz",        weight: "25%",
    desc: "Cross-references Reddit, YouTube, and News. Multi-source signals score higher. Single-source capped at 6/10.",
  },
  {
    icon: "📈", name: "Market Size", weight: "25%",
    desc: "McKinsey top-down MECE guesstimate. CAGR weighted 65%, absolute TAM 35%. Mosaic-addressable segment only.",
  },
  {
    icon: "🏁", name: "White Space", weight: "25%",
    desc: "Inverse competition scoring. Lower Amazon listing density = higher score. 0 brands + high demand = 9–10.",
  },
  {
    icon: "🕐", name: "Timing",      weight: "25%",
    desc: "Rogers' Diffusion: Reddit organic = Innovators (9–10), YouTube niche = Early Adopters (7–8). Novel keywords get +1 bonus.",
  },
];

const ScoreTooltip = () => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: "#f59e0b" }}
        aria-label="How the score is calculated"
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 text-left pointer-events-none flex flex-col items-center"
          style={{ width: 718
           }}
        >
          {/* Arrow pointing up toward the icon */}
          <span
            className="w-8 h-3 rotate-45 -mb-1.5 shrink-0"
            style={{ background: "#111827", borderTop: "1px solid rgba(13,148,136,0.3)", borderLeft: "1px solid rgba(13,148,136,0.3)" }}
          />
          <span
            className="block rounded-xl p-4 shadow-2xl w-full"
            style={{ background: "#111827", border: "1px solid rgba(13,148,136,0.3)" }}
          >
            <span className="block text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "rgba(148,163,184,0.6)" }}>
              How Overall Score is calculated
            </span>
            <span className="block text-[11px] mb-3 leading-relaxed"
              style={{ color: "rgba(148,163,184,0.7)" }}>
              Equal-weighted average of 4 dimensions (25% each).
              Confirmed Trend requires ≥ 7.5 overall, velocity ≥ 6, timing ≥ 6, and 2+ active sources.
            </span>
            {SCORE_DIMS.map(({ icon, name, weight, desc }) => (
              <span key={name} className="block mb-2 last:mb-0">
                <span className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-semibold" style={{ color: "#e8eaf0" }}>
                    {icon} {name}
                  </span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: "#0D9488" }}>
                    {weight}
                  </span>
                </span>
                <span className="block text-[10px] leading-relaxed"
                  style={{ color: "rgba(148,163,184,0.6)" }}>
                  {desc}
                </span>
              </span>
            ))}
          </span>

        </span>
      )}
    </span>
  );
};

// ── Marquee text — scrolls on hover to reveal full string ─────────────────
const MarqueeText = ({ text, maxWidth = 240 }: { text: string; maxWidth?: number }) => {
  const [hovered, setHovered] = useState(false);
  const CLIP = 32;
  const isLong = text.length > CLIP;

  return (
    <span
      className="inline-block overflow-hidden align-bottom"
      style={{ maxWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={text}
    >
      {isLong && hovered ? (
        <>
          <style>{`
            @keyframes ssb-marquee {
              0%   { transform: translateX(0); }
              20%  { transform: translateX(0); }
              80%  { transform: translateX(calc(-100% + ${maxWidth}px)); }
              100% { transform: translateX(calc(-100% + ${maxWidth}px)); }
            }
          `}</style>
          <span
            className="inline-block whitespace-nowrap"
            style={{ animation: "ssb-marquee 3.5s ease-in-out infinite alternate" }}
          >
            {text}
          </span>
        </>
      ) : (
        <span className="inline-block whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth }}>
          {text}
        </span>
      )}
    </span>
  );
};

// ── ScanSummaryBar ─────────────────────────────────────────────────────────
const ScanSummaryBar = ({ trends }: ScanSummaryBarProps) => {
  if (!trends.length) return null;

  const avgScore = (
    trends.reduce((sum, t) => sum + ((t as any).overall_score ?? (t as any).scores?.overall ?? 0), 0) /
    trends.length
  ).toFixed(1);

  const best = trends.reduce((a, b) => {
    const sa = (a as any).overall_score ?? (a as any).scores?.overall ?? 0;
    const sb = (b as any).overall_score ?? (b as any).scores?.overall ?? 0;
    return sb > sa ? b : a;
  }, trends[0]);

  const bestName = (best as any).keyword
    || (best as any).trend_core_name
    || ((best as any).trend_name ?? "").split(":")[0]
    || "Top Trend";

  const bestStat = (best as any).cagrEstimate
    || (best as any).hook_subheading
    || `${((best as any).overall_score ?? 0).toFixed(1)}/10`;

  const bestText = `${bestName} · ${bestStat}`;

  return (
    <div
      className="flex items-center justify-between h-12 px-4 md:px-8"
      style={{
        background: "rgba(13,148,136,0.08)",
        borderBottom: "1px solid rgba(13,148,136,0.2)",
      }}
    >
      {/* Segment 1 — opportunity count */}
      <span className="font-label text-[13px] text-foreground whitespace-nowrap">
        {trends.length} Opportunities Found
      </span>

      {/* Divider */}
      <div className="w-px h-5 mx-5 hidden sm:block" style={{ background: "rgba(255,255,255,0.1)" }} />

      {/* Segment 2 — avg score + tooltip */}
      <span
        className="font-label text-[13px] whitespace-nowrap hidden sm:inline-flex items-center"
        style={{ color: "#f59e0b" }}
      >
        Avg Score {avgScore}
        <ScoreTooltip />
      </span>

      {/* Divider */}
      <div className="w-px h-5 mx-5 hidden md:block" style={{ background: "rgba(255,255,255,0.1)" }} />

      {/* Segment 3 — best trend with marquee */}
      <span
        className="font-label text-[13px] hidden md:inline-flex items-center"
        style={{ color: "#0D9488", maxWidth: 240 }}
      >
        Best:&nbsp;<MarqueeText text={bestText} maxWidth={200} />
      </span>
    </div>
  );
};

export default ScanSummaryBar;