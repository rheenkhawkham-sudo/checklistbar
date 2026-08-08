import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Wine, Download, Lock, KeyRound, CalendarIcon, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getPassword } from "@/lib/passwords";
import { useI18n, LangToggle } from "@/lib/i18n";
import { usePasswords } from "@/lib/usePasswords";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});


const DEFAULT_OUTLETS: string[] = [
  "Beach Bar",
  "Pakarang Bar",
  "Pool Bar",
  "Family Pool Bar",
  "Outlet 5",
  "Outlet 6",
  "Outlet 7",
];
type Outlet = string;
type OutletSelection = string;
const DELETE_ALL_CODE = "090138";

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
type DateMode = "all" | "day" | "month" | "year" | "range";

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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ReportsPage() {
  const { t } = useI18n();
  const { changePassword } = usePasswords();

  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("daily");
  const [outlet, setOutlet] = useState<OutletSelection>("All Outlets");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [outletNames, setOutletNames] = useState<Record<string, string>>({});
  const [outletIds, setOutletIds] = useState<string[]>([...DEFAULT_OUTLETS]);
  const outletOptions = useMemo<OutletSelection[]>(() => ["All Outlets", ...outletIds], [outletIds]);

  const deleteAllHistory = async () => {
    const code = window.prompt(t("enterDeleteCode"));
    if (code === null) return;
    if (code.trim() !== DELETE_ALL_CODE) {
      window.alert(t("wrongDeleteCode"));
      return;
    }
    if (!window.confirm(t("deleteAllHistoryConfirm"))) return;
    const { error } = await supabase
      .from("checklist_reports")
      .delete()
      .not("id", "is", null);
    if (error) {
      window.alert(error.message);
      return;
    }
    setReports([]);
    window.alert(t("historyDeleted"));
  };

  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [singleDay, setSingleDay] = useState<Date | undefined>(undefined);
  const now = new Date();
  const [pickYear, setPickYear] = useState<number>(now.getFullYear());
  const [pickMonth, setPickMonth] = useState<number>(now.getMonth());
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const nameOf = (o: Outlet) => outletNames[o] || o;
  const outletLabel = (o: OutletSelection) => (o === "All Outlets" ? t("allOutlets") : nameOf(o));

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
    if (!unlocked) return;
    loadReports();

    // Load outlet list + display names (synced across devices)
    (async () => {
      const { data: rows } = await supabase
        .from("app_state")
        .select("key,value")
        .in("key", ["outlet_names", "outlet_ids"]);
      const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
      const ids = map.get("outlet_ids");
      if (Array.isArray(ids) && ids.length > 0) {
        setOutletIds((ids as string[]).filter((x) => typeof x === "string"));
      }
      const v = (map.get("outlet_names") ?? {}) as Record<string, string>;
      if (v && typeof v === "object") {
        const next: Record<string, string> = {};
        for (const k of Object.keys(v)) {
          if (typeof v[k] === "string" && v[k].trim()) next[k] = v[k];
        }
        setOutletNames(next);
      }
    })();

    const namesChannel = supabase
      .channel("outlet_names_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: "key=eq.outlet_names" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { value: unknown } | null;
          const v = (row?.value ?? {}) as Record<string, string>;
          if (v && typeof v === "object") {
            const next: Record<string, string> = {};
            for (const k of Object.keys(v)) {
              if (typeof v[k] === "string" && v[k].trim()) next[k] = v[k];
            }
            setOutletNames(next);
          }
        },
      )
      .subscribe();

    // Realtime: stay synced across all devices viewing reports
    const channel = supabase
      .channel("checklist_reports_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checklist_reports" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as unknown as Report;
            setReports((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [row, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as unknown as Report;
            setReports((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as unknown as { id: string };
            setReports((prev) => prev.filter((r) => r.id !== oldRow.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(namesChannel);
    };
  }, [unlocked]);

  const filtered = useMemo(() => {
    let list = reports;
    if (outlet !== "All Outlets") {
      const dn = nameOf(outlet);
      list = reports.filter((r) => r.outlet === outlet || r.outlet === dn);
    }
    if (dateMode === "day" && singleDay) {
      const key = format(singleDay, "yyyy-MM-dd");
      list = list.filter((r) => r.report_date === key);
    } else if (dateMode === "month") {
      const prefix = `${pickYear}-${String(pickMonth + 1).padStart(2, "0")}`;
      list = list.filter((r) => r.report_date.startsWith(prefix));
    } else if (dateMode === "year") {
      const prefix = `${pickYear}-`;
      list = list.filter((r) => r.report_date.startsWith(prefix));
    } else if (dateMode === "range" && dateRange?.from) {
      const fromKey = format(dateRange.from, "yyyy-MM-dd");
      const toKey = format(dateRange.to ?? dateRange.from, "yyyy-MM-dd");
      list = list.filter((r) => r.report_date >= fromKey && r.report_date <= toKey);
    }
    return list;
  }, [reports, outlet, dateMode, singleDay, pickYear, pickMonth, dateRange]);

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

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const r of reports) {
      const y = parseInt(r.report_date.slice(0, 4), 10);
      if (!isNaN(y)) years.add(y);
    }
    years.add(now.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [reports, now]);

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
          {outletOptions.map((o) => (
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

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="daily">{t("daily")}</TabsTrigger>
              <TabsTrigger value="monthly">{t("monthly")}</TabsTrigger>
              <TabsTrigger value="yearly">{t("yearly")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadPDF(outlet, filtered)}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {t("download", { outlet: outletLabel(outlet) })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteAllHistory}
              disabled={reports.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("deleteAllHistory")}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-3 mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={dateMode} onValueChange={(v) => setDateMode(v as DateMode)}>
              <TabsList>
                <TabsTrigger value="all">{t("all")}</TabsTrigger>
                <TabsTrigger value="day">{t("day")}</TabsTrigger>
                <TabsTrigger value="month">{t("month")}</TabsTrigger>
                <TabsTrigger value="year">{t("year")}</TabsTrigger>
                <TabsTrigger value="range">{t("range")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {dateMode === "day" && (
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(!singleDay && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {singleDay ? format(singleDay, "PPP") : t("pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={singleDay}
                    onSelect={setSingleDay}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {singleDay && (
                <Button variant="ghost" size="sm" onClick={() => setSingleDay(undefined)}>
                  <X className="h-4 w-4 mr-1" /> {t("clear")}
                </Button>
              )}
            </div>
          )}

          {dateMode === "month" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(pickMonth)} onValueChange={(v) => setPickMonth(parseInt(v, 10))}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(pickYear)} onValueChange={(v) => setPickYear(parseInt(v, 10))}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {dateMode === "year" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(pickYear)} onValueChange={(v) => setPickYear(parseInt(v, 10))}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {dateMode === "range" && (
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(!dateRange?.from && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "PP")} – {format(dateRange.to, "PP")}
                        </>
                      ) : (
                        format(dateRange.from, "PP")
                      )
                    ) : (
                      t("pickDateRange")
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {dateRange?.from && (
                <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                  <X className="h-4 w-4 mr-1" /> {t("clear")}
                </Button>
              )}
            </div>
          )}
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
                <div className="flex items-center justify-between mb-2 px-1 gap-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {groupKey} <span className="text-xs">({items.length})</span>
                  </h2>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-2xl border bg-card shadow-sm overflow-hidden"
                    >
                      <button
                        onClick={() => toggle(r.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
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
