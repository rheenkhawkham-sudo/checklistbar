import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Wine, Download, Trash2, Pencil, Lock, KeyRound } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPassword } from "@/lib/passwords";
import { useI18n, LangToggle } from "@/lib/i18n";
import { usePasswords } from "@/lib/usePasswords";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});


const OUTLETS = ["Beach Bar", "Pakarang Bar", "Pool Bar", "Family Pool Bar"] as const;
type Outlet = (typeof OUTLETS)[number];
type OutletSelection = Outlet | "All Outlets";
const OUTLET_OPTIONS: OutletSelection[] = ["All Outlets", ...OUTLETS];

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

function downloadPDF(label: string, reports: Report[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const title = `Bar Checklist Report — ${label}`;
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
  doc.text(`Total reports: ${reports.length}`, 40, 72);

  let y = 90;
  for (const r of reports) {
    if (y > 500) {
      doc.addPage();
      y = 40;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${r.outlet}  ·  ${r.report_date}  ·  ${r.percent}% (${r.done_tasks}/${r.total_tasks})`,
      40,
      y,
    );
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const meta = `Signed by: ${r.signed_by}${r.open_time ? `  ·  Open: ${r.open_time}` : ""}${
      r.close_time ? `  ·  Close: ${r.close_time}` : ""
    }`;
    doc.text(meta, 40, y);
    y += 6;

    const body: string[][] = [];
    const sections: [string, Task[]][] = [
      ["Open Bar", r.open_tasks ?? []],
      ["Close Bar", r.close_tasks ?? []],
      ["Weekly Cleaning", r.monthly_tasks ?? []],
    ];
    for (const [section, tasks] of sections) {
      for (const task of tasks) {
        body.push([section, task.text, task.done ? "Yes" : "No", task.remark ?? ""]);
      }
    }
    autoTable(doc, {
      startY: y + 4,
      head: [["Section", "Task", "Done", "Remark"]],
      body,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 30, 30] },
      columnStyles: {
        0: { cellWidth: 90 },
        2: { cellWidth: 40, halign: "center" },
        3: { cellWidth: 200 },
      },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error lastAutoTable injected by autoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  }

  const safe = label.replace(/\s+/g, "_");
  doc.save(`${safe}_reports_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function ReportsPage() {
  const { t } = useI18n();
  const { requirePassword, changePassword } = usePasswords();

  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("daily");
  const [outlet, setOutlet] = useState<OutletSelection>("All Outlets");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const outletLabel = (o: OutletSelection) => (o === "All Outlets" ? t("allOutlets") : o);

  const loadReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("checklist_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error && data) setReports(data as unknown as Report[]);
    setLoading(false);
  };

  useEffect(() => {
    if (unlocked) loadReports();
  }, [unlocked]);

  const filtered = useMemo(
    () => (outlet === "All Outlets" ? reports : reports.filter((r) => r.outlet === outlet)),
    [reports, outlet],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of filtered) {
      const key = fmtKey(r.report_date, period);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered, period]);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const handleDelete = async (id: string) => {
    if (!requirePassword("reports", "enterToDeleteReport")) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    const { error } = await supabase.from("checklist_reports").delete().eq("id", id);
    if (error) {
      window.alert(t("deleteFail") + error.message);
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const handleEdit = async (r: Report) => {
    if (!requirePassword("reports", "enterToEditReport")) return;
    const signed = window.prompt(t("signedBy"), r.signed_by) ?? r.signed_by;
    const openTime = window.prompt(t("openTime"), r.open_time) ?? r.open_time;
    const closeTime = window.prompt(t("closeTime"), r.close_time) ?? r.close_time;
    const { error } = await supabase
      .from("checklist_reports")
      .update({ signed_by: signed, open_time: openTime, close_time: closeTime })
      .eq("id", r.id);
    if (error) {
      window.alert(t("editFail") + error.message);
      return;
    }
    setReports((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, signed_by: signed, open_time: openTime, close_time: closeTime } : x,
      ),
    );
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex justify-end mb-2">
            <LangToggle />
          </div>
          <div className="flex flex-col items-center text-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">{t("restricted")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("enterToView")}</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pwInput === getPassword("reports")) {
                setUnlocked(true);
                setPwError("");
              } else {
                setPwError(t("pwWrong"));
              }
            }}
            className="space-y-3"
          >
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="••••••"
            />
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <Button type="submit" className="w-full">
              {t("login")}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/daily">{t("back")}</Link>
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex justify-end mb-2">
          <LangToggle />
        </div>
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-4">
            <Wine className="h-3.5 w-3.5" />
            {t("barOperations")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("reportHistory")}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t("browseAll")}</p>
        </header>

        <nav className="flex justify-center gap-2 mb-6 p-1 rounded-full border bg-card max-w-md mx-auto">
          <Link
            to="/daily"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
          >
            {t("daily")}
          </Link>
          <Link
            to="/monthly"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
          >
            {t("weeklyCleaning")}
          </Link>
          <Link
            to="/reports"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            {t("reports")}
          </Link>
        </nav>

        <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {OUTLET_OPTIONS.map((o) => (
            <button
              key={o}
              onClick={() => setOutlet(o)}
              className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                outlet === o
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent/40"
              }`}
            >
              {outletLabel(o)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="daily">{t("daily")}</TabsTrigger>
              <TabsTrigger value="monthly">{t("monthly")}</TabsTrigger>
              <TabsTrigger value="yearly">{t("yearly")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPDF(outlet, filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("download", { outlet: outletLabel(outlet) })}
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">{t("loading")}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border bg-card">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {t("noReportsFor", { outlet: outletLabel(outlet) })}
            </p>
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
                      <div className="w-full flex items-center gap-2 px-4 py-3">
                        <button
                          onClick={() => toggle(r.id)}
                          className="flex-1 flex items-center gap-3 text-left"
                        >
                          {expanded[r.id] ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold truncate">{r.outlet}</span>
                              <span className="text-xs text-muted-foreground">{r.report_date}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {t("signedBy")} {r.signed_by}
                              {r.open_time && ` · ${t("openTime")} ${r.open_time}`}
                              {r.close_time && ` · ${t("closeTime")} ${r.close_time}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold tabular-nums">{r.percent}%</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {r.done_tasks}/{r.total_tasks}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(r)}
                            aria-label={t("editAria")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(r.id)}
                            aria-label={t("deleteAria")}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {expanded[r.id] && (
                        <div className="px-4 pb-4 pt-1 border-t bg-background/40 space-y-4">
                          <TaskList title={t("openBar")} tasks={r.open_tasks} />
                          <TaskList title={t("closeBar")} tasks={r.close_tasks} />
                          <TaskList title={t("weeklyCleaning")} tasks={r.monthly_tasks} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/daily">{t("backToChecklist")}</Link>
          </Button>
          <Button variant="outline" onClick={() => changePassword("reports")}>
            <KeyRound className="h-4 w-4 mr-2" />
            {t("changePassword")}
          </Button>
          <Button variant="ghost" onClick={() => setUnlocked(false)}>
            {t("lock")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: Task[] }) {
  const { tTask } = useI18n();
  if (!tasks || tasks.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">{task.done ? "✅" : "⬜"}</span>
            <div className="flex-1">
              <p>{tTask(task.text)}</p>
              {task.remark && (
                <p className="text-xs text-muted-foreground italic">{task.remark}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
