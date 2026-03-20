import type { TrendData } from "./types";

export function getHeroStat(trend: TrendData): { label: string; value: string; colour: string } {
  // Condition 1 — Fad Override
  if (trend.classification === "LIKELY_FAD") {
    return { label: "", value: "⚠️ Likely Fad: Short Window Opportunity", colour: "#f59e0b" };
  }

  // Condition 2 — Blue Ocean
  if (trend.competition_score >= 9) {
    const ev = trend.signal_evidence?.find(
      (e) => e.metric?.toLowerCase().includes("product") || e.metric?.toLowerCase().includes("competitor")
    );
    const count = ev?.insight || ev?.value;
    if (count && (count === "0" || count.toLowerCase().includes("no competing"))) {
      return { label: "Blue Ocean Opportunity", value: "No competing products found on Amazon India", colour: "#0D9488" };
    }
    return { label: "Blue Ocean Opportunity", value: `${count || "Very few"} competing products on Amazon India`, colour: "#0D9488" };
  }

  // Condition 3 — Search Velocity
  if (trend.velocity_score >= 9) {
    const ev = trend.signal_evidence?.find(
      (e) => e.source?.toLowerCase().includes("google") || e.source?.toLowerCase().includes("trend")
    );
    const pct = ev?.insight || ev?.value || `${trend.velocity_score}/10 velocity`;
    return { label: "Search Velocity · 90 Days", value: `↑ ${pct}`, colour: "#10b981" };
  }

  // Condition 4 — Market Size
  if (trend.market_score >= 8) {
    const ev = trend.signal_evidence?.find(
      (e) => e.source?.toLowerCase().includes("research") || e.source?.toLowerCase().includes("report")
    );
    const figure = ev?.insight || ev?.value || trend.market_opportunity_value || "High market potential";
    return { label: "Untapped Market", value: figure, colour: "#f59e0b" };
  }

  // Condition 5 — Default
  return { label: "Opportunity Score", value: `${trend.overall_score}/10 Overall Opportunity`, colour: "#6b7280" };
}
