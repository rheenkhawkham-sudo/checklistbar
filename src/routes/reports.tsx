import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Wine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Task = { id: string; text: string; done: boolean; remark?: string };

interface Report {
  id: string;
  report_date: string;
  outlet: string;
  signed_by: string;
  open_time: string;
  close_time: string;
  open_tasks: Task[];
  close_tasks: Task[];
  monthly_tasks: Task[];
  total_tasks: number;
  done_tasks: number;
  percent: number;
  created_at: string;
}

type Period = "daily" | "monthly" | "yearly";

function fmtKey(dateStr: string, period: Period) {
  const d = new Date(dateStr);
  if (period === "yearly") return String(d.getFullYear());
  if (period === "monthly")
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("daily");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("checklist_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error && data) setReports(data as unknown as Report[]);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      const key = fmtKey(r.report_date, period);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [reports, period]);

  const toggle = (id: string) =>
    setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-4">
            <Wine className="h-3.5 w-3.5" />
            Bar Operations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Report History
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Browse all past checklist submissions
          </p>
        </header>

        <nav className="flex justify-center gap-2 mb-6 p-1 rounded-full border bg-card max-w-md mx-auto">
          <Link
            to="/daily"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
          >
            Daily
          </Link>
          <Link
            to="/monthly"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
          >
            Monthly
          </Link>
          <Link
            to="/reports"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            Reports
          </Link>
        </nav>

        <div className="flex justify-center mb-6">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border bg-card">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No reports submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([groupKey, items]) => (
              <section key={groupKey}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                  {groupKey} <span className="text-xs">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-2xl border bg-card shadow-sm overflow-hidden"
                    >
                      <button
                        onClick={() => toggle(r.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                      >
                        {expanded[r.id] ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-semibold truncate">
                              {r.outlet}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.report_date}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            Signed by {r.signed_by}
                            {r.open_time && ` · Open ${r.open_time}`}
                            {r.close_time && ` · Close ${r.close_time}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            {r.percent}%
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {r.done_tasks}/{r.total_tasks}
                          </div>
                        </div>
                      </button>
                      {expanded[r.id] && (
                        <div className="px-4 pb-4 pt-1 border-t bg-background/40 space-y-4">
                          <TaskList title="Open Bar" tasks={r.open_tasks} />
                          <TaskList title="Close Bar" tasks={r.close_tasks} />
                          <TaskList title="Monthly" tasks={r.monthly_tasks} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/daily">Back to checklist</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: Task[] }) {
  if (!tasks || tasks.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">{t.done ? "✅" : "⬜"}</span>
            <div className="flex-1">
              <p
                className={
                  t.done ? "line-through text-muted-foreground" : ""
                }
              >
                {t.text}
              </p>
              {t.remark && (
                <p className="text-xs text-muted-foreground italic">
                  {t.remark}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
