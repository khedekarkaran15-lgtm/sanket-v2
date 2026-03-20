import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TrendData } from "@/lib/types";
import { BRAND_MAP } from "@/lib/types";
import { toast } from "sonner";
import supabase from "@/lib/supabase";
import SignalEvidenceTable from "@/components/SignalEvidenceTable";
import ConsumerSignalPie from "@/components/ConsumerSignalPie";

// ─────────────────────────────────────────────────────────────────────────────
// ScoreDimensionCard — module-level component (never defined inside BriefPage).
// useState here is valid because this IS a top-level component.
// ─────────────────────────────────────────────────────────────────────────────
const ScoreDimensionCard = ({
  icon,
  label,
  scoreValue,
  rationaleText,
}: {
  icon: string;
  label: string;
  scoreValue: number;
  rationaleText: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const color =
    scoreValue >= 7 ? "#0D9488" :
    scoreValue >= 5 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="font-label text-sm text-foreground">{icon} {label}</span>
        <span className="font-mono font-bold text-lg" style={{ color }}>{scoreValue}/10</span>
      </div>
      <div className="w-full h-1.5 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, scoreValue * 10)}%`, background: color }}
        />
      </div>
      {rationaleText ? (
        <div>
          <p className={`text-xs text-muted-foreground leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
            {rationaleText}
          </p>
          {rationaleText.length > 160 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-teal mt-1 hover:underline"
            >
              {expanded ? "Show less" : "Show full reasoning →"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/40 italic">No reasoning available</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper functions — no hooks, no side effects
// ─────────────────────────────────────────────────────────────────────────────

function getScore(trend: TrendData, dim: string): number {
  const s = (trend.scores as any)?.[dim];
  if (typeof s === "number") return s;
  const map: Record<string, keyof TrendData> = {
    velocity:    "velocity_score",
    market:      "market_score",
    competition: "competition_score",
    timing:      "time_score",
    overall:     "overall_score",
  };
  return (trend[map[dim]] as number) ?? 0;
}

function getRationale(trend: TrendData, dim: string): string {
  const t = trend as any;
  if (dim === "velocity"    && t.velocityReasoning)    return String(t.velocityReasoning);
  if (dim === "market"      && t.marketReasoning)      return String(t.marketReasoning);
  if (dim === "competition" && t.competitionReasoning) return String(t.competitionReasoning);
  if (dim === "timing"      && t.timingReasoning)      return String(t.timingReasoning);
  const obj = t.rationale?.[dim];
  if (obj) return String(obj);
  const v1: Record<string, string> = {
    velocity:    "velocity_rationale",
    market:      "market_rationale",
    competition: "competition_rationale",
    timing:      "time_rationale",
  };
  return String(t[v1[dim]] ?? "");
}

function getField(trend: TrendData, ...keys: (keyof TrendData)[]): string {
  for (const k of keys) {
    const v = trend[k];
    if (v && typeof v === "string") return v;
  }
  return "";
}

function getBrands(trend: TrendData): string[] {
  if (Array.isArray((trend as any).brandFit) && (trend as any).brandFit.length) return (trend as any).brandFit;
  return trend.brand_fit ?? [];
}

const SCORE_DIMS = [
  { dim: "velocity",    icon: "⚡", label: "Velocity"            },
  { dim: "market",      icon: "💰", label: "Market Size"         },
  { dim: "competition", icon: "🛡️", label: "Competition"        },
  { dim: "timing",      icon: "⏱",  label: "Time-to-Mainstream" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// BriefPage — all hooks unconditionally at the top, early return after
// ─────────────────────────────────────────────────────────────────────────────
const BriefPage = () => {
  const { scanId, trendIndex } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [trend,           setTrend]           = useState<TrendData | null>(null);
  const [allTrends,       setAllTrends]       = useState<TrendData[]>([]);
  const [copied,          setCopied]          = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const methodRef = useRef<HTMLDivElement>(null);

  const idx = Number(trendIndex ?? "0");

  useEffect(() => {
    const state = location.state as any;
    if (state?.trend) setTrend(state.trend);
    if (state?.trends) {
      setAllTrends(state.trends);
      if (!state.trend) setTrend(state.trends[idx] ?? null);
    } else if (scanId) {
      supabase
        .from("scans")
        .select("claude_response")
        .eq("id", scanId)
        .single()
        .then(({ data }) => {
          if (data?.claude_response) {
            const ts = data.claude_response as TrendData[];
            setAllTrends(ts);
            setTrend(ts[idx] ?? null);
          }
        });
    }
  }, [scanId, trendIndex, location.state]);

  useEffect(() => {
    if (!showMethodology) return;
    const handler = (e: MouseEvent) => {
      if (methodRef.current && !methodRef.current.contains(e.target as Node)) {
        setShowMethodology(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMethodology]);

  // Early return AFTER all hooks
  if (!trend) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading brief...</p>
      </div>
    );
  }

  // Derived values — no hooks below this line
  const keyword      = getField(trend, "keyword", "trend_core_name") || "Trend";
  const title        = getField(trend, "headline", "trend_name") || keyword;
  const whyNow       = getField(trend, "whyNow", "why_now");
  const firstMove             = getField(trend, "firstMove", "first_move");
  // productRecommendation may live on the raw trend or inside brief_json (from Supabase)
  const t_ = trend as any;
  const productRec = (
    t_.productRecommendation ??
    t_.brief_json?.productRecommendation ??
    null
  ) as { product: string; price: string; targetConsumer: string; usp: string; positioning: string } | null;
  const recommendedFirstMove  = getField(trend, "recommendedFirstMove" as any);
  const riskFlag     = getField(trend, "riskFlag", "market_gap_exists_now");
  const cagrEstimate = getField(trend, "cagrEstimate", "hook_subheading");
  const consistency  = String((trend as any).consistencyFlag ?? trend.consistency_flag ?? "");
  const brands       = getBrands(trend);
  const evidence     = Array.isArray((trend as any).signalEvidence) && (trend as any).signalEvidence.length
    ? (trend as any).signalEvidence
    : (trend.signal_evidence ?? []);
  const quotes: string[] = Array.isArray((trend as any).consumerQuotes)
    ? (trend as any).consumerQuotes : [];
  const overallScore = getScore(trend, "overall");
  const isConfirmed  =
    Boolean((trend as any).isConfirmedTrend) ||
    trend.classification === "CONFIRMED_TREND" ||
    overallScore >= 6.5;
  const isNovel = Boolean((trend as any).isNovelKeyword);

  const handleCopy = () => {
    const text = [
      `📊 ${keyword}`,
      `Score: ${overallScore}/10 | ${isConfirmed ? "CONFIRMED TREND" : "LIKELY FAD"}`,
      `Brands: ${brands.join(", ")}`,
      "",
      whyNow,
      "",
      `First Move (60 days): ${firstMove}`,
      `Risk: ${riskFlag}`,
      `CAGR: ${cagrEstimate}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Brief copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  const goPrev = () => {
    if (idx <= 0) return;
    navigate(`/brief/${scanId}/${idx - 1}`, {
      state: { trend: allTrends[idx - 1], trends: allTrends },
    });
    window.scrollTo(0, 0);
  };

  const goNext = () => {
    if (idx >= allTrends.length - 1) return;
    navigate(`/brief/${scanId}/${idx + 1}`, {
      state: { trend: allTrends[idx + 1], trends: allTrends },
    });
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6">

        {/* Nav row */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(`/results/${scanId}`, { state: { trends: allTrends, scanId } })}
            className="px-4 py-2 rounded-md font-label text-[13px] text-muted-foreground border border-border hover:border-teal/50 hover:text-teal transition-all"
          >
            ← Back to Results
          </button>
          <nav className="flex items-center gap-1.5 text-sm">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">Home</button>
            <span className="text-muted-foreground">/</span>
            <button onClick={() => navigate(`/results/${scanId}`, { state: { trends: allTrends, scanId } })} className="text-muted-foreground hover:text-foreground">Results</button>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-label truncate max-w-[160px]">{keyword}</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-4">
          {cagrEstimate && (
            <p className="font-title text-xl text-teal mb-1">{cagrEstimate}</p>
          )}
          <h1 className="text-2xl md:text-3xl font-title text-foreground mb-1 leading-[1.3]">
            📊 {title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Score + methodology */}
            <div className="relative" ref={methodRef}>
              <div className="flex items-center gap-1.5">
                <span className="bg-accent text-accent-foreground font-mono font-bold text-lg px-3 py-1 rounded-lg">
                  {overallScore}/10
                </span>
                <button
                  onClick={() => setShowMethodology((v) => !v)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-label text-muted-foreground hover:text-foreground"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  ?
                </button>
              </div>
              {showMethodology && (
                <div
                  className="absolute top-full left-0 mt-2 rounded-xl z-50 p-5 w-[420px] max-w-[90vw]"
                  style={{ background: "#111827", border: "1px solid rgba(13,148,136,0.3)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
                >
                  <p className="text-[11px] uppercase tracking-widest font-label mb-1"
                    style={{ color: "rgba(148,163,184,0.5)" }}>
                    How the Overall Score is calculated
                  </p>
                  <p className="text-[12px] leading-relaxed mb-4"
                    style={{ color: "rgba(148,163,184,0.65)" }}>
                    Equal-weighted average of 4 dimensions (25% each). Confirmed Trend requires ≥ 7.5 overall + velocity ≥ 6 + timing ≥ 6 + 2+ active sources.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: "⚡", name: "Buzz / Velocity",      desc: "Cross-references Reddit, YouTube, News. Multi-source signals score higher. Single-source capped at 6/10." },
                      { icon: "📈", name: "Market Size",           desc: "McKinsey top-down MECE guesstimate. CAGR weighted 65%, absolute TAM 35%. Mosaic-addressable segment only." },
                      { icon: "🏁", name: "White Space",           desc: "Inverse competition scoring. Lower Amazon listing density = higher score. 0 brands + high demand = 9–10." },
                      { icon: "🕐", name: "Time-to-Mainstream",   desc: "Rogers' Diffusion of Innovation. Reddit = Innovators (9–10), YouTube niche = Early Adopters (7–8). Novel keywords +1 bonus." },
                    ].map((m) => (
                      <div key={m.name} className="rounded-lg p-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-[12px] font-semibold mb-1 text-foreground">{m.icon} {m.name}</p>
                        <p className="text-[11px] leading-relaxed"
                          style={{ color: "rgba(148,163,184,0.65)" }}>{m.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {brands.map((b) => {
              const brand = BRAND_MAP[b];
              return brand ? (
                <span
                  key={b}
                  className={`text-xs font-label px-2 py-0.5 rounded-full border ${brand.border} ${brand.bg}`}
                  style={{ color: brand.color }}
                >
                  {brand.label}
                </span>
              ) : null;
            })}

            <span className={`text-xs font-label px-2 py-0.5 rounded-full ${
              isConfirmed ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"
            }`}>
              {isConfirmed ? "✅ CONFIRMED TREND" : "⚠️ LIKELY FAD"}
            </span>
            {isNovel && (
              <span className="text-xs font-label px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30">
                🆕 First Discovery
              </span>
            )}
          </div>

          {whyNow && (
            <p className="text-sm text-foreground/70 mt-3">
              <span className="font-label">🕐 Why now:</span>{" "}
              {whyNow.replace(/^Why now:\s*/i, "")}
            </p>
          )}

          {consistency && (
            <div className="mt-3 p-3 rounded-lg bg-accent/10 border border-accent/30">
              <p className="text-xs font-label text-accent">⚠️ {consistency}</p>
            </div>
          )}
        </div>

        {/* Copy */}
        <div className="mb-6">
          <button
            onClick={handleCopy}
            className="w-full py-3.5 px-6 rounded-lg bg-teal text-white font-title text-sm hover:brightness-90 transition-all"
          >
            {copied ? "✅ Copied to Clipboard" : "📋 Copy Opportunity Brief"}
          </button>
        </div>

        {/* US Lag Indicator */}
        {(trend as any).usLagIndicator && (
          <section className="mb-6">
            <div className="p-3 rounded-lg border border-violet-500/30 bg-violet-500/5 flex items-start gap-2">
              <span className="text-violet-400 text-sm shrink-0">🌍</span>
              <div>
                <p className="text-[11px] font-label text-violet-400 uppercase tracking-wide mb-0.5">US/UK → India Lag Signal</p>
                <p className="text-xs text-foreground/75 leading-relaxed">{(trend as any).usLagIndicator}</p>
              </div>
            </div>
          </section>
        )}

        {/* Score breakdown */}
        <section className="mb-8">
          <h2 className="text-lg font-title text-foreground mb-3">Score Breakdown</h2>
          <p className="text-xs text-muted-foreground mb-3">Hover or tap each dimension to see AI reasoning.</p>
          {/* 2×2 grid matching card layout */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {SCORE_DIMS.map(({ dim, icon, label }) => {
              const val = getScore(trend, dim);
              const col = val >= 7 ? '#0D9488' : val >= 5 ? '#f59e0b' : '#ef4444';
              return (
                <div key={dim} className="p-4 rounded-xl bg-card border border-border flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-label text-sm text-foreground">{icon} {label}</span>
                    <span className="font-mono font-bold text-lg" style={{ color: col }}>{val}/10</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, val*10)}%`, background: col }} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {getRationale(trend, dim) || <span className="italic opacity-50">Reasoning generated on next scan</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Signal evidence — augmented with US-lag if present */}
        <SignalEvidenceTable evidence={[
          ...evidence,
          ...((trend as any).usLagIndicator ? [{
            source: 'US-Lag Signal',
            metric: 'India entry window',
            insight: (trend as any).usLagIndicator,
            strength: (trend as any).usLagIndicator?.toLowerCase().includes('open') ? 'Strong'
              : (trend as any).usLagIndicator?.toLowerCase().includes('closing') ? 'Moderate'
              : 'Weak',
          }] : []),
        ] as any} />

        <div className="mb-8 flex justify-center">
          <ConsumerSignalPie evidence={evidence as any} />
        </div>

        {/* Why Now */}
        {whyNow && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">Why Now</h2>
            <div className="p-4 rounded-xl bg-card border border-border">
              <p className="text-sm text-foreground/80 leading-relaxed">{whyNow}</p>
            </div>
          </section>
        )}

        {/* Market context */}
        {cagrEstimate && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">Market Context</h2>
            <div className="p-4 rounded-xl bg-card border border-border border-l-4 border-l-teal">
              <p className="text-sm text-foreground/80">{cagrEstimate}</p>
            </div>
          </section>
        )}

        {/* Risk */}
        {riskFlag && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">Risk Flag</h2>
            <div className="p-4 rounded-xl bg-card border border-border border-l-4 border-l-destructive">
              <p className="text-sm text-foreground/80">⚠️ {riskFlag}</p>
            </div>
          </section>
        )}

        {/* Consumer quotes */}
        {quotes.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">Consumer Language</h2>
            <div className="space-y-2">
              {quotes.map((q, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border">
                  <p className="text-sm text-foreground/70 italic">"{q}"</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Product Recommendation */}
        {productRec && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">🛍️ Potential Product</h2>
            <div className="rounded-xl border border-teal/30 bg-teal/5 overflow-hidden">
              {/* Product name header */}
              <div className="px-4 py-3 border-b border-teal/20 flex items-start justify-between gap-3">
                <p className="font-title text-sm text-teal leading-snug">{productRec.product}</p>
              </div>
              {/* Price row — highlighted */}
              <div className="grid grid-cols-2 border-b border-border/20">
                {productRec.price && (
                  <div className="px-4 py-3 border-r border-border/20">
                    <p className="text-[10px] font-label text-muted-foreground uppercase tracking-wider mb-1">Our Price</p>
                    <p className="text-base font-bold text-teal">{productRec.price}</p>
                  </div>
                )}
                {(productRec as any).competitorPriceRange && (
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-label text-muted-foreground uppercase tracking-wider mb-1">Competitor Range</p>
                    <p className="text-sm text-foreground/70">{(productRec as any).competitorPriceRange}</p>
                  </div>
                )}
              </div>
              {/* Rest of fields */}
              <div className="grid grid-cols-1 divide-y divide-border/20">
                {[
                  { label: 'Target Consumer', val: productRec.targetConsumer, icon: '👤' },
                  { label: 'USP',             val: productRec.usp,            icon: '⭐' },
                  { label: 'Positioning',     val: productRec.positioning,    icon: '📣' },
                ].map(({ label, val, icon }) => val && (
                  <div key={label} className="px-4 py-3 flex gap-3">
                    <span className="text-base shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-[10px] font-label text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-sm text-foreground/85 leading-snug">{val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Regulatory Note */}
        {(trend as any).regulatoryNote && (trend as any).regulatoryNote !== 'No current regulatory barrier identified' && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">⚖️ Regulatory Note</h2>
            <div className="p-4 rounded-xl bg-card border border-border border-l-4 border-l-amber-500">
              <p className="text-sm text-foreground/80">{(trend as any).regulatoryNote}</p>
            </div>
          </section>
        )}

        {/* Recommended First Move */}
        {(recommendedFirstMove || firstMove) && (
          <section className="mb-8">
            <h2 className="text-lg font-title text-foreground mb-3">🚀 Recommended First Move</h2>
            <div className="p-5 rounded-xl border-2 border-teal/30 bg-teal/5">
              <p className="text-foreground leading-relaxed text-sm">{recommendedFirstMove || firstMove}</p>
            </div>
          </section>
        )}

        {/* Copy */}
        <div className="mb-8">
          <button
            onClick={handleCopy}
            className="w-full py-3.5 px-6 rounded-lg bg-teal text-white font-title text-sm hover:brightness-90 transition-all"
          >
            {copied ? "✅ Copied to Clipboard" : "📋 Copy Opportunity Brief"}
          </button>
        </div>

        {/* Prev / Next */}
        {allTrends.length > 1 && (
          <div className="flex items-center justify-between py-4 border-t border-border">
            {idx > 0 ? (
              <button
                onClick={goPrev}
                className="flex items-center gap-2 px-4 py-2 rounded-md font-label text-sm text-teal border border-teal/50 hover:bg-teal/[0.08] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="truncate max-w-[140px]">
                  {String(allTrends[idx - 1]?.headline ?? allTrends[idx - 1]?.trend_name ?? "").split(":")[0]}
                </span>
              </button>
            ) : <div />}
            {idx < allTrends.length - 1 ? (
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-4 py-2 rounded-md font-label text-sm text-teal border border-teal/50 hover:bg-teal/[0.08] transition-all"
              >
                <span className="truncate max-w-[140px]">
                  {String(allTrends[idx + 1]?.headline ?? allTrends[idx + 1]?.trend_name ?? "").split(":")[0]}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : <div />}
          </div>
        )}

      </div>
    </div>
  );
};

export default BriefPage;