import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import supabase from "@/lib/supabase";
import type { ScanRecord, OpportunityBrief } from "@/lib/types";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface HistoryDrawerProps {
  children: React.ReactNode;
  onSelectScan: (scan: ScanRecord) => void;
}

interface ScanEntry {
  id: string;
  created_at: string;
  total_found: number;
  status: string;
  briefs: OpportunityBrief[];
  topKeywords: string[];
}

const HistoryDrawer = ({ children, onSelectScan }: HistoryDrawerProps) => {
  const [scans,   setScans]   = useState<ScanEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    (async () => {
      try {
        // 1. Load completed scan runs
        const { data: runs } = await supabase
          .from("scan_runs")
          .select("id, created_at, total_found, status")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10);

        if (!runs?.length) { setLoading(false); return; }

        // 2. For each run, load its top briefs
        const entries: ScanEntry[] = await Promise.all(
          runs.map(async (run) => {
            const { data: reports } = await supabase
              .from("trend_reports")
              .select("brief_json, overall_score, keyword, headline")
              .eq("run_id", run.id)
              .order("overall_score", { ascending: false })
              .limit(5);

            const briefs: OpportunityBrief[] = (reports ?? [])
              .filter((r: any) => r.brief_json)
              .map((r: any) => ({ ...r.brief_json, keyword: r.keyword, headline: r.headline }));

            const topKeywords = (reports ?? [])
              .slice(0, 4)
              .map((r: any) => r.keyword)
              .filter(Boolean);

            return {
              id:          run.id,
              created_at:  run.created_at,
              total_found: run.total_found ?? briefs.length,
              status:      run.status,
              briefs,
              topKeywords,
            };
          })
        );

        setScans(entries);
      } catch (err) {
        console.error("HistoryDrawer load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const handleSelect = (scan: ScanEntry) => {
    setOpen(false);
    // Navigate directly with full briefs — no need for onSelectScan legacy path
    navigate(`/results/${scan.id}`, {
      state: { trends: scan.briefs, scanId: scan.id },
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="bg-card border-border w-[380px]">
        <SheetHeader>
          <SheetTitle className="text-foreground">Previous Scans</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
          {loading && (
            <p className="text-muted-foreground text-sm">Loading scans...</p>
          )}

          {!loading && scans.length === 0 && (
            <p className="text-muted-foreground text-sm">No previous scans yet.</p>
          )}

          {!loading && scans.map((scan) => (
            <button
              key={scan.id}
              onClick={() => handleSelect(scan)}
              className="w-full text-left p-4 rounded-xl bg-secondary hover:bg-muted transition-colors border border-border group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(scan.created_at), "MMM d, yyyy · h:mm a")}
                </p>
                <span className="text-[10px] font-label text-teal bg-teal/10 border border-teal/20 px-2 py-0.5 rounded-full">
                  {scan.total_found} trends
                </span>
              </div>
              {scan.topKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {scan.topKeywords.map((kw) => (
                    <span key={kw} className="text-[10px] text-muted-foreground/60 bg-muted/40 px-2 py-0.5 rounded-full border border-border/40 truncate max-w-[160px]">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HistoryDrawer;