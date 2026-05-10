import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  Settings2,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { requirePassword, changePassword } from "@/lib/passwords";

export interface Task {
  id: string;
  text: string;
  done: boolean;
  remark?: string;
}

interface Props {
  title: string;
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  variant?: "default" | "open" | "close";
  headerExtra?: React.ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<Props["variant"]>, string> = {
  default: "border bg-card",
  open: "border-emerald-500/50 bg-emerald-500/5",
  close: "border-amber-500/50 bg-amber-500/5",
};

export function ChecklistSection({
  title,
  tasks,
  onChange,
  variant = "default",
  headerExtra,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const enableEdit = () => {
    if (!requirePassword("edit", "ใส่รหัสผ่านเพื่อแก้ไขรายการ")) return;
    setEditMode(true);
  };

  const exitEdit = () => {
    setEditMode(false);
    setEditingId(null);
  };

  const add = () => {
    const t = newText.trim();
    if (!t) return;
    onChange([...tasks, { id: crypto.randomUUID(), text: t, done: false, remark: "" }]);
    setNewText("");
  };

  const toggle = (id: string) =>
    onChange(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const remove = (id: string) => onChange(tasks.filter((t) => t.id !== id));

  const setRemark = (id: string, remark: string) =>
    onChange(tasks.map((t) => (t.id === id ? { ...t, remark } : t)));

  const move = (id: string, dir: -1 | 1) => {
    const idx = tasks.findIndex((t) => t.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= tasks.length) return;
    const copy = tasks.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditText(t.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const t = editText.trim();
    if (!t) return;
    onChange(tasks.map((x) => (x.id === editingId ? { ...x, text: t } : x)));
    setEditingId(null);
  };

  const done = tasks.filter((t) => t.done).length;

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${VARIANT_CLASSES[variant]}`}>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {done} / {tasks.length}
          </span>
          {editMode ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changePassword("edit")}
                title="เปลี่ยนรหัสผ่าน"
              >
                <KeyRound className="h-4 w-4 mr-1" />
                Password
              </Button>
              <Button size="sm" variant="secondary" onClick={exitEdit}>
                <Check className="h-4 w-4 mr-1" />
                Done
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={enableEdit}>
              <Settings2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {headerExtra && <div className="mb-4">{headerExtra}</div>}

      {editMode && (
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Add a new task..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={300}
          />
          <Button size="icon" onClick={add} aria-label="Add task">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {tasks.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-6">
            No tasks yet.{editMode ? " Add one above." : ""}
          </li>
        )}
        {tasks.map((t, idx) => (
          <li
            key={t.id}
            className="group rounded-lg border bg-background px-3 py-2 hover:bg-accent/40 transition-colors space-y-2"
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={t.done}
                onCheckedChange={() => toggle(t.id)}
                className="h-5 w-5 mt-0.5 shrink-0"
              />
              {editMode && editingId === t.id ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1"
                  />
                  <Button size="icon" variant="ghost" onClick={saveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span
                    className={`flex-1 min-w-0 text-sm break-words whitespace-pre-wrap ${
                      t.done ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {t.text}
                  </span>
                  {editMode && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => move(t.id, -1)}
                        aria-label="Move up"
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => move(t.id, 1)}
                        aria-label="Move down"
                        disabled={idx === tasks.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => startEdit(t)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive"
                        onClick={() => remove(t.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
            {editingId !== t.id && (
              <Input
                placeholder="Remark..."
                value={t.remark ?? ""}
                onChange={(e) => setRemark(t.id, e.target.value)}
                maxLength={300}
                className="h-9 w-full text-sm"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
