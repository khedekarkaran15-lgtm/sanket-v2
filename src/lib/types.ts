// ---- Raw signal from any API source ----
export interface RawSignal {
  source: 'serper' | 'youtube' | 'newsapi' | 'serp' | 'pubmed';
  keyword: string;
  title: string;
  url: string;
  snippet?: string;
  engagement: number;
  publishedAt?: string;
}

// ---- Output of Stage 2 scoring (raw API metrics — no scoring logic) ----
export interface ScoredTrend {
  keyword: string;
  // Stage 2 preliminary scores (used only for threshold filtering >= 3.0)
  velocityScore: number;
  marketScore: number;
  competitionScore: number;
  timingScore: number;
  overallScore: number;
  // Raw API metrics passed to Stage 3 for Gemini scoring
  ytViewVelocity: number;
  amazonResults: number;
  amazonSponsored: number;
  pubmedCount: number;
  newsCount: number;
  signalCount: number;
  signals: RawSignal[];
  consumerQuotes: string[];
}

// ---- Score with rationale — output of Stage 3 Gemini reasoning ----
export interface ScoredDimension {
  score: number;          // 1-10
  rationale: string;      // Full chain-of-thought reasoning paragraph
}

// ---- Output of Stage 3 Gemini brief ----
export interface SignalEvidence {
  source:         string;
  metric:         string;
  insight:        string;
  strength:       'Strong' | 'Moderate' | 'Weak';
  sourceFile?:    string;
  value?:         string;            // used by SignalEvidenceTable
  extracted_from?: string;           // used by SignalEvidenceTable
}

export interface OpportunityBrief {
  keyword:      string;
  headline:     string;
  whyNow:       string;
  signalEvidence: SignalEvidence[];
  cagrEstimate:  string;
  firstMove:     string;  // kept for backward compat — use productRecommendation instead
  productRecommendation?: {
    product:    string;
    price:      string;
    competitorPriceRange?: string;  // derived from Amazon signals
    targetConsumer: string;
    usp:        string;
    positioning: string;
  };
  regulatoryNote?: string;  // FSSAI/CDSCO note from Gemini
  recommendedFirstMove?: string;  // strategic supply/GTM action
  brandFit:      string[];
  riskFlag:      string;

  // Gemini-reasoned scores
  scores: {
    velocity:    number;
    market:      number;
    competition: number;
    timing:      number;
    overall:     number;
  };

  // Full step-by-step reasoning text per dimension (displayed in BriefPage)
  velocityReasoning?:    string;
  marketReasoning?:      string;
  competitionReasoning?: string;
  timingReasoning?:      string;

  // Consistency check
  consistencyFlag?: string | null;

  // Diffusion of Innovation
  adoptionStage?:       'Innovators' | 'Early Adopters' | 'Early Majority' | 'Late Majority' | 'Laggards';
  monthsToMainstream?:  number;

  consumerQuotes:    string[];
  isConfirmedTrend:  boolean;
  sparklineData?:    number[];  // Google Trends weekly values → sparkline
}

// ---- TrendData — unified shape used by ResultsPage and BriefPage ----
export interface TrendData {
  // v2 fields
  keyword?: string;
  headline?: string;
  whyNow?: string;
  signalEvidence?: {
    source: string;
    metric: string;
    insight: string;
    strength: 'Strong' | 'Moderate' | 'Weak';
    extracted_from?: string;
  }[];
  cagrEstimate?: string;
  firstMove?: string;
  brandFit?: string[];
  riskFlag?: string;
  scores?: { velocity: number; market: number; competition: number; timing: number; overall: number };
  rationale?: { velocity: string; market: string; competition: string; timing: string };
  consistencyFlag?: string | null;
  consumerQuotes?: string[];
  isConfirmedTrend?: boolean;

  // v1 legacy display fields
  trend_name?: string;
  trend_core_name?: string;
  trend_headline?: string;
  hook_subheading?: string;
  market_opportunity_value?: string;
  why_now?: string;
  sparkline_data?: { v: number }[];
  emoji?: string;
  overall_score?: number;
  velocity_score?: number;
  market_score?: number;
  competition_score?: number;
  time_score?: number;
  classification?: 'CONFIRMED_TREND' | 'LIKELY_FAD';
  consistency_flag?: string | null;
  brand_fit?: string[];
  brand_fit_rationale?: string;
  data_summary?: string;
  opportunity_statement?: string;
  trend_summary?: string;
  signal_evidence?: {
    source: string;
    metric: string;
    insight: string;
    strength: 'Strong' | 'Moderate' | 'Weak';
    extracted_from?: string;
  }[];
  market_gap_exists_now?: string;
  market_gap_missing?: string;
  product_name?: string;
  product_consumer?: string;
  product_price_inr?: number;
  product_usp?: string;
  product_positioning?: string;
  first_move?: string;
  velocity_rationale?: string;
  market_rationale?: string;
  competition_rationale?: string;
  time_rationale?: string;
  evidence_completeness?: 'Full' | 'Partial' | 'Insufficient';
}

// ---- Scan record ----
export interface ScanRecord {
  id: string;
  created_at?: string;
  files_uploaded?: string[];
  documents_count?: number;
  trends_found?: number;
  claude_response?: any;
}

// ---- Scan run status ----
export interface ScanRun {
  id: string;
  createdAt: string;
  status: 'running' | 'completed' | 'failed';
  currentStage: number;
  stage1Done: boolean;
  stage2Done: boolean;
  stage3Done: boolean;
  totalFound: number;
  errorMsg?: string;
}

export const BRAND_BORDER_COLORS: Record<string, string> = {
  'Man Matters':  'border-blue-500',
  'Be Bodywise':  'border-pink-400',
  'Little Joys':  'border-purple-400',
  'Root Labs':    'border-emerald-500',
  'New Category': 'border-amber-400',
};

export const BRAND_MAP: Record<string, { label: string; color: string; border: string; bg: string }> = {
  'Man Matters':  { label: 'Man Matters',  color: '#3b82f6', border: 'border-blue-500',    bg: 'bg-blue-500/10'    },
  'Be Bodywise':  { label: 'Be Bodywise',  color: '#f472b6', border: 'border-pink-400',    bg: 'bg-pink-400/10'    },
  'Little Joys':  { label: 'Little Joys',  color: '#a78bfa', border: 'border-purple-400',  bg: 'bg-purple-400/10'  },
  'Root Labs':    { label: 'Root Labs',    color: '#10b981', border: 'border-emerald-500', bg: 'bg-emerald-500/10' },
  'New Category': { label: 'New Category', color: '#f59e0b', border: 'border-amber-400',   bg: 'bg-amber-400/10'   },
};
