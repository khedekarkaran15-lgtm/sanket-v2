import { discoverTrends } from './stage1_discovery';
import { validateTrends } from './stage2_validation';
import { generateReports } from './stage3_reporting';
import type { OpportunityBrief } from '../lib/types';
import supabase from '../lib/supabase';

// ── Fallback keyword list if Stage 1 returns nothing ──────────────────────────
const FALLBACK_KEYWORDS = [
  'ashwagandha gummies india',
  'sea moss supplements india',
  'berberine pcos india',
  'collagen peptides india',
  'magnesium glycinate sleep india',
  'gut microbiome supplement india',
  'vitamin d3 k2 india',
  'lion mane mushroom india',
];

export async function runAgentScan(): Promise<{ runId: string; briefs: OpportunityBrief[] }> {
  // ── Quota pre-check ─────────────────────────────────────────────────────────
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentScans } = await supabase
      .from('scan_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', thirtyDaysAgo);
    if ((recentScans ?? 0) >= 35) {
      console.warn('[SankET] ⚠️ Approaching Serper free quota (~2500 calls/month). Current month scans:', recentScans);
    }
  } catch { /* non-blocking */ }

  // ── Create scan run ─────────────────────────────────────────────────────────
  const { data: run, error } = await supabase
    .from('scan_runs')
    .insert({ status: 'running', current_stage: 1 })
    .select()
    .single();

  if (error || !run) {
    throw new Error('Could not create scan run: ' + (error?.message ?? 'Unknown error'));
  }

  const runId: string = run.id;
  console.log('[SankET] Run created:', runId);

  try {
    // ── Stage 1: Discovery ─────────────────────────────────────────────────────
    console.log('[SankET] Stage 1 starting...');
    const keywords = await discoverTrends(runId);

    let effectiveKeywords = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
    if (effectiveKeywords.length === 0) {
      console.warn('[SankET] Stage 1 returned no keywords — using fallback list.');
      effectiveKeywords = FALLBACK_KEYWORDS;
    }

    // Deduplicate and cap at 12 to control API costs
    effectiveKeywords = [...new Set(effectiveKeywords)].slice(0, 12);

    await supabase.from('scan_runs').update({ current_stage: 2, stage1_done: true }).eq('id', runId);
    console.log('[SankET] Stage 1 complete. Keywords:', effectiveKeywords.length, effectiveKeywords);

    // ── Stage 2: Validation ────────────────────────────────────────────────────
    console.log('[SankET] Stage 2 starting. Validating', effectiveKeywords.length, 'keywords...');
    const scoredTrends = await validateTrends(effectiveKeywords, runId);

    await supabase.from('scan_runs').update({ current_stage: 3, stage2_done: true }).eq('id', runId);
    console.log('[SankET] Stage 2 complete. Scored trends:', scoredTrends.length);

    if (!Array.isArray(scoredTrends) || scoredTrends.length === 0) {
      throw new Error('Stage 2 returned zero scored trends.');
    }

    // ── Stage 3: Reporting ─────────────────────────────────────────────────────
    console.log('[SankET] Stage 3 starting...');
    const briefs = await generateReports(scoredTrends, runId);

    // Sort descending by overall score before returning
    briefs.sort((a, b) => (b.scores?.overall ?? 0) - (a.scores?.overall ?? 0));

    await supabase.from('scan_runs').update({
      status: 'completed',
      stage3_done: true,
      total_found: briefs.length,
    }).eq('id', runId);
    console.log('[SankET] Complete. Briefs:', briefs.length);

    return { runId, briefs };

  } catch (err: any) {
    const message = err?.message ?? 'Unknown error during agent scan';
    try {
      await supabase.from('scan_runs').update({ status: 'failed', error_msg: message }).eq('id', runId);
    } catch { /* ignore */ }
    throw err;
  }
}

export async function getRunHistory() {
  const { data } = await supabase
    .from('scan_runs')
    .select('*, trend_reports(*)')
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}
