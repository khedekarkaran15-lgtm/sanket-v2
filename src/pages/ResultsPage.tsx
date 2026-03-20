import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import OpportunityCard from "@/components/OpportunityCard";
import ScanSummaryBar from "@/components/ScanSummaryBar";
import type { TrendData } from "@/lib/types";
import { downloadTrendReport } from "@/lib/pdfReport";
import { Download, ArrowLeft, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useSankET } from "@/contexts/SankETContext";

// Brand tab keys match BRAND_MAP display-name keys exactly
const BRAND_TABS = [
  { key: "all",           label: "All Trends"    },
  { key: "Man Matters",   label: "Man Matters"   },
  { key: "Be Bodywise",   label: "Be Bodywise"   },
  { key: "Little Joys",   label: "Little Joys"   },
  { key: "Root Labs",     label: "Root Labs"     },
  { key: "New Category",  label: "New Category"  },
];

const ATTR_TABS = [
  { key: "confirmed",       label: "✅ Confirmed Trends"  },
  { key: "high_velocity",   label: "⚡ High Velocity"      },
  { key: "low_competition", label: "🛡️ Low Competition"   },
  { key: "saved",           label: "⭐ Saved"              },
];

// ─────────────────────────────────────────────────────────────────────────────
// normalise()
// Maps v2 OpportunityBrief → v1 TrendData so all display components work.
// brand_fit stays as display names ('Man Matters') to match BRAND_MAP keys.
// ─────────────────────────────────────────────────────────────────────────────
function normalise(raw: any): TrendData {
  // Already v1 shape
  if (typeof raw.overall_score === 'number' && !raw.scores) return raw as TrendData;

  const scores   = raw.scores   ?? {};
  const rationale = raw.rationale ?? {};

  // brandFit from Gemini is already display names: ['Man Matters', 'Be Bodywise']
  const brand_fit: string[] = Array.isArray(raw.brandFit) ? raw.brandFit : [];

  return {
    // ── identity ──────────────────────────────────────────────────────────
    keyword: raw.keyword ?? '',

    // ── v1 display fields ─────────────────────────────────────────────────
    trend_name:              raw.headline ?? raw.keyword ?? '',
    trend_core_name:         raw.keyword  ?? '',
    trend_headline:          raw.headline ?? '',
    hook_subheading:         raw.cagrEstimate ?? '',
    market_opportunity_value: raw.cagrEstimate ?? '',
    why_now:                 raw.whyNow   ?? '',
    emoji:                   '📊',
    // Convert Google Trends weekly values → sparkline format OpportunityCard needs
    sparkline_data: Array.isArray(raw.sparklineData) && raw.sparklineData.length >= 5
      ? raw.sparklineData.map((v: number) => ({ v }))
      : [],

    // ── scores ────────────────────────────────────────────────────────────
    overall_score:     scores.overall     ?? 0,
    velocity_score:    scores.velocity    ?? 0,
    market_score:      scores.market      ?? 0,
    competition_score: scores.competition ?? 0,
    time_score:        scores.timing      ?? 0,

    // ── classification ────────────────────────────────────────────────────
    classification: (raw.isConfirmedTrend || (scores.overall ?? 0) >= 6.5)
      ? 'CONFIRMED_TREND' : 'LIKELY_FAD',

    // ── rationale — v2 brief has flat fields (velocityReasoning) OR rationale object ──
    velocity_rationale:    raw.velocityReasoning    ?? rationale.velocity    ?? '',
    market_rationale:      raw.marketReasoning      ?? rationale.market      ?? '',
    competition_rationale: raw.competitionReasoning ?? rationale.competition ?? '',
    time_rationale:        raw.timingReasoning      ?? rationale.timing      ?? '',
    consistency_flag:      raw.consistencyFlag   ?? null,

    // ── brand — keep as display names to match BRAND_MAP ─────────────────
    brand_fit,
    brand_fit_rationale: '',

    // ── content ───────────────────────────────────────────────────────────
    trend_summary:         raw.whyNow     ?? '',
    data_summary:          (raw.signalEvidence ?? []).map((e: any) =>
      typeof e === 'string' ? e : `${e.source}: ${e.insight}`).join(' | '),
    opportunity_statement: raw.firstMove  ?? '',

    signal_evidence: (raw.signalEvidence ?? []).map((e: any) => {
      if (typeof e === 'string') {
        return { source: 'Analysis', metric: 'Signal', insight: e, strength: 'Moderate' as const, extracted_from: 'Gemini' };
      }
      return {
        source:         String(e.source   ?? 'Analysis'),
        metric:         String(e.metric   ?? 'Signal'),
        insight:        String(e.insight  ?? ''),
        strength:       (['Strong', 'Moderate', 'Weak'].includes(e.strength) ? e.strength : 'Moderate') as 'Strong' | 'Moderate' | 'Weak',
        extracted_from: 'Live scan',
      };
    }),

    // ── market gap ────────────────────────────────────────────────────────
    market_gap_exists_now: raw.riskFlag   ?? '',
    market_gap_missing:    raw.firstMove  ?? '',

    // ── product concept ───────────────────────────────────────────────────
    product_name:        raw.keyword      ?? '',
    product_consumer:    '',
    product_price_inr:   0,
    product_usp:         raw.firstMove    ?? '',
    product_positioning: raw.cagrEstimate ?? '',

    // ── first move ────────────────────────────────────────────────────────
    first_move: raw.firstMove ?? '',

    // ── consumer quotes ───────────────────────────────────────────────────
    consumerQuotes: raw.consumerQuotes ?? [],

    // ── keep all v2 fields for BriefPage direct access ───────────────────
    headline:           raw.headline        ?? '',
    whyNow:             raw.whyNow          ?? '',
    signalEvidence:     raw.signalEvidence  ?? [],
    cagrEstimate:       raw.cagrEstimate    ?? '',
    firstMove:          raw.firstMove       ?? '',
    brandFit:           raw.brandFit        ?? [],
    riskFlag:           raw.riskFlag        ?? '',
    scores,
    // Normalise rationale object so BriefPage helper works with either shape
    rationale: {
      velocity:    raw.velocityReasoning    ?? rationale.velocity    ?? '',
      market:      raw.marketReasoning      ?? rationale.market      ?? '',
      competition: raw.competitionReasoning ?? rationale.competition ?? '',
      timing:      raw.timingReasoning      ?? rationale.timing      ?? '',
    },
    consistencyFlag:    raw.consistencyFlag ?? null,
    isConfirmedTrend:   raw.isConfirmedTrend ?? false,
    evidence_completeness: 'Partial',
    // Pass through v2 fields not in TrendData schema
    ...(raw.productRecommendation  ? { productRecommendation:  raw.productRecommendation  } : {}),
    ...(raw.recommendedFirstMove   ? { recommendedFirstMove:   raw.recommendedFirstMove   } : {}),
    ...(raw.velocityReasoning      ? { velocityReasoning:      raw.velocityReasoning      } : {}),
    ...(raw.marketReasoning        ? { marketReasoning:        raw.marketReasoning        } : {}),
    ...(raw.competitionReasoning   ? { competitionReasoning:   raw.competitionReasoning   } : {}),
    ...(raw.timingReasoning        ? { timingReasoning:        raw.timingReasoning        } : {}),
    ...(raw.consistencyFlag      !== undefined ? { consistencyFlag:      raw.consistencyFlag      } : {}),
    ...(raw.regulatoryNote       ? { regulatoryNote:       raw.regulatoryNote       } : {}),
    ...(raw.isNovelKeyword       !== undefined ? { isNovelKeyword:       raw.isNovelKeyword       } : {}),
  } as TrendData;
}

// ─────────────────────────────────────────────────────────────────────────────

const ResultsPage = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { trends: rawTrends = [], scanId = "", fileNames = [] } =
    (location.state as any) || {};

  const trends: TrendData[] = useMemo(
    () => (rawTrends as any[]).map(normalise),
    [rawTrends],
  );

  const { filters, setFilters, savedTrends } = useSankET();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const brandFilter = filters.brandFilter;
  const attrFilter  = filters.attributeFilter;

  const setBrandFilter = (key: string)        => setFilters({ ...filters, brandFilter: key });
  const setAttrFilter  = (key: string | null) => setFilters({ ...filters, attributeFilter: key });

  const filtered = useMemo(() => {
    let data = trends;

    if (brandFilter !== "all") {
      data = data.filter((t) => (t.brand_fit ?? []).includes(brandFilter));
    }

    if (attrFilter === "confirmed") {
      data = data.filter((t) => t.classification === "CONFIRMED_TREND" && (t.overall_score ?? 0) >= 6.5);
    } else if (attrFilter === "high_velocity") {
      data = data.filter((t) => (t.velocity_score ?? 0) >= 7);
    } else if (attrFilter === "low_competition") {
      data = data.filter((t) => (t.competition_score ?? 0) >= 7);
    } else if (attrFilter === "saved") {
      data = data.filter((_, i) => savedTrends.includes(`${scanId}-${i}`));
    }

    // Sort descending by overall score
    return [...data].sort((a, b) => ((b.overall_score ?? 0) - (a.overall_score ?? 0)));
  }, [trends, brandFilter, attrFilter, savedTrends, scanId]);

  const handleDownloadPdf = () => {
    try {
      setIsGeneratingPdf(true);
      downloadTrendReport(trends, fileNames.length > 0 ? fileNames : ["SankET scan"], new Date());
      toast.success("Intelligence report downloaded");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF report");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(rawTrends, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `SankET-data-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!trends.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No results found.</p>
          <button onClick={() => navigate("/")} className="text-teal hover:underline">← Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Scan Complete · {format(new Date(), "MMM d, yyyy")}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-label hover:brightness-110 transition-all shadow-lg shadow-teal/20 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {isGeneratingPdf ? "Generating..." : "Download Report (PDF)"}
            </button>
            <button onClick={downloadJson} className="flex items-center gap-2 text-sm font-label text-muted-foreground hover:text-foreground transition-colors">
              <Download className="w-4 h-4" />
              JSON
            </button>
          </div>
        </div>
      </header>

      <ScanSummaryBar trends={trends} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-label text-muted-foreground mr-1">Filter by:</span>
          {BRAND_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setBrandFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-label transition-all ${
                brandFilter === tab.key ? "bg-teal text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >{tab.label}</button>
          ))}
          <div className="w-px h-5 mx-2" style={{ background: "rgba(255,255,255,0.12)" }} />
          {ATTR_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAttrFilter(attrFilter === tab.key ? null : tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-label transition-all ${
                attrFilter === tab.key ? "bg-teal text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((trend, filteredIdx) => {
            // Use keyword as stable key; fall back to filtered index
            const stableKey = trend.keyword || trend.trend_core_name || String(filteredIdx);
            // Find original index in full trends array for navigation
            const originalIndex = trends.findIndex(
              (t) => (t.keyword || t.trend_core_name) === (trend.keyword || trend.trend_core_name)
            );
            const idx = originalIndex >= 0 ? originalIndex : filteredIdx;
            return (
              <OpportunityCard
                key={stableKey}
                trend={trend}
                index={idx}
                scanId={scanId}
                allTrends={trends}
              />
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground mt-12 font-body">
            {attrFilter === "confirmed"
              ? "No confirmed high-opportunity trends detected."
              : attrFilter === "saved"
              ? "No saved trends yet."
              : "No trends match this filter."}
          </p>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
