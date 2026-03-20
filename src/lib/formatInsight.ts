/**
 * Replaces zero/0 insight values with contextual language based on metric type.
 */
export function formatInsightValue(metric: string, value: string): string {
  const v = value?.trim();
  if (!v || v === "0" || v === "0.0" || v === "0%") {
    const m = metric.toLowerCase();
    if (m.includes("product count") || m.includes("listing")) return "No competing products found.";
    if (m.includes("brand count") || m.includes("brand")) return "No established brands identified.";
    if (m.includes("review")) return "No reviews — category is nascent.";
    return "No data found — category may be nascent.";
  }
  return v;
}
