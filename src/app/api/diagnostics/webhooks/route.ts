import { NextResponse } from "next/server";
import { recentWebhookDiagnostics } from "@/lib/conversations";

export async function GET() {
  try {
    return NextResponse.json(await recentWebhookDiagnostics());
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el diagnóstico." }, { status: 500 });
  }
}
