import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { parseSaleInput } from "@/lib/sales-input";
import { canAccessConversation, getSession } from "@/lib/auth";

type Context = { params: Promise<{ conversationId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Context) {
  const { conversationId } = await params;
  if (!uuid.test(conversationId)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const orders = await db()`SELECT id::text AS id, items, total_pen::text AS "totalPen", status, version,
    closed_by AS "closedBy", paid_at AS "paidAt", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM sales_orders WHERE conversation_id=${conversationId} ORDER BY created_at DESC`;
  return NextResponse.json({ orders });
}

export async function POST(request: Request, { params }: Context) {
  const { conversationId } = await params;
  if (!uuid.test(conversationId)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const input = parseSaleInput(body);
  if (!input) return NextResponse.json({ error: "Revisa productos, cantidades, precios y estado del pedido." }, { status: 400 });
  const requestId = typeof body?.requestId === "string" && uuid.test(body.requestId) ? body.requestId : null;
  if (!requestId) return NextResponse.json({ error: "Identificador de pedido inválido." }, { status: 400 });
  const result = await db().begin(async (tx) => {
    const existing = await tx`SELECT id FROM conversations WHERE id=${conversationId} FOR UPDATE`;
    if (!existing.length) return null;
    const rows = await tx`INSERT INTO sales_orders(conversation_id,request_id,items,total_pen,status,closed_by,paid_at)
      VALUES (${conversationId},${requestId},${JSON.stringify(input.items)}::text::jsonb,${input.totalPen}::numeric,
        ${input.status},${input.closedBy},${input.status === "PAID" ? new Date().toISOString() : null})
      ON CONFLICT (conversation_id,request_id) DO NOTHING
      RETURNING id::text AS id`;
    if (!rows.length) {
      const prior = await tx`SELECT id::text AS id FROM sales_orders WHERE conversation_id=${conversationId} AND request_id=${requestId}`;
      return prior[0];
    }
    if (input.status === "PAID") {
      await tx`UPDATE conversations SET lead_level='WON',pipeline_stage='VENTA',updated_at=now() WHERE id=${conversationId}`;
      for (const item of input.items) await tx`INSERT INTO contact_memories(contact_id,conversation_id,kind,subject)
        SELECT contact_id,id,'PURCHASE_COMPLETED',${item.name} FROM conversations WHERE id=${conversationId}
        ON CONFLICT(contact_id,kind,subject) DO UPDATE SET last_seen_at=now(),conversation_id=EXCLUDED.conversation_id`;
    } else if (input.status === "PENDING") {
      await tx`UPDATE conversations SET lead_level='PAYMENT_PENDING',updated_at=now()
        WHERE id=${conversationId} AND lead_level NOT IN ('WON','LOST')`;
    }
    await tx`INSERT INTO crm_audit_log(conversation_id,action,details)
      VALUES (${conversationId},'SALE_CREATED',${JSON.stringify({ orderId: rows[0].id, status: input.status, totalPen: input.totalPen, closedBy: input.closedBy })}::jsonb)`;
    return rows[0];
  });
  return result ? NextResponse.json(result, { status: 201 }) : NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
}
