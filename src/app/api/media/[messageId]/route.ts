import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { canAccessConversation, getSession } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return NextResponse.json({ error: "Archivo inválido." }, { status: 400 });
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const rows = await db()`SELECT media_url AS "mediaUrl", content_type AS "contentType",conversation_id AS "conversationId"
    FROM messages WHERE id=${messageId} AND direction='INBOUND' AND content_type IN ('image','audio') LIMIT 1`;
  const record = rows[0];
  if (!record?.mediaUrl) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  if (!await canAccessConversation(user, String(record.conversationId))) return NextResponse.json({ error: "No tienes acceso a este archivo." }, { status: 403 });
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Medios no configurados." }, { status: 503 });
  try {
    const url = new URL(String(record.mediaUrl));
    if (url.protocol !== "https:" || url.hostname !== "api.ycloud.com" || !url.pathname.startsWith("/v2/whatsapp/media/download/"))
      return NextResponse.json({ error: "Origen de archivo no permitido." }, { status: 400 });
    const remote = await fetch(url, { headers: { "X-API-Key": apiKey }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const mimeType = (remote.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!remote.ok || !(record.contentType === "image" ? /^image\/(jpeg|png|webp|gif)$/.test(mimeType) : /^audio\/(mpeg|mp3|ogg|opus|aac|mp4|webm|amr|wav|x-wav|3gpp)$/.test(mimeType)))
      return NextResponse.json({ error: "No se pudo cargar el archivo de YCloud." }, { status: 502 });
    const size = Number(remote.headers.get("content-length") ?? 0);
    if (size > 16 * 1024 * 1024) return NextResponse.json({ error: "Archivo demasiado grande." }, { status: 413 });
    const bytes = await remote.arrayBuffer();
    if (bytes.byteLength > 16 * 1024 * 1024) return NextResponse.json({ error: "Archivo demasiado grande." }, { status: 413 });
    return new Response(bytes, { headers: { "Content-Type": mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el archivo." }, { status: 502 });
  }
}
