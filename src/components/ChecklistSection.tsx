import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

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

export function ChecklistSection({ title, tasks, onChange, variant = "default", headerExtra }: Props) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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

  const requirePassword = () => {
    const pw = window.prompt("กรุณาใส่รหัสผ่านเพื่อดำเนินการ");
    if (pw === null) return false;
    if (pw !== "0000") {
      window.alert("รหัสผ่านไม่ถูกต้อง");
      return false;
    }
    return true;
  };

  const startEdit = (t: Task) => {
    if (!requirePassword()) return;
    setEditingId(t.id);
    setEditText(t.text);
  };

  const tryRemove = (id: string) => {
    if (!requirePassword()) return;
    remove(id);
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {done} / {tasks.length}
        </span>
      </div>

      {headerExtra && <div className="mb-4">{headerExtra}</div>}

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

      <ul className="space-y-2">
        {tasks.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-6">No tasks yet. Add one above.</li>
        )}
        {tasks.map((t) => (
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
              {editingId === t.id ? (
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                    onClick={() => startEdit(t)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive shrink-0"
                    onClick={() => tryRemove(t.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
