import supabase from '../lib/supabase';
import type { RawSignal } from '../lib/types';

const SERPER_API_KEY  = import.meta.env.VITE_SERPER_API_KEY  as string | undefined;
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;
const NEWS_API_KEY    = import.meta.env.VITE_NEWS_API_KEY    as string | undefined;
const GEMINI_API_KEY  = import.meta.env.VITE_GEMINI_API_KEY  as string | undefined;

const GEMINI_MODEL = 'gemini-2.5-flash'; 
const SERPER_URL   = 'https://google.serper.dev/search';
const YOUTUBE_URL  = 'https://www.googleapis.com/youtube/v3/search';
const NEWSAPI_URL  = 'https://api.thenewsapi.com/v1/news/all';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// All external API calls go through sanket-proxy edge function to avoid 403/CORS
const S1_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function s1ProxyCall(service: string, body: object): Promise<any> {
  const base = (SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) throw new Error('VITE_SUPABASE_URL missing');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (S1_SUPABASE_ANON_KEY) headers['Authorization'] = `Bearer ${S1_SUPABASE_ANON_KEY}`;
  const res = await fetch(`${base}/functions/v1/sanket-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ service, ...body }),
  });
  if (!res.ok) throw new Error(`proxy/${service} ${res.status}`);
  return res.json();
}

const SIX_MONTHS_AGO_ISO = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
// NewsAPI free plan: max 30-day lookback
const ONE_MONTH_AGO_ISO  = new Date(Date.now() -  29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // thenewsapi needs YYYY-MM-DD

const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — only used when ALL THREE APIs fail completely
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_TRENDS: string[] = [
  'ashwagandha stress relief supplements india',
  'collagen peptides beauty supplements india',
  'berberine insulin resistance and pcos india',
  'probiotic gut health capsules india',
  'plant based protein powder india',
  'vitamin d3 and k2 deficiency india',
  'hair gummies biotin and multivitamin india',
  'sleep support melatonin and herbal blends india',
];

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC QUERY BUILDER
// Queries rotate based on current week number so each scan gets a different
// slice of the discovery space. No two weekly scans hit the same query set.
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentWeek(): number {
  const start = new Date(new Date().getFullYear(), 0, 1);
  return Math.ceil(((Date.now() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

function buildDynamicQueries(): {
  reddit: string[];
  youtube: string[];
  news: string[];
  usLag: string[];
} {
  const week = getCurrentWeek();
  const now  = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const year  = now.getFullYear();

  // ── REDDIT: 4 pools of 10 queries, rotated by week mod 4 ──────────────────
  // CONFIRMED FIX: Serper blocks ALL site:reddit.com queries (both quoted names
  // and /r/ format return 500). Use plain keyword + "reddit" queries instead —
  // Google surfaces Reddit posts naturally without site: operator.
  const redditPools: string[][] = [
    // Pool A — ingredient discovery
    [
      `reddit r/IndiaFitness supplement india ${year}`,
      `reddit r/AskIndia supplement recommendation india`,
      `reddit IndianSkincareAddicts ingredient supplement india`,
      `reddit r/PCOSIndia supplement helped results`,
      `reddit AskIndia health supplement india review`,
      `reddit AyurvedicHealth remedy supplement india`,
      `reddit india supplement not available imported ${year}`,
      `reddit IndiaFitness new supplement launch india`,
      `reddit PCOSIndia supplement results hormones`,
      `reddit AsianBeauty skincare supplement india underrated`,
    ],
    // Pool B — pain point discovery
    [
      `reddit india hair fall supplement ${year}`,
      `reddit IndiaFitness gut health microbiome supplement`,
      `reddit AskIndia sleep supplement india review`,
      `reddit india ashwagandha stress anxiety supplement`,
      `reddit PCOSIndia hormone supplement results india`,
      `reddit IndianSkincareAddicts collagen peptides supplement`,
      `reddit india thyroid supplement helped`,
      `reddit india immunity supplement review`,
      `reddit IndiaFitness recovery supplement protein`,
      `reddit india joint pain ayurveda supplement`,
    ],
    // Pool C — format and emerging categories
    [
      `reddit india gummies supplement ${year}`,
      `reddit IndiaFitness mushroom adaptogen supplement india`,
      `reddit AskIndia nootropic brain supplement india`,
      `reddit IndianSkincareAddicts peptide serum supplement`,
      `reddit india effervescent supplement health`,
      `reddit india weight management supplement review`,
      `reddit PCOSIndia inositol berberine supplement india`,
      `reddit AyurvedicHealth moringa shatavari supplement`,
      `reddit india kids supplement vitamin immunity`,
      `reddit india D2C supplement brand review ${year}`,
    ],
    // Pool D — velocity and US-lag
    [
      `reddit india supplement trending ${monthName} ${year}`,
      `reddit india biohacking supplement`,
      `reddit IndiaFitness supplement new launch india`,
      `reddit india doctor recommended supplement`,
      `reddit AskIndia collagen protein supplement india`,
      `reddit india supplement from US not available`,
      `reddit IndianSkincareAddicts bakuchiol ceramide supplement`,
      `reddit india magnesium glycinate melatonin review`,
      `reddit india sea buckthorn astaxanthin supplement`,
      `reddit india sea moss black seed supplement`,
    ],
  ];

  // ── YOUTUBE: 4 pools of 10 queries, rotated by week mod 4 ─────────────────
  const youtubePools: string[][] = [
    // Pool A — honest review signals
    [
      `honest review supplement india ${year}`,
      `supplement I actually use daily india results`,
      `underrated supplement india nobody talks about`,
      `ayurveda ingredient science backed india`,
      `supplement changed my life india review`,
      `doctor review supplement india worth it`,
      `hair skin supplement india 3 months results`,
      `women health supplement india pcos thyroid`,
      `gut microbiome supplement india what happened`,
      `vitamin deficiency india what to take`,
    ],
    // Pool B — trend identification
    [
      `trending supplement india ${monthName} ${year}`,
      `new health product india launch ${year}`,
      `supplement india before after transformation`,
      `men health supplement india testosterone hair`,
      `sleep supplement india review comparison`,
      `mushroom supplement india reishi lion mane`,
      `collagen supplement india which one to buy`,
      `children supplement india immunity gut`,
      `weight loss supplement india no gymno exercise`,
      `adaptogen herb india stress cortisol`,
    ],
    // Pool C — category deep dives
    [
      `ashwagandha KSM-66 india real review`,
      `probiotic india which strain to buy`,
      `omega 3 india fish oil vs algae`,
      `magnesium supplement india types comparison`,
      `iron supplement india women anaemia`,
      `zinc supplement india skin hair immune`,
      `berberine india pcos insulin resistance`,
      `postbiotic synbiotic supplement india women gut`,
      `electrolyte supplement india hydration`,
      `protein supplement india plant vs whey women`,
    ],
    // Pool D — emerging signals
    [
      `supplement stack india ${year} routine`,
      `new ingredient supplement india just launched`,
      `naturopath dietitian india supplement recommend`,
      `bloodwork supplement india what deficiency`,
      `india supplement brand honest comparison`,
      `ayurvedic supplement modern science india`,
      `seed cycling PCOS india supplement`,
      `postbiotic synbiotic india supplement`,
      `spermidine NMN NAD supplement india`,
      `lion mane focus india brain supplement`,
    ],
  ];

  // ── NEWS: India regulatory + US trend signals ────────────────────────────
  const newsPools: string[][] = [
    // Pool 0 — India regulatory + market signals
    [
      `nutraceutical supplement India market launch ${year}`,
      `FSSAI approval supplement regulation India ${year}`,
      `D2C health brand India funding launch ${year}`,
      `wellness ingredient trending India ${monthName}`,
      `CDSCO nutraceutical approval India ${year}`,
    ],
    // Pool 1 — US trend signals (for lag detection)
    [
      `supplement trending United States ${monthName} ${year}`,
      `wellness ingredient US market launch ${year}`,
      `new supplement category growth USA ${year}`,
      `functional food ingredient USA trend ${year}`,
      `nutraceutical FDA GRAS approved USA ${year}`,
    ],
  ];

  // ── US-LAG: Always fetch one US signal pool alongside India news ──────────
  const usLagQueries: string[] = [
    `trending supplement USA ${year} new launch`,
    `wellness product US market launch ${monthName} ${year}`,
    `supplement ingredient trending TikTok USA ${year}`,
  ];

  const rPool = week % 4;
  const yPool = (week + 1) % 4; // offset so Reddit and YouTube don't overlap categories
  const nPool = week % 2;

  return {
    reddit:  redditPools[rPool],
    youtube: youtubePools[yPool],
    news:    newsPools[nPool],
    usLag:   usLagQueries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI EXTRACTION FRAMEWORK
// Applies structured signal-pattern analysis — same rigor as market scoring.
// ─────────────────────────────────────────────────────────────────────────────

function buildExtractionPrompt(
  redditTexts: string[],
  youtubeTexts: string[],
  newsTexts:   string[],
  usLagTexts:  string[] = [],
): string {
  return `You are SankET, a senior wellness trend analyst for Mosaic Wellness India (D2C brands: Man Matters, Be Bodywise, Little Joys, Root Labs).

Your task: extract exactly 12 emerging wellness keyword opportunities from the raw signal corpus below.
All signals are from India, collected in the past 6 months.

=== RAW SIGNAL CORPUS ===
REDDIT (${redditTexts.length} signals):
${redditTexts.slice(0, 50).map((t, i) => `R${i+1}. ${t}`).join('\n')}

YOUTUBE (${youtubeTexts.length} signals):
${youtubeTexts.slice(0, 40).map((t, i) => `Y${i+1}. ${t}`).join('\n')}

NEWS (${newsTexts.length} signals):
${newsTexts.slice(0, 20).map((t, i) => `N${i+1}. ${t}`).join('\n')}

US/GLOBAL TREND SIGNALS (${usLagTexts.length} signals — for lag detection):
${usLagTexts.slice(0, 10).map((t, i) => `US${i+1}. ${t}`).join('\n')}
NOTE: US/Global signals show what is trending in mature markets 12-24 months before India adoption.
=== END CORPUS ===

EXTRACTION FRAMEWORK — apply all 5 filters before selecting each keyword:

FILTER 1 — CROSS-SOURCE BONUS (required for score ≥7):
  A keyword scores higher if it appears in 2+ source types (Reddit + YouTube, Reddit + News, etc.)
  Cross-reference the corpus. If "berberine" appears in R3, Y7, N2 → it is a confirmed multi-source signal.
  Single-source signals may still qualify but must pass Filter 2.

FILTER 2 — NOVELTY CHECK (penalise well-established keywords):
  Penalise keywords that are already mainstream D2C products in India:
  PENALISED — these are already well-established D2C markets in India with hundreds of SKUs.
  SKIP ENTIRELY unless the signal is for a specific NEW FORMAT or UNTAPPED NICHE within them:
    - creatine monohydrate (saturated fitness market, thousands of products)
    - whey protein (commoditised)
    - multivitamin (generic)
    - general probiotics (unless a specific strain like L. reuteri or postbiotic format)
    - vitamin C (generic)
    - fish oil / omega 3 (generic, unless algae-based DHA for vegans)
    - basic ashwagandha (unless specifically KSM-66 extract gummies or a new format)
    - mass gainers, pre-workout (gym supplement commodities)
    - general protein powder (unless specific: "pea protein for women india")
  ACCEPTABLE exception: "creatine gummies india" or "creatine for women 40+ india" would pass (new angle).
  REWARD: new delivery formats (gummies, liposomal, effervescent), genuinely new-to-India ingredients
  (postbiotics, spermidine, NMN, lion's mane, sea moss, saffron extract, black seed oil),
  niche condition targeting (PCOS-specific, thyroid-specific, perimenopause, men's hair loss science-backed).

FILTER 3 — SPECIFICITY RULE (mandatory):
  Each keyword must be SPECIFIC enough for Stage 2 to validate on Amazon and YouTube.
  BAD: "protein supplement india" (too broad, 500+ Amazon listings)
  GOOD: "collagen peptides type 1 3 women india" or "berberine pcos insulin india"
  BAD: "ayurveda india" (meaningless)
  GOOD: "shatavari capsule women hormones india"

FILTER 4 — MOSAIC BRAND FIT (at least 8 of 12 must fit a brand):
  Man Matters: men's hair, testosterone, performance, stress, sexual health
  Be Bodywise: PCOS, women's hormones, skin, hair loss women, fertility
  Little Joys: children immunity, gut, focus, growth
  Root Labs: Ayurveda ingredients with modern clinical evidence
  New Category: genuine white space with no current brand fit

FILTER 5 — MOMENTUM SIGNAL (at least 6 of 12 must have one):
  Momentum = any of: multiple Reddit posts with upvote signals, YouTube video with high view count,
  news article mentioning "launch" or "growing", cross-source appearance.
  State which signal(s) justify momentum for each selected keyword.

DIVERSITY REQUIREMENT:
  Select across multiple health categories. Do NOT output 12 keywords from the same category.
  Aim for: 2-3 women's health, 2 men's health, 1-2 children, 1-2 Ayurveda, 2-3 general wellness, 1-2 New Category.

OUTPUT:
Return ONLY a valid JSON array of exactly 12 strings.
Each string = a specific, searchable keyword phrase 3-7 words long, always ending in "india".
No markdown. No explanation. No numbering. Just the array.

Example format:
["berberine pcos insulin resistance india", "sea moss gel supplement india", "lion mane focus supplement india", ...]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function discoverTrends(runId: string): Promise<string[]> {
  const redditSignals:  RawSignal[] = [];
  const youtubeSignals: RawSignal[] = [];
  const newsSignals:    RawSignal[] = [];
  const redditTexts:  string[] = [];
  const youtubeTexts: string[] = [];
  const newsTexts:    string[] = [];

  const queries = buildDynamicQueries();
  const week    = getCurrentWeek();
  console.log(`[S1] Week ${week} — Reddit pool ${week % 4}, YouTube pool ${(week + 1) % 4}, News pool ${week % 2}`);

  // ── PART A: SERPER REDDIT ─────────────────────────────────────────────────
  try {
    if (!SERPER_API_KEY) {
      console.error('[S1] Missing VITE_SERPER_API_KEY.');
    } else {
      // Sequential with delay — Serper free tier = 5 req/sec max
      for (const q of queries.reddit) {
        try {
          await new Promise(r => setTimeout(r, 300));
          const data: any = await s1ProxyCall('serper', { params: { q, num: 10, gl: 'in', hl: 'en', tbs: 'qdr:m6' } })
            .catch((e: any) => { console.warn('[S1] Serper proxy failed:', q, e?.message); return {}; });
          (data?.organic ?? []).forEach((item: any) => {
            const title   = String(item?.title   ?? '').trim();
            const link    = String(item?.link    ?? '').trim();
            const snippet = String(item?.snippet ?? '').trim();
            if (!title || !link) return;
            const upvoteMatch = snippet.match(/(\d[\d,]*)\s*(?:votes?|upvotes?|points?)/i);
            const upvotes = upvoteMatch ? parseInt(upvoteMatch[1].replace(/,/g, ''), 10) : 0;
            redditSignals.push({ source: 'serper', keyword: 'discovery', title, url: link, snippet: snippet || undefined, engagement: upvotes });
            redditTexts.push(`${title}${snippet ? ` [${snippet.slice(0, 100)}]` : ''}${upvotes ? ` [${upvotes} upvotes]` : ''}`);
          });
        } catch (err) { console.warn('[S1] Serper failed:', q, err); }
      }
    }
  } catch (err) { console.error('[S1] Serper scan failed:', err); }

  console.log('[S1] Reddit signals:', redditSignals.length);

  // ── PART B: YOUTUBE ───────────────────────────────────────────────────────
  try {
    if (!YOUTUBE_API_KEY) {
      console.error('[S1] Missing VITE_YOUTUBE_API_KEY.');
    } else {
      await Promise.all(queries.youtube.map(async (q) => {
        try {
          const data: any = await s1ProxyCall('youtube_search', {
            endpoint: 'search',
            params: {
              part: 'snippet', maxResults: '8',
              order: 'viewCount', regionCode: 'IN', relevanceLanguage: 'en',
              publishedAfter: SIX_MONTHS_AGO_ISO, q,
            },
          }).catch((e: any) => { console.warn('[S1] YouTube proxy failed:', q, e?.message); return {}; });
          (data?.items ?? []).forEach((item: any) => {
            const snip        = item?.snippet ?? {};
            const title       = String(snip?.title        ?? '').trim();
            const description = String(snip?.description  ?? '').trim();
            const publishedAt = String(snip?.publishedAt  ?? '').trim() || undefined;
            const channel     = String(snip?.channelTitle ?? '').trim();
            const id = item?.id?.videoId ?? '';
            if (!title) return;
            youtubeSignals.push({
              source: 'youtube', keyword: 'discovery', title,
              url: id ? `https://www.youtube.com/watch?v=${id}` : '',
              snippet: description || undefined, engagement: 0, publishedAt,
            });
            youtubeTexts.push(`${title}${channel ? ` (${channel})` : ''}${publishedAt ? ` [${publishedAt.slice(0, 10)}]` : ''}`);
          });
        } catch (err) { console.warn('[S1] YouTube failed:', q, err); }
      }));
    }
  } catch (err) { console.error('[S1] YouTube scan failed:', err); }

  console.log('[S1] YouTube signals:', youtubeSignals.length);

  // ── PART C: NEWSAPI ───────────────────────────────────────────────────────
  try {
    if (!NEWS_API_KEY) {
      console.error('[S1] Missing VITE_NEWS_API_KEY.');
    } else {
      // Route through proxy — NewsAPI blocks direct browser CORS requests
      await Promise.all(queries.news.map(async (q: string) => {
        try {
          const data: any = await s1ProxyCall('newsapi', {
            params: { language: 'en', sort: 'published_at', published_after: ONE_MONTH_AGO_ISO, limit: '10', search: q },
          }).catch((e: any) => { console.warn('[S1] NewsAPI proxy failed:', q, e?.message); return {}; });
          (data?.data ?? []).forEach((article: any) => {
            const title       = String(article?.title       ?? '').trim();
            const urlStr      = String(article?.url         ?? '').trim();
            const description = String(article?.description ?? '').trim();
            const publishedAt = String(article?.published_at ?? article?.publishedAt ?? '').trim() || undefined;
            if (!title || !urlStr) return;
            newsSignals.push({ source: 'newsapi', keyword: 'discovery', title, url: urlStr, snippet: description || undefined, engagement: 0, publishedAt });
            newsTexts.push(`${title}${publishedAt ? ` [${publishedAt.slice(0, 10)}]` : ''}`);
          });
        } catch (err) { console.warn('[S1] NewsAPI failed:', q, err); }
      }));
    }
  } catch (err) { console.error('[S1] NewsAPI scan failed:', err); }

  console.log('[S1] News signals:', newsSignals.length);

  // ── PART D: SUPABASE LOGGING ──────────────────────────────────────────────
  if (isValidUUID(runId)) {
    try {
      const allSignals = [...redditSignals, ...youtubeSignals, ...newsSignals];
      if (allSignals.length > 0) {
        const rows = allSignals.map((s) => ({
          run_id: runId, source: s.source, keyword: s.keyword,
          title: s.title, url: s.url, snippet: s.snippet ?? null, engagement: s.engagement ?? 0,
        }));
        const { error } = await supabase.from('raw_signals').insert(rows);
        if (error) console.error('[S1] Supabase insert error:', error.message);
        else console.log('[S1] Inserted', rows.length, 'raw signals');
      }
    } catch (err) { console.error('[S1] Supabase logging failed:', err); }
  }

  // ── PART E: GEMINI KEYWORD EXTRACTION WITH FRAMEWORK ─────────────────────
  try {
    if (!GEMINI_API_KEY) {
      console.error('[S1] Missing VITE_GEMINI_API_KEY. Using fallback.');
      return FALLBACK_TRENDS;
    }
    if (!redditTexts.length && !youtubeTexts.length && !newsTexts.length) {
      console.warn('[S1] All APIs returned empty. Using fallback.');
      return FALLBACK_TRENDS;
    }

    // Fetch US lag signals (non-blocking, used for context in prompt)
    const usLagTexts: string[] = [];
    for (const q of (queries.usLag ?? [])) {
      try {
        await new Promise(r => setTimeout(r, 150));
        const data: any = await s1ProxyCall('newsapi', {
          search: q, language: 'en', sort: 'published_at', limit: '5',
          published_after: ONE_MONTH_AGO_ISO,
        }).catch(() => null);
        (data?.data ?? []).forEach((article: any) => {
          const t = String(article?.title ?? '').trim();
          if (t) usLagTexts.push(`[US MARKET] ${t}`);
        });
      } catch { /* non-blocking */ }
    }
    console.log('[S1] US-lag signals:', usLagTexts.length);

    const prompt = buildExtractionPrompt(redditTexts, youtubeTexts, newsTexts, usLagTexts);

    console.log('[S1] Calling Gemini for keyword extraction. Signals: Reddit', redditTexts.length, 'YT', youtubeTexts.length, 'News', newsTexts.length, 'US-lag', usLagTexts.length);

    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'You are a wellness market intelligence analyst. Return only valid JSON arrays.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 }, // higher temp = more varied keywords
      }),
    });

    console.log('[S1] Gemini status:', res.status);
    if (!res.ok) {
      const errText = await res.text();
      console.error('[S1] Gemini error:', errText.slice(0, 200), '— using fallback');
      return FALLBACK_TRENDS;
    }

    const data: any = await res.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!raw) { console.error('[S1] Gemini empty. Using fallback.'); return FALLBACK_TRENDS; }

    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(clean); }
    catch { console.error('[S1] JSON parse failed:', clean.slice(0, 200)); return FALLBACK_TRENDS; }

    if (!Array.isArray(parsed)) { console.error('[S1] Not array:', parsed); return FALLBACK_TRENDS; }

    const keywords = (parsed as unknown[])
      .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
      .filter(Boolean);

    if (!keywords.length) { console.error('[S1] Empty keywords. Using fallback.'); return FALLBACK_TRENDS; }

    console.log('[S1] Extracted keywords:', keywords);
    return keywords.slice(0, 12);

  } catch (err) {
    console.error('[S1] Gemini extraction failed:', err);
    return FALLBACK_TRENDS;
  }
}