import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { CircularProgress } from "@/components/CircularProgress";
import { ChecklistSection, type Task } from "@/components/ChecklistSection";
import { sendChecklistEmail } from "@/server/email.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

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

function Index() {
  const [daily, setDaily] = useState<Task[]>(DEFAULT_DAILY);
  const [monthly, setMonthly] = useState<Task[]>(DEFAULT_MONTHLY);
  const [outlet, setOutlet] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  useEffect(() => {
    setDaily(loadStored("bar.daily", DEFAULT_DAILY));
    setMonthly(loadStored("bar.monthly", DEFAULT_MONTHLY));
    setOutlet(loadStored<string>("bar.outlet", ""));
  }, []);

  useEffect(() => {
    localStorage.setItem("bar.daily", JSON.stringify(daily));
  }, [daily]);
  useEffect(() => {
    localStorage.setItem("bar.monthly", JSON.stringify(monthly));
  }, [monthly]);
  useEffect(() => {
    localStorage.setItem("bar.outlet", JSON.stringify(outlet));
  }, [outlet]);

  const { percent, done, total } = useMemo(() => {
    const all = [...daily, ...monthly];
    const t = all.length;
    const d = all.filter((x) => x.done).length;
    return { percent: t === 0 ? 0 : Math.round((d / t) * 100), done: d, total: t };
  }, [daily, monthly]);

  const onSubmit = async () => {
    if (!outlet.trim()) return toast.error("Please enter the outlet name");
    if (!signedBy.trim()) return toast.error("Please sign with your name before submitting");
    setSubmitting(true);
    try {
      const res = await send({ data: { outlet, signedBy, reportDate, daily, monthly } });
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
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-4">
            <Wine className="h-3.5 w-3.5" />
            Bar Operations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Bar Checklist
          </h1>
          <p className="mt-2 text-muted-foreground text-sm sm:text-base">
            Track your daily and monthly bar tasks. Submit when complete.
          </p>
        </header>

        <section className="flex flex-col items-center justify-center mb-10 rounded-3xl border bg-card p-8 shadow-sm">
          <CircularProgress percent={percent} />
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {done} of {total} tasks completed
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

          <ChecklistSection title="Daily Tasks" tasks={daily} onChange={setDaily} />
          <ChecklistSection title="Monthly Tasks" tasks={monthly} onChange={setMonthly} />
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
