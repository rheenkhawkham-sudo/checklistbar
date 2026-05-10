import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Wine, Mail, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { CircularProgress } from "@/components/CircularProgress";
import { ChecklistSection, type Task } from "@/components/ChecklistSection";
import { sendChecklistEmail } from "@/server/email.functions";
import { supabase } from "@/integrations/supabase/client";

const OUTLETS = ["Beach Bar", "Pakarang Bar", "Pool Bar", "Family Pool Bar"] as const;
type Outlet = typeof OUTLETS[number];

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

interface OutletData {
  open: Task[];
  close: Task[];
  monthly: Task[];
  signedBy: string;
  reportDate: string;
  openTime: string;
  closeTime: string;
}

const DEFAULT_DATA = (): OutletData => ({
  open: JSON.parse(JSON.stringify(DEFAULT_OPEN)),
  close: JSON.parse(JSON.stringify(DEFAULT_CLOSE)),
  monthly: JSON.parse(JSON.stringify(DEFAULT_MONTHLY)),
  signedBy: "",
  reportDate: new Date().toISOString().slice(0, 10),
  openTime: "",
  closeTime: "",
});

const STATE_KEY_OUTLET = (o: Outlet) => `outlet:${o}`;
const STATE_KEY_RECIPIENTS = "recipients";
const STATE_KEY_CURRENT = "currentOutlet";

function pct(tasks: Task[]) {
  const t = tasks.length;
  const d = tasks.filter((x) => x.done).length;
  return { percent: t === 0 ? 0 : Math.round((d / t) * 100), done: d, total: t };
}

function requirePassword() {
  const pw = window.prompt("กรุณาใส่รหัสผ่าน");
  if (pw === null) return false;
  if (pw !== "0000") {
    window.alert("รหัสผ่านไม่ถูกต้อง");
    return false;
  }
  return true;
}

async function pushState(key: string, value: unknown) {
  await supabase
    .from("app_state")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

interface Props {
  mode: "daily" | "monthly";
}

export function ChecklistPage({ mode }: Props) {
  const isDaily = mode === "daily";

  const [outlet, setOutlet] = useState<Outlet>(OUTLETS[0]);
  const [data, setData] = useState<OutletData>(DEFAULT_DATA);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  // Suppress echo: when we receive realtime for a write we just made
  const localWriteRef = useRef<{ [k: string]: string }>({});

  // Initial load + realtime subscription
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: rows } = await supabase.from("app_state").select("key,value");
      if (!active || !rows) return;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const cur = (map.get(STATE_KEY_CURRENT) as Outlet | undefined) ?? OUTLETS[0];
      const validCur = (OUTLETS as readonly string[]).includes(cur) ? cur : OUTLETS[0];
      setOutlet(validCur);
      const od = map.get(STATE_KEY_OUTLET(validCur)) as Partial<OutletData> | undefined;
      setData({ ...DEFAULT_DATA(), ...(od ?? {}) });
      const recs = map.get(STATE_KEY_RECIPIENTS);
      setRecipients(Array.isArray(recs) ? (recs as string[]) : []);
    })();

    const channel = supabase
      .channel("app_state_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key: string; value: unknown } | null;
          if (!row) return;
          const stamp = JSON.stringify(row.value);
          if (localWriteRef.current[row.key] === stamp) {
            delete localWriteRef.current[row.key];
            return;
          }
          if (row.key === STATE_KEY_CURRENT) {
            const v = row.value as Outlet;
            if ((OUTLETS as readonly string[]).includes(v)) setOutlet(v);
          } else if (row.key === STATE_KEY_RECIPIENTS) {
            setRecipients(Array.isArray(row.value) ? (row.value as string[]) : []);
          } else if (row.key.startsWith("outlet:")) {
            const o = row.key.slice("outlet:".length) as Outlet;
            setOutlet((cur) => {
              if (o === cur) {
                setData({ ...DEFAULT_DATA(), ...((row.value ?? {}) as Partial<OutletData>) });
              }
              return cur;
            });
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // When outlet changes locally, broadcast and load that outlet's data
  const outletInitRef = useRef(true);
  useEffect(() => {
    if (outletInitRef.current) {
      outletInitRef.current = false;
      return;
    }
    localWriteRef.current[STATE_KEY_CURRENT] = JSON.stringify(outlet);
    pushState(STATE_KEY_CURRENT, outlet);
    (async () => {
      const { data: row } = await supabase
        .from("app_state")
        .select("value")
        .eq("key", STATE_KEY_OUTLET(outlet))
        .maybeSingle();
      setData({ ...DEFAULT_DATA(), ...((row?.value ?? {}) as Partial<OutletData>) });
    })();
  }, [outlet]);

  // Debounced push of data changes for current outlet
  const dataInitRef = useRef(true);
  useEffect(() => {
    if (dataInitRef.current) {
      dataInitRef.current = false;
      return;
    }
    const key = STATE_KEY_OUTLET(outlet);
    const stamp = JSON.stringify(data);
    localWriteRef.current[key] = stamp;
    const t = setTimeout(() => pushState(key, data), 250);
    return () => clearTimeout(t);
  }, [data, outlet]);

  // Push recipient changes
  const recInitRef = useRef(true);
  useEffect(() => {
    if (recInitRef.current) {
      recInitRef.current = false;
      return;
    }
    localWriteRef.current[STATE_KEY_RECIPIENTS] = JSON.stringify(recipients);
    pushState(STATE_KEY_RECIPIENTS, recipients);
  }, [recipients]);

  const update = (patch: Partial<OutletData>) => setData((d) => ({ ...d, ...patch }));

  const dailyAll = useMemo(() => [...data.open, ...data.close], [data.open, data.close]);
  const dailyP = useMemo(() => pct(dailyAll), [dailyAll]);
  const monthlyP = useMemo(() => pct(data.monthly), [data.monthly]);
  const combinedP = useMemo(() => pct([...dailyAll, ...data.monthly]), [dailyAll, data.monthly]);

  const onSubmit = async () => {
    if (!data.signedBy.trim()) return toast.error("Please sign with your name before submitting");
    setSubmitting(true);
    try {
      const res = await send({
        data: {
          outlet,
          signedBy: data.signedBy,
          reportDate: data.reportDate,
          openTime: data.openTime,
          closeTime: data.closeTime,
          mode: "all",
          open: data.open,
          close: data.close,
          daily: [],
          monthly: data.monthly,
          recipients,
        },
      });
      const all = [...data.open, ...data.close, ...data.monthly];
      const totalTasks = all.length;
      const doneTasks = all.filter((t) => t.done).length;
      const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
      const { error: dbErr } = await supabase.from("checklist_reports").insert({
        report_date: data.reportDate,
        outlet,
        signed_by: data.signedBy,
        open_time: data.openTime,
        close_time: data.closeTime,
        open_tasks: JSON.parse(JSON.stringify(data.open)),
        close_tasks: JSON.parse(JSON.stringify(data.close)),
        monthly_tasks: JSON.parse(JSON.stringify(data.monthly)),
        total_tasks: totalTasks,
        done_tasks: doneTasks,
        percent,
      });
      if (dbErr) console.error("Failed to save report history", dbErr);
      toast.success(`Submitted! Report sent to ${res.recipient}`);
      const clear = (arr: Task[]) => arr.map((t) => ({ ...t, done: false, remark: "" }));
      setData((d) => ({
        open: clear(d.open),
        close: clear(d.close),
        monthly: clear(d.monthly),
        signedBy: "",
        openTime: "",
        closeTime: "",
        reportDate: new Date().toISOString().slice(0, 10),
      }));
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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Bar Checklist</h1>
        </header>

        {/* Outlet selector */}
        <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
          <Label className="text-xs text-muted-foreground">Select Outlet</Label>
          <Select value={outlet} onValueChange={(v) => setOutlet(v as Outlet)}>
            <SelectTrigger className="mt-2 h-12 text-base font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTLETS.map((o) => (
                <SelectItem key={o} value={o} className="text-base">
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            All data, tasks, and reports are kept separate per outlet.
          </p>
        </section>

        <nav className="flex justify-center gap-2 mb-8 p-1 rounded-full border bg-card max-w-md mx-auto">
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
            Weekly Cleaning
          </Link>
          <Link
            to="/reports"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full transition-colors text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            Reports
          </Link>
        </nav>

        <section className="flex flex-col items-center justify-center mb-8 rounded-3xl border bg-card p-8 shadow-sm">
          <CircularProgress percent={combinedP.percent} />
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {outlet} — {combinedP.done} of {combinedP.total} tasks completed
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
                Weekly {monthlyP.done}/{monthlyP.total}
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
              setTime: (v: string) => void,
            ) => (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Outlet</Label>
                  <Input value={outlet} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`signedBy-${timeId}`}>Signed by</Label>
                  <Input
                    id={`signedBy-${timeId}`}
                    placeholder="Your full name"
                    value={data.signedBy}
                    onChange={(e) => update({ signedBy: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`reportDate-${timeId}`}>Date</Label>
                  <Input
                    id={`reportDate-${timeId}`}
                    type="date"
                    value={data.reportDate}
                    onChange={(e) => update({ reportDate: e.target.value })}
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
                    tasks={data.open}
                    onChange={(open) => update({ open })}
                    variant="open"
                    headerExtra={buildMeta("Open time", "openTime", data.openTime, (v) =>
                      update({ openTime: v }),
                    )}
                  />
                  <ChecklistSection
                    title="Close Bar"
                    tasks={data.close}
                    onChange={(close) => update({ close })}
                    variant="close"
                    headerExtra={buildMeta("Close time", "closeTime", data.closeTime, (v) =>
                      update({ closeTime: v }),
                    )}
                  />
                </>
              );
            }
            return (
              <>
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Outlet</Label>
                      <Input value={outlet} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signedBy-m">Signed by</Label>
                      <Input
                        id="signedBy-m"
                        placeholder="Your full name"
                        value={data.signedBy}
                        onChange={(e) => update({ signedBy: e.target.value })}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reportDate-m">Date</Label>
                      <Input
                        id="reportDate-m"
                        type="date"
                        value={data.reportDate}
                        onChange={(e) => update({ reportDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <ChecklistSection
                  title="Weekly Cleaning"
                  tasks={data.monthly}
                  onChange={(monthly) => update({ monthly })}
                />
              </>
            );
          })()}
        </div>

        <RecipientsSection recipients={recipients} setRecipients={setRecipients} />

        <div className="sticky bottom-4 z-10 mt-6">
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
            {recipients.length > 0
              ? `Report will be emailed to ${recipients.length} recipient${recipients.length > 1 ? "s" : ""}`
              : "Report will be emailed to rheen.khawkham@gmail.com (default)"}
          </p>
        </div>
      </div>
    </div>
  );
}

function RecipientsSection({
  recipients,
  setRecipients,
}: {
  recipients: string[];
  setRecipients: (r: string[]) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

  const add = () => {
    const e = newEmail.trim();
    if (!isEmail(e)) return toast.error("Invalid email");
    if (recipients.length >= 5) return toast.error("Maximum 5 emails allowed");
    if (recipients.includes(e)) return toast.error("Email already added");
    if (!requirePassword()) return;
    setRecipients([...recipients, e]);
    setNewEmail("");
  };

  const remove = (i: number) => {
    if (!requirePassword()) return;
    setRecipients(recipients.filter((_, idx) => idx !== i));
  };

  const startEdit = (i: number) => {
    if (!requirePassword()) return;
    setEditingIdx(i);
    setEditValue(recipients[i]);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const e = editValue.trim();
    if (!isEmail(e)) return toast.error("Invalid email");
    setRecipients(recipients.map((r, idx) => (idx === editingIdx ? e : r)));
    setEditingIdx(null);
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Recipient Emails</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {recipients.length}/5
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Up to 5 recipients. Password required to add, edit, or remove (0000).
      </p>

      <ul className="space-y-2 mb-3">
        {recipients.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-3">
            No recipients yet. Default: rheen.khawkham@gmail.com
          </li>
        )}
        {recipients.map((r, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
          >
            {editingIdx === i ? (
              <>
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingIdx(null);
                  }}
                  className="flex-1"
                />
                <Button size="icon" variant="ghost" onClick={saveEdit}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingIdx(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 min-w-0 text-sm break-all">{r}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(i)}
                  aria-label="Edit"
                  className="shrink-0"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(i)}
                  aria-label="Remove"
                  className="shrink-0 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      {recipients.length < 5 && (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={255}
          />
          <Button size="icon" onClick={add} aria-label="Add email">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
