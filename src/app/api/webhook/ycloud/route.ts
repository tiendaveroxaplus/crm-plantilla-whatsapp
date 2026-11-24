import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { markWebhookFailed, markWebhookProcessed, persistBusinessAppMessage, persistInboundMessage, persistOutboundStatus, recordWhatsappPricing, registerWebhookEvent } from "@/lib/conversations";
import { isAiTestPhone } from "@/lib/ai";

function validSignature(rawBody: string, header: string, secret: string) {
  const match = /t=(\d+),s=([a-f0-9]+)/i.exec(header);
  if (!match) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${match[1]}.${rawBody}`).digest("hex");
  return expected.length === match[2].length && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(match[2], "hex"));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  const signature = request.headers.get("ycloud-signature");
  if (!signature || !validSignature(rawBody, signature, secret)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  let eventId: string | undefined;
  try {
    const payload = JSON.parse(rawBody) as Record<string, any> & { id?: string; type?: string };
    if (!payload.id || !payload.type) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    eventId = payload.id;
    const isNew = await registerWebhookEvent(payload.id, payload.type, payload);
    if (!isNew) return NextResponse.json({ ok: true, duplicate: true });
    if (payload.type === "whatsapp.inbound_message.received") {
      const message = payload.whatsappInboundMessage;
      if (message?.id && message?.from) {
        const media = ["image", "audio", "video", "document", "sticker"].includes(message.type) ? message[message.type] : null;
        const text = message.type === "text" ? message.text?.body : media?.caption || `[${message.type === "image" ? "Imagen recibida" : message.type === "audio" ? "Audio recibido" : `${message.type ?? "Archivo"} recibido`}]`;
        if (!text) throw new Error("El mensaje entrante no contiene contenido legible.");
        await persistInboundMessage({ id: message.id, from: message.from, name: message.customerProfile?.name, text, contentType: message.type ?? "unknown", mediaUrl: media?.link ?? null, referral: message.referral, sentAt: message.sendTime, payload }, isAiTestPhone(message.from));
      }
    }
    // Mensajes que el negocio envía desde el celular (app WhatsApp Business): se muestran en el chat, sin activar la IA.
    if (payload.type === "whatsapp.smb.message.echoes") {
      const message = payload.whatsappMessage;
      if (message?.id && message?.to) {
        const media = ["image", "audio", "video", "document", "sticker"].includes(message.type) ? message[message.type] : null;
        const names: Record<string, string> = { image: "Imagen", audio: "Audio", video: "Video", document: "Documento", sticker: "Sticker" };
        const text = message.type === "text" ? message.text?.body : media?.caption || `[${names[message.type] ?? message.type ?? "Mensaje"} enviado desde el celular]`;
        if (text) await persistBusinessAppMessage({ id: message.id, to: message.to, text, contentType: message.type ?? "text", sentAt: message.sendTime ?? message.createTime, payload });
      }
    }
    if (payload.type === "whatsapp.message.updated") {
      const message = payload.whatsappMessage;
      if (message?.id && ["accepted", "sent", "delivered", "read", "failed"].includes(message.status)) {
        await persistOutboundStatus({ id: message.id, status: message.status, error: message.errorMessage, payload });
        await recordWhatsappPricing(message);
      }
    }
    await markWebhookProcessed(payload.id);
    return NextResponse.json({ ok: true, queued: true });
  } catch (error) {
    if (eventId) await markWebhookFailed(eventId, error instanceof Error ? error.message : "Error desconocido").catch(() => {});
    console.error("[ycloud] No se pudo procesar el webhook", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json({ error: "No se pudo procesar el evento" }, { status: 500 });
  }
}
