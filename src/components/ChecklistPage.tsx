import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Wine, Mail, Plus, Trash2, Pencil, Check, X, Settings2, KeyRound } from "lucide-react";
import { useI18n, LangToggle } from "@/lib/i18n";
import { usePasswords } from "@/lib/usePasswords";
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

// SHARED across devices (in app_state): only the task TEMPLATE per outlet —
// task ids + text/order. Per-device working state (done, remark, signedBy,
// times, date) is kept LOCAL so concurrent users on different outlets — or
// even the same outlet — never overwrite each other's checkbox ticks or
// typed names. The shared template ensures user-added/edited/deleted task
// headings still propagate to every device.
const STATE_KEY_TEMPLATE = (o: Outlet) => `outlet:${o}`; // shared (template only)
const STATE_KEY_RECIPIENTS = "recipients"; // shared

const LOCAL_KEY_OUTLET = "checklist:currentOutlet"; // per-device
const LOCAL_KEY_WORK = (o: Outlet) => `checklist:work:${o}`; // per-device

interface OutletTemplate {
  open: Task[]; // only id + text are authoritative; done/remark ignored on read
  close: Task[];
  monthly: Task[];
}
interface LocalWork {
  done: Record<string, boolean>;
  remark: Record<string, string>;
  signedBy: string;
  reportDate: string;
  openTime: string;
  closeTime: string;
}

const DEFAULT_TEMPLATE = (): OutletTemplate => ({
  open: JSON.parse(JSON.stringify(DEFAULT_OPEN)),
  close: JSON.parse(JSON.stringify(DEFAULT_CLOSE)),
  monthly: JSON.parse(JSON.stringify(DEFAULT_MONTHLY)),
});
const DEFAULT_WORK = (): LocalWork => ({
  done: {},
  remark: {},
  signedBy: "",
  reportDate: new Date().toISOString().slice(0, 10),
  openTime: "",
  closeTime: "",
});

const stripTemplate = (tasks: Task[] | undefined): Task[] =>
  (tasks ?? []).map((x) => ({ id: x.id, text: x.text, done: false }));

function readLocalOutlet(): Outlet {
  if (typeof window === "undefined") return OUTLETS[0];
  try {
    const v = localStorage.getItem(LOCAL_KEY_OUTLET) as Outlet | null;
    return v && (OUTLETS as readonly string[]).includes(v) ? v : OUTLETS[0];
  } catch {
    return OUTLETS[0];
  }
}
function readLocalWork(o: Outlet): LocalWork {
  if (typeof window === "undefined") return DEFAULT_WORK();
  try {
    const raw = localStorage.getItem(LOCAL_KEY_WORK(o));
    if (!raw) return DEFAULT_WORK();
    const parsed = JSON.parse(raw) as Partial<LocalWork>;
    return { ...DEFAULT_WORK(), ...parsed, done: { ...(parsed.done ?? {}) }, remark: { ...(parsed.remark ?? {}) } };
  } catch {
    return DEFAULT_WORK();
  }
}
function writeLocalWork(o: Outlet, w: LocalWork) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY_WORK(o), JSON.stringify(w));
  } catch {
    /* ignore quota errors */
  }
}

function pct(tasks: Task[]) {
  const total = tasks.length;
  const d = tasks.filter((x) => x.done).length;
  return { percent: total === 0 ? 0 : Math.round((d / total) * 100), done: d, total };
}

async function pushState(key: string, value: unknown) {
  await supabase
    .from("app_state")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// Project a shared template + per-device work into the OutletData shape
// the existing UI expects.
function projectData(tpl: OutletTemplate, work: LocalWork): OutletData {
  const apply = (arr: Task[]): Task[] =>
    arr.map((x) => ({
      id: x.id,
      text: x.text,
      done: !!work.done[x.id],
      remark: work.remark[x.id] ?? "",
    }));
  return {
    open: apply(tpl.open),
    close: apply(tpl.close),
    monthly: apply(tpl.monthly),
    signedBy: work.signedBy,
    reportDate: work.reportDate,
    openTime: work.openTime,
    closeTime: work.closeTime,
  };
}

interface Props {
  mode: "daily" | "monthly";
}

export function ChecklistPage({ mode }: Props) {
  const isDaily = mode === "daily";
  const { t } = useI18n();

  const [outlet, setOutletState] = useState<Outlet>(OUTLETS[0]);
  const [template, setTemplate] = useState<OutletTemplate>(DEFAULT_TEMPLATE);
  const [work, setWork] = useState<LocalWork>(DEFAULT_WORK);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  const data = useMemo(() => projectData(template, work), [template, work]);

  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return (
        "{" +
        keys.map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") +
        "}"
      );
    }
    return JSON.stringify(v);
  };

  const outletRef = useRef<Outlet>(outlet);
  const templateRef = useRef<OutletTemplate>(template);
  const recipientsRef = useRef<string[]>(recipients);
  const lastSyncedTplCanonRef = useRef<string>("");
  const lastSyncedRecCanonRef = useRef<string>("");

  useEffect(() => {
    outletRef.current = outlet;
  }, [outlet]);
  useEffect(() => {
    templateRef.current = template;
  }, [template]);
  useEffect(() => {
    recipientsRef.current = recipients;
  }, [recipients]);

  // Wrap setOutlet to persist locally (per-device) — never to app_state.
  const setOutlet = (o: Outlet) => {
    setOutletState(o);
    try {
      localStorage.setItem(LOCAL_KEY_OUTLET, o);
    } catch {
      /* ignore */
    }
  };

  // Initial load — restore per-device outlet + work from localStorage,
  // shared template + recipients from app_state.
  useEffect(() => {
    let active = true;
    const initialOutlet = readLocalOutlet();
    setOutletState(initialOutlet);
    setWork(readLocalWork(initialOutlet));

    (async () => {
      const { data: rows } = await supabase.from("app_state").select("key,value");
      if (!active || !rows) return;
      const map = new Map(rows.map((r) => [r.key, r.value]));

      // One-time restore: if a template is missing/default, repopulate
      // headings from the latest submitted report.
      const isDefaultTpl = (tpl: OutletTemplate | undefined): boolean => {
        if (!tpl) return true;
        const def = DEFAULT_TEMPLATE();
        const same = (a?: Task[], b?: Task[]) =>
          JSON.stringify((a ?? []).map((x) => x.text)) ===
          JSON.stringify((b ?? []).map((x) => x.text));
        return same(tpl.open, def.open) && same(tpl.close, def.close) && same(tpl.monthly, def.monthly);
      };

      await Promise.all(
        OUTLETS.map(async (o) => {
          const raw = map.get(STATE_KEY_TEMPLATE(o)) as Partial<OutletTemplate> | undefined;
          const tpl: OutletTemplate = {
            open: stripTemplate(raw?.open),
            close: stripTemplate(raw?.close),
            monthly: stripTemplate(raw?.monthly),
          };
          if (tpl.open.length === 0 && tpl.close.length === 0 && tpl.monthly.length === 0) {
            // nothing stored at all — leave defaults
            map.set(STATE_KEY_TEMPLATE(o), DEFAULT_TEMPLATE() as unknown as never);
            return;
          }
          if (!isDefaultTpl(tpl)) {
            map.set(STATE_KEY_TEMPLATE(o), tpl as unknown as never);
            return;
          }
          const { data: report } = await supabase
            .from("checklist_reports")
            .select("open_tasks,close_tasks,monthly_tasks")
            .eq("outlet", o)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!report) {
            map.set(STATE_KEY_TEMPLATE(o), tpl as unknown as never);
            return;
          }
          const restored: OutletTemplate = {
            open: stripTemplate((report.open_tasks ?? []) as unknown as Task[]),
            close: stripTemplate((report.close_tasks ?? []) as unknown as Task[]),
            monthly: stripTemplate((report.monthly_tasks ?? []) as unknown as Task[]),
          };
          map.set(STATE_KEY_TEMPLATE(o), restored as unknown as never);
          await pushState(STATE_KEY_TEMPLATE(o), restored);
        }),
      );
      if (!active) return;

      const tplRaw = map.get(STATE_KEY_TEMPLATE(initialOutlet)) as Partial<OutletTemplate> | undefined;
      const initialTpl: OutletTemplate = {
        open: stripTemplate(tplRaw?.open) ?? DEFAULT_TEMPLATE().open,
        close: stripTemplate(tplRaw?.close) ?? DEFAULT_TEMPLATE().close,
        monthly: stripTemplate(tplRaw?.monthly) ?? DEFAULT_TEMPLATE().monthly,
      };
      if (initialTpl.open.length + initialTpl.close.length + initialTpl.monthly.length === 0) {
        const def = DEFAULT_TEMPLATE();
        setTemplate(def);
        lastSyncedTplCanonRef.current = canon(def);
      } else {
        setTemplate(initialTpl);
        lastSyncedTplCanonRef.current = canon(initialTpl);
      }
      const recs = map.get(STATE_KEY_RECIPIENTS);
      const initialRecs = Array.isArray(recs) ? (recs as string[]) : [];
      setRecipients(initialRecs);
      lastSyncedRecCanonRef.current = canon(initialRecs);
    })();

    // Realtime: only listen for shared template / recipients changes.
    const channel = supabase
      .channel("app_state_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key: string; value: unknown } | null;
          if (!row) return;
          if (row.key === STATE_KEY_RECIPIENTS) {
            const next = Array.isArray(row.value) ? (row.value as string[]) : [];
            const remoteCanon = canon(next);
            if (remoteCanon === lastSyncedRecCanonRef.current) return;
            const localCanon = canon(recipientsRef.current);
            if (localCanon !== lastSyncedRecCanonRef.current) {
              lastSyncedRecCanonRef.current = remoteCanon;
              return;
            }
            setRecipients(next);
            lastSyncedRecCanonRef.current = remoteCanon;
          } else if (row.key.startsWith("outlet:")) {
            const o = row.key.slice("outlet:".length) as Outlet;
            if (o !== outletRef.current) return;
            const raw = (row.value ?? {}) as Partial<OutletTemplate>;
            const remoteTpl: OutletTemplate = {
              open: stripTemplate(raw.open),
              close: stripTemplate(raw.close),
              monthly: stripTemplate(raw.monthly),
            };
            const remoteCanon = canon(remoteTpl);
            if (remoteCanon === lastSyncedTplCanonRef.current) return;
            const localCanon = canon(templateRef.current);
            if (localCanon === lastSyncedTplCanonRef.current) {
              // No local template edits pending — adopt headings as-is. Done
              // checkmarks in `work` are unaffected (keyed by id).
              setTemplate(remoteTpl);
              lastSyncedTplCanonRef.current = remoteCanon;
              return;
            }
            // Local has unpushed template edits — keep them; ack remote.
            lastSyncedTplCanonRef.current = remoteCanon;
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user changes outlet (local-only), load that outlet's template from
  // app_state and that outlet's local work from localStorage.
  const outletInitRef = useRef(true);
  useEffect(() => {
    if (outletInitRef.current) {
      outletInitRef.current = false;
      return;
    }
    setWork(readLocalWork(outlet));
    (async () => {
      const { data: row } = await supabase
        .from("app_state")
        .select("value")
        .eq("key", STATE_KEY_TEMPLATE(outlet))
        .maybeSingle();
      const raw = (row?.value ?? {}) as Partial<OutletTemplate>;
      const tpl: OutletTemplate = {
        open: stripTemplate(raw.open),
        close: stripTemplate(raw.close),
        monthly: stripTemplate(raw.monthly),
      };
      const final =
        tpl.open.length + tpl.close.length + tpl.monthly.length === 0 ? DEFAULT_TEMPLATE() : tpl;
      setTemplate(final);
      lastSyncedTplCanonRef.current = canon(final);
      // mark template push effect as init so it doesn't echo this remote load
      tplInitRef.current = true;
    })();
  }, [outlet]);

  // Persist work to localStorage whenever it changes (per-device).
  useEffect(() => {
    writeLocalWork(outlet, work);
  }, [work, outlet]);

  // Debounced push of TEMPLATE to app_state when the local template changes.
  const tplInitRef = useRef(true);
  useEffect(() => {
    if (tplInitRef.current) {
      tplInitRef.current = false;
      return;
    }
    const key = STATE_KEY_TEMPLATE(outlet);
    const snapshot: OutletTemplate = {
      open: stripTemplate(template.open),
      close: stripTemplate(template.close),
      monthly: stripTemplate(template.monthly),
    };
    const snapshotCanon = canon(snapshot);
    if (snapshotCanon === lastSyncedTplCanonRef.current) return;
    const tm = setTimeout(async () => {
      await pushState(key, snapshot);
      lastSyncedTplCanonRef.current = snapshotCanon;
    }, 350);
    return () => clearTimeout(tm);
  }, [template, outlet]);

  const recInitRef = useRef(true);
  useEffect(() => {
    if (recInitRef.current) {
      recInitRef.current = false;
      return;
    }
    const snapshot = recipients;
    const snapshotCanon = canon(snapshot);
    const tm = setTimeout(async () => {
      await pushState(STATE_KEY_RECIPIENTS, snapshot);
      lastSyncedRecCanonRef.current = snapshotCanon;
    }, 350);
    return () => clearTimeout(tm);
  }, [recipients]);

  // Apply a Task[] update from the UI: split into template (id+text) edits
  // and work (done/remark) edits.
  const applySectionUpdate = (section: "open" | "close" | "monthly", next: Task[]) => {
    setTemplate((prev) => {
      const prevSection = prev[section];
      const sameTemplate =
        prevSection.length === next.length &&
        prevSection.every((p, i) => p.id === next[i]?.id && p.text === next[i]?.text);
      if (sameTemplate) return prev;
      return { ...prev, [section]: next.map((x) => ({ id: x.id, text: x.text, done: false })) };
    });
    setWork((prev) => {
      const done = { ...prev.done };
      const remark = { ...prev.remark };
      const validIds = new Set(next.map((x) => x.id));
      for (const t of next) {
        done[t.id] = !!t.done;
        if (t.remark !== undefined) remark[t.id] = t.remark ?? "";
      }
      // garbage-collect entries for removed tasks in this section
      const oldSection = templateRef.current[section];
      for (const o of oldSection) {
        if (!validIds.has(o.id)) {
          delete done[o.id];
          delete remark[o.id];
        }
      }
      return { ...prev, done, remark };
    });
  };

  const updateMeta = (patch: Partial<Pick<LocalWork, "signedBy" | "reportDate" | "openTime" | "closeTime">>) =>
    setWork((w) => ({ ...w, ...patch }));

  // Compat wrapper for the existing JSX: routes meta-field updates and
  // section (open/close/monthly Task[]) updates to the right reducer.
  const update = (patch: Partial<OutletData>) => {
    if (patch.open) applySectionUpdate("open", patch.open);
    if (patch.close) applySectionUpdate("close", patch.close);
    if (patch.monthly) applySectionUpdate("monthly", patch.monthly);
    const meta: Partial<Pick<LocalWork, "signedBy" | "reportDate" | "openTime" | "closeTime">> = {};
    if (patch.signedBy !== undefined) meta.signedBy = patch.signedBy;
    if (patch.reportDate !== undefined) meta.reportDate = patch.reportDate;
    if (patch.openTime !== undefined) meta.openTime = patch.openTime;
    if (patch.closeTime !== undefined) meta.closeTime = patch.closeTime;
    if (Object.keys(meta).length > 0) updateMeta(meta);
  };

  const dailyAll = useMemo(() => [...data.open, ...data.close], [data.open, data.close]);
  const openP = useMemo(() => pct(data.open), [data.open]);
  const closeP = useMemo(() => pct(data.close), [data.close]);
  const monthlyP = useMemo(() => pct(data.monthly), [data.monthly]);
  const combinedP = useMemo(() => pct([...dailyAll, ...data.monthly]), [dailyAll, data.monthly]);

  const onSubmit = async () => {
    if (!data.signedBy.trim()) return toast.error(t("signBeforeSubmit"));
    setSubmitting(true);
    try {
      // Send ONLY this device's currently-selected outlet data. Concurrent
      // submits from other devices/outlets are independent.
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
      const doneTasks = all.filter((x) => x.done).length;
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
      toast.success(t("submitted", { to: res.recipient }));
      // Clear ONLY this device's local working state for the current outlet.
      // Task headings (template) are shared and remain intact. Other devices'
      // checkboxes/signed-by are unaffected.
      const cleared: LocalWork = { ...DEFAULT_WORK(), reportDate: data.reportDate };
      setWork(cleared);
      writeLocalWork(outlet, cleared);
    } catch (e) {
      console.error(e);
      toast.error(t("sendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <Toaster richColors position="top-center" />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex justify-end mb-2">
          <LangToggle />
        </div>
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-4">
            <Wine className="h-3.5 w-3.5" />
            {t("barOperations")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("barChecklist")}</h1>
        </header>

        <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
          <Label className="text-xs text-muted-foreground">{t("selectOutlet")}</Label>
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
          <p className="mt-2 text-xs text-muted-foreground">{t("separateData")}</p>
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
            {t("daily")}
          </Link>
          <Link
            to="/monthly"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full transition-colors text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            {t("weeklyCleaning")}
          </Link>
          <Link
            to="/reports"
            className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-full transition-colors text-muted-foreground hover:text-foreground"
            activeProps={{
              className:
                "flex-1 text-center text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground",
            }}
          >
            {t("reports")}
          </Link>
        </nav>

        <section className="flex flex-col items-center justify-center mb-8 rounded-3xl border bg-card p-8 shadow-sm">
          <CircularProgress percent={combinedP.percent} />
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">
            {t("completedSummary", { outlet, done: combinedP.done, total: combinedP.total })}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4 w-full max-w-md">
            <div className="flex flex-col items-center">
              <CircularProgress percent={openP.percent} size={84} />
              <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                {t("openShort")} {openP.done}/{openP.total}
              </p>
            </div>
            <div className="flex flex-col items-center">
              <CircularProgress percent={closeP.percent} size={84} />
              <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                {t("closeShort")} {closeP.done}/{closeP.total}
              </p>
            </div>
            <div className="flex flex-col items-center">
              <CircularProgress percent={monthlyP.percent} size={84} />
              <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                {t("weeklyShort")} {monthlyP.done}/{monthlyP.total}
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
                  <Label>{t("outlet")}</Label>
                  <Input value={outlet} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`signedBy-${timeId}`}>{t("signedBy")}</Label>
                  <Input
                    id={`signedBy-${timeId}`}
                    placeholder={t("fullName")}
                    value={data.signedBy}
                    onChange={(e) => update({ signedBy: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`reportDate-${timeId}`}>{t("date")}</Label>
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
                    title={t("openBar")}
                    tasks={data.open}
                    onChange={(open) => update({ open })}
                    variant="open"
                    headerExtra={buildMeta(t("openTime"), "openTime", data.openTime, (v) =>
                      update({ openTime: v }),
                    )}
                  />
                  <ChecklistSection
                    title={t("closeBar")}
                    tasks={data.close}
                    onChange={(close) => update({ close })}
                    variant="close"
                    headerExtra={buildMeta(t("closeTime"), "closeTime", data.closeTime, (v) =>
                      update({ closeTime: v }),
                    )}
                  />
                </>
              );
            }
            return (
              <>
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("outlet")}</Label>
                      <Input value={outlet} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signedBy-m">{t("signedBy")}</Label>
                      <Input
                        id="signedBy-m"
                        placeholder={t("fullName")}
                        value={data.signedBy}
                        onChange={(e) => update({ signedBy: e.target.value })}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reportDate-m">{t("date")}</Label>
                      <Input
                        id="reportDate-m"
                        type="date"
                        value={data.reportDate}
                        onChange={(e) => update({ reportDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cleanTime-m">{t("time")}</Label>
                      <Input
                        id="cleanTime-m"
                        type="time"
                        value={data.openTime}
                        onChange={(e) => update({ openTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <ChecklistSection
                  title={t("weeklyCleaning")}
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
            {submitting ? t("sending") : t("submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-2">
            {recipients.length > 0
              ? t(recipients.length > 1 ? "emailedToPlural" : "emailedTo", { n: recipients.length })
              : t("emailedToDefault")}
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
  const { t } = useI18n();
  const { requirePassword, changePassword } = usePasswords();
  const [editMode, setEditMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

  const enableEdit = () => {
    if (!requirePassword("edit", "enterToEditEmails")) return;
    setEditMode(true);
  };

  const exitEdit = () => {
    setEditMode(false);
    setEditingIdx(null);
  };

  const add = () => {
    const e = newEmail.trim();
    if (!isEmail(e)) return toast.error(t("invalidEmail"));
    if (recipients.length >= 5) return toast.error(t("max5"));
    if (recipients.includes(e)) return toast.error(t("alreadyAdded"));
    setRecipients([...recipients, e]);
    setNewEmail("");
  };

  const remove = (i: number) => {
    setRecipients(recipients.filter((_, idx) => idx !== i));
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditValue(recipients[i]);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const e = editValue.trim();
    if (!isEmail(e)) return toast.error(t("invalidEmail"));
    setRecipients(recipients.map((r, idx) => (idx === editingIdx ? e : r)));
    setEditingIdx(null);
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">{t("recipientEmails")}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {recipients.length}/5
        </span>
        <div className="ml-auto flex items-center gap-2">
          {editMode ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changePassword("edit")}
              >
                <KeyRound className="h-4 w-4 mr-1" />
                {t("password")}
              </Button>
              <Button size="sm" variant="secondary" onClick={exitEdit}>
                <Check className="h-4 w-4 mr-1" />
                {t("done")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={enableEdit}>
              <Settings2 className="h-4 w-4 mr-1" />
              {t("edit")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{t("upTo5")}</p>

      <ul className="space-y-2 mb-3">
        {recipients.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-3">
            {t("noRecipients")}
          </li>
        )}
        {recipients.map((r, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
          >
            {editMode && editingIdx === i ? (
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
                {editMode && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(i)}
                      aria-label={t("editAria")}
                      className="shrink-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(i)}
                      aria-label={t("removeAria")}
                      className="shrink-0 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {editMode && recipients.length < 5 && (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={255}
          />
          <Button size="icon" onClick={add} aria-label={t("addEmail")}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
