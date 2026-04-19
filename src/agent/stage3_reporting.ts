import supabase from '../lib/supabase';
import type { ScoredTrend, OpportunityBrief } from '../lib/types';
import type { Stage2Corpus, RichSignal } from './stage2_validation';

const GEMINI_MODEL    = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// Retry Gemini fetch with exponential backoff on 429 / 503
async function retryFetch(
  url: string,
  body: object,
  maxRetries = 5,
): Promise<any> {
  let delay = 15000; // start at 15s (free tier RPM is tight)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (res.ok) return res.json();

    const isRetryable = res.status === 429 || res.status === 503;
    if (!isRetryable || attempt === maxRetries) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    // Check Retry-After header first
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delay;
    console.warn(`[S3] 429/503 rate limit hit. Waiting ${waitMs / 1000}s before retry ${attempt + 1}/${maxRetries} for: ${url.split('models/')[1]?.split(':')[0] ?? 'gemini'}`);
    await sleep(waitMs);
    delay = Math.min(delay * 2, 60000); // cap at 60s
  }
  throw new Error('retryFetch: exhausted retries');
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the structured corpus block that Gemini will reason over.
// Each signal is tagged with its source so Gemini can cite it explicitly.
// ─────────────────────────────────────────────────────────────────────────────
function buildCorpusBlock(corpus: Stage2Corpus): string {
  const lines: string[] = [];

  // Reddit signals
  if (corpus.redditSignals.length > 0) {
    lines.push('--- REDDIT SIGNALS (past 6 months) ---');
    corpus.redditSignals.slice(0, 12).forEach((s, i) => {
      const meta = [
        s.upvotes     ? `upvotes: ${s.upvotes}`      : null,
        s.commentCount ? `comments: ${s.commentCount}` : null,
        s.subreddit   ? `r/${s.subreddit}`            : null,
      ].filter(Boolean).join(', ');
      lines.push(`R${i+1}. "${s.title}"${meta ? ` [${meta}]` : ''}${s.snippet ? ` — ${s.snippet.slice(0, 120)}` : ''}`);
    });
  }

  // YouTube signals
  if (corpus.youtubeSignals.length > 0) {
    lines.push('--- YOUTUBE SIGNALS (past 6 months) ---');
    corpus.youtubeSignals.slice(0, 10).forEach((s, i) => {
      const meta = [
        s.viewCount    ? `views: ${s.viewCount.toLocaleString()}`                             : null,
        s.viewVelocity ? `velocity: ${s.viewVelocity.toLocaleString()} views/day`             : null,
        s.likeCount    ? `likes: ${s.likeCount.toLocaleString()}`                             : null,
        s.channelTitle ? `channel: ${s.channelTitle} (${s.subscriberTier ?? 'unknown tier'})` : null,
      ].filter(Boolean).join(', ');
      lines.push(`Y${i+1}. "${s.title}" [${meta}]`);
    });
  }

  // News signals
  if (corpus.newsSignals.length > 0) {
    lines.push('--- NEWS SIGNALS (past 6 months) ---');
    corpus.newsSignals.slice(0, 10).forEach((s, i) => {
      const meta = [
        s.sourceName ? s.sourceName : null,
        s.isIndian !== undefined ? (s.isIndian ? 'Indian source' : 'International source') : null,
        s.framingType ? `framing: ${s.framingType}` : null,
        s.publishedAt ? s.publishedAt.slice(0, 10) : null,
      ].filter(Boolean).join(', ');
      lines.push(`N${i+1}. "${s.title}" [${meta}]`);
    });
  }

  // Amazon signals
  if (corpus.amazonSignals.length > 0) {
    lines.push('--- AMAZON INDIA SIGNALS ---');
    corpus.amazonSignals.slice(0, 15).forEach((s, i) => {
      const meta = [
        s.reviewCount !== undefined ? `reviews: ${s.reviewCount}` : null,
        s.price ? `price: ${s.price}` : null,
      ].filter(Boolean).join(', ');
      lines.push(`A${i+1}. "${s.title}"${meta ? ` [${meta}]` : ''}${s.snippet ? ` — ${s.snippet.slice(0, 80)}` : ''}`);
    });
  }

  // PubMed
  if (corpus.pubmedSignals.length > 0) {
    lines.push('--- PUBMED (past 12 months) ---');
    corpus.pubmedSignals.forEach((s, i) => lines.push(`P${i+1}. ${s.title}`));
  }

  // Novelty signal
  lines.push(`--- NOVELTY SIGNAL ---`);
  lines.push(corpus.isNovelKeyword === true
    ? '🆕 NOVEL KEYWORD: This keyword has NOT appeared in any previous SankET scan. Strong predictive signal — early mover advantage is intact.'
    : corpus.isNovelKeyword === false
    ? '🔄 RECURRING KEYWORD: This keyword has appeared in previous SankET scans. Weight timing and competition scores accordingly.'
    : 'NOVELTY: Unknown (first scan)');

  // Google Trends
  if (corpus.trendValues.length > 0) {
    lines.push('--- GOOGLE TRENDS DATA (6-month weekly values, latest last) ---');
    lines.push(`Values: [${corpus.trendValues.join(', ')}]`);
    lines.push(`Slope (second half avg minus first half avg): ${corpus.trendSlope.toFixed(2)}`);
  }

  // Consumer quotes
  if (corpus.consumerQuotes.length > 0) {
    lines.push('--- CONSUMER QUOTES (YouTube comments) ---');
    corpus.consumerQuotes.slice(0, 8).forEach((q, i) => lines.push(`Q${i+1}. "${q}"`));
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SCORING PROMPT
// Gemini reasons through each dimension step by step, then outputs structured JSON.
// ─────────────────────────────────────────────────────────────────────────────

function buildScoringPrompt(keyword: string, corpus: Stage2Corpus): string {
  const corpusBlock = buildCorpusBlock(corpus);

  return `You are SankET, a senior wellness market intelligence analyst for Mosaic Wellness India.
Mosaic owns 5 D2C wellness brands:
- Man Matters: men's health, hair loss, testosterone, performance, stress
- Be Bodywise: women's health, PCOS, hormones, skin, hair
- Little Joys: children's nutrition, immunity, gut health
- Root Labs: Ayurveda-backed supplements, ancient ingredients modernised
- New Category: genuine white space with no current brand fit

IMPORTANT: All data below is from the past 6 months only. Today's date context: 2026. Do NOT reference dates before September 2025. Use present tense.

You must now score the trend keyword: "${keyword}"

=== CORPUS ===
${corpusBlock}
=== END CORPUS ===

Perform the following 4 scoring analyses in order. For each, you must SHOW YOUR REASONING explicitly before assigning the score. Then output a single JSON object.

────────────────────────────────────────────
STEP 1 — VELOCITY REASONING
────────────────────────────────────────────
Cross-reference Reddit, News, and YouTube signal documents above.

For REDDIT INDIA: state (a) number of Indian-focused Reddit posts found (b) total upvotes (c) upvote-to-comment ratio (d) whether posts are organic questions or promo content.

IMPORTANT US-LAG CHECK: Using your training knowledge, state whether this trend is already mainstream in the US/UK supplement market. If yes, estimate how many months behind India typically lags (usually 12-24 months for D2C supplement trends). State: "US/UK status: [mainstream/early adopter/emerging] → India lag: ~X months → India window: [open/closing/closed]". This is the single most valuable predictive signal.

For REDDIT: state (a) number of Reddit posts found — NOTE: 3+ posts is Early Adopter signal; 8+ is meaningful momentum in India. Do NOT treat 13+ posts as weak. (b) total upvotes across all posts (this is the key engagement metric — weight this heavily), (c) average upvote-to-comment ratio (high ratio = passive reading, low ratio = active debate — both are valuable), (d) average comments per post (indicates depth of consumer concern), (e) whether the posts are authentic product questions or sponsored/commercial content.

For YOUTUBE: state (a) number of unique video titles found, (b) total view count figures extracted, (c) average like-to-view ratio if extractable from the data, (d) whether creators appear to be niche specialists or mainstream — cite specific channel names.

For NEWS: state (a) number of distinct articles found, (b) proportion that are Indian vs international sources, (c) whether framing is informational (early stage signal) or commercial/review-based (later stage).

Then write one paragraph summarising your Velocity reasoning conclusion.

If only ONE source type contains any signal (the other two are empty), you MUST explicitly state: "Only one active source. Velocity score is capped at 6." and cap accordingly.

Assign velocityScore (integer 1-10).

────────────────────────────────────────────
STEP 2 — MARKET SIZE REASONING (McKinsey Top-Down MECE)
────────────────────────────────────────────
Use your training knowledge as a senior strategy consultant. Do NOT say you cannot estimate.
You have rich signal data in the corpus above. Use it as your primary input.

AMAZON LISTING COUNT from corpus: ${corpus.amazonSignals.length} products found
YOUTUBE TOP VELOCITY: ${Math.round(Math.max(0, ...corpus.youtubeSignals.map((s: any) => s.viewVelocity ?? 0)))} views/day
REDDIT SIGNAL COUNT: ${corpus.redditSignals.length} posts

PART A — Market Size (Mosaic-addressable, India D2C):
  This is NOT total India market. This is the realistic Mosaic-addressable segment.
  1. Start with India population 1.4B
  2. Target demographic: state the relevant age/gender for this keyword based on corpus signals
  3. Urban + digital-first filter: apply % for Tier-1/Tier-2 smartphone users
  4. Affordability ("India 1" cohort): top 8% households, monthly income >₹50k
  5. Health affinity: % who are ACTIVELY searching for this specific solution (use Reddit + YouTube signal strength as proxy — be conservative for low-signal trends)
  6. Mosaic-addressable Market = Addressable Audience × ₹900 avg monthly spend × 10 repurchase events/year
  IMPORTANT: A small but real market (₹20-50Cr) with zero competition is MORE valuable than a ₹1000Cr market with 50 established brands. Do not inflate. Be honest.
  Show the multiplication chain at each step. State all assumptions explicitly.

PART B — CAGR (Three-Proxy Blend):
  Proxy 1 (macro): state the standard CAGR for the parent category in India (e.g. nutraceuticals 18%, women's D2C health 24%, Ayurveda supplements 22%)
  Proxy 2 (mature market): state how fast this trend grew in the US/UK during early adoption years 1-3
  Proxy 3 (velocity multiplier): if YouTube views/day > 3000 OR Reddit posts > 8 OR news articles > 5, apply 1.3-1.5x to macro CAGR. Justify the multiplier.
  Final CAGR = blend of the three proxies. Show the formula.

PART C — SCORING:
  Apply: CAGR 65% weight, Market Size 35% weight.
  Show: "CAGR X% → axis score Y. Market Size ₹Z crore → axis score W. Weighted: (Y × 0.65) + (W × 0.35) = [result]."
  CAGR axis: <10%=2, 10-15%=4, 15-20%=6, 20-30%=7, 30-40%=8, 40-60%=9, >60%=10
  Market Size axis (Mosaic-addressable): <₹10Cr=3, ₹10-50Cr=5, ₹50-200Cr=6, ₹200-500Cr=7, ₹500-1000Cr=8, >₹1000Cr=9
  NOTE: A ₹20Cr market is valid and scores 5. Do not inflate to justify a higher score.

PART D — SANITY CHECK:
  Compare to ONE known adjacent D2C India market. Adjust if your estimate is >3x that benchmark.

IMPORTANT MARKET SIZE CONTEXT: Report the Mosaic-addressable market honestly — ₹20Cr is valid, ₹500Cr is not inflated. Always explain WHY existing brands haven't captured this segment (formulation gap, distribution gap, positioning gap). High competition score + any market size = white-space gold.

MINIMUM marketScore = 3. NEVER output marketScore = 0 or 1 or 2.
Assign marketScore (integer 3-10).

────
STEP 3 — COMPETITION REASONING
────────────────────────────────────────────
From the Amazon signals above, state: (a) total competing product listings found, (b) number of unique brands identified across the listings (look for distinct brand names in titles), (c) average review volume per product if calculable, (d) any sentiment signals visible in review snippets.

Apply inverse scoring logic — lower competition = higher score:
0 products = 8, 1-5 = 9 (near white space), 6-10 = 7, 11-20 = 6, 21-35 = 5, 36-50 = 4, 50+ = 2

Apply review density adjustment:
- If average reviews per product > 500: subtract 1 point (established market)
- If average reviews per product < 50: add 1 point (early adopters only)
Show the adjustment calculation explicitly.

Assign competitionScore (integer 1-10).

────────────────────────────────────────────
STEP 4 — TIME-TO-MAINSTREAM REASONING
────────────────────────────────────────────
Apply the Diffusion of Innovation framework.

NOVELTY BONUS: If the corpus shows this is a NOVEL KEYWORD (first appearance in SankET history), add +1 to the final timingScore (max 10). First-time signals are inherently earlier in the adoption curve.

State: (a) Reddit Innovator signal strength — count Reddit posts from corpus that are in past 3 months (look at snippet dates or recency clues), (b) Amazon Early Majority signal strength — product count and average review volume, (c) the ratio between Reddit innovator signal and Amazon mainstream signal.

State which adoption stage the Indian market is currently in for this trend:
- Innovators stage: Reddit > 5 posts, Amazon < 5 products, avg reviews < 50 → score 9-10
- Early Adopters: Reddit 3-8 posts, Amazon 5-20 products, avg reviews 50-200 → score 7-8 (Goldilocks Zone)
- Early Majority: Reddit < 5 posts, Amazon 20-50 products, avg reviews 200-500 → score 5-6
- Late Majority: Amazon 50+ products, avg reviews > 500 → score 3-4
- Laggards / Saturated: → score 1-2

Also use the Google Trends slope:
- Slope > 15: accelerating into mainstream → subtract 1 from score (window closing)
- Slope < 0: declining → subtract 2

Predict the number of months to mainstream adoption. Show the stage determination logic before assigning the score.

Assign timingScore (integer 1-10).

────────────────────────────────────────────
STEP 5 — CONSISTENCY CHECK
────────────────────────────────────────────
Compare velocityScore vs timingScore:
- If timingScore >= 9 AND velocityScore < 5: set consistency_flag = "Signal conflict — nascent but low momentum. Monitor 4-6 weeks before acting."
- If velocityScore >= 9 AND timingScore < 4: set consistency_flag = "Late-mover risk — strong momentum but limited first-mover window."
- Otherwise: set consistency_flag = null

────────────────────────────────────────────
STEP 6 — OPPORTUNITY BRIEF
────────────────────────────────────────────
Now write the opportunity brief.

Assign overall score = average of 4 dimension scores, rounded to 1 decimal.
Confirm: isConfirmedTrend = true ONLY if ALL of the following:
  1. overallScore >= 7.5
  2. velocityScore >= 6 (at least one active social source)
  3. At least two of: (redditPosts >= 3) OR (youtubeVideos >= 3) OR (amazonListings >= 1 with context clues of real demand) OR (googleTrendsSlope > 5)
  4. timingScore >= 6 (not already mainstream)
  If any condition fails, set isConfirmedTrend = false. Be strict — false negatives are safer than false positives for a D2C brand about to invest in a product launch.

────────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────────
Return ONLY a valid JSON object. No markdown fences. No text before or after. Exactly this structure:

{
  "velocityReasoning": "2-3 sentence reasoning summary for velocity (keep concise)",
  "usLagIndicator": "US/UK status: [mainstream/early adopter/emerging] → India lag: ~X months → India entry window: [open/closing/closed]. One sentence justification.",
  "velocityScore": number,
  "marketReasoning": "2-3 sentence reasoning summary with TAM/CAGR figures",
  "marketScore": number,
  "competitionReasoning": "2-3 sentence reasoning summary with listing/review counts",
  "competitionScore": number,
  "timingReasoning": "2-3 sentence reasoning with adoption stage and months estimate",
  "timingScore": number,
  "consistencyFlag": string | null,
  "overallScore": number,
  "headline": "insight-led, max 12 words, must include a number or specific gap",
  "whyNow": "1-2 paragraphs, cite specific signals from corpus (e.g. R3, Y1, N2), present tense",
  "signalEvidence": [
    { "source": "Reddit|YouTube|News|Amazon|PubMed|Google Trends", "metric": "string", "insight": "must include a number or specific data point", "strength": "Strong|Moderate|Weak" },
    { "source": "...", "metric": "...", "insight": "...", "strength": "..." },
    { "source": "...", "metric": "...", "insight": "...", "strength": "..." },
    { "source": "...", "metric": "...", "insight": "...", "strength": "..." }
  ],
  "cagrEstimate": "X% CAGR — brief reasoning",
  "productRecommendation": {
    "product": "product name and format (e.g. Be Bodywise Sea Buckthorn Gummies 500mg, 60-count)",
    "price": "₹XXX/month or ₹XXX per unit — derived from Amazon signal pricing or comparable category benchmarks",
    "competitorPriceRange": "₹XXX–₹XXX based on Amazon signals A1-A10, or 'No direct comp pricing found'",
    "targetConsumer": "specific demographic (e.g. women 22-35, urban Tier 1, PCOS-aware)",
    "usp": "single differentiating claim in one sentence",
    "positioning": "channel + angle (e.g. Instagram-first, dermatologist-endorsed, Ayurveda meets clinical)"
  },
  "recommendedFirstMove": "specific strategic action to take before launch — supply chain, partnerships, influencer seeding, regulatory step (2-3 sentences)",
  "brandFit": ["string"],
  "riskFlag": "one honest caution about consumer, regulatory, or competitive risk",
  "regulatoryNote": "one sentence: any FSSAI, CDSCO, or import regulation relevant to this ingredient in India — if none known, state 'No current regulatory barrier identified'",
  "consumerLanguage": ["exact phrase 1 from corpus", "exact phrase 2"],
  "monthsToMainstream": number,
  "adoptionStage": "Innovators|Early Adopters|Early Majority|Late Majority|Laggards",
  "isConfirmedTrend": boolean
}`;
}

// ─────────────────────────────────────────────────────────────────────────────

// Build a Stage2Corpus from a plain ScoredTrend when _corpus is absent.
// Used by Test Stage 3 and any path where Stage 2 did not attach _corpus.
function corpusFromTrend(trend: ScoredTrend): Stage2Corpus {
  const raw = (trend.signals ?? []) as any[];
  const toRich = (s: any): RichSignal => ({
    source:       s.source === 'serper' ? 'reddit' : s.source === 'serp' ? 'amazon' : s.source,
    keyword:      trend.keyword,
    title:        String(s.title   ?? ''),
    url:          String(s.url     ?? ''),
    snippet:      s.snippet,
    publishedAt:  s.publishedAt,
    viewCount:    s.source === 'youtube' ? (s.engagement ?? undefined) : undefined,
    viewVelocity: s.source === 'youtube' && s.engagement
      ? s.engagement / 30 : undefined,
    reviewCount:  s.source === 'serp' ? undefined : undefined,
    isIndian:     true,
    framingType:  'informational' as const,
  });
  return {
    keyword:          trend.keyword,
    redditSignals:    raw.filter((s) => s.source === 'serper').map(toRich),
    youtubeSignals:   raw.filter((s) => s.source === 'youtube').map(toRich),
    newsSignals:      raw.filter((s) => s.source === 'newsapi').map(toRich),
    pubmedSignals:    raw.filter((s) => s.source === 'pubmed').map(toRich),
    amazonSignals:    raw.filter((s) => s.source === 'serp').map(toRich),
    consumerQuotes:   trend.consumerQuotes ?? [],
    trendSlope:       0,
    trendValues:      [],
    totalSignalCount: raw.length,
  };
}

async function generateOneBrief(trend: ScoredTrend, runId: string): Promise<OpportunityBrief> {
  // Use rich _corpus from Stage 2 if available; reconstruct from signals if absent (test mode)
  const corpus: Stage2Corpus = (trend as any)._corpus ?? corpusFromTrend(trend);

  const makeFallbackBrief = (reason: string): OpportunityBrief => ({
    keyword:         trend.keyword,
    headline:        `${trend.keyword} — analysis incomplete`,
    whyNow:          `Gemini could not generate analysis. Reason: ${reason}`,
    signalEvidence:  [],
    cagrEstimate:    '',
    firstMove:       '',
    brandFit:        [],
    riskFlag:        '',
    scores: {
      velocity:    trend.velocityScore    ?? 0,
      market:      trend.marketScore      ?? 0,
      competition: trend.competitionScore ?? 0,
      timing:      trend.timingScore      ?? 0,
      overall:     trend.overallScore     ?? 0,
    },
    consistencyFlag: null,
    consumerQuotes:  trend.consumerQuotes ?? [],
    isConfirmedTrend: false,
  });

  try {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!GEMINI_API_KEY) return makeFallbackBrief('Missing VITE_GEMINI_API_KEY');

    const prompt = buildScoringPrompt(trend.keyword, corpus);
    console.log('[S3] Calling Gemini for:', trend.keyword);

    const data: any = await retryFetch(
      `${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      },
    );

    console.log('[S3] Gemini scoring complete for:', trend.keyword);
    // Gemini with google_search grounding returns multiple parts; last text part is the JSON answer
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const raw: string = parts
      .filter((p: any) => typeof p?.text === 'string' && p.text.trim().length > 10)
      .map((p: any) => p.text as string)
      .pop() ?? '';
    if (!raw) throw new Error('Empty Gemini response');

    console.log('[S3] Raw (first 400):', raw.slice(0, 400));

    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(clean); }
    catch { throw new Error('JSON parse failed: ' + clean.slice(0, 300)); }

    // Normalise signal evidence
    const rawEvidence = Array.isArray(parsed.signalEvidence) ? parsed.signalEvidence : [];
    const signalEvidence = rawEvidence.map((e: any) => ({
      source:   String(e?.source   ?? 'Analysis').trim(),
      metric:   String(e?.metric   ?? 'Signal').trim(),
      insight:  String(e?.insight  ?? '').trim(),
      strength: (['Strong', 'Moderate', 'Weak'].includes(e?.strength) ? e.strength : 'Moderate') as 'Strong' | 'Moderate' | 'Weak',
    }));

    const velocityScore    = Math.max(1, Number(parsed.velocityScore)    || 1);
    const marketScore      = Math.max(3, Number(parsed.marketScore) || 3);
    const competitionScore = Math.max(1, Number(parsed.competitionScore) || 1);  // floor at 1
    const timingScore      = Math.max(1, Number(parsed.timingScore)      || 1);
    const overallScore     = Math.round(((velocityScore + marketScore + competitionScore + timingScore) / 4) * 10) / 10;

    const brief: OpportunityBrief = {
      keyword:     trend.keyword,
      headline:    String(parsed.headline    ?? '').trim(),
      whyNow:      String(parsed.whyNow      ?? '').trim(),
      signalEvidence,
      cagrEstimate: String(parsed.cagrEstimate ?? '').trim(),
      firstMove:   String(parsed.firstMove   ?? parsed.recommendedFirstMove ?? '').trim(),
      productRecommendation: parsed.productRecommendation ? {
        ...parsed.productRecommendation,
        competitorPriceRange: String(parsed.productRecommendation.competitorPriceRange ?? '').trim() || undefined,
      } : undefined,
      recommendedFirstMove:  String(parsed.recommendedFirstMove ?? '').trim(),
      brandFit: Array.isArray(parsed.brandFit)
        ? parsed.brandFit.map((s: any) => String(s ?? '').trim()).filter(Boolean) : [],
      riskFlag: String(parsed.riskFlag ?? '').trim(),
      regulatoryNote: String(parsed.regulatoryNote ?? 'No current regulatory barrier identified').trim(),
      scores: { velocity: velocityScore, market: marketScore, competition: competitionScore, timing: timingScore, overall: overallScore },
      consumerQuotes: Array.isArray(parsed.consumerLanguage)
        ? parsed.consumerLanguage.map((s: any) => String(s ?? '').trim()).filter(Boolean)
        : corpus.consumerQuotes.slice(0, 5),
      isConfirmedTrend:  Boolean(parsed.isConfirmedTrend),
      // Pass Google Trends weekly values through so OpportunityCard can render sparkline
      sparklineData: corpus.trendValues.length >= 5 ? corpus.trendValues : [],

      // Reasoning fields for BriefPage to display
      velocityReasoning:    String(parsed.velocityReasoning    ?? '').trim(),
      marketReasoning: String(parsed.marketReasoning ?? '').trim(),
      competitionReasoning: String(parsed.competitionReasoning ?? '').trim(),
      timingReasoning:      String(parsed.timingReasoning      ?? '').trim(),
      consistencyFlag:      parsed.consistencyFlag ?? null,
      adoptionStage: (['Innovators', 'Early Adopters', 'Early Majority', 'Late Majority', 'Laggards'].includes(parsed.adoptionStage)
        ? parsed.adoptionStage
        : 'Early Adopters') as 'Innovators' | 'Early Adopters' | 'Early Majority' | 'Late Majority' | 'Laggards',
      monthsToMainstream:   Number(parsed.monthsToMainstream)  || 0,
    };

    // Write back actual Gemini scores to ScoredTrend (mutate in place — orchestrator uses these)
    (trend as any).velocityScore    = velocityScore;
    (trend as any).marketScore      = marketScore;
    (trend as any).competitionScore = competitionScore;
    (trend as any).timingScore      = timingScore;
    (trend as any).overallScore     = overallScore;

    console.log('[S3] Scores for', trend.keyword,
      '| v:', velocityScore, 'm:', marketScore, 'c:', competitionScore, 't:', timingScore, 'overall:', overallScore);

    await persistBrief(trend, runId, brief, overallScore, velocityScore, marketScore, competitionScore, timingScore);
    return brief;

  } catch (err: any) {
    console.error('[S3] Gemini failed for:', trend.keyword, '|', err?.message);
    const fallback = makeFallbackBrief(err?.message ?? String(err));
    await persistBrief(trend, runId, fallback, 0, 0, 0, 0, 0).catch(() => {});
    return fallback;
  }
}

async function persistBrief(
  trend: ScoredTrend, runId: string, brief: OpportunityBrief,
  overall: number, velocity: number, market: number, competition: number, timing: number,
) {
  if (!isValidUUID(runId)) return;
  try {
    // Use insert — upsert requires a unique constraint on (run_id, keyword) which
    // may not exist. Insert is safe because each run generates fresh rows.
    const { error } = await supabase.from('trend_reports').insert({
      run_id: runId, keyword: trend.keyword,
      overall_score: overall, velocity_score: velocity, market_score: market,
      competition_score: competition, timing_score: timing,
      headline: brief.headline, why_now: brief.whyNow, first_move: brief.firstMove,
      risk_flag: brief.riskFlag, brand_fit: brief.brandFit, brief_json: brief,
      is_confirmed_trend: brief.isConfirmedTrend,
      yt_view_velocity: trend.ytViewVelocity,
      amazon_results: trend.amazonResults,
      pubmed_count: trend.pubmedCount,
      news_count: trend.newsCount,
      signal_count: trend.signalCount,
    });
    if (error) console.error('[S3] Supabase insert failed:', trend.keyword, error.message);
  } catch (err) { console.error('[S3] Supabase threw:', err); }
}

export async function generateReports(trends: ScoredTrend[], runId: string): Promise<OpportunityBrief[]> {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  console.log('[S3] Key present:', !!GEMINI_API_KEY, '| Model:', GEMINI_MODEL, '| Trends:', trends.length);

  const allBriefs: OpportunityBrief[] = [];

  // ONE keyword at a time — two Gemini calls per keyword requires sequential processing
  for (let i = 0; i < trends.length; i += 1) {
    const batch = trends.slice(i, i + 1);
    try {
      const batchBriefs = await Promise.all(batch.map((t) => generateOneBrief(t, runId)));
      allBriefs.push(...batchBriefs);
    } catch (err) { console.error('[S3] Batch error:', err); }
    if (i + 1 < trends.length) await sleep(8000); // 8s gap — single call per keyword, respect RPM
  }

  console.log('[S3] Done. Briefs:', allBriefs.length);
  return allBriefs;
}