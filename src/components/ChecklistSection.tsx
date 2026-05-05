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
}

export function ChecklistSection({ title, tasks, onChange }: Props) {
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
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {done} / {tasks.length}
        </span>
      </div>

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
            className="group rounded-lg border bg-background px-3 py-2 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Checkbox checked={t.done} onCheckedChange={() => toggle(t.id)} className="h-5 w-5" />
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
                    className={`min-w-0 flex-shrink text-sm break-words ${
                      t.done ? "line-through text-muted-foreground" : ""
                    }`}
                    style={{ flexBasis: "40%" }}
                  >
                    {t.text}
                  </span>
                  <Input
                    placeholder="Remark..."
                    value={t.remark ?? ""}
                    onChange={(e) => setRemark(t.id, e.target.value)}
                    maxLength={300}
                    className="h-9 flex-1 min-w-0 text-sm"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => startEdit(t)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => remove(t.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
