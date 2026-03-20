import type { TrendData } from './types';
import { BRAND_MAP } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// SankET PDF Report Generator
// Strategy: render a styled HTML document in a hidden iframe, then call
// window.print() with print-specific CSS. This produces crisp typography,
// proper Unicode (rupee sign, emojis), and full colour — no jsPDF artifacts.
// ─────────────────────────────────────────────────────────────────────────────

function safe(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v).trim() || fallback;
}

function scoreColor(s: number): string {
  if (s >= 7.5) return '#0D9488';
  if (s >= 5)   return '#f59e0b';
  return '#ef4444';
}

function scoreBg(s: number): string {
  if (s >= 7.5) return '#0D948815';
  if (s >= 5)   return '#f59e0b15';
  return '#ef444415';
}

function getScore(t: TrendData, dim: string): number {
  const s = (t.scores as any)?.[dim];
  if (typeof s === 'number') return s;
  const map: Record<string, keyof TrendData> = {
    velocity:    'velocity_score',
    market:      'market_score',
    competition: 'competition_score',
    timing:      'time_score',
    overall:     'overall_score',
  };
  return (t[map[dim]] as number) ?? 0;
}

function getRationale(t: TrendData, dim: string): string {
  // Cast through any so TypeScript doesn't complain about non-standard v2 fields
  const tAny = t as any;
  const flatMap: Record<string, string> = {
    velocity:    'velocityReasoning',
    market:      'marketReasoning',
    competition: 'competitionReasoning',
    timing:      'timingReasoning',
  };
  const flat = tAny[flatMap[dim]] as string | undefined;
  if (flat) return flat;
  const obj = (t.rationale as any)?.[dim];
  if (obj) return String(obj);
  const v1map: Record<string, keyof TrendData> = {
    velocity:    'velocity_rationale',
    market:      'market_rationale',
    competition: 'competition_rationale',
    timing:      'time_rationale',
  };
  return String(t[v1map[dim]] ?? '');
}

function getBrands(t: TrendData): string[] {
  if (Array.isArray(t.brandFit) && t.brandFit.length) return t.brandFit;
  return t.brand_fit ?? [];
}

function scoreBar(label: string, icon: string, s: number, rationale: string): string {
  const pct  = Math.min(100, Math.round(s * 10));
  const col  = scoreColor(s);
  const bg   = scoreBg(s);
  const rat  = safe(rationale);
  return `
    <div class="score-row">
      <div class="score-header">
        <span class="score-label">${icon} ${label}</span>
        <span class="score-value" style="color:${col}">${s}/10</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${col}"></div>
      </div>
      ${rat ? `<p class="score-rationale">${rat.slice(0, 400)}${rat.length > 400 ? '…' : ''}</p>` : ''}
    </div>`;
}

function signalTable(t: TrendData): string {
  const evidence = (Array.isArray(t.signalEvidence) && t.signalEvidence.length
    ? t.signalEvidence : t.signal_evidence ?? []) as any[];
  if (!evidence.length) return '';
  const rows = evidence.map(e => {
    const src     = safe(e?.source, 'Analysis');
    const metric  = safe(e?.metric, 'Signal');
    const insight = safe(e?.insight);
    const str     = safe(e?.strength, 'Moderate');
    const strCol  = str === 'Strong' ? '#0D9488' : str === 'Moderate' ? '#f59e0b' : '#94a3b8';
    return `<tr>
      <td><span class="tag" style="background:${strCol}20;color:${strCol};border:1px solid ${strCol}40">${src}</span></td>
      <td>${metric}</td>
      <td>${insight}</td>
      <td><span class="tag" style="background:${strCol}20;color:${strCol}">${str}</span></td>
    </tr>`;
  }).join('');
  return `
    <h3 class="section-sub">Signal Evidence</h3>
    <table class="evidence-table">
      <thead><tr><th>Source</th><th>Metric</th><th>Insight</th><th>Strength</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function trendPage(t: TrendData, index: number): string {
  const keyword      = safe(t.keyword ?? t.trend_core_name, `Trend ${index + 1}`);
  const headline     = safe(t.headline ?? t.trend_name, keyword);
  const whyNow       = safe(t.whyNow ?? t.why_now);
  const firstMove    = safe(t.firstMove ?? t.first_move);
  const riskFlag     = safe(t.riskFlag ?? t.market_gap_exists_now);
  const cagrEstimate = safe(t.cagrEstimate ?? t.hook_subheading);
  const overall      = getScore(t, 'overall');
  const brands       = getBrands(t);
  const isConfirmed  = Boolean((t as any).isConfirmedTrend) || (t as any).classification === 'CONFIRMED_TREND' || overall >= 6.5;
  const quotes       = Array.isArray((t as any).consumerQuotes) ? (t as any).consumerQuotes as string[] : [];
  const evidence     = Array.isArray((t as any).signalEvidence) && (t as any).signalEvidence.length
    ? (t as any).signalEvidence : (t.signal_evidence ?? []) as any[];
  const productRec   = (t as any).productRecommendation as { product: string; price: string; targetConsumer: string; usp: string; positioning: string } | undefined;
  const recFirstMove = safe((t as any).recommendedFirstMove ?? t.firstMove ?? t.first_move);
  const overallCol   = scoreColor(overall);

  const brandBadges = brands.map(b => {
    const bm = BRAND_MAP[b];
    return bm
      ? `<span class="brand-badge" style="background:${bm.color}20;color:${bm.color};border:1px solid ${bm.color}40">${bm.label}</span>`
      : `<span class="brand-badge">${b}</span>`;
  }).join('');

  const isNovel = Boolean((t as any).isNovelKeyword);
  const regulatoryNote = safe((t as any).regulatoryNote);
  const statusBadge = isConfirmed
    ? `<span class="status-badge confirmed">✅ Confirmed Trend</span>`
    : `<span class="status-badge fad">⚠️ Likely Fad</span>`;
  const novelBadge = isNovel
    ? `<span class="status-badge novel">🆕 First Discovery</span>`
    : '';

  // 2×2 score grid (matching app layout)
  const scoreDims = [
    { dim: 'velocity',    icon: '⚡', label: 'Buzz'   },
    { dim: 'market',      icon: '📈', label: 'Market' },
    { dim: 'competition', icon: '🏁', label: 'Space'  },
    { dim: 'timing',      icon: '🕐', label: 'Timing' },
  ];

  const scoreGrid = `
    <div class="score-grid">
      ${scoreDims.map(({ dim, icon, label }) => {
        const s   = getScore(t, dim);
        const col = scoreColor(s);
        const rat = getRationale(t, dim);
        const pct = Math.min(100, Math.round(s * 10));
        return `<div class="score-cell">
          <div class="score-cell-header">
            <span class="score-cell-label">${icon} ${label}</span>
            <span class="score-cell-val" style="color:${col}">${s}/10</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
          ${rat ? `<p class="score-cell-rat">${rat.slice(0, 300)}${rat.length > 300 ? '…' : ''}</p>` : ''}
        </div>`;
      }).join('')}
    </div>`;

  // Signal evidence table
  const sigRows = evidence.slice(0, 6).map((e: any) => {
    const src = safe(e?.source, 'Analysis');
    const met = safe(e?.metric, 'Signal');
    const ins = safe(e?.insight);
    const str = safe(e?.strength, 'Moderate');
    const col = str === 'Strong' ? '#0D9488' : str === 'Moderate' ? '#f59e0b' : '#94a3b8';
    return `<tr>
      <td><span class="tag" style="background:${col}20;color:${col};border:1px solid ${col}40">${src}</span></td>
      <td>${met}</td><td>${ins}</td>
      <td><span class="tag" style="background:${col}20;color:${col}">${str}</span></td>
    </tr>`;
  }).join('');

  const signalTable = evidence.length ? `
    <h3 class="section-sub">Signal Evidence</h3>
    <table class="evidence-table">
      <thead><tr><th>Source</th><th>Metric</th><th>Insight</th><th>Strength</th></tr></thead>
      <tbody>${sigRows}</tbody>
    </table>` : '';

  // Product Recommendation table
  const productSection = productRec ? `
    <h3 class="section-sub">🛍️ Potential Product</h3>
    <div class="product-rec">
      <p class="product-name">${productRec.product}</p>
      <div class="product-grid">
        ${productRec.price ? `<div class="product-cell"><p class="prod-label">Our Price</p><p class="prod-val">${productRec.price}</p></div>` : ''}
        ${(productRec as any).competitorPriceRange ? `<div class="product-cell"><p class="prod-label">Competitor Range</p><p class="prod-val">${(productRec as any).competitorPriceRange}</p></div>` : ''}
        ${productRec.targetConsumer ? `<div class="product-cell"><p class="prod-label">Target Consumer</p><p class="prod-val">${productRec.targetConsumer}</p></div>` : ''}
        ${productRec.usp ? `<div class="product-cell"><p class="prod-label">USP</p><p class="prod-val">${productRec.usp}</p></div>` : ''}
        ${productRec.positioning ? `<div class="product-cell"><p class="prod-label">Positioning</p><p class="prod-val">${productRec.positioning}</p></div>` : ''}
      </div>
    </div>` : '';

  return `
  <div class="trend-page page-break">
    <div class="trend-header" style="border-left:5px solid ${overallCol}">
      <div class="trend-header-left">
        <div class="trend-rank">#${index + 1}</div>
        <div>
          <div class="trend-kw">${keyword}</div>
          <div class="trend-headline">${headline}</div>
          ${cagrEstimate ? `<div class="trend-cagr">${cagrEstimate}</div>` : ''}
        </div>
      </div>
      <div class="overall-badge" style="background:${overallCol}18;border:2px solid ${overallCol}50">
        <div class="overall-label">Score</div>
        <div class="overall-score" style="color:${overallCol}">${overall.toFixed(1)}</div>
        <div class="overall-denom">/10</div>
      </div>
    </div>

    <div class="badges-row">
      ${brandBadges}${statusBadge}${novelBadge}
    </div>

    ${whyNow ? `
    <div class="card">
      <h3 class="section-sub">🕐 Why Now</h3>
      <p class="body-text">${whyNow}</p>
    </div>` : ''}

    <div class="card">
      <h3 class="section-sub">Score Breakdown</h3>
      ${scoreGrid}
    </div>

    ${evidence.length ? `<div class="card">${signalTable}</div>` : ''}

    ${cagrEstimate ? `
    <div class="card" style="border-left:3px solid #0D9488">
      <h3 class="section-sub">📈 Market Context</h3>
      <p class="body-text">${cagrEstimate}</p>
    </div>` : ''}

    ${riskFlag ? `
    <div class="card" style="border-left:3px solid #ef4444">
      <h3 class="section-sub">⚠️ Risk Flag</h3>
      <p class="body-text">${riskFlag}</p>
    </div>` : ''}

    ${quotes.length ? `
    <div class="card">
      <h3 class="section-sub">💬 Consumer Language</h3>
      ${quotes.slice(0, 4).map((q: string) => `<p class="quote">"${q}"</p>`).join('')}
    </div>` : ''}

    ${productSection ? `<div class="card">${productSection}</div>` : ''}

    ${regulatoryNote && regulatoryNote !== 'No current regulatory barrier identified' ? `
    <div class="card" style="border-left:3px solid #f59e0b">
      <h3 class="section-sub">⚖️ Regulatory Note</h3>
      <p class="body-text">${regulatoryNote}</p>
    </div>` : ''}

    ${recFirstMove ? `
    <div class="card" style="border:2px solid rgba(13,148,136,0.3);background:rgba(13,148,136,0.04)">
      <h3 class="section-sub" style="color:#0D9488">🚀 Recommended First Move</h3>
      <p class="body-text">${recFirstMove}</p>
    </div>` : ''}
  </div>`;
}


function buildHTML(trends: TrendData[], scanDate: Date): string {
  const dateStr   = scanDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const avgScore  = trends.length
    ? (trends.reduce((s, t) => s + getScore(t, 'overall'), 0) / trends.length).toFixed(1)
    : '—';
  const topTrend  = trends.length
    ? safe(trends.reduce((a, b) => getScore(a, 'overall') >= getScore(b, 'overall') ? a : b).keyword)
    : '—';

  const summaryRows = trends.map((t, i) => {
    const keyword = safe(t.keyword ?? t.trend_core_name, `Trend ${i+1}`);
    const score   = getScore(t, 'overall');
    const brands  = getBrands(t).join(', ') || '—';
    const cagr    = safe(t.cagrEstimate ?? t.hook_subheading, '—');
    const col     = scoreColor(score);
    return `<tr>
      <td class="rank-cell">${i + 1}</td>
      <td class="kw-cell">${keyword}</td>
      <td><span class="score-chip" style="background:${col}20;color:${col};border:1px solid ${col}40">${score.toFixed(1)}</span></td>
      <td>${brands}</td>
      <td class="cagr-cell">${cagr.split('—')[0].slice(0, 60)}</td>
    </tr>`;
  }).join('');

  const trendPages = trends.map((t, i) => trendPage(t, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SankET Intelligence Report · ${dateStr}</title>
<style>
  /* ── Reset & Base ──────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #07090f;
    color: #e8eaf0;
    font-size: 13px;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Print overrides ────────────────────────────────────── */
  @media print {
    /* Keep dark theme in print — matches screen render exactly */
    body { background: #07090f !important; color: #e8eaf0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .cover { page-break-before: avoid; }
    @page { size: A4; margin: 12mm 10mm; }
  }

  /* ── Layout ─────────────────────────────────────────────── */
  .page { max-width: 860px; margin: 0 auto; padding: 32px 24px; }
  .page-break { page-break-before: always; }

  /* ── Cover ──────────────────────────────────────────────── */
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 60px 48px;
    background: linear-gradient(135deg, #0d1117 0%, #0f1923 100%);
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -120px; right: -120px;
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%);
    border-radius: 50%;
  }
  .cover-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    background: rgba(13,148,136,0.15);
    border: 1px solid rgba(13,148,136,0.4);
    color: #0D9488;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .cover-brand { font-size: 52px; font-weight: 800; color: #0D9488; letter-spacing: -1px; margin-bottom: 8px; }
  .cover-title { font-size: 22px; font-weight: 400; color: #94a3b8; margin-bottom: 40px; }
  .cover-divider { width: 60px; height: 3px; background: #0D9488; border-radius: 2px; margin-bottom: 40px; }
  .cover-meta { display: flex; flex-direction: column; gap: 8px; }
  .cover-meta-row { display: flex; align-items: center; gap: 10px; color: #94a3b8; font-size: 13px; }
  .cover-meta-dot { width: 6px; height: 6px; background: #0D9488; border-radius: 50%; }
  .cover-footer {
    position: absolute; bottom: 32px; left: 48px; right: 48px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 16px;
    color: rgba(255,255,255,0.3);
    font-size: 11px;
  }

  /* ── Summary page ────────────────────────────────────────── */
  .summary-page { padding: 40px 32px; }
  .page-title {
    font-size: 22px; font-weight: 700; color: #e8eaf0;
    margin-bottom: 8px;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(13,148,136,0.4);
  }
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 24px 0;
  }
  .kpi-card {
    background: rgba(13,148,136,0.06);
    border: 1px solid rgba(13,148,136,0.2);
    border-radius: 10px;
    padding: 16px 20px;
  }
  .kpi-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .kpi-value { font-size: 26px; font-weight: 800; color: #0D9488; }
  .kpi-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }

  /* Summary table */
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .summary-table th {
    text-align: left; padding: 10px 12px; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.6px;
    color: #64748b; background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .summary-table td {
    padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05);
    vertical-align: middle;
  }
  .summary-table tr:last-child td { border-bottom: none; }
  .rank-cell { color: #64748b; font-size: 12px; font-weight: 600; width: 32px; }
  .kw-cell   { font-weight: 600; color: #e8eaf0; }
  .cagr-cell { color: #94a3b8; font-size: 12px; }
  .score-chip {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    font-weight: 700; font-size: 13px;
  }

  /* ── Trend page ──────────────────────────────────────────── */
  .trend-page { padding: 32px; }
  .trend-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    background: rgba(255,255,255,0.03);
    border-radius: 12px; padding: 20px 24px; margin-bottom: 16px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .trend-header-left { display: flex; gap: 16px; align-items: flex-start; flex: 1; }
  .trend-rank {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(13,148,136,0.15); border: 1px solid rgba(13,148,136,0.4);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: #0D9488; font-size: 14px; flex-shrink: 0;
  }
  .trend-kw      { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; }
  .trend-headline { font-size: 17px; font-weight: 700; color: #e8eaf0; margin-top: 2px; line-height: 1.3; }
  .trend-cagr    { font-size: 13px; color: #0D9488; margin-top: 4px; font-weight: 500; }
  .overall-badge {
    border-radius: 12px; padding: 10px 16px; text-align: center;
    flex-shrink: 0; margin-left: 16px;
  }
  .overall-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; }
  .overall-score { font-size: 28px; font-weight: 800; line-height: 1.1; }
  .overall-denom { font-size: 11px; color: #64748b; }

  /* Badges */
  .badges-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
  .brand-badge {
    display: inline-block; padding: 3px 10px; border-radius: 20px;
    font-size: 11px; font-weight: 600;
  }
  .status-badge {
    display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  }
  .status-badge.confirmed { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
  .status-badge.fad       { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
  .status-badge.novel     { background: rgba(139,92,246,0.12); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }

  /* Cards */
  .card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 16px 20px; margin-bottom: 12px;
  }
  .section-sub {
    font-size: 12px; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 10px;
  }
  .body-text { font-size: 13px; color: #cbd5e1; line-height: 1.65; }

  /* Two-col layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .risk-card { border-left: 3px solid #ef4444; }
  .move-card { border-left: 3px solid #0D9488; }

  /* Score rows */
  .scores-grid { display: flex; flex-direction: column; gap: 12px; }
  .score-row {}
  .score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .score-label  { font-size: 12px; font-weight: 600; color: #e8eaf0; }
  .score-value  { font-size: 15px; font-weight: 800; }
  .bar-track    { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
  .bar-fill     { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .score-rationale { font-size: 11px; color: #64748b; line-height: 1.5; }

  /* Evidence table */
  .evidence-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .evidence-table th {
    text-align: left; padding: 8px 10px; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px;
    color: #64748b; background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .evidence-table td {
    padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.04);
    color: #cbd5e1; vertical-align: top;
  }
  .tag {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 600; white-space: nowrap;
  }

  /* Quotes */
  .quotes { display: flex; flex-direction: column; gap: 8px; }
  .quote {
    font-style: italic; color: #94a3b8; font-size: 12px;
    border-left: 3px solid rgba(13,148,136,0.4);
    padding: 6px 12px;
    background: rgba(13,148,136,0.04);
    border-radius: 0 6px 6px 0;
  }

  /* 2×2 Score grid */
  .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .score-cell { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px; }
  .score-cell-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .score-cell-label { font-size: 12px; font-weight: 600; color: #e8eaf0; }
  .score-cell-val { font-size: 16px; font-weight: 800; }
  .score-cell-rat { font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 6px; }

  /* Product recommendation */
  .product-rec { border: 1px solid rgba(13,148,136,0.3); border-radius: 10px; overflow: hidden; }
  .product-name { padding: 10px 14px; font-size: 13px; font-weight: 700; color: #0D9488; border-bottom: 1px solid rgba(13,148,136,0.2); }
  .product-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .product-cell { padding: 10px 14px; border-right: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .prod-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 3px; }
  .prod-val { font-size: 12px; color: #cbd5e1; line-height: 1.4; }

  /* Methodology page */
  .method-page { padding: 40px 32px; }
  .method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
  .method-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 16px;
  }
  .method-icon { font-size: 20px; margin-bottom: 6px; }
  .method-name { font-size: 13px; font-weight: 700; color: #e8eaf0; margin-bottom: 6px; }
  .method-desc { font-size: 12px; color: #64748b; line-height: 1.6; }
  .disclaimer {
    margin-top: 32px; padding: 14px 18px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    font-size: 11px; color: #475569; line-height: 1.6;
  }
</style>
</head>
<body>

<!-- ── COVER ────────────────────────────────────────────── -->
<div class="cover">
  <span class="cover-badge">Wellness Intelligence</span>
  <div class="cover-brand">SankET</div>
  <div class="cover-title">Market Intelligence Report</div>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <div class="cover-meta-row"><div class="cover-meta-dot"></div><span>Scan Date: ${dateStr}</span></div>
    <div class="cover-meta-row"><div class="cover-meta-dot"></div><span>${trends.length} Opportunities Found</span></div>
    <div class="cover-meta-row"><div class="cover-meta-dot"></div><span>Average Score: ${avgScore}/10</span></div>
    <div class="cover-meta-row"><div class="cover-meta-dot"></div><span>Top Opportunity: ${topTrend}</span></div>
  </div>
  <div class="cover-footer">
    <span>SankET · Mosaic Wellness India · Internal Use Only</span>
    <span>Generated ${dateStr}</span>
  </div>
</div>

<!-- ── EXECUTIVE SUMMARY ─────────────────────────────────── -->
<div class="summary-page page-break">
  <h2 class="page-title">Executive Summary</h2>

  <div class="kpi-strip">
    <div class="kpi-card">
      <div class="kpi-label">Opportunities Found</div>
      <div class="kpi-value">${trends.length}</div>
      <div class="kpi-sub">Passing validation threshold</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Average Score</div>
      <div class="kpi-value">${avgScore}</div>
      <div class="kpi-sub">Out of 10</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Top Opportunity</div>
      <div class="kpi-value" style="font-size:16px;line-height:1.3">${topTrend}</div>
      <div class="kpi-sub">Score: ${trends.length ? getScore(trends.reduce((a,b) => getScore(a,'overall') >= getScore(b,'overall') ? a : b), 'overall').toFixed(1) : '—'}</div>
    </div>
  </div>

  <table class="summary-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Keyword</th>
        <th>Score</th>
        <th>Brand Fit</th>
        <th>CAGR Estimate</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
  </table>
</div>

<!-- ── TREND PAGES ───────────────────────────────────────── -->
${trendPages}

<!-- ── METHODOLOGY ───────────────────────────────────────── -->
<div class="method-page page-break">
  <h2 class="page-title">Methodology</h2>
  <div class="method-grid">
    <div class="method-card">
      <div class="method-icon">⚡</div>
      <div class="method-name">Velocity (1–10)</div>
      <div class="method-desc">Cross-references Reddit, YouTube, and News signals. Multi-source signals score higher. Single-source is capped at 6/10. Measures demand momentum across consumer touchpoints.</div>
    </div>
    <div class="method-card">
      <div class="method-icon">💰</div>
      <div class="method-name">Market Size (3–10)</div>
      <div class="method-desc">McKinsey-style top-down MECE guesstimate. CAGR weighted 65%, absolute TAM weighted 35%. Uses three-proxy CAGR blend: macro category, mature market reference, and scraped velocity multiplier.</div>
    </div>
    <div class="method-card">
      <div class="method-icon">🛡</div>
      <div class="method-name">Competition (1–10)</div>
      <div class="method-desc">Inverse scoring — lower competition scores higher. Based on Amazon India listing density, number of unique brands, and review volume density. True white space scores 8–10.</div>
    </div>
    <div class="method-card">
      <div class="method-icon">⏱</div>
      <div class="method-name">Time-to-Mainstream (1–10)</div>
      <div class="method-desc">Rogers' Diffusion of Innovation framework. Reddit = Innovators, YouTube niche = Early Adopters, Amazon = Early Majority. Goldilocks Zone (score 5–6) = 4–9 months to mainstream.</div>
    </div>
  </div>
  <div class="disclaimer">
    This market trend intelligence report has been generated through multi-source signal analysis and AI-assisted Chain-of-Thought reasoning across Reddit, YouTube, News, Amazon India, PubMed, and Google Trends. All assessments are intended to support — not replace — human strategic judgement. Market size figures are estimates derived using a structured guesstimate methodology and should be validated before investment or launch decisions. SankET · Mosaic Wellness India · Internal Use Only.
  </div>
</div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export — opens a print-ready window and triggers the print dialog
// ─────────────────────────────────────────────────────────────────────────────
export function downloadTrendReport(
  trends: TrendData[],
  _fileNames: string[],
  scanDate: Date,
): void {
  const html     = buildHTML(trends, scanDate);
  const blob     = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl  = URL.createObjectURL(blob);

  const win = window.open(blobUrl, '_blank', 'width=1000,height=800');
  if (!win) {
    // Fallback: download the HTML file directly
    const a  = document.createElement('a');
    a.href   = blobUrl;
    a.download = `SankET-Report-${scanDate.toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return;
  }

  win.addEventListener('load', () => {
    setTimeout(() => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }, 800);
  });
}
