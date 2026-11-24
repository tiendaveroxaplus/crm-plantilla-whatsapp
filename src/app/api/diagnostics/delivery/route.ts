import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getSession } from "@/lib/auth";

// SOLO LECTURA para administradores: estado de entrega de los últimos mensajes salientes y lo que
// reportó YCloud (estado, tipo y error). No incluye textos ni teléfonos.
export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const sql = db();
  const [messages, events] = await Promise.all([
    sql`SELECT created_at AS "createdAt", content_type AS "type", sender, status, error_detail AS "error",
        LEFT(ycloud_message_id, 8) AS "idStart"
      FROM messages WHERE direction='OUTBOUND' ORDER BY created_at DESC LIMIT 25`,
    // El JSON de los eventos puede estar guardado como objeto o como texto JSON: se lee de las dos formas.
    sql`SELECT received_at AS "receivedAt",
        COALESCE(m->>'status','') AS status, COALESCE(m->>'type','') AS "type",
        COALESCE(m->>'errorCode', m->'whatsappApiError'->>'code','') AS "errorCode",
        LEFT(COALESCE(m->>'errorMessage', m->'whatsappApiError'->>'message',''), 160) AS "errorMessage",
        LEFT(COALESCE(m->>'id',''), 8) AS "idStart"
      FROM (SELECT received_at, CASE WHEN jsonb_typeof(payload)='string' THEN (payload #>> '{}')::jsonb ELSE payload END->'whatsappMessage' AS m
            FROM webhook_events WHERE event_type='whatsapp.message.updated' ORDER BY received_at DESC LIMIT 40) e
      ORDER BY received_at DESC`,
  ]);
  return NextResponse.json({ messages, events });
}
