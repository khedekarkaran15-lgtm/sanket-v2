import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";
import type { SignalEvidence } from "@/lib/types";

interface ConsumerSignalPieProps {
  evidence: SignalEvidence[];
}

const SOURCE_COLORS: Record<string, string> = {
  Reddit: "#ff4500",
  YouTube: "#ff0000",
  "Google Trends": "#4285f4",
  Research: "#a78bfa",
  Amazon: "#f59e0b",
  "Amazon India": "#f59e0b",
  News: "#6b7280",
};

const ConsumerSignalPie = ({ evidence }: ConsumerSignalPieProps) => {
  if (!evidence?.length) return null;

  const counts: Record<string, number> = {};
  for (const ev of evidence) {
    const src = ev.source || "Other";
    counts[src] = (counts[src] || 0) + 1;
  }

  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <h3 className="font-title text-sm text-foreground mb-3">Consumer Signal Sources</h3>
      <ResponsiveContainer width={280} height={280}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={SOURCE_COLORS[d.name] || "#6b7280"} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ConsumerSignalPie;
