import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view") ?? "open";
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const status = view === "done" ? "DONE" : "OPEN";
  // Parámetros reales (antes el rol y el id se pegaban como texto en el SQL y la consulta fallaba con error 500).
  const assignedUserId = user.role === "ADMIN" ? null : user.id;
  const tasks = await db()`SELECT task.id::text AS id, task.note, task.due_at AS "dueAt", task.status, task.priority,
    COALESCE(contact.display_name, contact.whatsapp_phone) AS contact, conversation.id::text AS "conversationId"
    FROM follow_up_tasks task JOIN conversations conversation ON conversation.id=task.conversation_id
    JOIN contacts contact ON contact.id=conversation.contact_id WHERE task.status=${status}
      AND (${assignedUserId}::uuid IS NULL OR conversation.assigned_user_id=${assignedUserId}::uuid)
    ORDER BY task.due_at ASC LIMIT 250`;
  return NextResponse.json({ tasks });
}
