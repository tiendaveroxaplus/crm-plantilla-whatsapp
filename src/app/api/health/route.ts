import { NextResponse } from "next/server";
import { configured } from "@/lib/env";
import { databaseHealth } from "@/lib/database";

export async function GET() {
  const databaseConfigured = configured("DATABASE_URL");
  let database = "not_configured";
  if (databaseConfigured) {
    try {
      database = (await databaseHealth()) ? "ok" : "unavailable";
    } catch {
      database = "unavailable";
    }
  }
  const healthy = database === "ok";
  return NextResponse.json({
    status: healthy ? "ok" : "degraded",
    database,
    ycloud: configured("YCLOUD_API_KEY") && configured("YCLOUD_WEBHOOK_SECRET") ? "configured" : "not_configured",
    ai: configured("GOOGLE_AI_API_KEY") && configured("GOOGLE_AI_MODEL") ? "configured" : "not_configured",
  }, { status: healthy ? 200 : 503 });
}
