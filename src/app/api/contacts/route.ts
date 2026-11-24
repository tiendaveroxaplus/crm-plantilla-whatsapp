import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const rows = await db()`
    SELECT contact.id::text AS id, COALESCE(contact.display_name, contact.whatsapp_phone) AS name,
      '+' || contact.whatsapp_phone AS phone, contact.city, contact.profile,
      contact.created_at AS "createdAt", contact.updated_at AS "updatedAt",
      conversation.id::text AS "conversationId", COALESCE(conversation.pipeline_stage,'NUEVO_LEAD') AS stage,
      COALESCE(conversation.lead_level,'NEW') AS "leadLevel", conversation.automation_mode AS "automationMode",
      COALESCE(conversation.entry_source,'UNKNOWN') AS "entrySource", conversation.free_entry_expires_at AS "freeEntryExpiresAt",
      conversation.last_inbound_at AS "lastInboundAt", conversation.last_outbound_at AS "lastOutboundAt",
      COALESCE(tag_list.items, ARRAY[]::text[]) AS tags
    FROM contacts contact
    LEFT JOIN conversations conversation ON conversation.contact_id = contact.id
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(tag.name ORDER BY tag.name) AS items
      FROM conversation_tags ct JOIN tags tag ON tag.id = ct.tag_id WHERE ct.conversation_id = conversation.id
    ) tag_list ON TRUE
    WHERE (${user.role}='ADMIN' OR conversation.assigned_user_id=${user.id}::uuid)
      AND (${search} = '' OR contact.display_name ILIKE ${`%${search}%`} OR contact.whatsapp_phone ILIKE ${`%${search.replace(/\D/g, "")}%`})
    ORDER BY contact.updated_at DESC LIMIT 250`;
  return NextResponse.json({ contacts: rows });
}

export async function POST(request: NextRequest) {
  const user = await getSession(request); if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Solo administradores pueden crear contactos." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  if (!name || name.length > 140 || city.length > 100 || !/^\d{8,15}$/.test(phone))
    return NextResponse.json({ error: "Escribe nombre y teléfono con código de país (8 a 15 dígitos)." }, { status: 400 });
  const rows = await db()`INSERT INTO contacts(whatsapp_phone,display_name,city,profile)
    VALUES (${phone},${name},${city || null},'{"name_manually_set":true}'::jsonb)
    ON CONFLICT(whatsapp_phone) DO NOTHING RETURNING id::text AS id`;
  return rows[0] ? NextResponse.json(rows[0], { status: 201 })
    : NextResponse.json({ error: "Ya existe un contacto con ese número." }, { status: 409 });
}

export async function PATCH(request: NextRequest) {
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 140) : "";
  const city = typeof body?.city === "string" ? body.city.trim().slice(0, 100) : null;
  if (!id || !name) return NextResponse.json({ error: "Nombre y contacto son obligatorios." }, { status: 400 });
  const rows = await db()`UPDATE contacts SET display_name=${name}, city=${city},
    profile=CASE WHEN COALESCE(display_name,whatsapp_phone) IS DISTINCT FROM ${name}
      THEN profile || '{"name_manually_set":true}'::jsonb ELSE profile END, updated_at=now()
    WHERE id=${id} AND (${user.role}='ADMIN' OR EXISTS (SELECT 1 FROM conversations WHERE contact_id=contacts.id AND assigned_user_id=${user.id}::uuid)) RETURNING id::text AS id`;
  return rows[0] ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Contacto no encontrado." }, { status: 404 });
}
