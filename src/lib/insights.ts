import { db } from "@/lib/database";
import { geminiJson, list, text } from "@/lib/gemini";
import { SLOTS, slotStatus, slotWindow, type Slot } from "@/lib/insight-slots";

export type Stats = { messages: number; conversations: number; newContacts: number; adLeads: number; unanswered: number; paidSales: number; revenuePen: number };
type Topic = { tema: string; menciones: number; ejemplo: string };
type Action = { conversationId: string; name: string; motivo: string; accion: string };
export type Analysis = {
  resumen: string; pedidos: Topic[]; preguntas: Topic[]; objeciones: Topic[]; productos: Topic[];
  oportunidades: Action[]; sinRespuesta: Action[]; recomendaciones: string[];
};

export async function computeStats(from: Date, to: Date): Promise<Stats> {
  const f = from.toISOString();
  const t = to.toISOString();
  const rows = await db()`SELECT
      (SELECT COUNT(*) FROM messages WHERE direction='INBOUND' AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz)::int AS messages,
      (SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE direction='INBOUND' AND created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz)::int AS conversations,
      (SELECT COUNT(*) FROM contacts WHERE created_at >= ${f}::timestamptz AND created_at < ${t}::timestamptz)::int AS "newContacts",
      (SELECT COUNT(*) FROM conversations WHERE entry_source <> 'UNKNOWN' AND referral_at >= ${f}::timestamptz AND referral_at < ${t}::timestamptz)::int AS "adLeads",
      (SELECT COUNT(*) FROM conversations WHERE last_inbound_at >= ${f}::timestamptz AND last_inbound_at < ${t}::timestamptz
         AND (last_outbound_at IS NULL OR last_outbound_at < last_inbound_at))::int AS unanswered,
      (SELECT COUNT(*) FROM sales_orders WHERE status='PAID' AND paid_at >= ${f}::timestamptz AND paid_at < ${t}::timestamptz)::int AS "paidSales",
      (SELECT COALESCE(SUM(total_pen),0) FROM sales_orders WHERE status='PAID' AND paid_at >= ${f}::timestamptz AND paid_at < ${t}::timestamptz)::float AS "revenuePen"`;
  const row = rows[0] ?? {};
  return { messages: Number(row.messages ?? 0), conversations: Number(row.conversations ?? 0), newContacts: Number(row.newContacts ?? 0), adLeads: Number(row.adLeads ?? 0),
    unanswered: Number(row.unanswered ?? 0), paidSales: Number(row.paidSales ?? 0), revenuePen: Number(row.revenuePen ?? 0) };
}

const topics = (value: unknown): Topic[] => (Array.isArray(value) ? value : []).map((item) => {
  const entry = (item ?? {}) as Record<string, unknown>;
  const mentions = Number(entry.menciones);
  return { tema: text(entry.tema ?? entry.pregunta ?? entry.producto ?? entry.texto, 160), menciones: Number.isFinite(mentions) && mentions > 0 ? Math.round(mentions) : 1, ejemplo: text(entry.ejemplo, 200) };
}).filter((item) => item.tema).slice(0, 8);

export async function readInsights(day: string) {
  const rows = await db()`SELECT slot, stats, analysis, message_count AS "messageCount", model, generated_at AS "generatedAt" FROM ai_insights WHERE day = ${day}::date`;
  return rows;
}

export async function generateInsight(day: string, slot: Slot) {
  const { from, to } = slotWindow(day, slot);
  const stats = await computeStats(from, to);
  const messages = await db()`SELECT m.conversation_id::text AS cid, COALESCE(ct.display_name, '') AS name, m.body, m.created_at AS "createdAt"
    FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN contacts ct ON ct.id = c.contact_id
    WHERE m.direction = 'INBOUND' AND m.body IS NOT NULL AND m.body <> '' AND m.created_at >= ${from.toISOString()}::timestamptz AND m.created_at < ${to.toISOString()}::timestamptz
    ORDER BY m.created_at ASC LIMIT 500`;
  const useful = messages.filter((row) => !/^\[(?:Audio|Imagen|Video|Archivo|Documento) recibido\]$/i.test(String(row.body)));
  let analysis: Analysis = { resumen: "Sin mensajes de clientes en este corte.", pedidos: [], preguntas: [], objeciones: [], productos: [], oportunidades: [], sinRespuesta: [], recomendaciones: [] };
  let model: string | null = null;
  if (useful.length) {
    const refs = new Map<string, { ref: string; name: string }>();
    const lines: string[] = [];
    for (const row of useful) {
      if (!refs.has(row.cid)) refs.set(row.cid, { ref: `c${refs.size + 1}`, name: String(row.name || "Cliente sin nombre") });
      lines.push(`[${refs.get(row.cid)!.ref}] ${String(row.body).replace(/\s+/g, " ").slice(0, 300)}`);
    }
    const label = SLOTS.find((item) => item.id === slot)?.label ?? "";
    const prompt = `Analiza los mensajes que los CLIENTES enviaron por WhatsApp a un negocio durante el corte "${label}" del día ${day}.
Cada línea empieza con el código de la conversación (c1, c2…). Usa SOLO lo que dicen los mensajes; no inventes datos ni cifras. Responde en español, breve y práctico para quien atiende el negocio.
Devuelve JSON válido exacto:
{"resumen":"2-3 frases con lo más importante del corte",
"pedidos":[{"tema":"lo que más piden","menciones":número,"ejemplo":"frase corta"}],
"preguntas":[{"tema":"pregunta frecuente","menciones":número,"ejemplo":"frase corta"}],
"objeciones":[{"tema":"duda, queja o freno para comprar","menciones":número,"ejemplo":"frase corta"}],
"productos":[{"tema":"producto o servicio mencionado","menciones":número,"ejemplo":""}],
"oportunidades":[{"ref":"cN","motivo":"por qué es una oportunidad","accion":"acción concreta sugerida"}],
"sin_respuesta":[{"ref":"cN","motivo":"qué pregunta o pedido quedó pendiente","accion":"qué responder"}],
"recomendaciones":["hasta 4 acciones para el negocio"]}
Máximo 6 elementos por lista. Si no hay datos para una lista, devuelve [].

MENSAJES:
${lines.join("\n").slice(0, 24000)}`;
    const { data, model: usedModel } = await geminiJson(prompt, { maxOutputTokens: 2500 });
    model = usedModel;
    const byRef = new Map([...refs.entries()].map(([cid, value]) => [value.ref, { conversationId: cid, name: value.name }]));
    const actions = (value: unknown): Action[] => (Array.isArray(value) ? value : []).map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const target = byRef.get(String(entry.ref));
      return target ? { conversationId: target.conversationId, name: target.name, motivo: text(entry.motivo, 220), accion: text(entry.accion, 220) } : null;
    }).filter((item): item is Action => Boolean(item)).slice(0, 8);
    analysis = { resumen: text(data.resumen, 700) || analysis.resumen, pedidos: topics(data.pedidos), preguntas: topics(data.preguntas), objeciones: topics(data.objeciones),
      productos: topics(data.productos), oportunidades: actions(data.oportunidades), sinRespuesta: actions(data.sin_respuesta), recomendaciones: list(data.recomendaciones, 4, 220) };
  }
  await db()`INSERT INTO ai_insights (day, slot, from_at, to_at, message_count, stats, analysis, model, generated_at)
    VALUES (${day}::date, ${slot}, ${from.toISOString()}, ${to.toISOString()}, ${useful.length}, ${JSON.stringify(stats)}::text::jsonb, ${JSON.stringify(analysis)}::text::jsonb, ${model}, now())
    ON CONFLICT (day, slot) DO UPDATE SET from_at = EXCLUDED.from_at, to_at = EXCLUDED.to_at, message_count = EXCLUDED.message_count,
      stats = EXCLUDED.stats, analysis = EXCLUDED.analysis, model = EXCLUDED.model, generated_at = now()`;
  return { stats, analysis };
}

// Vista del día: los tres cortes con su estado, números en vivo y el análisis guardado (si existe).
export async function dayOverview(day: string, now: Date = new Date()) {
  const saved = await readInsights(day);
  return Promise.all(SLOTS.map(async (def) => {
    const status = slotStatus(day, def.id, now);
    const { from, to } = slotWindow(day, def.id);
    const stored = saved.find((row) => row.slot === def.id);
    const liveStats = status === "FUTURE" ? null : await computeStats(from, to);
    return {
      slot: def.id, label: def.label, status, from: from.toISOString(), to: to.toISOString(), liveStats,
      insight: stored ? { analysis: stored.analysis as Analysis, stats: stored.stats as Stats, generatedAt: String(stored.generatedAt), messageCount: Number(stored.messageCount) } : null,
    };
  }));
}
