import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { CircularProgress } from "@/components/CircularProgress";
import { ChecklistSection, type Task } from "@/components/ChecklistSection";
import { sendChecklistEmail } from "@/server/email.functions";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_OPEN: Task[] = [
  { id: "o1", text: "Stock and restock liquor bottles", done: false },
  { id: "o2", text: "Check ice machine and refill", done: false },
  { id: "o3", text: "Wipe down glassware", done: false },
];

const DEFAULT_CLOSE: Task[] = [
  { id: "c1", text: "Clean bar counter and tools", done: false },
  { id: "c2", text: "Empty trash and recycling", done: false },
  { id: "c3", text: "Cash drawer reconciliation", done: false },
];

const DEFAULT_MONTHLY: Task[] = [
  { id: "m1", text: "Deep clean draft beer lines", done: false },
  { id: "m2", text: "Inventory full audit", done: false },
  { id: "m3", text: "Inspect and clean refrigeration units", done: false },
  { id: "m4", text: "Review supplier orders & invoices", done: false },
  { id: "m5", text: "Restock garnish and condiments", done: false },
];

const KEY_OPEN = "bar.daily.open";
const KEY_CLOSE = "bar.daily.close";
const KEY_MONTHLY = "bar.monthly";
const KEY_OUTLET = "bar.outlet";
const KEY_SIGNED = "bar.signedBy";
const KEY_DATE = "bar.reportDate";
const KEY_OPEN_TIME = "bar.openTime";
const KEY_CLOSE_TIME = "bar.closeTime";

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function pct(tasks: Task[]) {
  const t = tasks.length;
  const d = tasks.filter((x) => x.done).length;
  return { percent: t === 0 ? 0 : Math.round((d / t) * 100), done: d, total: t };
}

interface Props {
  mode: "daily" | "monthly";
}

export function ChecklistPage({ mode }: Props) {
  const isDaily = mode === "daily";

  const [openTasks, setOpenTasks] = useState<Task[]>(DEFAULT_OPEN);
  const [closeTasks, setCloseTasks] = useState<Task[]>(DEFAULT_CLOSE);
  const [monthlyTasks, setMonthlyTasks] = useState<Task[]>(DEFAULT_MONTHLY);
  const [outlet, setOutlet] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [reportDate, setReportDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  useEffect(() => {
    setOpenTasks(loadStored(KEY_OPEN, DEFAULT_OPEN));
    setCloseTasks(loadStored(KEY_CLOSE, DEFAULT_CLOSE));
    setMonthlyTasks(loadStored(KEY_MONTHLY, DEFAULT_MONTHLY));
    setOutlet(loadStored<string>(KEY_OUTLET, ""));
    setSignedBy(loadStored<string>(KEY_SIGNED, ""));
    const storedDate = loadStored<string>(KEY_DATE, "");
    if (storedDate) setReportDate(storedDate);
    setOpenTime(loadStored<string>(KEY_OPEN_TIME, ""));
    setCloseTime(loadStored<string>(KEY_CLOSE_TIME, ""));

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === KEY_OPEN) setOpenTasks(loadStored(KEY_OPEN, DEFAULT_OPEN));
      if (e.key === KEY_CLOSE) setCloseTasks(loadStored(KEY_CLOSE, DEFAULT_CLOSE));
      if (e.key === KEY_MONTHLY) setMonthlyTasks(loadStored(KEY_MONTHLY, DEFAULT_MONTHLY));
      if (e.key === KEY_OUTLET) setOutlet(loadStored<string>(KEY_OUTLET, ""));
      if (e.key === KEY_SIGNED) setSignedBy(loadStored<string>(KEY_SIGNED, ""));
      if (e.key === KEY_DATE) {
        const v = loadStored<string>(KEY_DATE, "");
        if (v) setReportDate(v);
      }
      if (e.key === KEY_OPEN_TIME) setOpenTime(loadStored<string>(KEY_OPEN_TIME, ""));
      if (e.key === KEY_CLOSE_TIME) setCloseTime(loadStored<string>(KEY_CLOSE_TIME, ""));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY_OPEN, JSON.stringify(openTasks));
  }, [openTasks]);
  useEffect(() => {
    localStorage.setItem(KEY_CLOSE, JSON.stringify(closeTasks));
  }, [closeTasks]);
  useEffect(() => {
    localStorage.setItem(KEY_MONTHLY, JSON.stringify(monthlyTasks));
  }, [monthlyTasks]);
  useEffect(() => {
    localStorage.setItem(KEY_OUTLET, JSON.stringify(outlet));
  }, [outlet]);
  useEffect(() => {
    localStorage.setItem(KEY_SIGNED, JSON.stringify(signedBy));
  }, [signedBy]);
  useEffect(() => {
    localStorage.setItem(KEY_DATE, JSON.stringify(reportDate));
  }, [reportDate]);
  useEffect(() => {
    localStorage.setItem(KEY_OPEN_TIME, JSON.stringify(openTime));
  }, [openTime]);
  useEffect(() => {
    localStorage.setItem(KEY_CLOSE_TIME, JSON.stringify(closeTime));
  }, [closeTime]);

  const dailyAll = useMemo(() => [...openTasks, ...closeTasks], [openTasks, closeTasks]);
  const dailyP = useMemo(() => pct(dailyAll), [dailyAll]);
  const monthlyP = useMemo(() => pct(monthlyTasks), [monthlyTasks]);
  const combinedP = useMemo(() => pct([...dailyAll, ...monthlyTasks]), [dailyAll, monthlyTasks]);

  const onSubmit = async () => {
    if (!outlet.trim()) return toast.error("Please enter the outlet name");
    if (!signedBy.trim())
      return toast.error("Please sign with your name before submitting");
    setSubmitting(true);
    try {
      const res = await send({
        data: {
          outlet,
          signedBy,
          reportDate,
          openTime,
          closeTime,
          mode: "all",
          open: openTasks,
          close: closeTasks,
          daily: [],
          monthly: monthlyTasks,
        },
      });
      toast.success(`Submitted! Report sent to ${res.recipient}`);
      const clearTasks = (arr: Task[]) =>
        arr.map((t) => ({ ...t, done: false, remark: "" }));
      setOpenTasks((prev) => clearTasks(prev));
      setCloseTasks((prev) => clearTasks(prev));
      setMonthlyTasks((prev) => clearTasks(prev));
      setOutlet("");
      setSignedBy("");
      setOpenTime("");
      setCloseTime("");
      setReportDate(new Date().toISOString().slice(0, 10));
    } catch (e) {
      console.error(e);
      toast.error("Failed to send email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <Toaster richColors position="top-center" />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-4">
            <Wine className="h-3.5 w-3.5" />
            Bar Operations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Bar Checklist
          </h1>
        </header>

        <nav className="flex justify-center gap-2 mb-8 p-1 rounded-full border bg-card max-w-xs mx-auto">
          <Link
            to="/daily"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full transition-colors text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            Daily
          </Link>
          <Link
            to="/monthly"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full transition-colors text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            Monthly
          </Link>
        </nav>

        <section className="flex flex-col items-center justify-center mb-8 rounded-3xl border bg-card p-8 shadow-sm">
          <CircularProgress percent={combinedP.percent} />
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            Overall: {combinedP.done} of {combinedP.total} tasks completed
          </p>

          <div className="mt-8 grid grid-cols-2 gap-6 w-full max-w-sm">
            <div className="flex flex-col items-center">
              <CircularProgress percent={dailyP.percent} size={100} />
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                Daily {dailyP.done}/{dailyP.total}
              </p>
            </div>
            <div className="flex flex-col items-center">
              <CircularProgress percent={monthlyP.percent} size={100} />
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                Monthly {monthlyP.done}/{monthlyP.total}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 mb-8">
          {(() => {
            const buildMeta = (
              timeLabel: string,
              timeId: string,
              timeValue: string,
              setTime: (v: string) => void
            ) => (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`outlet-${timeId}`}>Outlet</Label>
                  <Input
                    id={`outlet-${timeId}`}
                    placeholder="e.g. Sky Bar – Sukhumvit"
                    value={outlet}
                    onChange={(e) => setOutlet(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`signedBy-${timeId}`}>Signed by</Label>
                  <Input
                    id={`signedBy-${timeId}`}
                    placeholder="Your full name"
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`reportDate-${timeId}`}>Date</Label>
                  <Input
                    id={`reportDate-${timeId}`}
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={timeId}>{timeLabel}</Label>
                  <Input
                    id={timeId}
                    type="time"
                    value={timeValue}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
            );

            if (isDaily) {
              return (
                <>
                  <ChecklistSection
                    title="Open Bar"
                    tasks={openTasks}
                    onChange={setOpenTasks}
                    variant="open"
                    headerExtra={buildMeta("Open time", "openTime", openTime, setOpenTime)}
                  />
                  <ChecklistSection
                    title="Close Bar"
                    tasks={closeTasks}
                    onChange={setCloseTasks}
                    variant="close"
                    headerExtra={buildMeta("Close time", "closeTime", closeTime, setCloseTime)}
                  />
                </>
              );
            }
            return (
              <>
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="outlet-m">Outlet</Label>
                      <Input
                        id="outlet-m"
                        placeholder="e.g. Sky Bar – Sukhumvit"
                        value={outlet}
                        onChange={(e) => setOutlet(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signedBy-m">Signed by</Label>
                      <Input
                        id="signedBy-m"
                        placeholder="Your full name"
                        value={signedBy}
                        onChange={(e) => setSignedBy(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reportDate-m">Date</Label>
                      <Input
                        id="reportDate-m"
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <ChecklistSection
                  title="Monthly Tasks"
                  tasks={monthlyTasks}
                  onChange={setMonthlyTasks}
                />
              </>
            );
          })()}
        </div>

        <div className="sticky bottom-4 z-10">
          <Button
            size="lg"
            className="w-full h-14 text-base shadow-lg"
            onClick={onSubmit}
            disabled={submitting}
          >
            <Send className="mr-2 h-5 w-5" />
            {submitting ? "Sending..." : "Submit & Email Report"}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Report will be emailed to <b>rheen.khawkham@gmail.com</b>
          </p>
        </div>
      </div>
    </div>
  );
}
