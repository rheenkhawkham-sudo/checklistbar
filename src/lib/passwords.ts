// Simple password manager stored in localStorage per device.
// Two scopes: "edit" (tasks, recipients) and "reports" (reports access).

export type PasswordKind = "edit" | "reports";

const STORAGE_KEY: Record<PasswordKind, string> = {
  edit: "pw:edit",
  reports: "pw:reports",
};

const DEFAULTS: Record<PasswordKind, string> = {
  edit: "0000",
  reports: "00000",
};

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---- Cross-device sync via app_state("passwords") ----
const REMOTE_KEY = "passwords";
let syncStarted = false;
function applyRemote(v: unknown) {
  if (!v || typeof v !== "object") return;
  const o = v as Partial<Record<PasswordKind, string>>;
  (Object.keys(STORAGE_KEY) as PasswordKind[]).forEach((k) => {
    if (typeof o[k] === "string" && o[k]) safeSet(STORAGE_KEY[k], o[k]!);
  });
}
export async function initPasswordSync() {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.from("app_state").select("value").eq("key", REMOTE_KEY).maybeSingle();
  if (data?.value) applyRemote(data.value);
  supabase
    .channel("passwords_sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `key=eq.${REMOTE_KEY}` }, (payload) => {
      applyRemote((payload.new as { value?: unknown } | null)?.value);
    })
    .subscribe();
}
async function pushRemote() {
  const { supabase } = await import("@/integrations/supabase/client");
  const value = { edit: getPassword("edit"), reports: getPassword("reports") };
  await supabase
    .from("app_state")
    .upsert({ key: REMOTE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export function getPassword(kind: PasswordKind): string {
  return safeGet(STORAGE_KEY[kind]) ?? DEFAULTS[kind];
}

export function setPassword(kind: PasswordKind, value: string) {
  safeSet(STORAGE_KEY[kind], value);
  void pushRemote();
}

export interface PromptMessages {
  prompt: string;
  wrong: string;
}
export interface ChangeMessages {
  current: string;
  wrongCurrent: string;
  next: string;
  lengthErr: string;
  confirm: string;
  mismatch: string;
  changed: string;
}

export function requirePassword(kind: PasswordKind, msgs: PromptMessages): boolean {
  if (typeof window === "undefined") return false;
  const pw = window.prompt(msgs.prompt);
  if (pw === null) return false;
  if (pw !== getPassword(kind)) {
    window.alert(msgs.wrong);
    return false;
  }
  return true;
}

export function changePassword(kind: PasswordKind, msgs: ChangeMessages): boolean {
  if (typeof window === "undefined") return false;
  const current = window.prompt(msgs.current);
  if (current === null) return false;
  if (current !== getPassword(kind)) {
    window.alert(msgs.wrongCurrent);
    return false;
  }
  const next = window.prompt(msgs.next);
  if (next === null) return false;
  const trimmed = next.trim();
  if (trimmed.length < 4 || trimmed.length > 20) {
    window.alert(msgs.lengthErr);
    return false;
  }
  const confirm = window.prompt(msgs.confirm);
  if (confirm === null) return false;
  if (confirm !== trimmed) {
    window.alert(msgs.mismatch);
    return false;
  }
  setPassword(kind, trimmed);
  window.alert(msgs.changed);
  return true;
}
