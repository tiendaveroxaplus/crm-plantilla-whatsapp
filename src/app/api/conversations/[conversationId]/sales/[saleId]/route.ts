import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { parseSaleInput } from "@/lib/sales-input";
import { canAccessConversation, getSession } from "@/lib/auth";

type Context = { params: Promise<{ conversationId: string; saleId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Context) {
  const { conversationId, saleId } = await params;
  if (!uuid.test(conversationId) || !uuid.test(saleId)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const input = parseSaleInput(body);
  if (!input) return NextResponse.json({ error: "Revisa productos, cantidades, precios y estado del pedido." }, { status: 400 });
  const expectedVersion = typeof body?.version === "number" && Number.isSafeInteger(body.version) ? body.version : null;
  if (expectedVersion === null) return NextResponse.json({ error: "Recarga el pedido antes de editarlo." }, { status: 400 });
  const result = await db().begin(async (tx) => {
    const previous = await tx`SELECT status,version FROM sales_orders WHERE id=${saleId} AND conversation_id=${conversationId} FOR UPDATE`;
    if (!previous.length) return null;
    if (previous[0].version !== expectedVersion) return "STALE";
    const rows = await tx`UPDATE sales_orders SET items=${JSON.stringify(input.items)}::text::jsonb,
      total_pen=${input.totalPen}::numeric,status=${input.status},closed_by=${input.closedBy},
      paid_at=CASE WHEN ${input.status}='PAID' THEN COALESCE(paid_at,now()) ELSE NULL END,
      version=version+1,updated_at=now() WHERE id=${saleId} AND conversation_id=${conversationId}
      RETURNING id::text AS id`;
    if (input.status === "PAID" && previous[0].status !== "PAID") {
      await tx`UPDATE conversations SET lead_level='WON',pipeline_stage='VENTA',updated_at=now() WHERE id=${conversationId}`;
      for (const item of input.items) await tx`INSERT INTO contact_memories(contact_id,conversation_id,kind,subject)
        SELECT contact_id,id,'PURCHASE_COMPLETED',${item.name} FROM conversations WHERE id=${conversationId}
        ON CONFLICT(contact_id,kind,subject) DO UPDATE SET last_seen_at=now(),conversation_id=EXCLUDED.conversation_id`;
    }
    await tx`INSERT INTO crm_audit_log(conversation_id,action,details)
      VALUES (${conversationId},'SALE_UPDATED',${JSON.stringify({ orderId: saleId, previousStatus: previous[0].status, status: input.status, totalPen: input.totalPen, closedBy: input.closedBy })}::jsonb)`;
    return rows[0];
  });
  if (result === "STALE") return NextResponse.json({ error: "Este pedido cambió en otra sesión. Recarga antes de sobrescribirlo." }, { status: 409 });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
}
