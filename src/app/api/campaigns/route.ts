import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getSession } from "@/lib/auth";
import { scoreLead, serviceWindow } from "@/lib/lead-score";
import { DELIVERY_ZONES } from "@/lib/brand";

// SOLO LECTURA: no escribe en la base ni toca el flujo del webhook, la IA o los envíos.
// Muestra los leads de anuncios/publicaciones de Meta con una temperatura SUGERIDA y el estado de su ventana de 24 h.
function dateParam(value: string | null, fallback: Date) {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const to = dateParam(request.nextUrl.searchParams.get("to"), new Date());
  const from = dateParam(request.nextUrl.searchParams.get("from"), new Date(Date.now() - 29 * 86400000));
  if (new Date(from) > new Date(to)) return NextResponse.json({ error: "La fecha inicial debe ser anterior a la final." }, { status: 400 });
  const assigned = user.role === "ADVISOR" ? user.id : null;
  const rows = await db()`
    SELECT c.id::text AS id, COALESCE(ct.display_name, ct.whatsapp_phone) AS name, ct.city,
      c.lead_level AS level, c.entry_source AS source, c.referral_headline AS headline, c.referral_source_id AS "sourceId",
      c.last_inbound_at AS "lastInboundAt", c.inbox_state AS state,
      EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.direction='OUTBOUND') AS "answered",
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.direction='INBOUND')::int AS inbound,
      ARRAY(SELECT m.body FROM messages m WHERE m.conversation_id=c.id AND m.direction='INBOUND' ORDER BY m.created_at DESC LIMIT 8) AS texts,
      (SELECT COALESCE(SUM(o.total_pen),0) FROM sales_orders o WHERE o.conversation_id=c.id AND o.status='PAID')::float AS "revenuePen",
      EXISTS (SELECT 1 FROM sales_orders o WHERE o.conversation_id=c.id AND o.status='PAID') AS paid
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
    WHERE c.entry_source <> 'UNKNOWN'
      AND COALESCE(c.referral_at, c.created_at) BETWEEN ${from}::timestamptz AND ${to}::timestamptz
      AND (${assigned}::uuid IS NULL OR c.assigned_user_id=${assigned}::uuid)
    ORDER BY c.last_inbound_at DESC NULLS LAST LIMIT 600`;

  const temp: Record<string, number> = { NEW: 0, INTERESTED: 0, POTENTIAL: 0, HOT: 0 };
  const windows = { open: 0, closing: 0, closed: 0 };
  const adMap = new Map<string, { headline: string; sourceId: string | null; source: string; leads: number; hot: number; sales: number; revenuePen: number }>();
  const attend: Array<Record<string, unknown>> = [];
  let neverAnswered = 0;

  for (const row of rows) {
    const scored = scoreLead({ texts: (row.texts as string[]).map((t) => String(t ?? "")), fromAd: true, inboundCount: Number(row.inbound), districts: DELIVERY_ZONES.covered });
    const finished = ["WON", "LOST"].includes(String(row.level));
    const level = finished || row.level === "PAYMENT_PENDING" ? String(row.level) : scored.level;
    if (level in temp) temp[level] += 1;
    const win = serviceWindow(row.lastInboundAt);
    if (win.state === "OPEN") windows.open += 1; else if (win.state === "CLOSING") windows.closing += 1; else if (win.state === "CLOSED") windows.closed += 1;
    if (!row.answered) neverAnswered += 1;
    const key = `${row.sourceId ?? ""}|${row.headline ?? ""}|${row.source}`;
    const ad = adMap.get(key) ?? { headline: row.headline || (row.source === "META_POST" ? "Publicación de Meta" : "Anuncio sin título"), sourceId: row.sourceId, source: row.source, leads: 0, hot: 0, sales: 0, revenuePen: 0 };
    ad.leads += 1; if (level === "HOT" || level === "PAYMENT_PENDING") ad.hot += 1; if (row.paid) { ad.sales += 1; ad.revenuePen += Number(row.revenuePen); }
    adMap.set(key, ad);
    if (!finished && (win.state === "OPEN" || win.state === "CLOSING") && level !== "NEW")
      attend.push({ id: row.id, name: row.name, city: row.city, level, reason: row.level === "PAYMENT_PENDING" ? "Pago pendiente" : scored.reason, headline: row.headline, lastInboundAt: row.lastInboundAt, msLeft: win.msLeft, closing: win.state === "CLOSING", waitingReply: ["UNREAD", "PENDING_REPLY"].includes(String(row.state)) });
  }
  const order: Record<string, number> = { PAYMENT_PENDING: 0, HOT: 1, POTENTIAL: 2, INTERESTED: 3 };
  attend.sort((a, b) => (order[String(a.level)] ?? 9) - (order[String(b.level)] ?? 9) || Number(a.msLeft) - Number(b.msLeft));
  return NextResponse.json({
    range: { from, to },
    totals: { leads: rows.length, neverAnswered, revenuePen: rows.reduce((sum, row) => sum + Number(row.revenuePen), 0), sales: rows.filter((row) => row.paid).length },
    temperature: temp, windows,
    ads: [...adMap.values()].sort((a, b) => b.leads - a.leads).slice(0, 20),
    attend: attend.slice(0, 20),
  });
}
