import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dayOverview, generateInsight, readInsights } from "@/lib/insights";
import { isDay, limaDay, SLOTS, slotStatus, type Slot } from "@/lib/insight-slots";

// Análisis de la IA por cortes del día (mañana, tarde, noche). Solo administradores.
async function admin(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return { error: NextResponse.json({ error: "Sesión requerida." }, { status: 401 }) };
  if (user.role !== "ADMIN") return { error: NextResponse.json({ error: "El análisis está disponible solo para administradores." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  const requested = request.nextUrl.searchParams.get("day");
  const day = isDay(requested) ? requested : limaDay();
  return NextResponse.json({ day, today: limaDay(), slots: await dayOverview(day) });
}

export async function POST(request: NextRequest) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const day = isDay(body?.day) ? body.day : limaDay();
  const slot = SLOTS.find((item) => item.id === body?.slot)?.id as Slot | undefined;
  if (!slot) return NextResponse.json({ error: "Corte inválido." }, { status: 400 });
  const status = slotStatus(day, slot);
  if (status === "FUTURE") return NextResponse.json({ error: "Ese corte todavía no empieza." }, { status: 400 });
  const existing = (await readInsights(day)).find((row) => row.slot === slot);
  const fresh = existing && Date.now() - new Date(String(existing.generatedAt)).getTime() < 20 * 60_000;
  // Un corte terminado se analiza una sola vez; uno en curso se renueva cada 20 minutos o con "force".
  if (existing && body?.force !== true && (status === "DONE" || fresh)) return NextResponse.json({ day, today: limaDay(), slots: await dayOverview(day) });
  try {
    await generateInsight(day, slot);
  } catch (error) {
    console.error("[analisis-ia]", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json({ error: "No se pudo generar el análisis ahora. Revisa la IA (/api/diagnostics/ai) e inténtalo otra vez." }, { status: 502 });
  }
  return NextResponse.json({ day, today: limaDay(), slots: await dayOverview(day) });
}
