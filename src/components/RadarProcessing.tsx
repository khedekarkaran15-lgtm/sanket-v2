import { useEffect, useState, useMemo, useRef } from "react";

// ── Stage-aware messages ───────────────────────────────────────────────────
const STAGE_MESSAGES: Record<number, string[]> = {
  1: [
    "Scraping wellness conversations from Reddit India...",
    "Identifying emerging signals in YouTube content...",
    "Cross-referencing US supplement trends for lag signals...",
    "Pulling live health headlines from Indian media...",
    "Distinguishing organic consumer signals from brand noise...",
    "Sending signal corpus to Gemini for keyword extraction...",
  ],
  2: [
    "Validating keywords against Google Trends data...",
    "Scanning Amazon India for product gaps and review counts...",
    "Measuring YouTube video velocity and audience engagement...",
    "Querying PubMed for clinical and research backing...",
    "Scoring trends across Buzz, Market, Space, and Timing...",
    "Checking signal novelty against previous scan history...",
  ],
  3: [
    "Generating D2C opportunity briefs with Gemini AI...",
    "Mapping trends to Mosaic Wellness brands...",
    "Writing product recommendations and competitor pricing...",
    "Calculating US-lag indicators and entry windows...",
    "Distinguishing sustainable trends from short-term fads...",
    "Finalising your intelligence report...",
  ],
};

// Progress milestones keyed to elapsed seconds
// Stage 1: 0–120s → 0–30%, Stage 2: 120–420s → 30–65%, Stage 3: 420–600s → 65–92%
function calcProgress(elapsed: number, isComplete: boolean): { pct: number; stage: number } {
  if (isComplete) return { pct: 100, stage: 3 };
  if (elapsed < 120) return { pct: Math.round((elapsed / 120) * 30), stage: 1 };
  if (elapsed < 420) return { pct: 30 + Math.round(((elapsed - 120) / 300) * 35), stage: 2 };
  return { pct: 65 + Math.min(27, Math.round(((elapsed - 420) / 180) * 27)), stage: 3 };
}

// ─────────────────────────────────────────────────────────────────────────────

interface RadarProcessingProps {
  isComplete: boolean;
  trendsCount: number;
}

const RadarProcessing = ({ isComplete, trendsCount }: RadarProcessingProps) => {
  const [elapsed,      setElapsed]      = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [animPct,      setAnimPct]      = useState(0);  // smoothly animated %
  const startRef   = useRef(Date.now());
  const animRef    = useRef<number | null>(null);
  const prevPctRef = useRef(0);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { pct: targetPct, stage } = calcProgress(elapsed, isComplete);

  // Animate progress bar smoothly toward targetPct
  useEffect(() => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    const from = prevPctRef.current;
    const to   = targetPct;
    if (from === to) return;
    const start = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const cur = Math.round(from + (to - from) * eased);
      setAnimPct(cur);
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        prevPctRef.current = to;
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [targetPct]);

  // Rotate messages every 8s
  useEffect(() => {
    if (isComplete) return;
    const msgs = STAGE_MESSAGES[stage] ?? STAGE_MESSAGES[1];
    setMessageIndex(0);
    const t = setInterval(() => setMessageIndex(i => (i + 1) % msgs.length), 8000);
    return () => clearInterval(t);
  }, [stage, isComplete]);

  const currentMsg = isComplete
    ? `Report ready — ${trendsCount} trends identified.`
    : (STAGE_MESSAGES[stage] ?? STAGE_MESSAGES[1])[messageIndex];

  const stageLabel = isComplete ? "Complete" : ["Discovery", "Validation", "Briefing"][stage - 1];
  const stageIcon  = isComplete ? "✅" : ["🔍", "🔬", "🧠"][stage - 1];

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Stable radar dot positions
  const dots = useMemo(() => {
    const out: { x: number; y: number; color: string; delay: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const angle  = (i / 12) * Math.PI * 2 + (i % 3) * 0.2;
      const radius = 60 + (i % 4) * 30;
      out.push({
        x: 200 + Math.cos(angle) * radius,
        y: 200 + Math.sin(angle) * radius,
        color: i < 4 ? "var(--signal-red)" : i < 8 ? "var(--signal-amber)" : "var(--signal-green)",
        delay: i * 0.3,
      });
    }
    return out;
  }, []);

  return (
    <>
      <style>{`
        @keyframes radar-ripple {
          0%   { transform: scale(0.4); opacity: 0.6; }
          100% { transform: scale(2.6); opacity: 0; }
        }
      `}</style>
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-4">
      {/* ── Radar Logo — matches landing page ── */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
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
          <span className="relative z-10 w-2.5 h-2.5 rounded-full bg-teal shadow-[0_0_8px_hsl(var(--teal))]" />
        </div>
        <span className="font-title text-2xl font-bold tracking-tight text-foreground">
          Sank<span className="text-teal">ET</span>
        </span>
      </div>

      {/* Radar SVG — unchanged essence */}
      <svg
        width="400" height="400"
        viewBox="0 0 400 400"
        className="w-[240px] h-[240px] md:w-[320px] md:h-[320px]"
      >
        {/* Concentric rings */}
        {[160, 120, 80, 40].map((r) => (
          <circle key={r} cx="200" cy="200" r={r}
            fill="none" stroke="hsl(var(--teal))" strokeWidth="1" opacity="0.12" />
        ))}
        {/* Crosshairs */}
        <line x1="200" y1="30" x2="200" y2="370" stroke="hsl(var(--teal))" strokeWidth="0.5" opacity="0.12" />
        <line x1="30"  y1="200" x2="370" y2="200" stroke="hsl(var(--teal))" strokeWidth="0.5" opacity="0.12" />

        {/* Sweep arm */}
        <g className="animate-radar-sweep" style={{ transformOrigin: "200px 200px" }}>
          <defs>
            <linearGradient id="bigSweep" gradientTransform="rotate(90)">
              <stop offset="0%"   stopColor="hsl(var(--teal))" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(var(--teal))" stopOpacity="0"   />
            </linearGradient>
          </defs>
          <path d="M200,200 L200,40 A160,160 0 0,1 336,120 Z" fill="url(#bigSweep)" />
          <line x1="200" y1="200" x2="200" y2="40"
            stroke="hsl(var(--teal))" strokeWidth="2" opacity="0.5" />
        </g>

        {/* Signal dots */}
        {dots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r="4"
            fill={`hsl(${dot.color})`}
            className="animate-pulse-dot"
            style={{ animationDelay: `${dot.delay}s` }}>
            <animate attributeName="opacity"
              values="0;0;1;1" keyTimes="0;0.3;0.35;1"
              dur="4s" begin={`${dot.delay}s`} fill="freeze" />
          </circle>
        ))}

        {/* Centre dot */}
        <circle cx="200" cy="200" r="6" fill="hsl(var(--teal))" className="animate-gentle-pulse" />
      </svg>

      {/* Stage label */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm">{stageIcon}</span>
        <span className={`text-xs font-label uppercase tracking-widest ${isComplete ? "text-teal" : "text-muted-foreground"}`}>
          {isComplete ? "Scan Complete" : `Stage ${stage} — ${stageLabel}`}
        </span>
      </div>

      {/* ── Global progress bar ── */}
      <div className="mt-3 w-full max-w-xs">
        <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-1.5 font-mono">
          <span>{isComplete ? "Done" : "Analysing..."}</span>
          <span>{animPct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${animPct}%`,
              background: isComplete
                ? "hsl(var(--teal))"
                : "linear-gradient(90deg, hsl(var(--teal) / 0.7), hsl(var(--teal)))",
            }}
          />
        </div>
      </div>

      {/* Status message */}
      <div className="mt-5 text-center min-h-[44px] w-full max-w-sm">
        <p
          key={currentMsg}
          className={`text-base animate-fade-up font-body leading-relaxed ${
            isComplete ? "text-teal font-label" : "text-muted-foreground"
          }`}
        >
          {currentMsg}
        </p>
      </div>

      {/* Elapsed time */}
      {!isComplete && (
        <p className="mt-3 text-[11px] font-mono text-muted-foreground/30">
          {formatTime(elapsed)} elapsed
        </p>
      )}
    </div>
    </>
  );
};

export default RadarProcessing;