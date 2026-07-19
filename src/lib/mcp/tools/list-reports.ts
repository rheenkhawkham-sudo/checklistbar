import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function anonClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export default defineTool({
  name: "list_reports",
  title: "List checklist reports",
  description:
    "List bar checklist reports with optional filters. Returns summary rows (id, date, outlet, signed_by, times, totals, percent).",
  inputSchema: {
    outlet: z.string().optional().describe("Exact outlet name to filter by."),
    from: z.string().optional().describe("Inclusive start date (YYYY-MM-DD)."),
    to: z.string().optional().describe("Inclusive end date (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ outlet, from, to, limit }) => {
    const supabase = anonClient();
    let q = supabase
      .from("checklist_reports")
      .select(
        "id, report_date, outlet, signed_by, open_time, close_time, total_tasks, done_tasks, percent, created_at",
      )
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (outlet) q = q.eq("outlet", outlet);
    if (from) q = q.gte("report_date", from);
    if (to) q = q.lte("report_date", to);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { reports: data ?? [] },
    };
  },
});
