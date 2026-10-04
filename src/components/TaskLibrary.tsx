import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/components/ChecklistSection";

type Field = "open" | "afternoon" | "night" | "close" | "monthly";
export type LibTemplate = Record<Field, Task[]>;
export type Category = "job" | "close" | "weekly";

const SHIFT_FIELDS: { key: Field; label: "morning" | "afternoon" | "night" }[] = [
  { key: "open", label: "morning" },
  { key: "afternoon", label: "afternoon" },
  { key: "night", label: "night" },
];
const MAX_TASKS = 50;

interface Row {
  key: string; // normalized text
  text: string;
  outlets: Set<string>;
  shifts: Set<Field>;
}

const norm = (s: string) => s.trim().toLowerCase();

interface Props {
  outletIds: string[];
  outletNames: Record<string, string>;
  templates: Record<string, LibTemplate>;
  setTemplates: (next: Record<string, LibTemplate>) => void;
}

export function TaskLibrary({ outletIds, outletNames, templates, setTemplates }: Props) {
  const { t, tTask } = useI18n();
  const [cat, setCat] = useState<Category>("job");
  const fields: Field[] = cat === "job" ? ["open", "afternoon", "night"] : cat === "close" ? ["close"] : ["monthly"];

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const o of outletIds) {
      const tpl = templates[o];
      if (!tpl) continue;
      for (const f of fields) {
        for (const task of tpl[f] ?? []) {
          const k = norm(task.text);
          if (!k) continue;
          let r = map.get(k);
          if (!r) {
            r = { key: k, text: task.text, outlets: new Set(), shifts: new Set() };
            map.set(k, r);
          }
          r.outlets.add(o);
          r.shifts.add(f);
        }
      }
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, outletIds, cat]);

  // Rebuild every outlet/field list from the library rows (keeps existing ids
  // so device-local ticks/remarks survive).
  const commit = (nextRows: Row[]) => {
    const next: Record<string, LibTemplate> = { ...templates };
    for (const o of outletIds) {
      const cur = templates[o];
      if (!cur) continue;
      const tpl: LibTemplate = { ...cur };
      for (const f of fields) {
        const existing = new Map((cur[f] ?? []).map((x) => [norm(x.text), x]));
        const list: Task[] = [];
        for (const r of nextRows) {
          if (!r.outlets.has(o) || !r.shifts.has(f)) continue;
          const prev = existing.get(r.key);
          list.push({ id: prev?.id ?? crypto.randomUUID(), text: r.text, done: false });
        }
        if (list.length > MAX_TASKS) {
          toast.error(t("maxTasks"));
          return;
        }
        tpl[f] = list;
      }
      next[o] = tpl;
    }
    setTemplates(next);
  };

  const [newText, setNewText] = useState("");
  const [newOutlets, setNewOutlets] = useState<Set<string>>(new Set());
  const [newShifts, setNewShifts] = useState<Set<Field>>(new Set(["open"]));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const toggleIn = <T,>(s: Set<T>, v: T) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const add = () => {
    const txt = newText.trim();
    if (!txt) return;
    if (newOutlets.size === 0) return toast.error(t("pickOutlet"));
    const shifts = cat === "job" ? newShifts : new Set<Field>(fields);
    if (shifts.size === 0) return toast.error(t("pickShift"));
    const k = norm(txt);
    const existing = rows.find((r) => r.key === k);
    const nextRows = existing
      ? rows.map((r) =>
          r.key === k
            ? { ...r, outlets: new Set([...r.outlets, ...newOutlets]), shifts: new Set([...r.shifts, ...shifts]) }
            : r,
        )
      : [...rows, { key: k, text: txt, outlets: new Set(newOutlets), shifts: new Set(shifts) }];
    commit(nextRows);
    setNewText("");
  };

  const updateRow = (key: string, patch: Partial<Row>) =>
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => {
    if (!window.confirm(t("deleteTaskConfirm"))) return;
    commit(rows.filter((r) => r.key !== key));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const copy = rows.slice();
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    commit(copy);
  };

  const saveEdit = () => {
    if (!editingKey) return;
    const txt = editText.trim();
    if (!txt) return;
    const k = norm(txt);
    if (k !== editingKey && rows.some((r) => r.key === k)) return toast.error(t("alreadyAdded"));
    commit(rows.map((r) => (r.key === editingKey ? { ...r, key: k, text: txt } : r)));
    setEditingKey(null);
  };

  const OutletBoxes = ({ value, onToggle }: { value: Set<string>; onToggle: (o: string) => void }) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {outletIds.map((o) => (
        <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox checked={value.has(o)} onCheckedChange={() => onToggle(o)} className="h-4 w-4" />
          {outletNames[o] || o}
        </label>
      ))}
    </div>
  );
  const ShiftBoxes = ({ value, onToggle }: { value: Set<Field>; onToggle: (f: Field) => void }) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {SHIFT_FIELDS.map((s) => (
        <label key={s.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox checked={value.has(s.key)} onCheckedChange={() => onToggle(s.key)} className="h-4 w-4" />
          {t(s.label)}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {([
          ["job", t("jobToDo")],
          ["close", t("closeBar")],
          ["weekly", t("weeklyCleaning")],
        ] as [Category, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setCat(k);
              setEditingKey(null);
            }}
            className={`rounded-xl border px-2 py-2 text-xs sm:text-sm font-semibold transition-colors ${
              cat === k ? "border-primary bg-primary/15 text-primary" : "bg-background text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-background p-3 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder={t("addTask")}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={300}
          />
          <Button size="icon" onClick={add} aria-label={t("addTask")}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("outlets")}</div>
        <OutletBoxes value={newOutlets} onToggle={(o) => setNewOutlets((s) => toggleIn(s, o))} />
        {cat === "job" && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("shifts")}</div>
            <ShiftBoxes value={newShifts} onToggle={(f) => setNewShifts((s) => toggleIn(s, f))} />
          </>
        )}
      </div>

      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-6">{t("noTasks")}</li>
        )}
        {rows.map((r, idx) => (
          <li key={r.key} className="rounded-xl border bg-background p-3 space-y-2">
            <div className="flex items-start gap-1">
              {editingKey === r.key ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingKey(null);
                    }}
                    className="flex-1"
                    maxLength={300}
                  />
                  <Button size="icon" variant="ghost" onClick={saveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingKey(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 text-sm break-words whitespace-pre-wrap pt-2">{tTask(r.text)}</span>
                  <Button size="icon" variant="ghost" className="shrink-0" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label={t("moveUp")}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="shrink-0" disabled={idx === rows.length - 1} onClick={() => move(idx, 1)} aria-label={t("moveDown")}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="shrink-0" onClick={() => { setEditingKey(r.key); setEditText(r.text); }} aria-label={t("editAria")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="shrink-0 text-destructive" onClick={() => removeRow(r.key)} aria-label={t("deleteAria")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <OutletBoxes
              value={r.outlets}
              onToggle={(o) => {
                const n = toggleIn(r.outlets, o);
                if (n.size === 0) return toast.error(t("pickOutlet"));
                updateRow(r.key, { outlets: n });
              }}
            />
            {cat === "job" && (
              <ShiftBoxes
                value={r.shifts}
                onToggle={(f) => {
                  const n = toggleIn(r.shifts, f);
                  if (n.size === 0) return toast.error(t("pickShift"));
                  updateRow(r.key, { shifts: n });
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
