import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Mail, Plus, Trash2, Pencil, Check, X, Settings2, KeyRound } from "lucide-react";
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
import { RiuLogo } from "@/components/RiuLogo";
import { sendChecklistEmail } from "@/lib/email.functions";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_OUTLETS: string[] = [
  "Beach Bar",
  "Pakarang Bar",
  "Pool Bar",
  "Family Pool Bar",
  "Outlet 5",
  "Outlet 6",
  "Outlet 7",
];
type Outlet = string;
const DEFAULT_OUTLET_NAMES: Record<Outlet, string> = Object.fromEntries(
  DEFAULT_OUTLETS.map((o) => [o, o]),
) as Record<Outlet, string>;

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
const STATE_KEY_OUTLET_NAMES = "outlet_names"; // shared display names
const STATE_KEY_OUTLET_IDS = "outlet_ids"; // shared outlet list

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
// Fallback used when an outlet was just added and has no template yet.
const EMPTY_TEMPLATE: OutletTemplate = DEFAULT_TEMPLATE();
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
  if (typeof window === "undefined") return DEFAULT_OUTLETS[0];
  try {
    const v = localStorage.getItem(LOCAL_KEY_OUTLET);
    return v && v.trim() ? v : DEFAULT_OUTLETS[0];
  } catch {
    return DEFAULT_OUTLETS[0];
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

  const [outlet, setOutletState] = useState<Outlet>(DEFAULT_OUTLETS[0]);
  const [outletIds, setOutletIds] = useState<string[]>(() => [...DEFAULT_OUTLETS]);
  const [templates, setTemplates] = useState<Record<Outlet, OutletTemplate>>(
    () => Object.fromEntries(DEFAULT_OUTLETS.map((o) => [o, DEFAULT_TEMPLATE()])) as Record<Outlet, OutletTemplate>,
  );
  const template = templates[outlet] ?? EMPTY_TEMPLATE;
  const setTemplate = (updater: OutletTemplate | ((prev: OutletTemplate) => OutletTemplate)) => {
    setTemplates((prev) => {
      const cur = prev[outletRef.current] ?? DEFAULT_TEMPLATE();
      const next = typeof updater === "function" ? (updater as (p: OutletTemplate) => OutletTemplate)(cur) : updater;
      if (next === cur) return prev;
      return { ...prev, [outletRef.current]: next };
    });
  };
  const [work, setWork] = useState<LocalWork>(DEFAULT_WORK);
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    );
  }, []);
  const [dailySection, setDailySectionState] = useState<"open" | "close">("open");
  useEffect(() => {
    try {
      const v = localStorage.getItem("checklist:dailySection");
      if (v === "open" || v === "close") setDailySectionState(v);
    } catch {
      /* ignore */
    }
  }, []);
  const setDailySection = (s: "open" | "close") => {
    setDailySectionState(s);
    try {
      localStorage.setItem("checklist:dailySection", s);
    } catch {
      /* ignore */
    }
  };
  const [recipients, setRecipients] = useState<string[]>([]);
  const [outletNames, setOutletNames] = useState<Record<Outlet, string>>(DEFAULT_OUTLET_NAMES);
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
  const templatesRef = useRef<Record<Outlet, OutletTemplate>>(templates);
  const recipientsRef = useRef<string[]>(recipients);
  const lastSyncedTplCanonRef = useRef<Record<Outlet, string>>(
    Object.fromEntries(DEFAULT_OUTLETS.map((o) => [o, ""])) as Record<Outlet, string>,
  );
  const outletIdsRef = useRef<string[]>(outletIds);
  const lastSyncedIdsCanonRef = useRef<string>("");
  const lastSyncedRecCanonRef = useRef<string>("");
  const outletNamesRef = useRef<Record<Outlet, string>>(outletNames);
  const lastSyncedNamesCanonRef = useRef<string>("");


  useEffect(() => {
    outletRef.current = outlet;
  }, [outlet]);
  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);
  useEffect(() => {
    recipientsRef.current = recipients;
  }, [recipients]);
  useEffect(() => {
    outletNamesRef.current = outletNames;
  }, [outletNames]);
  useEffect(() => {
    outletIdsRef.current = outletIds;
  }, [outletIds]);


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

      const rawIds = map.get(STATE_KEY_OUTLET_IDS);
      const ids: string[] =
        Array.isArray(rawIds) && rawIds.length > 0
          ? (rawIds as string[]).filter((x) => typeof x === "string")
          : [...DEFAULT_OUTLETS];
      setOutletIds(ids);
      lastSyncedIdsCanonRef.current = canon(ids);
      if (!ids.includes(initialOutlet)) setOutlet(ids[0]);

      const loaded: Record<Outlet, OutletTemplate> = Object.fromEntries(
        ids.map((o) => [o, DEFAULT_TEMPLATE()]),
      ) as Record<Outlet, OutletTemplate>;

      const today = new Date().toISOString().slice(0, 10);
      // Union two task lists by id (fallback text), preserving the order of
      // `primary` first then appending any extras from `extra` that are not
      // already represented. This guarantees that tasks added/edited today on
      // ANY device come back for every outlet on next load.
      const unionTasks = (primary: Task[], extra: Task[]): Task[] => {
        const seen = new Set<string>();
        const keyOf = (t: Task) => `${t.id}::${(t.text ?? "").trim().toLowerCase()}`;
        const out: Task[] = [];
        for (const t of primary) {
          const k = keyOf(t);
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ id: t.id, text: t.text, done: false });
        }
        // also block duplicates by id alone or text alone
        const idSet = new Set(out.map((x) => x.id));
        const textSet = new Set(out.map((x) => (x.text ?? "").trim().toLowerCase()));
        for (const t of extra) {
          const txt = (t.text ?? "").trim().toLowerCase();
          if (idSet.has(t.id) || textSet.has(txt)) continue;
          idSet.add(t.id);
          textSet.add(txt);
          out.push({ id: t.id, text: t.text, done: false });
        }
        return out;
      };

      const savedNames = map.get(STATE_KEY_OUTLET_NAMES) as Record<string, string> | undefined;

      await Promise.all(
        ids.map(async (o) => {
          const raw = map.get(STATE_KEY_TEMPLATE(o)) as Partial<OutletTemplate> | undefined;
          const tpl: OutletTemplate = {
            open: stripTemplate(raw?.open),
            close: stripTemplate(raw?.close),
            monthly: stripTemplate(raw?.monthly),
          };
          const storedCount = tpl.open.length + tpl.close.length + tpl.monthly.length;

          // Pull the latest report AND today's reports (could be multiple
          // submits today) so we can recover any task added/edited today.
          const reportNames = Array.from(
            new Set([o, savedNames?.[o]].filter((name): name is string => typeof name === "string" && name.trim().length > 0)),
          );
          const [{ data: latest }, { data: todayRows }] = await Promise.all([
            supabase
              .from("checklist_reports")
              .select("open_tasks,close_tasks,monthly_tasks")
              .in("outlet", reportNames)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("checklist_reports")
              .select("open_tasks,close_tasks,monthly_tasks,created_at")
              .in("outlet", reportNames)
              .eq("report_date", today)
              .order("created_at", { ascending: false }),
          ]);

          const toTpl = (r: { open_tasks: unknown; close_tasks: unknown; monthly_tasks: unknown } | null): OutletTemplate | null =>
            r
              ? {
                  open: stripTemplate((r.open_tasks ?? []) as unknown as Task[]),
                  close: stripTemplate((r.close_tasks ?? []) as unknown as Task[]),
                  monthly: stripTemplate((r.monthly_tasks ?? []) as unknown as Task[]),
                }
              : null;

          const latestTpl = toTpl(latest as never);
          const todayTpls: OutletTemplate[] = (todayRows ?? [])
            .map((r) => toTpl(r as never))
            .filter((x): x is OutletTemplate => !!x);

          // Pick the strongest base: stored (if non-default), else latest report, else default.
          let base: OutletTemplate;
          if (storedCount > 0 && !isDefaultTpl(tpl)) {
            base = tpl;
          } else if (latestTpl && latestTpl.open.length + latestTpl.close.length + latestTpl.monthly.length > 0) {
            base = latestTpl;
          } else {
            base = DEFAULT_TEMPLATE();
          }

          // Merge in any task headings from today's reports that aren't
          // already in the base — these are today's adds/edits that may
          // have been lost from app_state.
          let merged: OutletTemplate = base;
          for (const r of todayTpls) {
            merged = {
              open: unionTasks(merged.open, r.open),
              close: unionTasks(merged.close, r.close),
              monthly: unionTasks(merged.monthly, r.monthly),
            };
          }
          // Also union with the latest report if base wasn't latest.
          if (latestTpl && base !== latestTpl) {
            merged = {
              open: unionTasks(merged.open, latestTpl.open),
              close: unionTasks(merged.close, latestTpl.close),
              monthly: unionTasks(merged.monthly, latestTpl.monthly),
            };
          }

          // If we ended up enriching the stored template, push it back so
          // every device sees the recovered list.
          if (canon(merged) !== canon(tpl)) {
            await pushState(STATE_KEY_TEMPLATE(o), merged);
          }
          loaded[o] = merged;
        }),
      );
      if (!active) return;

      setTemplates(loaded);
      for (const o of ids) {
        lastSyncedTplCanonRef.current[o] = canon(loaded[o]);
      }
      const recs = map.get(STATE_KEY_RECIPIENTS);
      const initialRecs = Array.isArray(recs) ? (recs as string[]) : [];
      setRecipients(initialRecs);
      lastSyncedRecCanonRef.current = canon(initialRecs);

      const rawNames = map.get(STATE_KEY_OUTLET_NAMES) as Record<string, string> | undefined;
      const initialNames: Record<Outlet, string> = {};
      for (const o of ids) {
        const n = rawNames?.[o];
        initialNames[o] = typeof n === "string" && n.trim() ? n : (DEFAULT_OUTLET_NAMES[o] ?? o);
      }
      setOutletNames(initialNames);
      lastSyncedNamesCanonRef.current = canon(initialNames);
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
          if (row.key === STATE_KEY_OUTLET_IDS) {
            const ids = Array.isArray(row.value) ? (row.value as string[]).filter((x) => typeof x === "string") : [];
            if (ids.length === 0) return;
            const remoteCanon = canon(ids);
            if (remoteCanon === lastSyncedIdsCanonRef.current) return;
            if (canon(outletIdsRef.current) !== lastSyncedIdsCanonRef.current) {
              lastSyncedIdsCanonRef.current = remoteCanon;
              return;
            }
            setOutletIds(ids);
            lastSyncedIdsCanonRef.current = remoteCanon;
            return;
          }
          if (row.key === STATE_KEY_OUTLET_NAMES) {
            const raw = (row.value ?? {}) as Record<string, string>;
            const next: Record<Outlet, string> = {};
            for (const o of outletIdsRef.current) {
              const n = raw?.[o];
              next[o] = typeof n === "string" && n.trim() ? n : (outletNamesRef.current[o] ?? o);
            }
            const remoteCanon = canon(next);
            if (remoteCanon === lastSyncedNamesCanonRef.current) return;
            const localCanon = canon(outletNamesRef.current);
            if (localCanon !== lastSyncedNamesCanonRef.current) {
              lastSyncedNamesCanonRef.current = remoteCanon;
              return;
            }
            setOutletNames(next);
            lastSyncedNamesCanonRef.current = remoteCanon;
            return;
          }
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
            if (!outletIdsRef.current.includes(o)) return;
            const raw = (row.value ?? {}) as Partial<OutletTemplate>;
            const remoteTpl: OutletTemplate = {
              open: stripTemplate(raw.open),
              close: stripTemplate(raw.close),
              monthly: stripTemplate(raw.monthly),
            };
            const remoteCanon = canon(remoteTpl);
            if (remoteCanon === lastSyncedTplCanonRef.current[o]) return;
            const localTpl = templatesRef.current[o] ?? DEFAULT_TEMPLATE();
            const localCanon = canon(localTpl);
            if (localCanon === lastSyncedTplCanonRef.current[o]) {
              // No local edits pending for this outlet — adopt remote.
              setTemplates((prev) => ({ ...prev, [o]: remoteTpl }));
              lastSyncedTplCanonRef.current[o] = remoteCanon;
              return;
            }
            const countTasks = (tpl: OutletTemplate) =>
              tpl.open.length + tpl.close.length + tpl.monthly.length;
            if (countTasks(remoteTpl) > countTasks(localTpl)) {
              // A database recovery can arrive while an older tab still has
              // an incomplete template in memory. Always accept the more
              // complete copy so that stale tabs cannot erase restored tasks.
              setTemplates((prev) => ({ ...prev, [o]: remoteTpl }));
              lastSyncedTplCanonRef.current[o] = remoteCanon;
              return;
            }
            // Local has unpushed edits — keep them; ack remote so our next
            // push doesn't get suppressed.
            lastSyncedTplCanonRef.current[o] = remoteCanon;
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

  // When user changes outlet (local-only), just reload work from localStorage.
  // Templates for all outlets are kept in memory and synced via realtime, so
  // we never have to re-fetch them from app_state on outlet switch.
  const outletInitRef = useRef(true);
  useEffect(() => {
    if (outletInitRef.current) {
      outletInitRef.current = false;
      return;
    }
    setWork(readLocalWork(outlet));
  }, [outlet]);

  // Persist work to localStorage whenever it changes (per-device).
  useEffect(() => {
    writeLocalWork(outlet, work);
  }, [work, outlet]);

  // Debounced push of TEMPLATE per outlet to app_state. We diff each outlet
  // independently against its own lastSynced canon so editing one outlet
  // never pushes its tasks under another outlet's key (the previous bug).
  const tplInitRef = useRef(true);
  useEffect(() => {
    if (tplInitRef.current) {
      tplInitRef.current = false;
      return;
    }
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (const o of Object.keys(templates)) {
      const snapshot: OutletTemplate = {
        open: stripTemplate(templates[o].open),
        close: stripTemplate(templates[o].close),
        monthly: stripTemplate(templates[o].monthly),
      };
      const snapshotCanon = canon(snapshot);
      if (snapshotCanon === lastSyncedTplCanonRef.current[o]) continue;
      const key = STATE_KEY_TEMPLATE(o);
      const tm = setTimeout(async () => {
        await pushState(key, snapshot);
        lastSyncedTplCanonRef.current[o] = snapshotCanon;
      }, 350);
      timers.push(tm);
    }
    return () => {
      for (const tm of timers) clearTimeout(tm);
    };
  }, [templates]);

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

  const idsInitRef = useRef(true);
  useEffect(() => {
    if (idsInitRef.current) {
      idsInitRef.current = false;
      return;
    }
    const snapshot = outletIds;
    const snapshotCanon = canon(snapshot);
    if (snapshotCanon === lastSyncedIdsCanonRef.current) return;
    const tm = setTimeout(async () => {
      await pushState(STATE_KEY_OUTLET_IDS, snapshot);
      lastSyncedIdsCanonRef.current = snapshotCanon;
    }, 350);
    return () => clearTimeout(tm);
  }, [outletIds]);

  const namesInitRef = useRef(true);
  useEffect(() => {
    if (namesInitRef.current) {
      namesInitRef.current = false;
      return;
    }
    const snapshot = outletNames;
    const snapshotCanon = canon(snapshot);
    if (snapshotCanon === lastSyncedNamesCanonRef.current) return;
    const tm = setTimeout(async () => {
      await pushState(STATE_KEY_OUTLET_NAMES, snapshot);
      lastSyncedNamesCanonRef.current = snapshotCanon;
    }, 350);
    return () => clearTimeout(tm);
  }, [outletNames]);

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
      const oldSection = templatesRef.current[outletRef.current][section];
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
      const outletLabel = outletNames[outlet] || outlet;
      // Only the section the user is currently working on is reported.
      const submitMode: "open" | "close" | "monthly" = isDaily ? dailySection : "monthly";
      const openScoped = submitMode === "open" ? data.open : [];
      const closeScoped = submitMode === "close" ? data.close : [];
      const monthlyScoped = submitMode === "monthly" ? data.monthly : [];
      const res = await send({
        data: {
          outlet: outletLabel,
          signedBy: data.signedBy,
          reportDate: data.reportDate,
          openTime: submitMode === "close" ? "" : data.openTime,
          closeTime: submitMode === "close" ? data.closeTime : "",
          mode: submitMode,
          open: openScoped,
          close: closeScoped,
          daily: [],
          monthly: monthlyScoped,
          recipients,
        },
      });
      const all = [...openScoped, ...closeScoped, ...monthlyScoped];
      const totalTasks = all.length;
      const doneTasks = all.filter((x) => x.done).length;
      const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
      const { error: dbErr } = await supabase.from("checklist_reports").insert({
        report_date: data.reportDate,
        outlet: outletLabel,
        signed_by: data.signedBy,
        open_time: submitMode === "close" ? "" : data.openTime,
        close_time: submitMode === "close" ? data.closeTime : "",
        open_tasks: JSON.parse(JSON.stringify(openScoped)),
        close_tasks: JSON.parse(JSON.stringify(closeScoped)),
        monthly_tasks: JSON.parse(JSON.stringify(monthlyScoped)),
        total_tasks: totalTasks,
        done_tasks: doneTasks,
        percent,
      });
      if (dbErr) console.error("Failed to save report history", dbErr);
      toast.success(t("submitted", { to: res.recipient }));
      // Clear ONLY the submitted section's ticks/remarks for this device.
      const submittedIds = new Set(all.map((x) => x.id));
      setWork((prev) => {
        const done = { ...prev.done };
        const remark = { ...prev.remark };
        for (const id of submittedIds) {
          delete done[id];
          delete remark[id];
        }
        const next: LocalWork = {
          ...prev,
          done,
          remark,
          signedBy: "",
          openTime: submitMode === "close" ? prev.openTime : "",
          closeTime: submitMode === "close" ? "" : prev.closeTime,
        };
        writeLocalWork(outlet, next);
        return next;
      });
    } catch (e) {
      console.error(e);
      toast.error(t("sendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 pb-32">
        <div className="flex justify-end mb-2">
          <LangToggle />
        </div>
        <header className="text-center mb-6">
          <RiuLogo />
          <div className="mt-5 text-xs font-semibold uppercase tracking-widest text-primary">
            {t("barOperations")}
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{t("barChecklist")}</h1>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{todayLabel}</p>
        </header>

        <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{t("selectOutlet")}</Label>
            <OutletNamesEditor
              outletIds={outletIds}
              setOutletIds={setOutletIds}
              outletNames={outletNames}
              setOutletNames={setOutletNames}
            />
          </div>
          <Select value={outlet} onValueChange={(v) => setOutlet(v)}>
            <SelectTrigger className="mt-2 h-12 text-base font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {outletIds.map((o) => (
                <SelectItem key={o} value={o} className="text-base">
                  {outletNames[o] || o}
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
            {t("completedSummary", { outlet: outletNames[outlet] || outlet, done: combinedP.done, total: combinedP.total })}
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

        {isDaily && (
          <div className="sticky top-3 z-20 mb-6 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/80 p-1.5 shadow-xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => setDailySection("open")}
                aria-pressed={dailySection === "open"}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  dailySection === "open"
                    ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("openBar")}
              </button>
              <button
                type="button"
                onClick={() => setDailySection("close")}
                aria-pressed={dailySection === "close"}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  dailySection === "close"
                    ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("closeBar")}
              </button>
            </div>
          </div>
        )}

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
                  <Input value={outletNames[outlet] || outlet} disabled />
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
              return dailySection === "open" ? (
                <ChecklistSection
                  title={t("openBar")}
                  tasks={data.open}
                  onChange={(open) => update({ open })}
                  variant="open"
                  headerExtra={buildMeta(t("openTime"), "openTime", data.openTime, (v) =>
                    update({ openTime: v }),
                  )}
                />
              ) : (
                <ChecklistSection
                  title={t("closeBar")}
                  tasks={data.close}
                  onChange={(close) => update({ close })}
                  variant="close"
                  headerExtra={buildMeta(t("closeTime"), "closeTime", data.closeTime, (v) =>
                    update({ closeTime: v }),
                  )}
                />
              );
            }
            return (
              <>
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("outlet")}</Label>
                      <Input value={outletNames[outlet] || outlet} disabled />
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

      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Button
            size="lg"
            className="w-full h-14 text-base shadow-lg"
            onClick={onSubmit}
            disabled={submitting}
          >
            <Send className="mr-2 h-5 w-5" />
            {submitting ? t("sending") : t("submit")}
            {isDaily ? ` — ${dailySection === "open" ? t("openBar") : t("closeBar")}` : ""}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-1.5">
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

function OutletNamesEditor({
  outletIds,
  setOutletIds,
  outletNames,
  setOutletNames,
}: {
  outletIds: string[];
  setOutletIds: (ids: string[]) => void;
  outletNames: Record<Outlet, string>;
  setOutletNames: (n: Record<Outlet, string>) => void;
}) {
  const { t } = useI18n();
  const { requirePassword } = usePasswords();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(outletIds);
  const [draft, setDraft] = useState<Record<Outlet, string>>(outletNames);
  const [newName, setNewName] = useState("");

  const start = () => {
    if (!requirePassword("edit", "enterToEditOutlets")) return;
    setIds([...outletIds]);
    setDraft({ ...outletNames });
    setNewName("");
    setOpen(true);
  };

  const addOutlet = () => {
    const label = newName.trim();
    if (!label) return toast.error(t("outletNameEmpty"));
    const id = `outlet-${Date.now().toString(36)}`;
    setIds((prev) => [...prev, id]);
    setDraft((d) => ({ ...d, [id]: label }));
    setNewName("");
  };

  const removeOutlet = (id: string) => {
    if (ids.length <= 1) return toast.error(t("outletMinOne"));
    if (!window.confirm(t("deleteOutletConfirm", { name: draft[id] || id }))) return;
    setIds((prev) => prev.filter((x) => x !== id));
  };

  const save = () => {
    const next: Record<Outlet, string> = {};
    for (const o of ids) {
      const v = (draft[o] ?? "").trim();
      if (!v) return toast.error(t("outletNameEmpty"));
      next[o] = v;
    }
    setOutletNames(next);
    setOutletIds(ids);
    setOpen(false);
    toast.success(t("outletNamesSaved"));
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={start} className="h-8 gap-1">
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">{t("editOutletNames")}</span>
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{t("manageOutlets")}</h3>
            <div className="space-y-2 max-h-[55vh] overflow-auto">
              {ids.map((o) => (
                <div key={o} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">{o}</Label>
                    <Input
                      value={draft[o] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [o]: e.target.value }))}
                      maxLength={60}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive shrink-0"
                    onClick={() => removeOutlet(o)}
                    aria-label={t("removeAria")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                placeholder={t("newOutletName")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addOutlet()}
                maxLength={60}
              />
              <Button size="icon" onClick={addOutlet} aria-label={t("addOutlet")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={save}>
                <Check className="h-4 w-4 mr-1" />
                {t("save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

