import { NextResponse } from "next/server";
import { getConversationAutomationMode, getConversationRecipient, persistOutboundMessage } from "@/lib/conversations";
import { sendYcloudText } from "@/lib/ycloud";
import { canAccessConversation, getSession } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4096) return NextResponse.json({ error: "Escribe un mensaje de hasta 4096 caracteres." }, { status: 400 });
  if (await getConversationAutomationMode(conversationId) !== "HUMAN")
    return NextResponse.json({ error: "Toma control de la conversación antes de enviar un mensaje manual." }, { status: 409 });
  const recipient = await getConversationRecipient(conversationId);
  if (!recipient) return NextResponse.json({ error: "No se encontró el contacto de esta conversación." }, { status: 404 });
  let sent: Awaited<ReturnType<typeof sendYcloudText>>;
  try {
    sent = await sendYcloudText({ to: recipient, body: text });
  } catch {
    return NextResponse.json({ error: "No se pudo enviar el mensaje. Revisa YCloud y la ventana de conversación." }, { status: 502 });
  }
  try {
    await persistOutboundMessage({ conversationId, ycloudMessageId: sent.id, body: text, sender: "HUMAN", payload: sent.payload });
    return NextResponse.json({ ok: true });
  } catch {
    // El proveedor ya aceptó el envío: no invitar a reintentar y duplicarlo.
    return NextResponse.json({ ok: true, warning: "YCloud aceptó el mensaje, pero el CRM no pudo registrar su estado. Revisa el historial antes de reenviar." }, { status: 202 });
  }
}
