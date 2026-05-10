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
import { toast } from "sonner";

const MAX_TASKS = 50;
import { useI18n } from "@/lib/i18n";
import { usePasswords } from "@/lib/usePasswords";

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
  const { t, tTask } = useI18n();
  const { requirePassword, changePassword } = usePasswords();
  const [editMode, setEditMode] = useState(false);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const enableEdit = () => {
    if (!requirePassword("edit", "enterToEditTasks")) return;
    setEditMode(true);
  };

  const exitEdit = () => {
    setEditMode(false);
    setEditingId(null);
  };

  const add = () => {
    const txt = newText.trim();
    if (!txt) return;
    if (tasks.length >= MAX_TASKS) {
      toast.error(t("maxTasks"));
      return;
    }
    onChange([...tasks, { id: crypto.randomUUID(), text: txt, done: false, remark: "" }]);
    setNewText("");
  };

  const toggle = (id: string) =>
    onChange(tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));

  const remove = (id: string) => onChange(tasks.filter((x) => x.id !== id));

  const setRemark = (id: string, remark: string) =>
    onChange(tasks.map((x) => (x.id === id ? { ...x, remark } : x)));

  const move = (id: string, dir: -1 | 1) => {
    const idx = tasks.findIndex((x) => x.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= tasks.length) return;
    const copy = tasks.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const txt = editText.trim();
    if (!txt) return;
    onChange(tasks.map((x) => (x.id === editingId ? { ...x, text: txt } : x)));
    setEditingId(null);
  };

  const doneCount = tasks.filter((x) => x.done).length;

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${VARIANT_CLASSES[variant]}`}>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {doneCount} / {tasks.length}
          </span>
          {editMode ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changePassword("edit")}
                title={t("changePassword")}
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

      {headerExtra && <div className="mb-4">{headerExtra}</div>}

      {editMode && (
        <div className="mb-4 space-y-1">
          <div className="flex gap-2">
            <Input
              placeholder={t("addTask")}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              maxLength={300}
              disabled={tasks.length >= MAX_TASKS}
            />
            <Button
              size="icon"
              onClick={add}
              aria-label={t("addTask")}
              disabled={tasks.length >= MAX_TASKS}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums text-right">
            {tasks.length} / {MAX_TASKS}
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {tasks.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-6">
            {t("noTasks")}
            {editMode ? t("addOneAbove") : ""}
          </li>
        )}
        {tasks.map((task, idx) => (
          <li
            key={task.id}
            className="group rounded-lg border bg-background px-3 py-2 hover:bg-accent/40 transition-colors space-y-2"
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.done}
                onCheckedChange={() => toggle(task.id)}
                className="h-5 w-5 mt-0.5 shrink-0"
              />
              {editMode && editingId === task.id ? (
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
                      task.done ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {tTask(task.text)}
                  </span>
                  {editMode && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => move(task.id, -1)}
                        aria-label={t("moveUp")}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => move(task.id, 1)}
                        aria-label={t("moveDown")}
                        disabled={idx === tasks.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => startEdit(task)}
                        aria-label={t("editAria")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive"
                        onClick={() => remove(task.id)}
                        aria-label={t("deleteAria")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
            {editingId !== task.id && (
              <Input
                placeholder={t("remark")}
                value={task.remark ?? ""}
                onChange={(e) => setRemark(task.id, e.target.value)}
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
