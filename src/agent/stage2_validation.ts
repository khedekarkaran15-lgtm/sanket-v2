import supabase from '../lib/supabase';
import type { RawSignal, ScoredTrend } from '../lib/types';

const SERP_API_KEY    = import.meta.env.VITE_SERP_API_KEY    as string | undefined;
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;
const NEWS_API_KEY    = import.meta.env.VITE_NEWS_API_KEY    as string | undefined;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// SerpAPI must be called via the Supabase Edge Function (sanket-proxy).
// Direct browser → serpapi.com is CORS-blocked. Edge function → serpapi.com works fine.
// This is why Google Trends always returned 0 before.
const SERP_URL = 'https://serpapi.com/search'; // reference only — not called directly

// Central proxy caller — all APIs route through sanket-proxy edge function
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function proxyCall(service: string, body: object): Promise<any> {
  const base = (SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) throw new Error(`VITE_SUPABASE_URL missing — ${service} skipped`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Supabase Edge Functions require Authorization: Bearer <anon-key>
  if (SUPABASE_ANON_KEY) headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
  const res = await fetch(`${base}/functions/v1/sanket-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ service, ...body }),
  });
  if (!res.ok) throw new Error(`sanket-proxy/${service} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// SerpAPI (Google Trends, Amazon via Google)
async function serpViaProxy(params: Record<string, string>): Promise<any> {
  return proxyCall('serpapi', { params });
}

// Serper (Reddit search)
async function serperViaProxy(params: object): Promise<any> {
  return proxyCall('serper', { params });
}

// YouTube Data API v3 — proxied because YouTube blocks direct browser fetch with 403
async function youtubeViaProxy(endpoint: string, params: Record<string, string>): Promise<any> {
  return proxyCall('youtube_search', { endpoint, params });
}

// Google Trends
async function trendsViaProxy(keyword: string): Promise<any> {
  return proxyCall('google_trends', { keyword, geo: 'IN', date: 'today 12-m' });
}
const YT_SEARCH   = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEOS   = 'https://www.googleapis.com/youtube/v3/videos';
const YT_COMMENTS = 'https://www.googleapis.com/youtube/v3/commentThreads';
const NEWSAPI_URL = 'https://api.thenewsapi.com/v1/news/all';
const PUBMED_URL  = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';

// All data strictly within 6-month window
const SIX_MONTHS_AGO_ISO  = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
// NewsAPI free plan: max 30-day lookback
const ONE_MONTH_AGO_ISO   = new Date(Date.now() -  29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // thenewsapi uses YYYY-MM-DD
const THREE_MONTHS_AGO_ISO = new Date(Date.now() -  90 * 24 * 60 * 60 * 1000).toISOString();

const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 is now a PURE DATA COLLECTOR.
// All scoring and reasoning is done by Gemini in Stage 3.
// The goal here is to extract the richest possible signal metadata so Gemini
// can reason about: upvotes, view counts, like ratios, source type, framing, etc.
// ─────────────────────────────────────────────────────────────────────────────

export interface RichSignal {
  source:         'reddit' | 'youtube' | 'newsapi' | 'pubmed' | 'amazon' | 'google_trends';
  keyword:        string;
  title:          string;
  url:            string;
  snippet?:       string;
  publishedAt?:   string;

  // Reddit-specific
  upvotes?:       number;   // extracted from snippet text if present
  commentCount?:  number;   // extracted from snippet text if present
  subreddit?:     string;

  // YouTube-specific
  viewCount?:     number;
  likeCount?:     number;
  commentCountYT?: number;
  channelTitle?:  string;
  subscriberTier?: 'niche' | 'mid' | 'mainstream'; // estimated from channel name patterns
  viewVelocity?:  number;  // views/day since publish

  // News-specific
  sourceName?:    string;
  isIndian?:      boolean;
  framingType?:   'informational' | 'commercial' | 'regulatory' | 'review';

  // Market-specific
  reviewCount?:   number;  // Amazon review count if extractable
  price?:         string;
  engagement?:    number;  // generic engagement score (reviews, upvotes etc)
}

export interface Stage2Corpus {
  keyword:          string;
  redditSignals:    RichSignal[];
  youtubeSignals:   RichSignal[];
  newsSignals:      RichSignal[];
  pubmedSignals:    RichSignal[];
  amazonSignals:    RichSignal[];
  trendSlope:       number;
  trendValues:      number[];
  consumerQuotes:   string[];
  isNovelKeyword?:  boolean;    // true = first time seen in SankET history — strong predictive signal
  totalSignalCount: number;
}

// Extract upvotes / comments from Serper Reddit snippets
// Serper often includes "123 votes, 45 comments" in snippet text
function extractRedditMeta(snippet: string): { upvotes: number; commentCount: number } {
  const upvoteMatch   = snippet.match(/(\d[\d,]*)\s*(?:votes?|upvotes?|points?)/i);
  const commentMatch  = snippet.match(/(\d[\d,]*)\s*comments?/i);
  const upvotes       = upvoteMatch  ? parseInt(upvoteMatch[1].replace(/,/g, ''),  10) : 0;
  const commentCount  = commentMatch ? parseInt(commentMatch[1].replace(/,/g, ''), 10) : 0;
  return { upvotes, commentCount };
}

function extractSubreddit(url: string): string {
  const m = url.match(/reddit\.com\/r\/([^/]+)/i);
  return m ? m[1] : 'unknown';
}

function classifyNewsFraming(title: string, description: string): 'informational' | 'commercial' | 'regulatory' | 'review' {
  const text = (title + ' ' + description).toLowerCase();
  if (/ban|restrict|fssai|cdsco|regulat|warning|recall/i.test(text))  return 'regulatory';
  if (/review|rating|best|top \d|ranked|recommend/i.test(text))       return 'review';
  if (/buy|shop|deal|discount|offer|launch|sale|brand/i.test(text))   return 'commercial';
  return 'informational';
}

const INDIAN_NEWS_DOMAINS = [
  'timesofindia', 'hindustantimes', 'ndtv', 'economictimes', 'thehindu',
  'indianexpress', 'livemint', 'businessstandard', 'moneycontrol', 'indiatoday',
];

function isIndianSource(url: string, sourceName: string): boolean {
  const haystack = (url + ' ' + sourceName).toLowerCase();
  return INDIAN_NEWS_DOMAINS.some((d) => haystack.includes(d)) || haystack.includes('.in/');
}

function estimateSubscriberTier(channelTitle: string, viewCount: number): 'niche' | 'mid' | 'mainstream' {
  const name = channelTitle.toLowerCase();
  // Very rough heuristic: mainstream channels have generic names; niche channels are specialist
  if (viewCount > 500000)                                  return 'mainstream';
  if (name.includes('doctor') || name.includes('dr.') ||
      name.includes('nutritionist') || name.includes('ayurved')) return 'niche';
  return 'mid';
}

// ─────────────────────────────────────────────────────────────────────────────

export async function validateTrends(keywords: string[], runId: string): Promise<ScoredTrend[]> {
  // Build corpora for all keywords in parallel
  const corpora = await Promise.all(
    keywords.map((kw) => buildCorpus(kw, runId))
  );

  // Return as ScoredTrend[] — scores are ALL ZERO at this stage.
  // Stage 3 Gemini fills in the actual scores via reasoning.
  const results: ScoredTrend[] = corpora.map((corpus) => ({
    keyword:          corpus.keyword,
    velocityScore:    0,
    marketScore:      0,
    competitionScore: 0,
    timingScore:      0,
    overallScore:     0,
    ytViewVelocity:   Math.max(0, ...corpus.youtubeSignals.map((s) => s.viewVelocity ?? 0)),
    amazonResults:    corpus.amazonSignals.length,
    amazonSponsored:  0,
    pubmedCount:      corpus.pubmedSignals.length,
    newsCount:        corpus.newsSignals.length,
    signalCount:      corpus.totalSignalCount,
    signals:          [
      ...corpus.redditSignals,
      ...corpus.youtubeSignals,
      ...corpus.newsSignals,
      ...corpus.pubmedSignals,
      ...corpus.amazonSignals,
    ] as unknown as RawSignal[],
    consumerQuotes:   corpus.consumerQuotes,
    // Attach full corpus for Stage 3 to consume
    _corpus:          corpus,
  } as any));

  console.log('[S2] Corpora built for', results.length, 'keywords');
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD INTELLIGENCE LAYER
// The keyword from Stage 1 is a long phrase like "myo inositol d chiro pcos india".
// Direct searches for this exact phrase return 0 results.
// This layer decomposes it into smart, targeted search variants per source.
// ─────────────────────────────────────────────────────────────────────────────

interface KeywordVariants {
  // Short core terms (2-3 words) for Reddit — how people actually write in posts
  redditQueries:  string[];
  // Descriptive queries for YouTube — how people search for video content
  youtubeQuery:   string;
  // Amazon-optimised — ingredient name only, no geographic modifiers
  amazonQuery:    string;
  // Google Trends query — short and clean
  trendsQuery:    string;
  // News query
  newsQuery:      string;
  // PubMed query — scientific terms only
  pubmedQuery:    string;
}

function buildKeywordVariants(keyword: string): KeywordVariants {
  // Normalise: lowercase, trim
  const kw = keyword.toLowerCase().trim();

  // Strip common trailing words that kill search precision
  const stripped = kw
    .replace(/india/g, '')
    .replace(/supplement[s]?/g, '')
    .replace(/powder/g, '')
    .replace(/capsule[s]?/g, '')
    .replace(/tablet[s]?/g, '')
    .replace(/gummies/g, '')
    .replace(/for/g, '')
    .replace(/and/g, '')
    .replace(/the/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Extract meaningful tokens (≥3 chars)
  // Keep tokens ≥2 chars if they contain a digit (e.g. 'd3', 'k2', 'b12') otherwise ≥3
  const tokens = stripped.split(/\s+/).filter(t => t.length >= 2 && (t.length >= 3 || /\d/.test(t)));

  // Core: first 2-3 meaningful tokens — what people actually search
  const core = tokens.slice(0, 3).join(' ').trim();
  const shortCore = tokens.slice(0, 2).join(' ').trim() || core;

  // Build Reddit queries — use exact core ingredient + condition + India subreddits
  // FIX: Serper blocks ALL site:reddit.com queries. Use plain keyword + "reddit".
  const redditQueries = [
    `reddit "${core}" india`,
    `reddit r/IndiaFitness ${shortCore} india`,
    `reddit r/AskIndia ${shortCore} supplement india`,
    `reddit IndianSkincareAddicts PCOSIndia ${shortCore} india`,
  ].slice(0, 3); // max 3 queries to save quota

  // YouTube: conversational search terms
  const youtubeQuery = `${core} india benefits review`;

  // Amazon: ingredient only, no fluff — what's actually listed as a product
  const amazonQuery = `${core} supplement india`;

  // Google Trends: short and clean
  const trendsQuery = shortCore;

  // News: include market/industry terms
  const newsQuery = `${core} india supplement wellness`;

  // PubMed: scientific name only
  const pubmedQuery = `${core} india`;

  return { redditQueries, youtubeQuery, amazonQuery, trendsQuery, newsQuery, pubmedQuery };
}

async function buildCorpus(keyword: string, runId: string): Promise<Stage2Corpus> {
  const redditSignals:  RichSignal[] = [];
  const youtubeSignals: RichSignal[] = [];
  const newsSignals:    RichSignal[] = [];
  const pubmedSignals:  RichSignal[] = [];
  const amazonSignals:  RichSignal[] = [];
  const consumerQuotes: string[] = [];
  let trendSlope  = 0;
  let trendValues: number[] = [];

  // ── NOVELTY CHECK — has this keyword appeared in previous scans? ───────────
  // First-time keywords get a novelty bonus. Recurrence = already known.
  let isNovelKeyword = true;
  try {
    const { count } = await supabase
      .from('trend_reports')
      .select('*', { count: 'exact', head: true })
      .ilike('keyword', `%${keyword.split(' ').slice(0, 3).join('%')}%`)
      .neq('run_id', runId);
    isNovelKeyword = (count ?? 0) === 0;
    if (!isNovelKeyword) {
      console.log('[S2]', keyword, '| RECURRENCE: seen in', count, 'previous scans — not novel');
    } else {
      console.log('[S2]', keyword, '| NOVEL: first time this keyword appears in SankET');
    }
  } catch { /* non-blocking */ }

  // ── GOOGLE TRENDS ──────────────────────────────────────────────────────────
  // SerpAPI returns raw weekly interest_over_time data (0-100 scale).
  // It does NOT return a slope — we calculate it from the raw values.
  // Slope formula: avg(second half) - avg(first half) of the 6-month window.
  // Additional signals extracted: peak value, recent acceleration, breakout detection.
  try {
    const variants = buildKeywordVariants(keyword);
    console.log('[S2]', keyword, '| search variants:', JSON.stringify(variants));

    // Try Supabase proxy first; if unavailable fall back gracefully
    let trendsData: any = {};
    try {
      trendsData = await trendsViaProxy(variants.trendsQuery);
    } catch (proxyErr: any) {
      console.warn('[S2] Google Trends proxy unavailable:', proxyErr?.message,
        '— trendSlope will be 0. Deploy sanket-proxy with SERP_API_KEY to enable.');
    }

    const timeline: any[] = trendsData?.interest_over_time?.timeline_data ?? [];

    if (timeline.length >= 4) {
      // Extract weekly interest values (0-100)
      trendValues = timeline.map((pt: any) => {
        const raw = pt?.values?.[0]?.value;
        // SerpAPI sometimes returns "<1" for very low interest
        if (raw === '<1') return 0.5;
        const n = parseFloat(raw ?? '0');
        return Number.isFinite(n) ? n : 0;
      });

      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
      const half = Math.floor(trendValues.length / 2);
      const firstHalfAvg  = avg(trendValues.slice(0, half));
      const secondHalfAvg = avg(trendValues.slice(half));

      // Base slope: second half avg minus first half avg
      // Positive = growing, Negative = declining
      trendSlope = secondHalfAvg - firstHalfAvg;

      // Breakout detection: if last 4 weeks are significantly above the 6-month avg
      const overallAvg  = avg(trendValues);
      const last4Avg    = avg(trendValues.slice(-4));
      const breakoutMultiplier = overallAvg > 0 ? last4Avg / overallAvg : 1;
      if (breakoutMultiplier >= 1.5) {
        // Recent spike — boost slope to signal urgency
        trendSlope = Math.max(trendSlope, trendSlope * breakoutMultiplier);
        console.log('[S2]', keyword, '| BREAKOUT detected — multiplier:', breakoutMultiplier.toFixed(2));
      }

      // Zero-to-nonzero detection: was flat then suddenly spiked
      const firstHalfZeros = trendValues.slice(0, half).filter(v => v <= 1).length;
      if (firstHalfZeros >= half * 0.7 && secondHalfAvg > 10) {
        // Essentially new trend — set slope to a high value
        trendSlope = Math.max(trendSlope, 25);
        console.log('[S2]', keyword, '| NEW TREND signal — was near-zero, now active');
      }

      console.log('[S2]', keyword,
        '| Trends points:', trendValues.length,
        '| firstHalf avg:', firstHalfAvg.toFixed(1),
        '| secondHalf avg:', secondHalfAvg.toFixed(1),
        '| slope:', trendSlope.toFixed(1),
        '| last4 avg:', last4Avg.toFixed(1));
    } else {
      console.log('[S2]', keyword, '| Google Trends: no data (proxy not deployed or keyword not tracked)');
    }
  } catch (err: any) { console.warn('[S2] Google Trends failed:', keyword, err?.message); }

  // ── REDDIT via SERPER (6-month) ────────────────────────────────────────────
  try {
    if (SERP_API_KEY) {
      // Use decomposed queries — variants already built in the Trends section above
      const redditVariants = buildKeywordVariants(keyword);
      // Process serper queries sequentially with delay — Serper free tier = 5 req/sec
      for (const q of redditVariants.redditQueries) {
        try {
          await new Promise(r => setTimeout(r, 600)); // 600ms = safe under Serper 5 req/sec limit // 300ms gap = max ~3 req/sec
          const data: any = await serperViaProxy({ q, num: 10, gl: 'in', hl: 'en', tbs: 'qdr:m6' })
            .catch((e: any) => { console.warn('[S2] Serper proxy failed:', q, e?.message); return {}; });
          (data?.organic ?? []).forEach((item: any) => {
            const title   = String(item?.title   ?? '').trim();
            const link    = String(item?.link    ?? '').trim();
            const snippet = String(item?.snippet ?? '').trim();
            if (!title || !link) return;
            // Deduplicate by URL
            if (redditSignals.some(s => s.url === link)) return;
            const { upvotes, commentCount } = extractRedditMeta(snippet);
            redditSignals.push({
              source: 'reddit', keyword, title, url: link,
              snippet: snippet || undefined,
              upvotes, commentCount,
              subreddit: extractSubreddit(link),
            });
          });
        } catch (e: any) { console.warn('[S2] Reddit query failed:', q, e?.message); }
      }
      console.log('[S2]', keyword, '| reddit signals:', redditSignals.length);
    }
  } catch (err: any) { console.warn('[S2] Reddit failed:', keyword, err?.message); }

  // ── AMAZON INDIA via SERP API ──────────────────────────────────────────────
  try {
    {
      // Amazon via Serper Shopping endpoint
      // /shopping returns ratingCount and rating as structured integer/float fields —
      // no regex needed. Google Search snippets never reliably contain review counts.
      const amazonVariant = buildKeywordVariants(keyword).amazonQuery;
      try {
        await new Promise(r => setTimeout(r, 400));

        // Primary: Serper Shopping — structured ratingCount field
        let shoppingItems: any[] = [];
        try {
          const shopRes: any = await proxyCall('serper_shopping', {
            params: {
              q: `${amazonVariant} amazon.in`,
              gl: 'in',
              hl: 'en',
              num: 10,
            },
          });
          shoppingItems = shopRes?.shopping ?? [];
        } catch (shopErr: any) {
          console.warn('[S2] Serper Shopping failed, falling back to search:', shopErr?.message);
        }

        // Fallback: Serper Search with site:amazon.in (no structured review counts)
        if (shoppingItems.length === 0) {
          const searchRes: any = await proxyCall('serper', {
            params: {
              q: `${amazonVariant} site:amazon.in`,
              gl: 'in', hl: 'en', num: 10,
            },
          });
          shoppingItems = (searchRes?.organic ?? []).map((item: any) => ({
            title:       item.title,
            link:        item.link,
            snippet:     item.snippet,
            price:       item.price,
            rating:      null,
            ratingCount: 0,   // Google Search snippets don't reliably have review counts
          }));
        }

        shoppingItems.forEach((item: any) => {
          const title = String(item?.title ?? '').trim();
          const link  = String(item?.link ?? item?.productLink ?? '').trim();
          if (!title) return;

          // ratingCount is a native integer from /shopping endpoint
          const reviewCount = typeof item?.ratingCount === 'number'
            ? item.ratingCount
            : typeof item?.rating_count === 'number'
            ? item.rating_count
            : 0;

          const rating = typeof item?.rating === 'number' ? item.rating : null;

          // Price: Shopping returns structured price string e.g. "₹899"
          const priceStr = item?.price
            ? String(item.price)
            : (() => {
                const m = String(item?.snippet ?? '').match(/(?:₹|Rs\.?)\s*[\d,]+/);
                return m ? m[0] : undefined;
              })();

          amazonSignals.push({
            source: 'amazon', keyword, title, url: link,
            snippet: String(item?.snippet ?? '') || undefined,
            reviewCount,
            price: priceStr,
            engagement: reviewCount,
          });
        });

        console.log('[S2]', keyword, '| amazon signals:', amazonSignals.length,
          '| avg reviews:', amazonSignals.length
            ? Math.round(amazonSignals.reduce((s, x) => s + (x.reviewCount ?? 0), 0) / amazonSignals.length)
            : 0);
      } catch (err: any) { console.warn('[S2] Amazon failed:', keyword, err?.message); }
    }
  } catch (err: any) { console.warn('[S2] Amazon failed:', keyword, err?.message); }

  // ── YOUTUBE (6-month window) ───────────────────────────────────────────────
  try {
    if (YOUTUBE_API_KEY) {
      const searchData: any = await youtubeViaProxy('search', {
        part: 'snippet',
        q: buildKeywordVariants(keyword).youtubeQuery,
        maxResults: '12', order: 'viewCount', regionCode: 'IN',
        publishedAfter: SIX_MONTHS_AGO_ISO,
      }).catch((e: any) => {
            const msg = String(e?.message ?? '');
            if (msg.includes('403') || msg.includes('quota')) {
              console.warn('[S2] YouTube quota exhausted — skipping YouTube for remaining scan');
            } else {
              console.warn('[S2] YouTube search proxy failed:', keyword, msg);
            }
            return {};
          });

      const videoIds = (searchData?.items ?? [])
        .map((i: any) => String(i?.id?.videoId ?? '').trim()).filter(Boolean);

      if (videoIds.length > 0) {
        const statsData: any = await youtubeViaProxy('videos', {
          part: 'statistics,snippet', id: videoIds.join(','),
        }).catch((e: any) => { console.warn('[S2] YouTube stats proxy failed:', keyword, e?.message); return {}; });

        const videoMetrics: { videoId: string; viewVelocity: number }[] = [];

        for (const v of (statsData?.items ?? [])) {
          const videoId      = String(v?.id ?? '').trim();
          const snip         = v?.snippet ?? {};
          const title        = String(snip?.title        ?? '').trim();
          const desc         = String(snip?.description  ?? '').trim();
          const publishedAt  = String(snip?.publishedAt  ?? '').trim();
          const channelTitle = String(snip?.channelTitle ?? '').trim();
          const stats        = v?.statistics ?? {};
          const viewCount    = parseInt(String(stats?.viewCount   ?? '0'), 10) || 0;
          const likeCount    = parseInt(String(stats?.likeCount   ?? '0'), 10) || 0;
          const commentCountYT = parseInt(String(stats?.commentCount ?? '0'), 10) || 0;
          if (!videoId || !title) continue;

          const days = publishedAt && !isNaN(Date.parse(publishedAt))
            ? Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 86400000) : 90;
          const viewVelocity = viewCount / days;

          videoMetrics.push({ videoId, viewVelocity });
          youtubeSignals.push({
            source: 'youtube', keyword, title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            snippet: desc || undefined,
            publishedAt: publishedAt || undefined,
            viewCount, likeCount, commentCountYT, channelTitle,
            viewVelocity: Math.round(viewVelocity),
            subscriberTier: estimateSubscriberTier(channelTitle, viewCount),
          });
        }

        if (videoMetrics.length > 0) {
          const top3 = [...videoMetrics].sort((a, b) => b.viewVelocity - a.viewVelocity).slice(0, 3);
          await Promise.all(top3.map(async (vm) => {
            if (consumerQuotes.length >= 20) return;
            try {
              const commentsData: any = await youtubeViaProxy('commentThreads', {
                part: 'snippet', videoId: vm.videoId, maxResults: '20', order: 'relevance',
              }).catch(() => ({}));
              if (!commentsData?.items) return;
              for (const item of (commentsData?.items ?? [])) {
                const text = String(item?.snippet?.topLevelComment?.snippet?.textDisplay ?? '').trim();
                if (!text || text.length <= 30 || !/[A-Za-z]/.test(text)) continue;
                consumerQuotes.push(text);
                if (consumerQuotes.length >= 20) break;
              }
            } catch { /* skip */ }
          }));
        }

        console.log('[S2]', keyword, '| youtube signals:', youtubeSignals.length,
          '| top velocity:', Math.round(Math.max(0, ...videoMetrics.map((v) => v.viewVelocity))));
      }
    }
  } catch (err: any) { console.warn('[S2] YouTube failed:', keyword, err?.message); }

  // ── NEWSAPI (6-month window) — routed via proxy (NewsAPI blocks browser CORS)
  try {
    {
      const data: any = await proxyCall('newsapi', {
        params: {
          search: buildKeywordVariants(keyword).newsQuery,
          language: 'en', sort: 'published_at',
          published_after: ONE_MONTH_AGO_ISO, limit: '10',
        },
      }).catch((e: any) => { console.warn('[S2] NewsAPI proxy failed:', keyword, e?.message); return {}; });
      {
        (data?.data ?? []).forEach((article: any) => {
          const title       = String(article?.title       ?? '').trim();
          const urlStr      = String(article?.url         ?? '').trim();
          const description = String(article?.description ?? '').trim();
          const publishedAt = String(article?.published_at ?? article?.publishedAt ?? '').trim();
          const sourceName  = String(article?.source ?? article?.source?.name ?? '').trim();
          if (!title || !urlStr) return;
          newsSignals.push({
            source: 'newsapi', keyword, title, url: urlStr,
            snippet: description || undefined,
            publishedAt: publishedAt || undefined,
            sourceName,
            isIndian: isIndianSource(urlStr, sourceName),
            framingType: classifyNewsFraming(title, description),
          });
        });
        console.log('[S2]', keyword, '| news signals:', newsSignals.length);
      }
    }
  } catch (err: any) { console.warn('[S2] NewsAPI failed:', keyword, err?.message); }

  // ── PUBMED (12-month window) — routed via Supabase proxy (CORS blocked direct)
  try {
    const pubmedTerm = buildKeywordVariants(keyword).pubmedQuery;
    const pubmedParams = {
      db: 'pubmed', term: pubmedTerm, retmax: '10',
      datetype: 'pdat', reldate: '365', retmode: 'json',
    };

    let pubmedData: any = {};
    try {
      // Try via Supabase proxy first
      const base = (SUPABASE_URL ?? '').replace(/\/+$/, '');
      if (base) {
        const pubHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (SUPABASE_ANON_KEY) pubHeaders['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
        const proxyRes = await fetch(`${base}/functions/v1/sanket-proxy`, {
          method: 'POST',
          headers: pubHeaders,
          body: JSON.stringify({ service: 'pubmed', params: pubmedParams }),
        });
        if (proxyRes.ok) pubmedData = await proxyRes.json();
        else console.warn('[S2] PubMed proxy non-200:', proxyRes.status, keyword);
      }
    } catch (proxyErr: any) {
      console.warn('[S2] PubMed proxy failed, trying direct (dev only):', proxyErr?.message);
      // Direct fallback — works in dev if CORS is not blocked, fails in prod
      try {
        const res = await fetch(`${PUBMED_URL}?${new URLSearchParams(pubmedParams)}`);
        if (res.ok) pubmedData = await res.json();
      } catch { /* silently skip */ }
    }

    const count = parseInt(String(pubmedData?.esearchresult?.count ?? '0'), 10);
    if (count > 0) {
      pubmedSignals.push({
        source: 'pubmed', keyword,
        title: `PubMed: ${count} papers for "${keyword}" in past 12 months`,
        url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(pubmedTerm)}`,
        snippet: `${count} peer-reviewed results`,
      });
      console.log('[S2]', keyword, '| pubmed count:', count);
    }
  } catch (err: any) { console.warn('[S2] PubMed failed:', keyword, err?.message); }

  // ── SUPABASE RAW SIGNALS LOG ───────────────────────────────────────────────
  if (isValidUUID(runId)) {
    try {
      const all = [...redditSignals, ...youtubeSignals, ...newsSignals, ...pubmedSignals, ...amazonSignals];
      if (all.length > 0) {
        const rows = all.map((s) => ({
          run_id: runId, source: s.source, keyword,
          title: s.title, url: s.url, snippet: s.snippet ?? null,
          engagement: (s as any).viewCount ?? (s as any).upvotes ?? 0,
        }));
        const { error } = await supabase.from('raw_signals').insert(rows);
        if (error) console.warn('[S2] raw_signals insert:', error.message);
      }
    } catch (err) { console.warn('[S2] Supabase log failed:', err); }
  }

  return {
    keyword,
    redditSignals,
    youtubeSignals,
    newsSignals,
    pubmedSignals,
    amazonSignals,
    trendSlope,
    trendValues,
    isNovelKeyword,
    consumerQuotes,
    totalSignalCount: redditSignals.length + youtubeSignals.length + newsSignals.length + amazonSignals.length,
  };
}