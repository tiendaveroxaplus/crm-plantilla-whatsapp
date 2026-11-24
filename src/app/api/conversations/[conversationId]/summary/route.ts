import { NextResponse } from "next/server";
import { buildSummary, readSummary } from "@/lib/conversation-summary";
import { canAccessConversation, getSession } from "@/lib/auth";

type Context = { params: Promise<{ conversationId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(request: Request, conversationId: string) {
  if (!uuid.test(conversationId)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (!await canAccessConversation(user, conversationId)) return NextResponse.json({ error: "No tienes acceso a esta conversación." }, { status: 403 });
  return null;
}

// Lee el resumen guardado (no usa IA).
export async function GET(request: Request, { params }: Context) {
  const { conversationId } = await params;
  const denied = await authorize(request, conversationId);
  if (denied) return denied;
  return NextResponse.json(await readSummary(conversationId));
}

// Genera o actualiza el resumen con IA. Si ya está al día, no gasta nada.
export async function POST(request: Request, { params }: Context) {
  const { conversationId } = await params;
  const denied = await authorize(request, conversationId);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await buildSummary(conversationId, body?.force === true));
  } catch (error) {
    console.error("[resumen]", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json({ error: "No se pudo generar el resumen ahora. Inténtalo de nuevo en un momento." }, { status: 502 });
  }
}
