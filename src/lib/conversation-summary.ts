import { db } from "@/lib/database";
import { geminiJson, list, text } from "@/lib/gemini";

export type ConversationSummary = { summary: string; keyPoints: string[]; nextStep: string; interest: string; messageCount: number; updatedAt: string };

const INTEREST = ["alto", "medio", "bajo", "sin_dato"];
// Cuántos mensajes nuevos hacen que el resumen se considere desactualizado.
export const STALE_AFTER = 3;

async function currentCount(conversationId: string) {
  const rows = await db()`SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = ${conversationId}`;
  return Number(rows[0]?.count ?? 0);
}

export async function readSummary(conversationId: string) {
  const [rows, count] = await Promise.all([
    db()`SELECT summary, key_points AS "keyPoints", next_step AS "nextStep", interest, message_count AS "messageCount", updated_at AS "updatedAt"
      FROM conversation_summaries WHERE conversation_id = ${conversationId}`,
    currentCount(conversationId),
  ]);
  const row = rows[0];
  const keyPoints = Array.isArray(row?.keyPoints) ? row.keyPoints.map(String) : [];
  const summary: ConversationSummary | null = row ? { summary: String(row.summary), keyPoints, nextStep: String(row.nextStep ?? ""), interest: String(row.interest ?? "sin_dato"), messageCount: Number(row.messageCount), updatedAt: String(row.updatedAt) } : null;
  return { summary, totalMessages: count, stale: summary ? count - summary.messageCount >= STALE_AFTER : count >= 2 };
}

export async function buildSummary(conversationId: string, force = false) {
  const existing = await readSummary(conversationId);
  if (!force && existing.summary && !existing.stale) return existing;
  const rows = await db()`SELECT direction, sender, body FROM (
      SELECT direction, sender, body, created_at FROM messages WHERE conversation_id = ${conversationId} AND body IS NOT NULL AND body <> ''
      ORDER BY created_at DESC LIMIT 80) recent ORDER BY created_at ASC`;
  const lines = rows
    .filter((row) => !/^\[(?:Audio|Imagen|Video|Archivo|Documento) recibido\]$/i.test(String(row.body)))
    .map((row) => `${row.direction === "INBOUND" ? "Cliente" : row.sender === "AI" ? "Asistente IA" : "Asesor"}: ${String(row.body).replace(/\s+/g, " ").slice(0, 400)}`);
  if (lines.length < 2) return existing;
  const conversation = lines.join("\n").slice(-12000);
  const prompt = `Eres un asistente que resume conversaciones de ventas por WhatsApp para que un asesor entienda rápido, sin leer todo el historial.
Usa SOLO lo que dice la conversación; no inventes datos. Responde en español.
Devuelve JSON válido con este formato exacto:
{"resumen":"máximo 3 frases claras sobre qué quiere el cliente y en qué punto está","puntos":["hasta 5 datos clave: producto de interés, cantidad, zona o distrito, objeciones, datos de entrega o pago, estado del pedido"],"siguiente_paso":"una acción concreta para el asesor","interes":"alto|medio|bajo|sin_dato"}

CONVERSACIÓN:
${conversation}`;
  const { data, model } = await geminiJson(prompt, { maxOutputTokens: 700, conversationId });
  const summary = text(data.resumen, 600);
  if (!summary) throw new Error("La IA no devolvió un resumen.");
  const interest = INTEREST.includes(String(data.interes)) ? String(data.interes) : "sin_dato";
  const count = await currentCount(conversationId);
  await db()`INSERT INTO conversation_summaries (conversation_id, summary, key_points, next_step, interest, message_count, model, updated_at)
    VALUES (${conversationId}, ${summary}, ${JSON.stringify(list(data.puntos, 5, 200))}::text::jsonb, ${text(data.siguiente_paso, 300)}, ${interest}, ${count}, ${model}, now())
    ON CONFLICT (conversation_id) DO UPDATE SET summary = EXCLUDED.summary, key_points = EXCLUDED.key_points, next_step = EXCLUDED.next_step,
      interest = EXCLUDED.interest, message_count = EXCLUDED.message_count, model = EXCLUDED.model, updated_at = now()`;
  return readSummary(conversationId);
}
