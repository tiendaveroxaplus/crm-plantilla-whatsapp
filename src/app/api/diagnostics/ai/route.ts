import { NextResponse } from "next/server";
import { db } from "@/lib/database";

export async function GET() {
  const [counts, recent] = await Promise.all([
    db()`SELECT status, COUNT(*)::int AS count FROM ai_response_jobs GROUP BY status`,
    db()`SELECT status, attempts, last_error AS "lastError", updated_at AS "updatedAt"
      FROM ai_response_jobs WHERE last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 10`,
  ]);
  return NextResponse.json({ counts, recent });
}
