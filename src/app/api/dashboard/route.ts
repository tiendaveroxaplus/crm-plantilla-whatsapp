import { NextRequest, NextResponse } from "next/server";
import { listInbox } from "@/lib/conversations";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const live = await listInbox(user.role === "ADVISOR" ? user.id : undefined);
  const conversations = live;
  return NextResponse.json({
    source: "live",
    integrations: { ycloud: Boolean(process.env.YCLOUD_API_KEY && process.env.YCLOUD_WHATSAPP_NUMBER && process.env.YCLOUD_WEBHOOK_SECRET), ai: Boolean(process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_MODEL) },
    currentUser: { name: user.name, role: user.role },
    conversations,
    metrics: {
      unread: conversations.filter((item) => item.unread > 0).length,
      pending: conversations.filter((item) => item.state === "PENDING_REPLY").length,
      inProgress: conversations.filter((item) => item.state === "IN_PROGRESS").length,
      responded: conversations.filter((item) => item.state === "RESPONDED").length,
    },
  });
}
