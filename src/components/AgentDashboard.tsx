import { useEffect, useRef, useState } from 'react';
import { runAgentScan, getRunHistory } from '../agent/orchestrator';
import type { OpportunityBrief, ScanRun } from '../lib/types';
import supabase from '../lib/supabase';

type AppState = 'idle' | 'running' | 'complete' | 'error';
type BrandFilter = 'All' | 'Man Matters' | 'Be Bodywise' | 'Little Joys' | 'Root Labs' | 'New Category';
type ScanRunStatus = ScanRun['status'];

const STAGE1_MESSAGES = [
  'Scanning r/IndiaFitness for trending posts...',
  'Searching r/AskIndia for supplement questions...',
  'Scanning r/IndianSkincareAddicts...',
  'Querying YouTube India wellness channels...',
  'Fetching NewsAPI India health headlines...',
  'Calling Gemini to extract trend keywords...',
];
const STAGE2_MESSAGES = [
  'Checking Google Trends India for each keyword...',
  'Scanning Amazon India product listings...',
  'Fetching YouTube video stats and comments...',
  'Running PubMed research paper search...',
  'Checking NewsAPI for regulatory signals...',
  'Computing 4-dimension scores...',
];
const STAGE3_MESSAGES = [
  'Generating Opportunity Briefs with Gemini...',
  'Mapping trends to Mosaic brands...',
  'Writing reports to Supabase...',
  'Finalising analysis...',
];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Render a signalEvidence item — handles both string (legacy) and object (v2) */
function renderSignalItem(item: any, idx: number) {
  if (!item) return null;
  if (typeof item === 'string') {
    return <li key={idx} className="text-xs text-slate-300">• {item}</li>;
  }
  // v2 object: { source, metric, insight, strength }
  const source   = item.source   ?? '';
  const insight  = item.insight  ?? '';
  const strength = item.strength ?? '';
  const strengthColor =
    strength === 'Strong' ? 'text-emerald-400' :
    strength === 'Moderate' ? 'text-amber-400' : 'text-slate-400';
  return (
    <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
      <span className={`font-semibold shrink-0 ${strengthColor}`}>[{source}]</span>
      <span>{insight}</span>
    </li>
  );
}

export function AgentDashboard() {
  const [appState,     setAppState]     = useState<AppState>('idle');
  const [briefs,       setBriefs]       = useState<OpportunityBrief[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [stage1Done,   setStage1Done]   = useState(false);
  const [stage2Done,   setStage2Done]   = useState(false);
  const [stage3Done,   setStage3Done]   = useState(false);
  const [activityLog,  setActivityLog]  = useState<string[]>([]);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [runStartTime, setRunStartTime] = useState<number>(0);
  const [elapsedTime,  setElapsedTime]  = useState('0:00');
  const [lastRunInfo,  setLastRunInfo]  = useState<{ date: string; count: number } | null>(null);
  const [pastScans,    setPastScans]    = useState<{ id: string; date: string; count: number; briefs: OpportunityBrief[] }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showFaq,       setShowFaq]       = useState(false);
  const [selectedBrief,setSelectedBrief]= useState<OpportunityBrief | null>(null);
  const [activeRunId,  setActiveRunId]  = useState<string | null>(null);
  const [brandFilter,  setBrandFilter]  = useState<BrandFilter>('All');
  const activityIndexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingHistory(true);
        // Load scan runs
        const history: any[] = await getRunHistory();
        if (cancelled || !history?.length) { setLoadingHistory(false); return; }

        // Set last run info
        const last = history[0] as any;
        const createdAt = last.created_at ?? last.createdAt;
        setLastRunInfo({
          date:  createdAt ? new Date(createdAt).toLocaleString() : '',
          count: typeof last.total_found === 'number' ? last.total_found : 0,
        });

        // Load briefs for each completed run
        const completedRuns = history.filter((r: any) => r.status === 'completed' && r.total_found > 0).slice(0, 5);
        const scansWithBriefs = await Promise.all(completedRuns.map(async (run: any) => {
          try {
            const { data: reports } = await supabase
              .from('trend_reports')
              .select('brief_json, overall_score, keyword, headline')
              .eq('run_id', run.id)
              .order('overall_score', { ascending: false });

            const briefs: OpportunityBrief[] = (reports ?? [])
              .filter((r: any) => r.brief_json)
              .map((r: any) => ({ ...r.brief_json, keyword: r.keyword, headline: r.headline }));

            return {
              id: run.id,
              date: run.created_at ? new Date(run.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
              count: briefs.length,
              briefs,
            };
          } catch { return null; }
        }));

        if (!cancelled) {
          setPastScans(scansWithBriefs.filter(Boolean) as any[]);
        }
      } catch (err) { console.error('Failed to load run history', err); }
      finally { if (!cancelled) setLoadingHistory(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (appState !== 'running') return;
    activityIndexRef.current = 0;
    const interval = setInterval(() => {
      setActivityLog((prev) => {
        const messages =
          currentStage === 1 ? STAGE1_MESSAGES :
          currentStage === 2 ? STAGE2_MESSAGES :
          currentStage === 3 ? STAGE3_MESSAGES : [];
        if (!messages.length) return prev;
        const msg = messages[activityIndexRef.current % messages.length];
        activityIndexRef.current += 1;
        return [msg, ...prev].slice(0, 6);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [appState, currentStage]);

  useEffect(() => {
    if (appState !== 'running' || !activeRunId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.from('scan_runs').select('*').eq('id', activeRunId).single();
        if (cancelled || error || !data) return;
        const row = data as any;
        setCurrentStage(row.current_stage ?? 0);
        setStage1Done(!!row.stage1_done);
        setStage2Done(!!row.stage2_done);
        setStage3Done(!!row.stage3_done);
        if (row.status === 'failed') {
          setErrorMsg(row.error_msg || 'Scan failed');
          setAppState('error');
        }
      } catch (err) { console.error('Failed to poll scan_runs', err); }
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [appState, activeRunId]);

  useEffect(() => {
    if (appState !== 'running' || !runStartTime) return;
    const interval = setInterval(() => setElapsedTime(formatElapsed(Date.now() - runStartTime)), 1000);
    return () => clearInterval(interval);
  }, [appState, runStartTime]);

  const handleStartScan = async () => {
    setErrorMsg(''); setActivityLog([]); setBriefs([]); setSelectedBrief(null);
    setCurrentStage(1); setStage1Done(false); setStage2Done(false); setStage3Done(false);
    setRunStartTime(Date.now()); setElapsedTime('0:00'); setAppState('running');
    try {
      const { runId, briefs: newBriefs } = await runAgentScan();
      setActiveRunId(runId);
      setBriefs(newBriefs);
      setAppState('complete');
      setLastRunInfo({ date: new Date().toLocaleString(), count: newBriefs.length });
    } catch (err: any) {
      setErrorMsg(typeof err?.message === 'string' ? err.message : 'Unknown error');
      setAppState('error');
    }
  };

  const handleRunNewScan = () => {
    setAppState('idle'); setActiveRunId(null); setActivityLog([]); setErrorMsg('');
    setCurrentStage(0); setStage1Done(false); setStage2Done(false); setStage3Done(false);
    setElapsedTime('0:00'); setSelectedBrief(null); setBrandFilter('All');
  };

  const filteredBriefs = brandFilter === 'All' ? briefs : briefs.filter((b) => b.brandFit?.includes(brandFilter));

  // Overall progress percentage for the progress bar
  const progressPct = appState === 'complete' ? 100
    : stage3Done ? 95
    : stage2Done ? 65
    : stage1Done ? 30
    : currentStage === 3 ? 80
    : currentStage === 2 ? 45
    : currentStage === 1 ? 15
    : 0;
  const topScore = briefs.length > 0 ? Math.max(...briefs.map((b) => b.scores.overall)) : 0;

  // ── Sub-components ──────────────────────────────────────────────────────────

  const StageRow = ({ stage, label, description, eta }: { stage: 1|2|3; label: string; description: string; eta: string }) => {
    const done = (stage === 1 && stage1Done) || (stage === 2 && stage2Done) || (stage === 3 && stage3Done);
    const isActive = currentStage === stage && !done;
    const circleBase = 'flex items-center justify-center w-9 h-9 rounded-full border text-sm font-semibold';
    const circleClass = done ? `${circleBase} bg-teal-500 border-teal-400 text-slate-900`
      : isActive ? `${circleBase} border-teal-400 text-teal-300`
      : `${circleBase} border-slate-600 text-slate-500`;
    const inner = done ? '✓'
      : isActive ? <span className="h-4 w-4 border-2 border-teal-300 border-t-transparent rounded-full animate-spin" />
      : stage;
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className={circleClass}>{inner}</div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{label}</div>
            <div className="text-xs text-slate-400">{description}</div>
          </div>
        </div>
        <div className="text-xs text-slate-500">ETA {eta}</div>
      </div>
    );
  };

  const BriefCard = ({ brief, onClick }: { brief: OpportunityBrief; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="text-left rounded-xl border border-slate-800 bg-slate-950/60 hover:border-teal-400/70 hover:bg-slate-900/80 transition-colors p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{brief.keyword}</div>
          <div className="mt-1 text-sm font-semibold text-slate-100 line-clamp-2">{brief.headline}</div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Score</span>
          <span className="text-sm font-mono text-teal-300">{brief.scores.overall.toFixed(1)}/10</span>
          {brief.isConfirmedTrend && (
            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
              Confirmed
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {brief.brandFit?.map((b) => (
          <span key={b} className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-200">{b}</span>
        ))}
      </div>
      <p className="text-xs text-slate-400 line-clamp-3">{brief.whyNow}</p>
    </button>
  );

  const BriefDetailModal = ({ brief }: { brief: OpportunityBrief }) => (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/70">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{brief.keyword}</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">{brief.headline}</h2>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-mono text-teal-300">{brief.scores.overall.toFixed(1)}/10</span>
            <div className="flex flex-wrap gap-1">
              {brief.brandFit?.map((b) => (
                <span key={b} className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-200">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto text-sm text-slate-200">
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Why now</h3>
            <p className="text-sm text-slate-200 whitespace-pre-line">{brief.whyNow}</p>
          </section>

          {brief.signalEvidence && brief.signalEvidence.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Signal evidence</h3>
              <ul className="space-y-1.5">
                {brief.signalEvidence.map((item, idx) => renderSignalItem(item, idx))}
              </ul>
            </section>
          )}

          {/* Score breakdown with rationale */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Score breakdown</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { label: 'Velocity',    val: brief.scores.velocity,    rat: (brief as any).velocityReasoning    ?? (brief as any).rationale?.velocity    },
                { label: 'Market',      val: brief.scores.market,      rat: (brief as any).marketReasoning      ?? (brief as any).rationale?.market      },
                { label: 'Competition', val: brief.scores.competition, rat: (brief as any).competitionReasoning ?? (brief as any).rationale?.competition },
                { label: 'Timing',      val: brief.scores.timing,      rat: (brief as any).timingReasoning      ?? (brief as any).rationale?.timing      },
              ] as const).map(({ label, val, rat }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{label}</span>
                    <span className="font-mono">{val.toFixed(1)}/10</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.min(100, (val / 10) * 100)}%` }} />
                  </div>
                  {rat && <p className="text-[11px] text-slate-500 line-clamp-2">{rat}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">CAGR estimate</h3>
              <p className="text-xs text-slate-300">{brief.cagrEstimate}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">First move</h3>
              <p className="text-xs text-slate-300">{brief.firstMove}</p>
            </div>
          </section>

          {brief.consumerQuotes && brief.consumerQuotes.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Consumer language</h3>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                {brief.consumerQuotes.slice(0, 5).map((q, idx) => (
                  <li key={idx}>&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Risk flag</h3>
            <p className="text-xs text-amber-300">{brief.riskFlag}</p>
          </section>

          {brief.consistencyFlag && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-200">⚠️ {brief.consistencyFlag}</p>
            </section>
          )}

          {brief.isConfirmedTrend && (
            <section className="rounded-xl border border-emerald-500/70 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 text-center">
              CONFIRMED TREND — Signal in 3+ sources
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/70">
          <div className="text-[11px] text-slate-500">
            V:{brief.scores.velocity.toFixed(1)} · M:{brief.scores.market.toFixed(1)} · C:{brief.scores.competition.toFixed(1)} · T:{brief.scores.timing.toFixed(1)}
          </div>
          <button type="button" onClick={() => setSelectedBrief(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // ── Render states ──────────────────────────────────────────────────────────

  if (appState === 'running') return (
    <div className="min-h-screen bg-[#07090f] text-slate-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl space-y-5">

        {/* Header */}
        <div className="text-center">
          <span className="text-2xl font-bold text-teal-400">SankET</span>
          <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">Trend Radar Active</p>
        </div>

        {/* Main progress card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">

          {/* Phase label + description */}
          <div className="text-center">
            <p className="text-sm font-semibold text-white">
              {progressPct < 30 ? '🔍 Stage 1 — Discovering Signals'
                : progressPct < 65 ? '🔬 Stage 2 — Validating Across 6 Sources'
                : progressPct < 95 ? '🧠 Stage 3 — Generating Opportunity Briefs'
                : '✅ Finalising Results...'}
            </p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {progressPct < 30
                ? 'Scanning Reddit India, YouTube, News & US media to extract emerging signals'
                : progressPct < 65
                ? 'Running Amazon India, Google Trends, PubMed & YouTube for each keyword'
                : progressPct < 95
                ? 'Gemini AI scoring 4 dimensions and writing structured opportunity briefs'
                : 'Saving results to database and sorting by opportunity score'}
            </p>
          </div>

          {/* Gradient progress bar */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
              <span>Overall Progress</span>
              <span className="font-mono">{progressPct}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #0f766e, #2dd4bf)' }}
              />
            </div>
          </div>

          {/* Stage pills */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { n: 1 as const, label: 'Discovery',  desc: 'Reddit · YouTube · News', done: stage1Done, active: currentStage === 1 },
              { n: 2 as const, label: 'Validation', desc: 'Amazon · Trends · PubMed', done: stage2Done, active: currentStage === 2 },
              { n: 3 as const, label: 'Briefing',   desc: 'Gemini AI · Scoring',     done: stage3Done, active: currentStage === 3 },
            ] as const).map(({ n, label, desc, done, active }) => (
              <div key={n} className={`rounded-xl px-2.5 py-2.5 text-center border transition-all ${
                done   ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                : active ? 'bg-slate-800 border-teal-500/40 text-white'
                : 'bg-slate-900/60 border-slate-800 text-slate-600'
              }`}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  {done ? (
                    <span className="text-teal-400 text-sm">✓</span>
                  ) : active ? (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  ) : (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-700" />
                  )}
                  <span className="text-xs font-semibold">{label}</span>
                </div>
                <p className="text-[10px] opacity-60 leading-tight">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live activity feed */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Live Activity</span>
            <span className="font-mono text-xs text-slate-600">{elapsedTime}</span>
          </div>
          <div className="h-24 overflow-y-auto space-y-1 pr-1">
            {activityLog.length === 0 ? (
              <p className="text-xs text-slate-600 italic">Initialising scan...</p>
            ) : (
              activityLog.map((msg, i) => (
                <p key={i} className={`text-xs leading-relaxed ${i === 0 ? 'text-teal-400' : 'text-slate-600'}`}>
                  {i === 0 ? '▶ ' : '  '}{msg}
                </p>
              ))
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-700">
          Scanning 7 sources · AI-powered · Results saved automatically
        </p>
      </div>
    </div>
  );
  if (appState === 'complete') return (
    <div className="min-h-screen bg-[#07090f] text-slate-100 px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-teal-400">SankET Trend Scan Results</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {briefs.length} trends found
              &nbsp;·&nbsp; Top score: {topScore.toFixed(1)}/10
              &nbsp;·&nbsp; {briefs.filter(b => b.isConfirmedTrend).length} confirmed
              &nbsp;·&nbsp; {briefs.filter(b => (b as any).isNovelKeyword).length} 🆕 first discoveries
              &nbsp;·&nbsp; Time: {elapsedTime}
            </p>
          </div>
          <button type="button" onClick={handleRunNewScan}
            className="self-start inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors">
            Run New Scan
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="uppercase tracking-wide text-slate-500">Filter by brand:</span>
          {(['All', 'Man Matters', 'Be Bodywise', 'Little Joys', 'Root Labs', 'New Category'] as BrandFilter[]).map((label) => (
            <button key={label} type="button" onClick={() => setBrandFilter(label)}
              className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                brandFilter === label
                  ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-teal-400/60'
              }`}>{label}</button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBriefs.map((brief) => (
            <BriefCard key={brief.keyword} brief={brief} onClick={() => setSelectedBrief(brief)} />
          ))}
        </div>

        {filteredBriefs.length === 0 && (
          <p className="text-sm text-slate-500">No trends match this filter. Try switching to &quot;All&quot;.</p>
        )}

        {selectedBrief && <BriefDetailModal brief={selectedBrief} />}
      </div>
    </div>
  );

  if (appState === 'error') return (
    <div className="min-h-screen bg-[#07090f] text-slate-100 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-red-400">Scan failed</h1>
            <p className="text-xs text-slate-500 mt-1">SankET encountered an error while running the autonomous scan.</p>
          </div>
          <button type="button" onClick={handleRunNewScan}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors">
            Try Again
          </button>
        </header>
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {errorMsg || 'Unknown error occurred.'}
        </div>
        {briefs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Last successful results</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {briefs.map((brief) => (
                <BriefCard key={brief.keyword} brief={brief} onClick={() => setSelectedBrief(brief)} />
              ))}
            </div>
          </div>
        )}
        {selectedBrief && <BriefDetailModal brief={selectedBrief} />}
      </div>
    </div>
  );

  // idle — landing page
  return (
    <div className="min-h-screen bg-[#07090f] text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-teal-400">SankET</span>
          <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest bg-teal-500/10 text-teal-400 border border-teal-500/20">
            v2 · Mosaic Intelligence
          </span>
        </div>
        {/* Quota indicator */}
        {loadingHistory ? null : (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span>API ready</span>
          </div>
        )}
        {/* FAQ button */}
        <button
          type="button"
          onClick={() => setShowFaq(true)}
          className="ml-3 w-7 h-7 rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/50 transition-colors flex items-center justify-center text-sm font-bold"
          title="How it works"
        >?</button>
      </div>

      {/* Main hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-xs font-label uppercase tracking-[2px] text-teal-500 mb-3">India D2C Wellness Intelligence</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 leading-tight">
          Discover Trends<br/>
          <span className="text-teal-400">Before They Go Mainstream</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-md mb-8 leading-relaxed">
          SankET autonomously scans Reddit, YouTube, Amazon, Google Trends, PubMed, and US media to surface the next D2C wellness opportunity — 3–6 months ahead of the market.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
          <button type="button" onClick={handleStartScan}
            className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl text-base font-semibold bg-teal-500 hover:bg-teal-400 text-white shadow-lg shadow-teal-500/25 transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-[#07090f]">
            <span>🔍</span> Run Full Scan
            <span className="text-teal-200 text-xs font-normal ml-1">~10 min</span>
          </button>
          {!loadingHistory && pastScans.length > 0 && (
            <button
              type="button"
              onClick={() => { setBriefs(pastScans[0].briefs); setAppState('complete'); }}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-medium bg-slate-800 hover:bg-slate-700 text-teal-400 border border-teal-700 hover:border-teal-500/50 transition-all duration-150"
            >
              <span>⚡</span> Load Last Scan
              <span className="text-slate-500 text-xs font-normal ml-1">instant</span>
            </button>
          )}
        </div>

        {lastRunInfo && (
          <p className="text-xs text-slate-600">
            Last scan: {lastRunInfo.date} · {lastRunInfo.count} opportunities found
          </p>
        )}

        {/* Signal sources strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600">
          {['🟠 Reddit India', '🔴 YouTube', '🟡 Amazon India', '🔵 Google Trends', '⚪ News + US Media', '🟢 PubMed'].map(s => (
            <span key={s} className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800">{s}</span>
          ))}
        </div>
      </div>

      {/* FAQ Modal */}
      {showFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70" onClick={() => setShowFaq(false)}>
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-teal-400">How SankET Works</h2>
              <button onClick={() => setShowFaq(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="space-y-4 text-sm text-slate-300">
              <div>
                <p className="font-semibold text-white mb-1">What does SankET do?</p>
                <p className="text-slate-400 leading-relaxed">SankET is a 3-stage autonomous agent that scans 7 data sources to identify wellness ingredient trends in India 3–6 months before they reach mainstream D2C.</p>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Stage 1 — Discovery (~2 min)</p>
                <p className="text-slate-400 leading-relaxed">Scans Reddit India communities, YouTube wellness channels, India news, and US supplement media. Gemini AI extracts 8–12 emerging keyword signals.</p>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Stage 2 — Validation (~5 min)</p>
                <p className="text-slate-400 leading-relaxed">For each keyword: checks Google Trends slope, Amazon India listings with real review counts, YouTube engagement, PubMed clinical papers, and news coverage.</p>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Stage 3 — Briefing (~3 min)</p>
                <p className="text-slate-400 leading-relaxed">Gemini scores each trend on 4 dimensions (Buzz, Market Size, White Space, Timing) and generates a full product brief with pricing, competitor range, and first move.</p>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">What is the US-lag indicator?</p>
                <p className="text-slate-400 leading-relaxed">Indian D2C supplement trends typically follow US trends by 12–24 months. SankET uses US media signals and Gemini's knowledge to flag how far behind India is — and whether the window is open, closing, or closed.</p>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">What do the scores mean?</p>
                <div className="space-y-1 text-slate-400">
                  <p>⚡ <b className="text-slate-300">Buzz (1–10):</b> Social momentum across Reddit, YouTube, News</p>
                  <p>📈 <b className="text-slate-300">Market (1–10):</b> Mosaic-addressable India market size</p>
                  <p>🏁 <b className="text-slate-300">Space (1–10):</b> White space — higher = fewer competitors</p>
                  <p>🕐 <b className="text-slate-300">Timing (1–10):</b> Rogers Diffusion stage — 8+ = Innovators/Early Adopters</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">What is "Load Last Scan"?</p>
                <p className="text-slate-400 leading-relaxed">Instantly loads the most recent completed scan from the database — no API calls needed. Use this for demos or repeat viewing.</p>
              </div>
              <div className="pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-500">Built for Mosaic Fellowship 2026 · Challenge #6 · All data is collected in real-time and should be validated before investment decisions.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Past Scans */}
      {!loadingHistory && pastScans.length > 0 && (
        <div className="w-full max-w-5xl mx-auto mt-12 px-4 pb-16">
          <h2 className="text-sm font-label text-slate-400 uppercase tracking-widest mb-4">Previous Scans</h2>
          <div className="space-y-3">
            {pastScans.map((scan) => (
              <div key={scan.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{scan.date}</p>
                    <p className="text-xs text-slate-500">{scan.count} opportunities found</p>
                  </div>
                  <button
                    onClick={() => {
                      setBriefs(scan.briefs);
                      setAppState('complete');
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 transition-colors"
                  >
                    View Results →
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scan.briefs.slice(0, 5).map((b) => (
                    <span key={b.keyword} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {b.keyword}
                    </span>
                  ))}
                  {scan.briefs.length > 5 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">
                      +{scan.briefs.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentDashboard;