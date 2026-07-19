import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

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

const DEFAULTS = [
  "Beach Bar",
  "Pakarang Bar",
  "Pool Bar",
  "Family Pool Bar",
  "Outlet 5",
  "Outlet 6",
  "Outlet 7",
];

export default defineTool({
  name: "list_outlets",
  title: "List outlets",
  description: "Return the current outlet display names used by the bar checklist app.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const { data } = await anonClient()
      .from("app_state")
      .select("value")
      .eq("key", "outlet_names")
      .maybeSingle();
    const names =
      data?.value && typeof data.value === "object"
        ? DEFAULTS.map((d, i) => (data.value as Record<string, string>)[String(i)] ?? d)
        : DEFAULTS;
    return {
      content: [{ type: "text", text: JSON.stringify(names) }],
      structuredContent: { outlets: names },
    };
  },
});
