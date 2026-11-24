import { NextRequest, NextResponse } from "next/server";
import { listConversationMessages } from "@/lib/conversations";
import { canAccessConversation, getSession } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await params;
    const user = await getSession(request);
    if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
    return NextResponse.json({ messages: await listConversationMessages(conversationId) });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }
}
