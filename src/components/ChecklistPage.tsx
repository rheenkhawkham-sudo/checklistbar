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

const STATE_KEY_OUTLET = (o: Outlet) => `outlet:${o}`;
const STATE_KEY_RECIPIENTS = "recipients";
const STATE_KEY_CURRENT = "currentOutlet";

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

interface Props {
  mode: "daily" | "monthly";
}

export function ChecklistPage({ mode }: Props) {
  const isDaily = mode === "daily";
  const { t } = useI18n();

  const [outlet, setOutlet] = useState<Outlet>(OUTLETS[0]);
  const [data, setData] = useState<OutletData>(DEFAULT_DATA);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const send = useServerFn(sendChecklistEmail);

  // Canonical JSON (sorted keys) — jsonb roundtrips don't preserve key order,
  // so naive stringify comparisons mis-detect "remote vs local" and overwrite
  // optimistic UI updates (e.g. a checkbox tick disappearing).
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

  const dataRef = useRef<OutletData>(data);
  const outletRef = useRef<Outlet>(outlet);
  const recipientsRef = useRef<string[]>(recipients);
  const pendingDataPushRef = useRef(false);
  const pendingRecPushRef = useRef(false);
  // Canon of last value we either successfully pushed OR adopted from remote
  // for the currently-selected outlet. Used to detect "is local ahead of
  // remote?" so realtime echoes don't clobber in-flight user edits.
  const lastSyncedDataCanonRef = useRef<string>("");
  const lastSyncedRecCanonRef = useRef<string>("");

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    outletRef.current = outlet;
  }, [outlet]);
  useEffect(() => {
    recipientsRef.current = recipients;
  }, [recipients]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: rows } = await supabase.from("app_state").select("key,value");
      if (!active || !rows) return;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const cur = (map.get(STATE_KEY_CURRENT) as Outlet | undefined) ?? OUTLETS[0];
      const validCur = (OUTLETS as readonly string[]).includes(cur) ? cur : OUTLETS[0];
      setOutlet(validCur);

      // One-time restore: if an outlet's app_state has the bare defaults
      // (e.g. was wiped by a previous submit), repopulate task headings
      // from its most recent submitted report so user-added tasks return.
      const isDefaultTaskSet = (od: Partial<OutletData> | undefined): boolean => {
        if (!od) return true;
        const def = DEFAULT_DATA();
        const same = (a?: Task[], b?: Task[]) =>
          JSON.stringify((a ?? []).map((x) => x.text)) ===
          JSON.stringify((b ?? []).map((x) => x.text));
        return (
          same(od.open, def.open) &&
          same(od.close, def.close) &&
          same(od.monthly, def.monthly)
        );
      };
      const resetDone = (arr: Task[]): Task[] =>
        (arr ?? []).map((x) => ({ ...x, done: false, remark: "" }));

      await Promise.all(
        OUTLETS.map(async (o) => {
          const od = map.get(STATE_KEY_OUTLET(o)) as Partial<OutletData> | undefined;
          if (!isDefaultTaskSet(od)) return;
          const { data: report } = await supabase
            .from("checklist_reports")
            .select("open_tasks,close_tasks,monthly_tasks")
            .eq("outlet", o)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!report) return;
          const restored: OutletData = {
            ...DEFAULT_DATA(),
            ...(od ?? {}),
            open: resetDone((report.open_tasks ?? []) as unknown as Task[]),
            close: resetDone((report.close_tasks ?? []) as unknown as Task[]),
            monthly: resetDone((report.monthly_tasks ?? []) as unknown as Task[]),
          };
          map.set(STATE_KEY_OUTLET(o), restored as unknown as never);
          await pushState(STATE_KEY_OUTLET(o), restored);
        }),
      );
      if (!active) return;

      const od = map.get(STATE_KEY_OUTLET(validCur)) as Partial<OutletData> | undefined;
      const initialData = { ...DEFAULT_DATA(), ...(od ?? {}) };
      setData(initialData);
      lastSyncedDataCanonRef.current = canon(initialData);
      const recs = map.get(STATE_KEY_RECIPIENTS);
      const initialRecs = Array.isArray(recs) ? (recs as string[]) : [];
      setRecipients(initialRecs);
      lastSyncedRecCanonRef.current = canon(initialRecs);
    })();

    const channel = supabase
      .channel("app_state_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key: string; value: unknown } | null;
          if (!row) return;
          if (row.key === STATE_KEY_CURRENT) {
            const v = row.value as Outlet;
            if ((OUTLETS as readonly string[]).includes(v) && v !== outletRef.current) {
              setOutlet(v);
            }
          } else if (row.key === STATE_KEY_RECIPIENTS) {
            const next = Array.isArray(row.value) ? (row.value as string[]) : [];
            const remoteCanon = canon(next);
            if (remoteCanon === lastSyncedRecCanonRef.current) return; // echo
            const localCanon = canon(recipientsRef.current);
            if (localCanon !== lastSyncedRecCanonRef.current) {
              // local has unpushed edits — keep them, but ack we've seen remote
              lastSyncedRecCanonRef.current = remoteCanon;
              return;
            }
            setRecipients(next);
            lastSyncedRecCanonRef.current = remoteCanon;
          } else if (row.key.startsWith("outlet:")) {
            const o = row.key.slice("outlet:".length) as Outlet;
            if (o !== outletRef.current) return;
            const merged = { ...DEFAULT_DATA(), ...((row.value ?? {}) as Partial<OutletData>) };
            const remoteCanon = canon(merged);
            if (remoteCanon === lastSyncedDataCanonRef.current) return; // echo
            const localCanon = canon(dataRef.current);
            if (localCanon !== lastSyncedDataCanonRef.current) {
              // user is in the middle of typing/ticking — local wins, our
              // pending push will overwrite remote shortly.
              lastSyncedDataCanonRef.current = remoteCanon;
              return;
            }
            setData(merged);
            lastSyncedDataCanonRef.current = remoteCanon;
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const outletInitRef = useRef(true);
  useEffect(() => {
    if (outletInitRef.current) {
      outletInitRef.current = false;
      return;
    }
    pushState(STATE_KEY_CURRENT, outlet);
    (async () => {
      const { data: row } = await supabase
        .from("app_state")
        .select("value")
        .eq("key", STATE_KEY_OUTLET(outlet))
        .maybeSingle();
      const next = { ...DEFAULT_DATA(), ...((row?.value ?? {}) as Partial<OutletData>) };
      setData(next);
      lastSyncedDataCanonRef.current = canon(next);
    })();
  }, [outlet]);

  const dataInitRef = useRef(true);
  useEffect(() => {
    if (dataInitRef.current) {
      dataInitRef.current = false;
      return;
    }
    const key = STATE_KEY_OUTLET(outlet);
    const snapshot = data;
    const snapshotCanon = canon(snapshot);
    // Local is ahead until our push lands; this guards realtime echoes.
    pendingDataPushRef.current = true;
    const tm = setTimeout(async () => {
      try {
        await pushState(key, snapshot);
        lastSyncedDataCanonRef.current = snapshotCanon;
      } finally {
        pendingDataPushRef.current = false;
      }
    }, 350);
    return () => clearTimeout(tm);
  }, [data, outlet]);

  const recInitRef = useRef(true);
  useEffect(() => {
    if (recInitRef.current) {
      recInitRef.current = false;
      return;
    }
    const snapshot = recipients;
    const snapshotCanon = canon(snapshot);
    pendingRecPushRef.current = true;
    const tm = setTimeout(async () => {
      try {
        await pushState(STATE_KEY_RECIPIENTS, snapshot);
        lastSyncedRecCanonRef.current = snapshotCanon;
      } finally {
        pendingRecPushRef.current = false;
      }
    }, 350);
    return () => clearTimeout(tm);
  }, [recipients]);

  const update = (patch: Partial<OutletData>) => setData((d) => ({ ...d, ...patch }));

  const dailyAll = useMemo(() => [...data.open, ...data.close], [data.open, data.close]);
  const openP = useMemo(() => pct(data.open), [data.open]);
  const closeP = useMemo(() => pct(data.close), [data.close]);
  const monthlyP = useMemo(() => pct(data.monthly), [data.monthly]);
  const combinedP = useMemo(() => pct([...dailyAll, ...data.monthly]), [dailyAll, data.monthly]);

  const onSubmit = async () => {
    if (!data.signedBy.trim()) return toast.error(t("signBeforeSubmit"));
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
      // Reset only the "done" checkmarks for EVERY outlet — keep all
      // user-added/edited task headings intact for the next round.
      const resetTasks = (arr: Task[]): Task[] =>
        arr.map((x) => ({ ...x, done: false }));
      pendingDataPushRef.current = true;
      try {
        const { data: rows } = await supabase
          .from("app_state")
          .select("key,value")
          .in(
            "key",
            OUTLETS.map((o) => STATE_KEY_OUTLET(o)),
          );
        const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
        await Promise.all(
          OUTLETS.map((o) => {
            const cur = {
              ...DEFAULT_DATA(),
              ...((map.get(STATE_KEY_OUTLET(o)) ?? {}) as Partial<OutletData>),
            };
            const cleared: OutletData = {
              ...cur,
              open: resetTasks(cur.open),
              close: resetTasks(cur.close),
              monthly: resetTasks(cur.monthly),
            };
            if (o === outlet) setData(cleared);
            return pushState(STATE_KEY_OUTLET(o), cleared);
          }),
        );
      } finally {
        pendingDataPushRef.current = false;
      }
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
