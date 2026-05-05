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

const DEFAULT_DAILY: Task[] = [
  { id: "d1", text: "Stock and restock liquor bottles", done: false },
  { id: "d2", text: "Clean bar counter and tools", done: false },
  { id: "d3", text: "Check ice machine and refill", done: false },
  { id: "d4", text: "Wipe down glassware", done: false },
  { id: "d5", text: "Empty trash and recycling", done: false },
  { id: "d6", text: "Cash drawer reconciliation", done: false },
];

const DEFAULT_MONTHLY: Task[] = [
  { id: "m1", text: "Deep clean draft beer lines", done: false },
  { id: "m2", text: "Inventory full audit", done: false },
  { id: "m3", text: "Inspect and clean refrigeration units", done: false },
  { id: "m4", text: "Review supplier orders & invoices", done: false },
  { id: "m5", text: "Restock garnish and condiments", done: false },
];

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface Props {
  mode: "daily" | "monthly";
}

export function ChecklistPage({ mode }: Props) {
  const isDaily = mode === "daily";
  const storageKey = isDaily ? "bar.daily" : "bar.monthly";
  const defaults = isDaily ? DEFAULT_DAILY : DEFAULT_MONTHLY;
  const title = isDaily ? "Daily Tasks" : "Monthly Tasks";

  const [tasks, setTasks] = useState<Task[]>(defaults);
  const [outlet, setOutlet] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [reportDate, setReportDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  useEffect(() => {
    setTasks(loadStored(storageKey, defaults));
    setOutlet(loadStored<string>("bar.outlet", ""));
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  }, [storageKey, tasks]);
  useEffect(() => {
    localStorage.setItem("bar.outlet", JSON.stringify(outlet));
  }, [outlet]);

  const { percent, done, total } = useMemo(() => {
    const t = tasks.length;
    const d = tasks.filter((x) => x.done).length;
    return { percent: t === 0 ? 0 : Math.round((d / t) * 100), done: d, total: t };
  }, [tasks]);

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
          mode,
          daily: isDaily ? tasks : [],
          monthly: isDaily ? [] : tasks,
        },
      });
      toast.success(`Submitted! Report sent to ${res.recipient}`);
      setSignedBy("");
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
          <CircularProgress percent={percent} />
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {done} of {total} {isDaily ? "daily" : "monthly"} tasks completed
          </p>
        </section>

        <div className="grid gap-6 mb-8">
          <div className="grid gap-4 sm:grid-cols-3 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="outlet">Outlet</Label>
              <Input
                id="outlet"
                placeholder="e.g. Sky Bar – Sukhumvit"
                value={outlet}
                onChange={(e) => setOutlet(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signedBy">Signed by</Label>
              <Input
                id="signedBy"
                placeholder="Your full name"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reportDate">Date</Label>
              <Input
                id="reportDate"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
          </div>

          <ChecklistSection title={title} tasks={tasks} onChange={setTasks} />
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
