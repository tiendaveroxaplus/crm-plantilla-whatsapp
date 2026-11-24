import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { canAccessConversation, getSession } from "@/lib/auth";

const allowedModes = new Set(["AI", "HUMAN", "PAUSED"]);
const allowedLevels = new Set(["NEW", "INTERESTED", "POTENTIAL", "HOT", "PAYMENT_PENDING", "WON", "LOST"]);

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const [notes, tasks, audit, tags, memories] = await Promise.all([
    db()`SELECT id::text AS id, author_name AS "authorName", body, created_at AS "createdAt" FROM conversation_notes WHERE conversation_id=${conversationId} ORDER BY created_at DESC LIMIT 50`,
    db()`SELECT id::text AS id, note, due_at AS "dueAt", status, priority FROM follow_up_tasks WHERE conversation_id=${conversationId} ORDER BY status='OPEN' DESC, due_at ASC`,
    db()`SELECT id::text AS id, action, details, actor_name AS "actorName", created_at AS "createdAt" FROM crm_audit_log WHERE conversation_id=${conversationId} ORDER BY created_at DESC LIMIT 30`,
    db()`SELECT tag.name FROM conversation_tags ct JOIN tags tag ON tag.id=ct.tag_id WHERE ct.conversation_id=${conversationId} ORDER BY tag.name`,
    db()`SELECT kind, subject, last_seen_at AS "lastSeenAt" FROM contact_memories
      WHERE contact_id=(SELECT contact_id FROM conversations WHERE id=${conversationId})
      ORDER BY last_seen_at DESC LIMIT 10`,
  ]);
  return NextResponse.json({ notes, tasks, audit, tags: tags.map((row) => row.name), memories });
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action === "note") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
    if (!note) return NextResponse.json({ error: "Escribe una nota." }, { status: 400 });
    await db().begin(async (tx) => { await tx`INSERT INTO conversation_notes(conversation_id, body) VALUES (${conversationId}, ${note})`; await tx`INSERT INTO crm_audit_log(conversation_id,action,details) VALUES (${conversationId},'NOTE_ADDED',${JSON.stringify({ note: note.slice(0, 120) })}::jsonb)`; });
  } else if (action === "task") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
    const priority = ["LOW", "NORMAL", "HIGH"].includes(body.priority) ? body.priority : "NORMAL";
    if (!note || !dueAt || Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "La tarea necesita detalle y fecha." }, { status: 400 });
    await db().begin(async (tx) => { await tx`INSERT INTO follow_up_tasks(conversation_id,note,due_at,priority) VALUES (${conversationId},${note},${dueAt.toISOString()},${priority})`; await tx`INSERT INTO crm_audit_log(conversation_id,action,details) VALUES (${conversationId},'TASK_CREATED',${JSON.stringify({ priority })}::jsonb)`; });
  } else if (action === "completeTask") {
    const rows = await db()`UPDATE follow_up_tasks SET status='DONE', completed_at=now()
      WHERE id=${body.taskId} AND conversation_id=${conversationId} AND status='OPEN' RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: "Seguimiento no encontrado o ya completado." }, { status: 404 });
  } else if (action === "assign") {
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo un administrador puede reasignar conversaciones." }, { status: 403 });
    const assignedUserId = typeof body.assignedUserId === "string" ? body.assignedUserId : "";
    if (!assignedUserId) return NextResponse.json({ error: "Selecciona un responsable." }, { status: 400 });
    await db().begin(async (tx) => {
      const users = await tx`SELECT id,display_name FROM users WHERE id=${assignedUserId} AND active=true LIMIT 1`;
      if (!users.length) throw new Error("Usuario no disponible");
      await tx`UPDATE conversations SET assigned_user_id=${assignedUserId},updated_at=now() WHERE id=${conversationId}`;
      await tx`INSERT INTO crm_audit_log(conversation_id,action,details) VALUES (${conversationId},'ASSIGNED_TO_USER',${JSON.stringify({ assignedUserId })}::jsonb)`;
    });
  } else if (action === "unassign") {
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo un administrador puede retirar asignaciones." }, { status: 403 });
    await db().begin(async (tx) => {
      await tx`UPDATE conversations SET assigned_user_id=NULL,updated_at=now() WHERE id=${conversationId}`;
      await tx`INSERT INTO crm_audit_log(conversation_id,action) VALUES (${conversationId},'UNASSIGNED')`;
    });
  } else if (action === "update") {
    const mode = allowedModes.has(body.mode) ? body.mode : null;
    const level = allowedLevels.has(body.leadLevel) ? body.leadLevel : null;
    const stage = typeof body.stage === "string" ? body.stage.trim().slice(0, 100) : null;
    if (!mode && !level && !stage) return NextResponse.json({ error: "No hay cambios válidos." }, { status: 400 });
    await db().begin(async (tx) => {
      await tx`UPDATE conversations SET automation_mode=COALESCE(${mode},automation_mode), lead_level=COALESCE(${level},lead_level), pipeline_stage=COALESCE(${stage},pipeline_stage), updated_at=now() WHERE id=${conversationId}`;
      if (mode === "HUMAN" || mode === "PAUSED") await tx`UPDATE ai_response_jobs SET generation=generation+1,
        status='IDLE', claimed_at=NULL, updated_at=now() WHERE conversation_id=${conversationId}`;
      if (level === "WON") await tx`INSERT INTO contact_memories(contact_id,conversation_id,kind,subject)
        SELECT contact_id,id,'PURCHASE_COMPLETED',COALESCE(interest_product,'UNSPECIFIED')
        FROM conversations WHERE id=${conversationId}
        ON CONFLICT(contact_id,kind,subject) DO UPDATE SET last_seen_at=now(), conversation_id=EXCLUDED.conversation_id`;
      await tx`INSERT INTO crm_audit_log(conversation_id,action,details) VALUES (${conversationId},'CONVERSATION_UPDATED',${JSON.stringify({ mode, level, stage })}::jsonb)`;
    });
  } else if (action === "tags") {
    if (!Array.isArray(body.tags) || body.tags.length > 12 || body.tags.some((tag: unknown) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 50))
      return NextResponse.json({ error: "Usa hasta 12 etiquetas de máximo 50 caracteres." }, { status: 400 });
    const names: string[] = [...new Set<string>((body.tags as string[]).map((tag) => tag.trim()))];
    await db().begin(async (tx) => {
      await tx`DELETE FROM conversation_tags WHERE conversation_id=${conversationId}`;
      for (const name of names) { const rows = await tx`INSERT INTO tags(name) VALUES (${name}) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`; await tx`INSERT INTO conversation_tags(conversation_id,tag_id) VALUES (${conversationId},${rows[0].id}) ON CONFLICT DO NOTHING`; }
      await tx`INSERT INTO crm_audit_log(conversation_id,action,details) VALUES (${conversationId},'TAGS_UPDATED',${JSON.stringify({ names })}::jsonb)`;
    });
  } else return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
