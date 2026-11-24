import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { canAccessConversation, getSession } from "@/lib/auth";
export async function GET(request: Request,{params}:{params:Promise<{conversationId:string}>}){const {conversationId}=await params;const user=await getSession(request);if(!user)return NextResponse.json({error:"Sesión requerida."},{status:401});if(!await canAccessConversation(user,conversationId))return NextResponse.json({error:"No tienes acceso a esta conversación."},{status:403});const rows=await db()`SELECT automation_mode AS mode FROM conversations WHERE id=${conversationId} LIMIT 1`;return NextResponse.json({mode:rows[0]?.mode??"AI"})}
export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params; const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 }); if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 }); const body = await request.json().catch(() => null);
  const mode = body?.mode;
  if (mode !== "AI" && mode !== "HUMAN") return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  const rows = await db().begin(async (tx) => {
    const updated = await tx`UPDATE conversations SET automation_mode=${mode}, updated_at=now() WHERE id=${conversationId} RETURNING id`;
    if (updated.length && mode === "HUMAN") await tx`UPDATE ai_response_jobs SET generation=generation+1,
      status='IDLE', claimed_at=NULL, updated_at=now() WHERE conversation_id=${conversationId}`;
    return updated;
  });
  if (!rows.length) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, mode });
}
