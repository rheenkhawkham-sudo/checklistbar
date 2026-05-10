import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  texts: z.array(z.string().min(1).max(500)).min(1).max(50),
  target: z.enum(["th", "en"]),
});

export const translateTexts = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const targetName = data.target === "th" ? "Thai" : "English";
    const numbered = data.texts.map((t, i) => `${i + 1}. ${t}`).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You translate short bar checklist task lines into ${targetName}. Reply with ONLY a JSON array of strings, same length and order as the input list. No commentary, no numbering, no extra text. Keep it concise and natural.`,
          },
          {
            role: "user",
            content: `Translate each line into ${targetName} and return as a JSON array:\n${numbered}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`AI gateway error: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
    let arr: unknown;
    try {
      arr = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\[[\s\S]*\]/);
      arr = m ? JSON.parse(m[0]) : [];
    }
    const result = Array.isArray(arr) ? arr.map((x) => String(x)) : [];
    while (result.length < data.texts.length) result.push(data.texts[result.length]);
    return { translations: result.slice(0, data.texts.length) };
  });
