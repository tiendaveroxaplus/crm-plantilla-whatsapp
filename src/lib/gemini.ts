import { db } from "@/lib/database";

// Cliente mínimo de Gemini para tareas que devuelven JSON (resúmenes y análisis). No toca el flujo de respuestas al cliente.

export function looseJson(text: string): unknown {
  const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(clean); } catch { /* se intenta extraer el objeto */ }
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* sin JSON válido */ } }
  return null;
}

export async function geminiJson(prompt: string, options: { maxOutputTokens?: number; conversationId?: string | null } = {}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GOOGLE_AI_MODEL;
  if (!apiKey || !model) throw new Error("Google AI no está configurado.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: options.maxOutputTokens ?? 2048, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${String(payload?.error?.message ?? "sin detalle").slice(0, 200)}`);
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.filter((part: { thought?: boolean; text?: unknown }) => part && part.thought !== true && typeof part.text === "string").map((part: { text: string }) => part.text).join("").trim() : "";
  const data = looseJson(text);
  if (!data || typeof data !== "object") throw new Error("Gemini no devolvió un JSON utilizable.");
  const inputTokens = Number(payload?.usageMetadata?.promptTokenCount ?? 0);
  const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount ?? 0);
  const inputRate = Number(process.env.GOOGLE_AI_INPUT_COST_PER_MILLION ?? 0);
  const outputRate = Number(process.env.GOOGLE_AI_OUTPUT_COST_PER_MILLION ?? 0);
  // El gasto queda registrado junto al resto del uso de IA (panel de ventas).
  await db()`INSERT INTO ai_usage (conversation_id, provider, model, input_tokens, output_tokens, cost_usd)
    VALUES (${options.conversationId ?? null}, 'google', ${model}, ${inputTokens}, ${outputTokens}, ${inputTokens * inputRate / 1_000_000 + outputTokens * outputRate / 1_000_000})`.catch(() => {});
  return { data: data as Record<string, unknown>, inputTokens, outputTokens, model };
}

export const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
export const list = (value: unknown, max: number, each: number) =>
  (Array.isArray(value) ? value : []).map((item) => text(item, each)).filter(Boolean).slice(0, max);
