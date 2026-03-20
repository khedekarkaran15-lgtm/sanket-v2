import { useNavigate } from "react-router-dom";
import { useSwipeable } from "react-swipeable";
import { useState, useEffect } from "react";
import type { TrendData } from "@/lib/types";
import { BRAND_MAP, BRAND_BORDER_COLORS } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSankET } from "@/contexts/SankETContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface OpportunityCardProps {
  trend: TrendData;
  index: number;
  scanId: string;
  allTrends?: TrendData[];
}

function getScoreBadgeStyle(score: number) {
  if (score >= 7.5) return { bg: "rgba(13,148,136,0.12)", border: "rgba(13,148,136,0.35)", color: "#0D9488" };
  if (score >= 5.0) return { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", color: "#f59e0b" };
  return { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", color: "#ef4444" };
}

// Score pill colours for the 4 dimensions
function dimColor(val: number): string {
  if (val >= 7) return "#0D9488";
  if (val >= 5) return "#f59e0b";
  return "#ef4444";
}

// Human-readable labels with short tooltips
const DIM_META: Record<string, { icon: string; label: string; tip: string }> = {
  velocity:    { icon: "⚡", label: "Buzz",    tip: "How much social chatter (Reddit + YouTube + News) exists right now. Capped at 6/10 if only one source has data." },
  market:      { icon: "📈", label: "Market",  tip: "Estimated TAM × CAGR for the India D2C opportunity. McKinsey-style top-down sizing." },
  competition: { icon: "🏁", label: "Space",   tip: "Inverse competition. Higher = more white space. 9-10 means near-zero Amazon listings." },
  timing:      { icon: "🕐", label: "Timing",  tip: "Rogers Diffusion stage. 9-10 = Innovators phase (best entry window). 3-4 = already mainstream." },
};

// Resolve scores from either v2 scores object or v1 top-level fields
function resolveScore(trend: TrendData, dim: string): number {
  const s = (trend.scores as any)?.[dim];
  if (typeof s === "number") return s;
  const map: Record<string, keyof TrendData> = {
    velocity: "velocity_score", market: "market_score",
    competition: "competition_score", timing: "time_score", overall: "overall_score",
  };
  return (trend[map[dim]] as number) ?? 0;
}

function resolveRationale(trend: TrendData, dim: string): string {
  const t = trend as any;
  const flatMap: Record<string, string> = {
    velocity: "velocityReasoning", market: "marketReasoning",
    competition: "competitionReasoning", timing: "timingReasoning",
  };
  return t[flatMap[dim]] || t.rationale?.[dim] || (t as any)[`${dim}_rationale`] || "";
}

const OpportunityCard = ({ trend, index, scanId, allTrends }: OpportunityCardProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { savedTrends, toggleSaved, dismissedTrends, toggleDismissed } = useSankET();
  const trendId = trend.keyword ?? String(index);
  const [swipeOverlay, setSwipeOverlay] = useState<"saved" | "removed" | null>(null);
  const [showHint, setShowHint] = useState(false);

  const overallScore    = resolveScore(trend, "overall");
  const velocityScore   = resolveScore(trend, "velocity");
  const marketScore     = resolveScore(trend, "market");
  const competitionScore = resolveScore(trend, "competition");
  const timingScore     = resolveScore(trend, "timing");

  const isDismissed = dismissedTrends.includes(trendId);
  const brands: string[] = trend.brand_fit ?? [];
  const primaryBrand = brands[0] ?? "New Category";
  const borderClass = BRAND_BORDER_COLORS[primaryBrand] ?? "border-l-amber-400";
  const badge = getScoreBadgeStyle(overallScore);

  // Card content
  const keyword   = String(trend.keyword ?? trend.trend_core_name ?? "");
  const headline  = String(trend.headline ?? trend.trend_name ?? keyword);
  const hookLine  = String(trend.cagrEstimate ?? trend.hook_subheading ?? "");
  const whyNow    = String(trend.whyNow ?? trend.why_now ?? "");
  const isConfirmed    = Boolean(trend.isConfirmedTrend) || trend.classification === "CONFIRMED_TREND";
  const isNovel        = Boolean((trend as any).isNovelKeyword);

  useEffect(() => {
    if (isMobile && index < 3 && !localStorage.getItem("hasSeenSwipeHint")) setShowHint(true);
  }, [isMobile, index]);

  const clearHint = () => {
    localStorage.setItem("hasSeenSwipeHint", "true");
    setShowHint(false);
  };

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      clearHint();
      const wasSaved = savedTrends.includes(trendId);
      toggleSaved(trendId);
      setSwipeOverlay(wasSaved ? "removed" : "saved");
      setTimeout(() => setSwipeOverlay(null), 600);
    },
    onSwipedLeft: () => { clearHint(); toggleDismissed(trendId); },
    trackMouse: false, preventScrollOnSwipe: true, delta: 50,
    ...(!isMobile && { disabled: true }),
  } as any);

  const handleCardClick = () => {
    if (isDismissed) { toggleDismissed(trendId); return; }
    navigate(`/brief/${scanId}/${index}`, { state: { trend, trends: allTrends } });
  };

  const dims = [
    { key: "velocity",    val: velocityScore    },
    { key: "market",      val: marketScore      },
    { key: "competition", val: competitionScore },
    { key: "timing",      val: timingScore      },
  ];

  return (
    <div {...swipeHandlers}>
      <div
        className={`relative flex flex-col gap-3 bg-card rounded-xl border border-border p-4 border-l-4 ${borderClass}
          hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 animate-fade-up cursor-pointer
          ${isDismissed ? "opacity-25 grayscale-[80%]" : ""}`}
        style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
        onClick={handleCardClick}
      >
        {swipeOverlay && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/20 animate-fade-up">
            <span className="font-title text-base text-foreground">{swipeOverlay === "saved" ? "⭐ Saved" : "Removed"}</span>
          </div>
        )}

        {/* ── Top row: keyword + score badge ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Keyword slug */}
            <p className="font-label text-[11px] uppercase tracking-widest text-muted-foreground truncate mb-0.5">
              {keyword}
            </p>
            {/* Headline */}
            <h2 className="font-title text-[15px] leading-snug text-foreground">
              {headline}
            </h2>
            {/* CAGR hook */}
            {hookLine && (
              <p className="font-label text-[12px] text-teal mt-0.5 leading-tight">{hookLine}</p>
            )}
          </div>

          {/* Score badge */}
          <div className="flex-shrink-0 rounded-xl px-3 py-2 text-center"
            style={{ background: badge.bg, border: `1px solid ${badge.border}` }}>
            <span className="font-label text-[9px] uppercase tracking-wider block" style={{ color: badge.color }}>Score</span>
            <span className="font-mono font-bold text-[22px] leading-none block" style={{ color: badge.color }}>
              {overallScore.toFixed(1)}
            </span>
            <span className="font-label text-[9px]" style={{ color: badge.color }}>/10</span>
          </div>
        </div>

        {/* ── Brand + status badges ── */}
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => {
            const brand = BRAND_MAP[b];
            return brand ? (
              <span key={b} className={`text-[11px] font-label px-2 py-0.5 rounded-full border ${brand.border} ${brand.bg}`}
                style={{ color: brand.color }}>{brand.label}</span>
            ) : null;
          })}
          <span className={`text-[11px] font-label px-2 py-0.5 rounded-full border ${
            isConfirmed
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
          }`}>
            {isConfirmed ? "✅ Confirmed Trend" : "⚠️ Likely Fad"}
          </span>
          {isNovel && (
            <span className="text-[11px] font-label px-2 py-0.5 rounded-full border bg-violet-500/10 text-violet-400 border-violet-500/30">
              🆕 First Discovery
            </span>
          )}
        </div>

        {/* ── Why now (1 line) ── */}
        {whyNow && (
          <p className="text-[12px] leading-relaxed"
            style={{
              color: "rgba(232,234,240,0.60)",
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
            {whyNow.replace(/^Why now:\s*/i, "")}
          </p>
        )}

        {/* ── 4-dimension score pills ── */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {dims.map(({ key, val }) => {
            const { icon, label, tip } = DIM_META[key];
            const col = dimColor(val);
            const pct = Math.min(100, val * 10);
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 cursor-help"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="text-[13px]">{icon}</span>
                    <span className="font-label text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
                    {/* Mini bar */}
                    <div className="w-full h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
                    </div>
                    <span className="font-mono text-[11px] font-semibold" style={{ color: col }}>{val}/10</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">{tip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* ── Footer: Brief button ── */}
        <div className="flex items-center justify-end pt-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            className="px-4 py-1.5 rounded-md font-label text-xs text-teal border border-teal/40 bg-transparent hover:bg-teal/[0.08] hover:border-teal transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
          >
            Full Brief →
          </button>
        </div>

        {isDismissed && (
          <p className="text-center text-xs text-muted-foreground mt-1">Dismissed — tap to restore</p>
        )}
        {showHint && !isDismissed && (
          <p className="text-center text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            ← Dismiss · Swipe · Save →
          </p>
        )}
      </div>
    </div>
  );
};

export default OpportunityCard;
