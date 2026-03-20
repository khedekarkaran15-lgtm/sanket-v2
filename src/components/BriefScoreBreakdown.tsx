import { useEffect, useRef, useState } from "react";
import type { TrendData } from "@/lib/types";

interface BriefScoreBreakdownProps {
  trend: TrendData;
}

const BriefScoreBreakdown = ({ trend }: BriefScoreBreakdownProps) => {
  const barsRef = useRef<HTMLDivElement>(null);
  const [barsVisible, setBarsVisible] = useState(false);

  useEffect(() => {
    if (!barsRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setBarsVisible(true); },
      { threshold: 0.3 }
    );
    observer.observe(barsRef.current);
    return () => observer.disconnect();
  }, [trend]);

  const scores = [
    { icon: "⚡", label: "Velocity", score: trend.velocity_score, rationale: trend.velocity_rationale },
    { icon: "💰", label: "Market Size", score: trend.market_score, rationale: trend.market_rationale },
    { icon: "🛡️", label: "Competition", score: trend.competition_score, rationale: trend.competition_rationale },
    { icon: "⏱️", label: "Time to Mainstream", score: trend.time_score, rationale: trend.time_rationale },
  ];

  return (
    <section className="mb-8" ref={barsRef}>
      <h2 className="text-lg font-bold text-foreground mb-3">Opportunity Score Breakdown</h2>
      <div className="space-y-4">
        {scores.map((s) => (
          <div key={s.label}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-base">{s.icon}</span>
              <span className="text-sm font-medium text-foreground w-36">{s.label}</span>
              <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                  style={{ width: barsVisible ? `${s.score * 10}%` : "0%" }}
                />
              </div>
              <span className="font-mono text-sm font-bold text-foreground w-10 text-right">
                {s.score}/10
              </span>
            </div>
            <p className="text-xs text-muted-foreground ml-9">{s.rationale}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BriefScoreBreakdown;
