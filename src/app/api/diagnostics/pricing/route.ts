import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getSession } from "@/lib/auth";

// SOLO LECTURA para administradores. Ayuda a entender por qué un costo aparece en 0:
// agrupa lo que YCloud reportó y muestra solo los campos de precio (sin teléfonos ni textos).
export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const sql = db();
  const [stored, rawSamples, ai] = await Promise.all([
    sql`SELECT pricing_category AS category, pricing_type AS "type", currency, amount::float AS amount, final_status AS status, COUNT(*)::int AS messages
      FROM whatsapp_message_pricing GROUP BY 1, 2, 3, 4, 5 ORDER BY messages DESC LIMIT 30`,
    sql`SELECT payload->'whatsappMessage'->>'status' AS status,
        payload->'whatsappMessage'->>'pricingCategory' AS category,
        payload->'whatsappMessage'->>'pricingType' AS "type",
        payload->'whatsappMessage'->>'pricingModel' AS model,
        jsonb_typeof(payload->'whatsappMessage'->'totalPrice') AS "totalPriceJsonType",
        payload->'whatsappMessage'->>'totalPrice' AS "totalPrice",
        payload->'whatsappMessage'->>'currency' AS currency,
        received_at AS "receivedAt"
      FROM webhook_events WHERE event_type='whatsapp.message.updated'
      ORDER BY received_at DESC LIMIT 12`,
    sql`SELECT COUNT(*)::int AS responses, COALESCE(SUM(input_tokens),0)::int AS "inputTokens", COALESCE(SUM(output_tokens),0)::int AS "outputTokens",
        COALESCE(SUM(cost_usd),0)::float AS "costUsd" FROM ai_usage`,
  ]);
  return NextResponse.json({
    note: "Los costos de IA se calculan al responder con GOOGLE_AI_INPUT/OUTPUT_COST_PER_MILLION; si esas variables estaban vacías, esas respuestas quedaron en 0.",
    aiEnvConfigured: { input: Number(process.env.GOOGLE_AI_INPUT_COST_PER_MILLION ?? 0) > 0, output: Number(process.env.GOOGLE_AI_OUTPUT_COST_PER_MILLION ?? 0) > 0, usdToPen: Number(process.env.USD_TO_PEN_EXCHANGE_RATE ?? 0) > 0 },
    ai: ai[0], whatsappStored: stored, latestWebhookPricingFields: rawSamples,
  });
}
