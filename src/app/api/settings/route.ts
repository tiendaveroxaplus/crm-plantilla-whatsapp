import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { configured } from "@/lib/env";

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  return NextResponse.json({
    user: { name: user.name, email: user.email, role: user.role },
    connections: {
      database: configured("DATABASE_URL"),
      ycloud: configured("YCLOUD_API_KEY") && configured("YCLOUD_WHATSAPP_NUMBER") && configured("YCLOUD_WEBHOOK_SECRET"),
      gemini: configured("GOOGLE_AI_API_KEY") && configured("GOOGLE_AI_MODEL"),
      media: configured("MEDIA_S3_ENDPOINT") && configured("MEDIA_S3_BUCKET") && configured("MEDIA_PUBLIC_BASE_URL"),
    },
  });
}
