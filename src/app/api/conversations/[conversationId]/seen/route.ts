import { NextResponse } from "next/server";
import { markConversationSeen } from "@/lib/conversations";
import { canAccessConversation, getSession } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const throughMessageId = typeof body?.throughMessageId === "string" ? body.throughMessageId : undefined;
  if (throughMessageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(throughMessageId))
    return NextResponse.json({ error: "Mensaje inválido." }, { status: 400 });
  await markConversationSeen(conversationId, throughMessageId);
  return NextResponse.json({ ok: true });
}
