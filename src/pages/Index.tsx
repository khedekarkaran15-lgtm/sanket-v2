import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HistoryDrawer from "@/components/HistoryDrawer";
import RadarProcessing from "@/components/RadarProcessing";
import type { ScanRecord, OpportunityBrief } from "@/lib/types";
import { toast } from "sonner";
import {
  TrendingUp, Youtube, ShoppingCart, BookOpen, Newspaper,
  X, AlertTriangle, Zap, ArrowRight, Info, BookOpenCheck,
} from "lucide-react";
import { runAgentScan, getRunHistory } from "@/agent/orchestrator";
import supabase from "@/lib/supabase";

// ── FAQ ────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "What does SankET do?",
    a: "SankET is a 3-stage market intelligence platform that scans 7 live data sources to surface wellness ingredient trends in India 3–6 months before they reach mainstream D2C. Built specifically for Mosaic brands — Man Matters, Be Bodywise, Little Joys, Root Labs.",
  },
  {
    q: "How does it work?",
    a: "Stage 1 — Discovery (~2 min)\nScans Reddit India, YouTube wellness channels, Indian & US news. Gemini AI extracts 8–12 emerging keyword signals.\n\nStage 2 — Validation (~5 min)\nFor each keyword: Google Trends slope, Amazon India listings with real review counts, YouTube engagement, PubMed papers, and news coverage.\n\nStage 3 — Briefing (~3 min)\nGemini scores each trend on 4 dimensions and generates a full D2C opportunity brief — product recommendation, pricing, competitor range, US-lag indicator, and first move.",
  },
  {
    q: "What happens after I click Run Trend Scan?",
    a: "You're redirected to a live progress screen. The scan takes 6–10 minutes. Once complete, you land on the results page with all opportunity briefs sorted by score.",
  },
  {
    q: "Can I access previous scans?",
    a: "Yes — use 'View previous scans →' below the CTA buttons. This opens a history drawer with all past completed scans. You can also use 'Load Last Scan' to instantly reload the most recent results without running a new scan.",
  },
  {
    q: "What if I'm in a time crunch?",
    a: "Use 'Load Last Scan' — it loads the most recent completed scan from the database instantly, with no API calls. Ideal for demos or review sessions.",
  },
  {
    q: "What do the 4 scores mean?",
    a: "⚡ Buzz (1–10): Social momentum across Reddit, YouTube, News\n📈 Market (1–10): Mosaic-addressable India market size\n🏁 Space (1–10): White space — higher = fewer competitors\n🕐 Timing (1–10): Rogers Diffusion stage — 8+ = Innovators/Early Adopters",
  },
  {
    q: "What is the US-lag indicator?",
    a: "Indian D2C supplement trends typically lag US trends by 12–24 months. SankET fetches live US media signals and uses Gemini to flag whether the India entry window is open, closing, or closed.",
  },
  {
    q: "Can I download the opportunity briefs?",
    a: "Yes — use 'Download Report' on the results page to export a clean, formatted PDF ready to share across teams.",
  },
];

const API_CONSTRAINTS_NOTE = `SankET currently runs on free-tier API plans, which means:

• Serper (Reddit/Google Search): ~2,500 calls/month
• YouTube Data API v3: 10,000 units/day (~8 scans)
• SerpAPI (Google Trends): 250 searches/month
• Gemini: gemini-flash-lite (free tier model)
• NewsAPI: 30-day article lookback

In a production deployment with paid plans, SankET would operate with significantly higher scraping frequency, deeper Reddit/YouTube signal extraction, access to Gemini Pro for richer scoring, and real-time trend monitoring rather than on-demand scans.`;

// ── Methodology stages for source tooltip ─────────────────────────────────
const METHOD_STAGES = [
  {
    stage: "Stage 1",
    label: "Social Discovery",
    color: "text-teal",
    border: "border-teal/30",
    bg: "bg-teal/5",
    sources: ["Reddit India", "YouTube", "News + US Media"],
    desc: "Finds what consumers discuss organically — before brands notice.",
  },
  {
    stage: "Stage 2",
    label: "Market Validation",
    color: "text-violet-400",
    border: "border-violet-400/30",
    bg: "bg-violet-400/5",
    sources: ["Google Trends", "Amazon India", "PubMed"],
    desc: "Quantifies search velocity, product gaps, and clinical backing.",
  },
  {
    stage: "Stage 3",
    label: "AI Briefing",
    color: "text-amber-400",
    border: "border-amber-400/30",
    bg: "bg-amber-400/5",
    sources: ["Gemini AI", "Mosaic Brand Map"],
    desc: "Scores 4 dimensions and writes actionable D2C opportunity briefs.",
  },
];

// ── Data helpers ───────────────────────────────────────────────────────────
async function getMonthlyQuotaUsage(): Promise<number> {
  try {
    const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("scan_runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("created_at", ago);
    return count ?? 0;
  } catch { return 0; }
}

async function loadLastScanBriefs(): Promise<{ runId: string; briefs: OpportunityBrief[]; topKeyword?: string; topScore?: number } | null> {
  try {
    const { data: runs } = await supabase
      .from("scan_runs")
      .select("id, created_at, total_found")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!runs?.length) return null;
    const { data: reports } = await supabase
      .from("trend_reports")
      .select("brief_json, overall_score, keyword, headline")
      .eq("run_id", runs[0].id)
      .order("overall_score", { ascending: false });
    const briefs: OpportunityBrief[] = (reports ?? [])
      .filter((r: any) => r.brief_json)
      .map((r: any) => ({ ...r.brief_json, keyword: r.keyword, headline: r.headline }));
    return briefs.length > 0
      ? { runId: runs[0].id, briefs, topKeyword: reports?.[0]?.keyword, topScore: reports?.[0]?.overall_score }
      : null;
  } catch { return null; }
}

// ── Animated Radar Logo ────────────────────────────────────────────────────
const RadarLogo = () => (
  <>
    <style>{`
      @keyframes radar-ripple {
        0%   { transform: scale(0.4); opacity: 0.6; }
        100% { transform: scale(2.6); opacity: 0; }
      }
    `}</style>
    <div className="flex items-center gap-2.5">
      <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border border-teal"
            style={{
              animation: "radar-ripple 2.4s ease-out infinite",
              animationDelay: `${i * 0.8}s`,
              opacity: 0,
            }}
          />
        ))}
        <span className="relative z-10 w-2 h-2 rounded-full bg-teal shadow-[0_0_6px_hsl(var(--teal))]" />
      </div>
      <span className="font-title text-xl font-bold tracking-tight text-foreground">
        Sank<span className="text-teal">ET</span>
      </span>
    </div>
  </>
);

// ── Methodology Tooltip ────────────────────────────────────────────────────
const MethodologyTooltip = () => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-[11px] text-muted-foreground/40 hover:text-teal underline underline-offset-2 decoration-dashed transition-colors font-body"
      >
        Methodology →
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[280px] rounded-xl border border-border bg-card shadow-2xl p-4 z-50 text-left pointer-events-none">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-label mb-3">
            How SankET finds opportunities
          </p>
          <div className="space-y-3">
            {METHOD_STAGES.map(({ stage, label, color, border, bg, sources, desc }) => (
              <div key={stage} className={`rounded-lg border ${border} ${bg} p-2.5`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-label font-bold ${color}`}>{stage}</span>
                  <span className="text-[10px] text-muted-foreground/60">· {label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed mb-1.5">{desc}</p>
                <div className="flex flex-wrap gap-1">
                  {sources.map(s => (
                    <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full border border-border/50 text-muted-foreground/50 bg-background/50">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b border-border bg-card" />
        </div>
      )}
    </div>
  );
};

// ── Live Signal Ticker ─────────────────────────────────────────────────────
const LiveSignalTicker = ({ keyword, score, date }: { keyword: string; score: number; date: string }) => (
  <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-teal/20 bg-teal/5">
    <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse shrink-0" />
    <span className="text-[10px] font-label uppercase tracking-widest text-teal/70">Latest Signal</span>
    <span className="w-px h-3 bg-border/60" />
    <span className="text-[12px] text-foreground/75 font-body truncate max-w-[180px]">{keyword}</span>
    <span className="text-[11px] font-mono font-bold text-teal shrink-0">{score}/10</span>
    <span className="text-[10px] text-muted-foreground/35 shrink-0 hidden sm:inline">{date}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete,   setIsComplete]   = useState(false);
  const [trendsCount,  setTrendsCount]  = useState(0);
  const [showFaq,      setShowFaq]      = useState(false);
  const [showApiNote,  setShowApiNote]  = useState(false);
  const [quotaCount,   setQuotaCount]   = useState<number | null>(null);
  const [lastScan,     setLastScan]     = useState<{ date: string; count: number; topKeyword?: string; topScore?: number } | null>(null);
  const [hasLastScan,  setHasLastScan]  = useState(false);
  const [loadingLast,  setLoadingLast]  = useState(false);

  useEffect(() => {
    getMonthlyQuotaUsage().then(setQuotaCount);
    getRunHistory().then((history: any[]) => {
      const completed = history.filter((r: any) => r.status === "completed");
      if (!completed.length) return;
      const last = completed[0];
      setHasLastScan(true);
      loadLastScanBriefs().then((res) => {
        setLastScan({
          date: last.created_at
            ? new Date(last.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            : "",
          count: last.total_found ?? 0,
          topKeyword: res?.topKeyword,
          topScore:   res?.topScore,
        });
      });
    });
    if (!localStorage.getItem("sanket_faq_seen")) setShowFaq(true);
  }, []);

  const handleDismissFaq = () => {
    localStorage.setItem("sanket_faq_seen", "1");
    setShowFaq(false);
  };

  const handleScan = async () => {
    setIsProcessing(true);
    setIsComplete(false);
    try {
      const result = await runAgentScan();
      setTrendsCount(result.briefs.length);
      setIsComplete(true);
      setTimeout(() => navigate(`/results/${result.runId}`, {
        state: { trends: result.briefs, scanId: result.runId },
      }), 2000);
    } catch (err: any) {
      toast.error(err?.message || "Scan failed. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleLoadLast = async () => {
    setLoadingLast(true);
    try {
      const result = await loadLastScanBriefs();
      if (!result) { toast.error("No previous scan found."); return; }
      navigate(`/results/${result.runId}`, { state: { trends: result.briefs, scanId: result.runId } });
    } catch { toast.error("Failed to load last scan."); }
    finally { setLoadingLast(false); }
  };

  const handleHistoryScan = (scan: ScanRecord) => {
    navigate(`/results/${scan.id}`, { state: { trends: scan.claude_response, scanId: scan.id } });
  };

  const quotaWarning = quotaCount !== null && quotaCount >= 30;

  if (isProcessing) return <RadarProcessing isComplete={isComplete} trendsCount={trendsCount} />;

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        {/* Animated radar logo replaces SankETLogo */}
        <RadarLogo />

        <div className="flex items-center gap-2">
          {/* Quota — header only. Warning state gets amber, normal gets muted text */}
          {quotaWarning && quotaCount !== null ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/8 text-[11px] font-label text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span>{quotaCount}/40 — quota low</span>
            </div>
          ) : quotaCount !== null ? (
            <span className="hidden sm:inline text-[11px] text-muted-foreground/35 font-mono">
              {quotaCount}/40 scans this month
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setShowFaq(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal/30 bg-teal/5 hover:bg-teal/10 text-teal text-[11px] font-label transition-colors"
          >
            <BookOpenCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guide & FAQ</span>
            <span className="sm:hidden">Guide</span>
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16 max-w-2x1 mx-auto w-full text-center">

        <p className="text-[10px] font-label uppercase tracking-[3px] text-teal/70 mb-5">
          India D2C Wellness Intelligence
        </p>

        <h1 className="text-4xl md:text-5xl font-title text-foreground mb-5 leading-tight">
          Detect <span className="text-teal">₹30Cr+</span> Wellness Opportunities{" "}
          <br className="hidden sm:block" />
          Before They Hit the Mainstream.
        </h1>

        <p className="text-sm text-muted-foreground mb-8 max-w-lg font-body leading-relaxed">
          SankET is an autonomous intelligence engine that scans{" "}
          <span className="text-foreground/65 font-medium">live Reddit, YouTube, and Amazon signals</span>
          {" "}to deliver investor-ready D2C briefs — mapped directly to Mosaic Wellness brands
          with validated product concepts and pricing.
        </p>

        {/* ── CTAs — quota warning removed from here ── */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs sm:max-w-sm mb-5">
          <button
            onClick={handleScan}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-label bg-teal text-white hover:brightness-110 shadow-lg shadow-teal/20 hover:-translate-y-0.5 transition-all duration-200"
          >
            Run Trend Scan →
          </button>
          {hasLastScan && (
            <button
              onClick={handleLoadLast}
              disabled={loadingLast}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-label border border-border bg-card hover:border-teal/40 hover:text-teal text-muted-foreground transition-all duration-200 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {loadingLast ? "Loading..." : "Load Last Scan"}
            </button>
          )}
        </div>

        {/* Live Signal Ticker — proof of value, shown when previous scan exists */}
        {lastScan?.topKeyword && lastScan.topScore !== undefined && (
          <div className="mb-5">
            <LiveSignalTicker
              keyword={lastScan.topKeyword}
              score={lastScan.topScore}
              date={lastScan.date}
            />
          </div>
        )}

        {/* Last scan — prominent proof metric */}
        <div className="flex flex-col items-center gap-1.5 mb-1">
          {lastScan && (
            <div className="flex items-center gap-2 text-sm font-body">
              <span className="w-1.5 h-1.5 rounded-full bg-teal/70 shrink-0" />
              <span className="text-muted-foreground/50">Last scan:</span>
              <span className="text-foreground/60">{lastScan.date}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-teal font-medium">{lastScan.count} opportunities found</span>
            </div>
          )}
          <HistoryDrawer onSelectScan={handleHistoryScan}>
            <button className="text-xs text-muted-foreground/35 hover:text-teal transition-colors font-body">
              View previous scans →
            </button>
          </HistoryDrawer>
        </div>

        {/* ── Source strip with Methodology tooltip ── */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 text-muted-foreground/20">
            <TrendingUp className="w-4 h-4" />
            <Youtube className="w-4 h-4" />
            <ShoppingCart className="w-4 h-4" />
            <BookOpen className="w-4 h-4" />
            <Newspaper className="w-4 h-4" />
          </div>
          <p className="text-[10px] text-muted-foreground/25 font-body tracking-wide">
            Google Trends · Reddit · YouTube · Amazon · Research · News + US Media
          </p>
          <MethodologyTooltip />
        </div>
      </main>

      {/* ── Persistent ℹ icon — bottom right ── */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setShowApiNote(!showApiNote)}
          className="w-8 h-8 rounded-full border border-border/50 bg-card/80 backdrop-blur text-muted-foreground/40 hover:text-muted-foreground hover:border-border transition-colors flex items-center justify-center"
          title="API constraints & limitations"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
        {showApiNote && (
          <div className="absolute bottom-10 right-0 w-72 rounded-xl border border-border bg-card shadow-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">Free-tier API Constraints</p>
              <button onClick={() => setShowApiNote(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed whitespace-pre-line">
              {API_CONSTRAINTS_NOTE}
            </p>
          </div>
        )}
      </div>

      {/* ── FAQ / Guide Modal ── */}
      {showFaq && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}>

            <div className="bg-teal/8 border-b border-teal/15 px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
                  <p className="text-[10px] font-label uppercase tracking-widest text-teal">
                    Read this before moving forward
                  </p>
                </div>
                <h2 className="text-base font-title text-foreground">Guide & FAQ</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Next Big Product Radar · Mosaic Fellowship 2026
                </p>
              </div>
              <button onClick={handleDismissFaq}
                className="shrink-0 w-7 h-7 rounded-full border border-border bg-background hover:border-teal/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-5 py-4 space-y-4">
              {FAQ_ITEMS.map(({ q, a }, i) => (
                <div key={q} className="pb-4 border-b border-border/30 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-teal/10 border border-teal/20 text-teal text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">{q}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{a}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      Running on free-tier APIs — what this means
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed whitespace-pre-line">
                      {API_CONSTRAINTS_NOTE}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 px-5 py-3.5 flex items-center justify-between gap-3 bg-card">
              <p className="text-[10px] text-muted-foreground/35">
                All data is real-time · Validate before investment decisions
              </p>
              <button
                onClick={handleDismissFaq}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal text-white text-xs font-label hover:brightness-110 transition-all"
              >
                Got it <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;