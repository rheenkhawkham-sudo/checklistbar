import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TaskSchema = z.object({
  id: z.string(),
  text: z.string().max(300),
  done: z.boolean(),
  remark: z.string().max(300).optional().default(""),
});

const PayloadSchema = z.object({
  signedBy: z.string().trim().min(1).max(100),
  outlet: z.string().trim().min(1).max(100),
  reportDate: z.string().trim().min(1).max(40),
  openTime: z.string().trim().max(20).optional().default(""),
  closeTime: z.string().trim().max(20).optional().default(""),
  mode: z.enum(["daily", "monthly", "all"]).default("all"),
  daily: z.array(TaskSchema).max(200).default([]),
  open: z.array(TaskSchema).max(200).default([]),
  close: z.array(TaskSchema).max(200).default([]),
  monthly: z.array(TaskSchema).max(200).default([]),
  recipients: z.array(z.string().trim().email()).max(5).optional().default([]),
});

const DEFAULT_RECIPIENT = "rheen.khawkham@gmail.com";

function renderList(title: string, tasks: { text: string; done: boolean; remark?: string }[]) {
  if (tasks.length === 0) return `<h3>${title}</h3><p style="color:#888">No tasks</p>`;
  const rows = tasks
    .map(
      (t) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;width:30px;vertical-align:top">${
          t.done ? "✅" : "⬜"
        }</td><td style="padding:6px 10px;border-bottom:1px solid #eee;${
          t.done ? "text-decoration:line-through;color:#888" : ""
        }">${escapeHtml(t.text)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;font-style:italic;vertical-align:top">${escapeHtml(t.remark || "")}</td></tr>`
    )
    .join("");
  return `<h3 style="margin:20px 0 8px">${title}</h3><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th></th><th style="text-align:left;padding:6px 10px;color:#666;font-weight:600;border-bottom:2px solid #ddd">Task</th><th style="text-align:left;padding:6px 10px;color:#666;font-weight:600;border-bottom:2px solid #ddd">Remark</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const sendChecklistEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PayloadSchema.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const includeDaily = data.mode === "daily" || data.mode === "all";
    const includeMonthly = data.mode === "monthly" || data.mode === "all";
    const dailyAll = [...data.open, ...data.close, ...data.daily];
    const scoped = [
      ...(includeDaily ? dailyAll : []),
      ...(includeMonthly ? data.monthly : []),
    ];
    const total = scoped.length;
    const done = scoped.filter((t) => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    const modeLabel =
      data.mode === "daily" ? "Daily" : data.mode === "monthly" ? "Monthly" : "Daily + Monthly";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222">
        <h2 style="margin:0 0 4px">Bar Checklist Report — ${escapeHtml(modeLabel)}</h2>
        <p style="color:#666;margin:0 0 16px">Submitted ${escapeHtml(now)} (Asia/Bangkok)</p>
        <table style="width:100%;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:4px 0"><b>Date:</b></td><td>${escapeHtml(data.reportDate)}</td></tr>
          <tr><td style="padding:4px 0"><b>Outlet:</b></td><td>${escapeHtml(data.outlet)}</td></tr>
          <tr><td style="padding:4px 0"><b>Signed by:</b></td><td>${escapeHtml(data.signedBy)}</td></tr>
          <tr><td style="padding:4px 0"><b>Open time:</b></td><td>${escapeHtml(data.openTime || "-")}</td></tr>
          <tr><td style="padding:4px 0"><b>Close time:</b></td><td>${escapeHtml(data.closeTime || "-")}</td></tr>
          <tr><td style="padding:4px 0"><b>Type:</b></td><td>${escapeHtml(modeLabel)}</td></tr>
          <tr><td style="padding:4px 0"><b>Completion:</b></td><td>${done} / ${total} (${pct}%)</td></tr>
        </table>
        ${includeDaily ? renderList("Open Bar", data.open) : ""}
        ${includeDaily ? renderList("Close Bar", data.close) : ""}
        ${includeDaily && data.daily.length > 0 ? renderList("Other Daily Tasks", data.daily) : ""}
        ${includeMonthly ? renderList("Monthly Tasks", data.monthly) : ""}
      </div>
    `;

    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Bar Checklist <onboarding@resend.dev>",
        to: [RECIPIENT],
        subject: `Bar Checklist (${modeLabel}) — ${data.outlet} — ${data.signedBy} (${pct}%)`,
        html,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend send failed", res.status, body);
      throw new Error(`Failed to send email [${res.status}]: ${JSON.stringify(body)}`);
    }
    return { ok: true, recipient: RECIPIENT, pct };
  });
