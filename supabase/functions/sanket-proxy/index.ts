// @ts-nocheck
// SankET v2 — Supabase Edge Function (sanket-proxy)
// Uses Deno.serve (no import needed — built into Supabase runtime v1.36+)
// Secrets required: NEWS_API_KEY, GEMINI_API_KEY, SERP_API_KEY, SERPER_API_KEY, YOUTUBE_API_KEY

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── TheNewsAPI ────────────────────────────────────────────────────
async function proxyNewsAPI(params: Record<string, string>) {
  const key = Deno.env.get("NEWS_API_KEY");
  if (!key) throw new Error("NEWS_API_KEY not set");
  const qs = new URLSearchParams({ ...params, api_token: key });
  const res = await fetch(`https://api.thenewsapi.com/v1/news/all?${qs}`);
  if (!res.ok) throw new Error(`TheNewsAPI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Gemini ────────────────────────────────────────────────────────
async function proxyGemini(model: string, body: unknown) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── SerpAPI (Google Search, Amazon, Google Trends) ───────────────
async function proxySerpAPI(params: Record<string, string>) {
  const key = Deno.env.get("SERP_API_KEY");
  if (!key) throw new Error("SERP_API_KEY not set");
  const qs = new URLSearchParams({ ...params, api_key: key });
  // Amazon engine uses amazon.com base URL; everything else uses serpapi.com/search
  const base = params.engine === "amazon"
    ? "https://serpapi.com/search"
    : "https://serpapi.com/search";
  const res = await fetch(`${base}?${qs}`);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Google Trends (via SerpAPI) ───────────────────────────────────
async function proxyGoogleTrends(keyword: string, geo = "IN", date = "today 12-m") {
  return proxySerpAPI({ engine: "google_trends", q: keyword, geo, date, data_type: "TIMESERIES" });
}

// ── Serper (Google Search) ────────────────────────────────────────
async function proxySerper(params: Record<string, unknown>) {
  const key = Deno.env.get("SERPER_API_KEY");
  if (!key) throw new Error("SERPER_API_KEY not set");
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Serper Shopping (returns ratingCount + rating as structured fields) ──────
async function proxySerperShopping(params: Record<string, unknown>) {
  const key = Deno.env.get("SERPER_API_KEY");
  if (!key) throw new Error("SERPER_API_KEY not set");
  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Serper Shopping ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── YouTube Data API v3 ───────────────────────────────────────────
async function proxyYouTube(params: Record<string, string>, endpoint = "search") {
  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (!key) throw new Error("YOUTUBE_API_KEY not set");
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`YouTube ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── PubMed ────────────────────────────────────────────────────────
async function proxyPubMed(params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${qs}`);
  if (!res.ok) throw new Error(`PubMed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Router ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const { service } = body;

    // Resolve params — support both { params: {...} } and flat body formats
    const p = (body.params && typeof body.params === 'object')
      ? body.params as Record<string, string>
      : (({ service: _s, ...rest }) => rest)(body) as Record<string, string>;

    switch (service) {
      case "newsapi":        return json(await proxyNewsAPI(p));
      case "gemini":         return json(await proxyGemini(body.model, body.body));
      case "serpapi":        return json(await proxySerpAPI(p));
      case "google_trends":  return json(await proxyGoogleTrends(body.keyword ?? p.keyword, body.geo ?? p.geo, body.date ?? p.date));
      case "serper":         return json(await proxySerper(p));
      case "serper_shopping": return json(await proxySerperShopping(p));
      case "youtube_search": return json(await proxyYouTube(p, body.endpoint ?? p.endpoint ?? "search"));
      case "pubmed":         return json(await proxyPubMed(p));
      default:               return json({ error: `Unknown service: ${service}` }, 400);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sanket-proxy error:", msg);
    return json({ error: msg }, 500);
  }
});