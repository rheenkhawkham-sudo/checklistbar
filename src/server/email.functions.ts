import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TaskSchema = z.object({
  id: z.string(),
  text: z.string().max(300),
  done: z.boolean(),
});

const PayloadSchema = z.object({
  signedBy: z.string().trim().min(1).max(100),
  outlet: z.string().trim().min(1).max(100),
  daily: z.array(TaskSchema).max(200),
  monthly: z.array(TaskSchema).max(200),
});

const RECIPIENT = "rheen.khawkham@gmail.com";

function renderList(title: string, tasks: { text: string; done: boolean }[]) {
  if (tasks.length === 0) return `<h3>${title}</h3><p style="color:#888">No tasks</p>`;
  const rows = tasks
    .map(
      (t) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;width:30px">${
          t.done ? "✅" : "⬜"
        }</td><td style="padding:6px 10px;border-bottom:1px solid #eee;${
          t.done ? "text-decoration:line-through;color:#888" : ""
        }">${escapeHtml(t.text)}</td></tr>`
    )
    .join("");
  return `<h3 style="margin:20px 0 8px">${title}</h3><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;
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

    const total = data.daily.length + data.monthly.length;
    const done = [...data.daily, ...data.monthly].filter((t) => t.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222">
        <h2 style="margin:0 0 4px">Bar Checklist Report</h2>
        <p style="color:#666;margin:0 0 16px">Submitted ${escapeHtml(now)} (Asia/Bangkok)</p>
        <table style="width:100%;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:4px 0"><b>Outlet:</b></td><td>${escapeHtml(data.outlet)}</td></tr>
          <tr><td style="padding:4px 0"><b>Signed by:</b></td><td>${escapeHtml(data.signedBy)}</td></tr>
          <tr><td style="padding:4px 0"><b>Completion:</b></td><td>${done} / ${total} (${pct}%)</td></tr>
        </table>
        ${renderList("Daily Tasks", data.daily)}
        ${renderList("Monthly Tasks", data.monthly)}
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
        subject: `Bar Checklist — ${data.outlet} — ${data.signedBy} (${pct}%)`,
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
