import type { SignalEvidence } from "@/lib/types";
import { formatInsightValue } from "@/lib/formatInsight";

interface SignalEvidenceTableProps {
  evidence: SignalEvidence[];
}

const strengthColors: Record<string, string> = {
  strong: "bg-primary/20 text-primary",
  moderate: "bg-accent/20 text-accent",
  weak: "bg-destructive/20 text-destructive",
  Strong: "bg-primary/20 text-primary",
  Moderate: "bg-accent/20 text-accent",
  Weak: "bg-destructive/20 text-destructive",
};

const SignalEvidenceTable = ({ evidence }: SignalEvidenceTableProps) => {
  if (!evidence?.length) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-title text-foreground mb-3">Signal Evidence</h2>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-5 text-muted-foreground font-label text-xs">Source</th>
              <th className="text-left py-2 px-5 text-muted-foreground font-label text-xs">Metric</th>
              <th className="text-left py-2 px-5 text-muted-foreground font-label text-xs">Insight</th>
              <th className="text-left py-2 px-5 text-muted-foreground font-label text-xs">Strength</th>
              <th className="text-left py-2 px-5 text-muted-foreground font-label text-xs">Source File</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((ev, i) => {
              const insightVal = ev.insight || ev.value || "";
              return (
                <tr
                  key={i}
                  className="border-b border-border/50"
                  style={{ backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}
                >
                  <td className="py-2.5 px-5 text-foreground font-body text-sm">{ev.source}</td>
                  <td className="py-2.5 px-5 text-muted-foreground font-body text-sm">{ev.metric}</td>
                  <td className="py-2.5 px-5 font-mono text-foreground text-xs">
                    {formatInsightValue(ev.metric, insightVal)}
                  </td>
                  <td className="py-2.5 px-5">
                    <span className={`text-xs font-label px-2 py-0.5 rounded-full ${strengthColors[ev.strength] || strengthColors.weak}`}>
                      {ev.strength}
                    </span>
                  </td>
                  <td className="py-2.5 px-5 text-xs text-muted-foreground truncate">
                    {ev.extracted_from || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack */}
      <div className="sm:hidden space-y-3">
        {evidence.map((ev, i) => {
          const insightVal = ev.insight || ev.value || "";
          return (
            <div key={i} className="p-3.5 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-label text-muted-foreground">{ev.source}</span>
                <span className={`text-xs font-label px-2 py-0.5 rounded-full ${strengthColors[ev.strength] || strengthColors.weak}`}>
                  {ev.strength}
                </span>
              </div>
              <p className="text-sm font-label text-foreground mb-1">{ev.metric}</p>
              <p className="text-base font-mono font-bold text-foreground">
                {formatInsightValue(ev.metric, insightVal)}
              </p>
              {ev.extracted_from && (
                <p className="text-xs text-muted-foreground mt-1.5">From: {ev.extracted_from}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default SignalEvidenceTable;
