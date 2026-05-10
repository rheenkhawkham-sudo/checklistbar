import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Lang = "en" | "th";
const STORAGE_KEY = "app:lang";

const dict = {
  en: {
    barOperations: "Bar Operations",
    barChecklist: "Bar Checklist",
    selectOutlet: "Select Outlet",
    separateData: "All data, tasks, and reports are kept separate per outlet.",
    daily: "Daily",
    weeklyCleaning: "Weekly Cleaning",
    reports: "Reports",
    completedSummary: "{outlet} — {done} of {total} tasks completed",
    dailyShort: "Daily",
    weeklyShort: "Weekly",
    outlet: "Outlet",
    signedBy: "Signed by",
    fullName: "Your full name",
    date: "Date",
    time: "Time",
    openTime: "Open time",
    closeTime: "Close time",
    openBar: "Open Bar",
    closeBar: "Close Bar",
    submit: "Submit & Email Report",
    sending: "Sending...",
    emailedTo: "Report will be emailed to {n} recipient",
    emailedToPlural: "Report will be emailed to {n} recipients",
    emailedToDefault: "Report will be emailed to rheen.khawkham@gmail.com (default)",
    recipientEmails: "Recipient Emails",
    upTo5: "Up to 5 recipients.",
    noRecipients: "No recipients yet. Default: rheen.khawkham@gmail.com",
    edit: "Edit",
    done: "Done",
    password: "Password",
    addTask: "Add a new task...",
    noTasks: "No tasks yet.",
    addOneAbove: " Add one above.",
    remark: "Remark...",
    moveUp: "Move up",
    moveDown: "Move down",
    deleteAria: "Delete",
    editAria: "Edit",
    removeAria: "Remove",
    addEmail: "Add email",
    invalidEmail: "Invalid email",
    max5: "Maximum 5 emails allowed",
    alreadyAdded: "Email already added",
    signBeforeSubmit: "Please sign with your name before submitting",
    submitted: "Submitted! Report sent to {to}",
    sendFailed: "Failed to send email. Please try again.",
    reportHistory: "Report History",
    browseAll: "Browse all past checklist submissions",
    restricted: "Reports — Restricted",
    enterToView: "Enter password to view reports",
    login: "Sign in",
    back: "Back",
    monthly: "Monthly",
    yearly: "Yearly",
    allOutlets: "All Outlets",
    download: "Download PDF — {outlet}",
    noReportsFor: "No reports yet for {outlet}",
    loading: "Loading...",
    deleteConfirm: "Delete this report?",
    deleteFail: "Failed to delete: ",
    editFail: "Failed to update: ",
    enterToEditTasks: "Enter password to edit tasks",
    enterToEditEmails: "Enter password to edit recipient emails",
    enterToEditReport: "Enter password to edit this report",
    enterToDeleteReport: "Enter password to delete this report",
    backToChecklist: "Back to checklist",
    changePassword: "Change password",
    lock: "Lock",
    promptCurrent: "Current password",
    promptNew: "New password (4-20 chars)",
    promptConfirm: "Confirm new password",
    pwWrong: "Wrong password",
    pwLengthErr: "Password must be 4-20 characters",
    pwMismatch: "Passwords do not match",
    pwChanged: "Password changed",
    promptSignedBy: "Signed by",
    wrongPwAlert: "Wrong password",
  },
  th: {
    barOperations: "ปฏิบัติงานบาร์",
    barChecklist: "เช็คลิสต์บาร์",
    selectOutlet: "เลือกเอ้าเลท",
    separateData: "ข้อมูล, งาน และรีพอร์ทของแต่ละเอ้าเลทถูกแยกออกจากกัน",
    daily: "รายวัน",
    weeklyCleaning: "ทำความสะอาดประจำสัปดาห์",
    reports: "รีพอร์ท",
    completedSummary: "{outlet} — เสร็จ {done} จาก {total} งาน",
    dailyShort: "รายวัน",
    weeklyShort: "สัปดาห์",
    outlet: "เอ้าเลท",
    signedBy: "ผู้ทำ",
    fullName: "ชื่อ-นามสกุล",
    date: "วันที่",
    time: "เวลา",
    openTime: "เวลาเปิด",
    closeTime: "เวลาปิด",
    openBar: "เปิดบาร์",
    closeBar: "ปิดบาร์",
    submit: "ส่งรีพอร์ทและอีเมล",
    sending: "กำลังส่ง...",
    emailedTo: "ส่งรีพอร์ทไปยัง {n} อีเมล",
    emailedToPlural: "ส่งรีพอร์ทไปยัง {n} อีเมล",
    emailedToDefault: "ส่งรีพอร์ทไปยัง rheen.khawkham@gmail.com (ค่าเริ่มต้น)",
    recipientEmails: "อีเมลผู้รับ",
    upTo5: "เพิ่มได้สูงสุด 5 อีเมล",
    noRecipients: "ยังไม่มีอีเมล ค่าเริ่มต้น: rheen.khawkham@gmail.com",
    edit: "แก้ไข",
    done: "เสร็จ",
    password: "รหัสผ่าน",
    addTask: "เพิ่มงานใหม่...",
    noTasks: "ยังไม่มีงาน",
    addOneAbove: " เพิ่มด้านบน",
    remark: "หมายเหตุ...",
    moveUp: "เลื่อนขึ้น",
    moveDown: "เลื่อนลง",
    deleteAria: "ลบ",
    editAria: "แก้ไข",
    removeAria: "ลบ",
    addEmail: "เพิ่มอีเมล",
    invalidEmail: "อีเมลไม่ถูกต้อง",
    max5: "เพิ่มได้สูงสุด 5 อีเมลเท่านั้น",
    alreadyAdded: "เพิ่มอีเมลนี้แล้ว",
    signBeforeSubmit: "กรุณาเซ็นชื่อก่อนส่ง",
    submitted: "ส่งสำเร็จ! ส่งรีพอร์ทไปยัง {to}",
    sendFailed: "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่",
    reportHistory: "ประวัติรีพอร์ท",
    browseAll: "ดูประวัติการส่งเช็คลิสต์ทั้งหมด",
    restricted: "รีพอร์ท — ต้องใช้รหัสผ่าน",
    enterToView: "ใส่รหัสผ่านเพื่อเข้าดูรีพอร์ท",
    login: "เข้าสู่ระบบ",
    back: "ย้อนกลับ",
    monthly: "รายเดือน",
    yearly: "รายปี",
    allOutlets: "ทุกเอ้าเลท",
    download: "ดาวน์โหลด PDF — {outlet}",
    noReportsFor: "ยังไม่มีรีพอร์ทของ {outlet}",
    loading: "กำลังโหลด...",
    deleteConfirm: "ยืนยันการลบรีพอร์ทนี้?",
    deleteFail: "ลบไม่สำเร็จ: ",
    editFail: "แก้ไขไม่สำเร็จ: ",
    enterToEditTasks: "ใส่รหัสผ่านเพื่อแก้ไขรายการ",
    enterToEditEmails: "ใส่รหัสผ่านเพื่อแก้ไขรายชื่ออีเมล",
    enterToEditReport: "ใส่รหัสผ่านเพื่อแก้ไขรีพอร์ท",
    enterToDeleteReport: "ใส่รหัสผ่านเพื่อลบรีพอร์ท",
    backToChecklist: "กลับไปยังเช็คลิสต์",
    changePassword: "เปลี่ยนรหัสผ่าน",
    lock: "ล็อก",
    promptCurrent: "ใส่รหัสผ่านปัจจุบัน",
    promptNew: "ตั้งรหัสผ่านใหม่ (4-20 ตัวอักษร)",
    promptConfirm: "ยืนยันรหัสผ่านใหม่อีกครั้ง",
    pwWrong: "รหัสผ่านไม่ถูกต้อง",
    pwLengthErr: "รหัสผ่านใหม่ต้องมีความยาว 4-20 ตัว",
    pwMismatch: "รหัสผ่านยืนยันไม่ตรงกัน",
    pwChanged: "เปลี่ยนรหัสผ่านเรียบร้อย",
    promptSignedBy: "ผู้ทำ",
    wrongPwAlert: "รหัสผ่านไม่ถูกต้อง",
  },
} as const;

export type TKey = keyof (typeof dict)["en"];

// Bidirectional translation for known/default task texts.
// Add entries here whenever defaults change so display follows the language.
const TASK_PAIRS: Array<[string, string]> = [
  ["Stock and restock liquor bottles", "เติมและจัดเรียงขวดสุรา"],
  ["Check ice machine and refill", "ตรวจสอบเครื่องน้ำแข็งและเติม"],
  ["Wipe down glassware", "เช็ดทำความสะอาดเครื่องแก้ว"],
  ["Clean bar counter and tools", "ทำความสะอาดเคาน์เตอร์และอุปกรณ์บาร์"],
  ["Empty trash and recycling", "ทิ้งขยะและรีไซเคิล"],
  ["Cash drawer reconciliation", "ตรวจนับเงินในลิ้นชัก"],
  ["Deep clean draft beer lines", "ล้างท่อเบียร์สดอย่างละเอียด"],
  ["Inventory full audit", "ตรวจนับสต็อกทั้งหมด"],
  ["Inspect and clean refrigeration units", "ตรวจและทำความสะอาดตู้เย็น"],
  ["Review supplier orders & invoices", "ตรวจสอบใบสั่งซื้อและใบแจ้งหนี้ซัพพลายเออร์"],
  ["Restock garnish and condiments", "เติมเครื่องตกแต่งและเครื่องปรุง"],
];
const TASK_EN_TO_TH = new Map(TASK_PAIRS);
const TASK_TH_TO_EN = new Map(TASK_PAIRS.map(([e, th]) => [th, e]));

const THAI_RE = /[\u0E00-\u0E7F]/;
const CACHE_KEY = "app:taskTranslations:v1";

type CacheShape = { th: Record<string, string> };
const cache: CacheShape = { th: {} };
let cacheLoaded = false;
function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.th && typeof parsed.th === "object") cache.th = parsed.th;
    }
  } catch {
    /* ignore */
  }
}
function saveCache() {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>();
function notify() {
  for (const fn of subscribers) fn();
}

async function flushPending() {
  flushTimer = null;
  if (pending.size === 0) return;
  const batch = Array.from(pending).slice(0, 50);
  for (const t of batch) pending.delete(t);
  try {
    const mod = await import("@/lib/translate.functions");
    const result = await mod.translateTexts({ data: { texts: batch, target: "th" } });
    const translations = result.translations;
    batch.forEach((src, i) => {
      const out = translations[i];
      if (out && out.trim()) cache.th[src] = out.trim();
    });
    saveCache();
    notify();
  } catch {
    /* leave untranslated; will retry on next request */
  }
  if (pending.size > 0 && !flushTimer) {
    flushTimer = setTimeout(flushPending, 250);
  }
}

function scheduleTranslate(text: string) {
  if (pending.has(text)) return;
  pending.add(text);
  if (!flushTimer) flushTimer = setTimeout(flushPending, 200);
}

export function translateTaskText(text: string, lang: Lang): string {
  if (!text) return text;
  if (lang === "en") {
    // Only translate built-in default Thai → EN; user-added text stays as-is
    return TASK_TH_TO_EN.get(text) ?? text;
  }
  // lang === "th"
  const known = TASK_EN_TO_TH.get(text);
  if (known) return known;
  if (THAI_RE.test(text)) return text;
  loadCache();
  const cached = cache.th[text];
  if (cached) return cached;
  scheduleTranslate(text);
  return text;
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  tTask: (text: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [, setTick] = useState(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === "en" || stored === "th") setLangState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      let s: string = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    },
    [lang],
  );

  const tTask = useCallback((text: string) => translateTaskText(text, lang), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, tTask }), [lang, setLang, t, tTask]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setLang(lang === "en" ? "th" : "en")}
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4 mr-1" />
      {lang === "en" ? "ไทย" : "EN"}
    </Button>
  );
}
