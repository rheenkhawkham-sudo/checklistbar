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

export function getPassword(kind: PasswordKind): string {
  return safeGet(STORAGE_KEY[kind]) ?? DEFAULTS[kind];
}

export function setPassword(kind: PasswordKind, value: string) {
  safeSet(STORAGE_KEY[kind], value);
}

export function requirePassword(
  kind: PasswordKind,
  label = "กรุณาใส่รหัสผ่าน",
): boolean {
  if (typeof window === "undefined") return false;
  const pw = window.prompt(label);
  if (pw === null) return false;
  if (pw !== getPassword(kind)) {
    window.alert("รหัสผ่านไม่ถูกต้อง");
    return false;
  }
  return true;
}

export function changePassword(kind: PasswordKind): boolean {
  if (typeof window === "undefined") return false;
  const current = window.prompt("ใส่รหัสผ่านปัจจุบัน");
  if (current === null) return false;
  if (current !== getPassword(kind)) {
    window.alert("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    return false;
  }
  const next = window.prompt("ตั้งรหัสผ่านใหม่ (4-20 ตัวอักษร)");
  if (next === null) return false;
  const trimmed = next.trim();
  if (trimmed.length < 4 || trimmed.length > 20) {
    window.alert("รหัสผ่านใหม่ต้องมีความยาว 4-20 ตัว");
    return false;
  }
  const confirm = window.prompt("ยืนยันรหัสผ่านใหม่อีกครั้ง");
  if (confirm === null) return false;
  if (confirm !== trimmed) {
    window.alert("รหัสผ่านยืนยันไม่ตรงกัน");
    return false;
  }
  setPassword(kind, trimmed);
  window.alert("เปลี่ยนรหัสผ่านเรียบร้อย");
  return true;
}
